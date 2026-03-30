const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

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

const getOpencvEndpointCandidates = (kind) => {
  const verifyUrl = normalizeBaseUrl(process.env.OPENCV_VERIFY_URL);
  const registerUrl = normalizeBaseUrl(
    process.env.OPENCV_REGISTER_URL ||
      (verifyUrl ? verifyUrl.replace(/\/verify\/?$/, "/register") : ""),
  );

  if (kind === "verify") {
    return withLocalhostFallback(verifyUrl);
  }

  if (kind === "register") {
    return withLocalhostFallback(registerUrl);
  }

  return [];
};

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
  const candidateHealthUrls = getOpencvEndpointCandidates("verify").map((verifyUrl) =>
    verifyUrl.endsWith("/verify")
      ? verifyUrl.replace(/\/verify\/?$/, "/health")
      : `${verifyUrl}/health`,
  );

  if (!candidateHealthUrls.length) {
    const message = "OPENCV_VERIFY_URL missing. Face scan routes will be unavailable.";
    console.error(message);
    return { ok: false, healthUrl: null, message };
  }

  const attempts = Math.max(1, Number(process.env.OPENCV_HEALTH_RETRIES || 6));
  const delayMs = Math.max(250, Number(process.env.OPENCV_HEALTH_RETRY_DELAY_MS || 2000));
  const timeoutMs = Math.max(1000, Number(process.env.OPENCV_HEALTH_TIMEOUT_MS || 5000));

  let lastMessage = "";

  for (const healthUrl of candidateHealthUrls) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          lastMessage = `OpenCV health check failed with status ${response.status} at ${healthUrl}`;
        } else {
          const payload = await response.json().catch(() => ({}));
          const message = `OpenCV service healthy at ${healthUrl}`;
          console.log(message);
          return { ok: true, healthUrl, payload, message };
        }
      } catch (error) {
        lastMessage = `OpenCV health check unreachable at ${healthUrl}: ${error?.message || error}`;
      }

      if (attempt < attempts) {
        console.warn(`${lastMessage}. Retrying (${attempt}/${attempts})...`);
        await sleep(delayMs);
      }
    }
  }

  console.error(lastMessage);
  return { ok: false, healthUrl: candidateHealthUrls[0] || null, message: lastMessage };
};

const fixPayload = (payload = {}) => {
  let { image, frames } = payload;

  frames = Array.isArray(frames)
    ? frames.filter((frame) => typeof frame === "string" && frame.startsWith("data:image/"))
    : [];

  if (!image && frames.length > 0) {
    image = frames[0];
  }

  if (!frames.length && image) {
    frames = [image];
  }

  return {
    ...payload,
    image: image || null,
    frames,
  };
};

const postToOpenCv = async (kind, payload, options = {}) => {
  const candidateUrls = getOpencvEndpointCandidates(kind);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
  const retries = Math.max(1, Number(options.retries || 2));
  const headers = {
    "Content-Type": "application/json",
    "x-opencv-key": process.env.OPENCV_API_KEY || "",
    "x-opencv-client": process.env.OPENCV_CLIENT_ID || "backend",
    ...(options.headers || {}),
  };

  if (!candidateUrls.length) {
    throw new Error(`OpenCV ${kind} endpoint not configured`);
  }

  const finalPayload = fixPayload(payload);
  let lastError = null;

  for (const url of candidateUrls) {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(finalPayload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await response.json().catch(() => ({
          success: false,
          message: "OpenCV returned invalid JSON",
        }));
        return { response, data, url };
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await sleep(400 * attempt);
        }
      }
    }
  }

  throw lastError || new Error(`OpenCV ${kind} request failed`);
};

module.exports = {
  checkOpenCvHealth,
  resolveOpencvHealthUrl,
  getOpencvEndpointCandidates,
  postToOpenCv,
};
