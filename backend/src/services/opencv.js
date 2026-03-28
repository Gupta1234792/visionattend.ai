const normalizeBaseUrl = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const withLocalhostFallback = (url) => {
  if (!url) return [];

  const candidates = [url];

  try {
    const parsed = new URL(url);

    if (parsed.hostname === "opencv-ai" || parsed.hostname === "vision_ai") {
      candidates.push(url.replace(parsed.hostname, "localhost"));
      candidates.push(url.replace(parsed.hostname, "127.0.0.1"));
    }
  } catch {}

  return [...new Set(candidates)];
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ================= GET ENDPOINT ================= */

const getOpencvEndpointCandidates = (kind) => {
  const verifyUrl = normalizeBaseUrl(process.env.OPENCV_VERIFY_URL);
  const registerUrl = normalizeBaseUrl(
    process.env.OPENCV_REGISTER_URL ||
      (verifyUrl ? verifyUrl.replace(/\/verify\/?$/, "/register") : "")
  );

  if (kind === "verify") {
    return withLocalhostFallback(verifyUrl);
  }

  if (kind === "register") {
    return withLocalhostFallback(registerUrl);
  }

  return [];
};

/* ================= HEALTH ================= */

const resolveOpencvHealthUrl = () => {
  const verifyCandidates = getOpencvEndpointCandidates("verify");
  const verifyUrl = verifyCandidates[0] || "";

  if (!verifyUrl) return "";

  if (verifyUrl.endsWith("/verify")) {
    return verifyUrl.replace(/\/verify\/?$/, "/health");
  }

  return `${verifyUrl}/health`;
};

const checkOpenCvHealth = async () => {
  const urls = getOpencvEndpointCandidates("verify").map((verifyUrl) =>
    verifyUrl.endsWith("/verify")
      ? verifyUrl.replace(/\/verify\/?$/, "/health")
      : `${verifyUrl}/health`
  );

  if (!urls.length) {
    return { ok: false, message: "OpenCV URL missing" };
  }

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log("✅ OpenCV healthy:", url);
        return { ok: true, url };
      }
    } catch {}
  }

  return { ok: false, message: "OpenCV unreachable" };
};

/* ================= PAYLOAD FIX ================= */

const fixPayload = (payload = {}) => {
  let { image, frames } = payload;

  // ensure array
  frames = Array.isArray(frames) ? frames : [];

  // fallback logic 🔥
  if (!image && frames.length > 0) {
    image = frames[0];
  }

  if (!frames.length && image) {
    frames = [image];
  }

  return {
    ...payload,
    image: image || null,
    frames
  };
};

/* ================= MAIN CALL ================= */

const postToOpenCv = async (kind, payload, options = {}) => {
  const urls = getOpencvEndpointCandidates(kind);

  if (!urls.length) {
    throw new Error(`OpenCV ${kind} URL missing`);
  }

  const finalPayload = fixPayload(payload);

  console.log("🔥 OpenCV FINAL PAYLOAD:", {
    userId: finalPayload.userId,
    hasImage: !!finalPayload.image,
    framesCount: finalPayload.frames.length
  });

  const headers = {
    "Content-Type": "application/json",
    "x-opencv-key": process.env.OPENCV_API_KEY || ""
  };

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(finalPayload),
        signal: AbortSignal.timeout(options.timeoutMs || 15000)
      });

      const data = await res.json().catch(() => ({}));

      return { response: res, data, url };
    } catch (err) {
      console.warn("⚠️ OpenCV retry:", url);
    }
  }

  throw new Error("OpenCV request failed");
};

module.exports = {
  checkOpenCvHealth,
  resolveOpencvHealthUrl,
  getOpencvEndpointCandidates,
  postToOpenCv
};