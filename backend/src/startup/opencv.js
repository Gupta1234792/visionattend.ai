const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LOCAL_OPENCV_BASES = [
  process.env.OPENCV_LOCAL_BASE_URL,
  "http://localhost:10000",
  "http://127.0.0.1:10000",
].map(normalizeBaseUrl).filter(Boolean);

const healthCache = new Map();
const HEALTH_CACHE_TTL_MS = Math.max(1000, Number(process.env.OPENCV_HEALTH_CACHE_TTL_MS || 5000));

const buildRouteUrl = (baseUrl, kind) => {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return "";
  return `${base}/${kind}`;
};

const toHealthUrl = (url) => {
  const normalized = normalizeBaseUrl(url);
  return normalized.replace(/\/(register|verify|health)$/i, "") + "/health";
};

const toBaseUrl = (url) =>
  normalizeBaseUrl(url).replace(/\/(register|verify|health)$/i, "");

const getRenderRouteUrl = (kind) => {
  const verifyUrl = normalizeBaseUrl(process.env.OPENCV_VERIFY_URL);
  const registerUrl = normalizeBaseUrl(
    process.env.OPENCV_REGISTER_URL ||
      (verifyUrl ? verifyUrl.replace(/\/verify\/?$/i, "/register") : ""),
  );

  return kind === "register" ? registerUrl : verifyUrl;
};

const getFallbackRouteUrl = (kind) => {
  const verifyUrl = normalizeBaseUrl(
    process.env.OPENCV_VERIFY_FALLBACK || process.env.OPENCV_VERIFY_URL,
  );
  const registerUrl = normalizeBaseUrl(
    process.env.OPENCV_REGISTER_FALLBACK ||
      process.env.OPENCV_REGISTER_URL ||
      (verifyUrl ? verifyUrl.replace(/\/verify\/?$/i, "/register") : ""),
  );

  return kind === "register" ? registerUrl : verifyUrl;
};

const getOpencvEndpointCandidates = (kind) => {
  const localCandidates = LOCAL_OPENCV_BASES.map((base) => buildRouteUrl(base, kind));
  const primaryCandidate = getRenderRouteUrl(kind);
  const fallbackCandidate = getFallbackRouteUrl(kind);
  return [...new Set([...localCandidates, primaryCandidate, fallbackCandidate].filter(Boolean))];
};

const probeHealth = async (url, timeoutMs) => {
  const healthUrl = toHealthUrl(url);
  const cacheKey = healthUrl;
  const now = Date.now();
  const cached = healthCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => ({}));
    const result = {
      ok: response.ok,
      url,
      healthUrl,
      payload,
      status: response.status,
      message: response.ok
        ? `OpenCV healthy at ${healthUrl}`
        : `OpenCV health failed with status ${response.status} at ${healthUrl}`,
    };
    healthCache.set(cacheKey, { value: result, expiresAt: now + HEALTH_CACHE_TTL_MS });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      url,
      healthUrl,
      payload: null,
      status: 0,
      message: `OpenCV health unreachable at ${healthUrl}: ${error?.message || error}`,
    };
    healthCache.set(cacheKey, { value: result, expiresAt: now + 1000 });
    return result;
  }
};

const getOpenCVUrl = async (kind, options = {}) => {
  const candidateUrls = getOpencvEndpointCandidates(kind);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 2500));

  if (!candidateUrls.length) {
    throw new Error(`OpenCV ${kind} endpoint not configured`);
  }

  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    const health = await probeHealth(url, timeoutMs);
    if (health.ok) {
      if (index > 0) {
        console.warn(`[OpenCV] fallback triggered healthy=${url}`);
      }
      return url;
    }
  }

  return candidateUrls[0];
};

const resolveOpencvHealthUrl = () => {
  const verifyCandidates = getOpencvEndpointCandidates("verify");
  return verifyCandidates.length ? toHealthUrl(verifyCandidates[0]) : "";
};

const checkOpenCvHealth = async (options = {}) => {
  const candidateUrls = getOpencvEndpointCandidates("verify");
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || process.env.OPENCV_HEALTH_TIMEOUT_MS || 2500));

  if (!candidateUrls.length) {
    const message = "OPENCV_VERIFY_URL missing. Face scan routes will be unavailable.";
    console.error(message);
    return { ok: false, healthUrl: null, message };
  }

  let lastReport = null;
  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    const report = await probeHealth(url, timeoutMs);
    lastReport = report;
    if (report.ok) {
      if (index > 0) {
        console.warn(`[OpenCV] fallback triggered healthy=${url}`);
      }
      return {
        ok: true,
        healthUrl: report.healthUrl,
        message: report.message,
        payload: report.payload,
        url,
      };
    }
  }

  return {
    ok: false,
    healthUrl: lastReport?.healthUrl || toHealthUrl(candidateUrls[0]),
    message: lastReport?.message || "OpenCV unreachable",
    payload: lastReport?.payload || null,
    url: lastReport?.url || candidateUrls[0],
  };
};

const fixPayload = (payload = {}) => {
  let { image, frames } = payload;

  const validFrames = Array.isArray(frames)
    ? frames.filter((frame) => typeof frame === "string" && frame.startsWith("data:image/"))
    : [];

  if (!image && validFrames.length > 0) {
    image = validFrames[0];
  }

  return {
    ...payload,
    image: typeof image === "string" && image.startsWith("data:image/") ? image : null,
    frames: validFrames.length ? validFrames : image ? [image] : [],
  };
};

const shouldFallbackResponse = (response) => response.status >= 500 || response.status === 429;

const postToOpenCv = async (kind, payload, options = {}) => {
  const candidateUrls = getOpencvEndpointCandidates(kind);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
  const retries = Math.max(1, Number(options.retries || 3));
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

  for (let index = 0; index < candidateUrls.length; index += 1) {
    const url = candidateUrls[index];
    const healthReport = await probeHealth(url, Math.min(3000, timeoutMs));
    if (!healthReport.ok) {
      console.warn(`[OpenCV] preflight failed url=${url} reason=${healthReport.message}`);
    }

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      console.log(`[OpenCV] calling: ${url} kind=${kind} attempt=${attempt}`);
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

        if (shouldFallbackResponse(response)) {
          lastError = new Error(`OpenCV ${kind} failed with status ${response.status} at ${url}`);
          if (attempt < retries) {
            await sleep(350 * attempt);
            continue;
          }
          break;
        }

        return { response, data, url };
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await sleep(350 * attempt);
          continue;
        }
      }
    }

    if (index < candidateUrls.length - 1) {
      console.warn(`[OpenCV] fallback triggered from=${url} to=${candidateUrls[index + 1]}`);
    }
  }

  throw lastError || new Error(`OpenCV ${kind} request failed`);
};

module.exports = {
  checkOpenCvHealth,
  getOpenCVUrl,
  resolveOpencvHealthUrl,
  getOpencvEndpointCandidates,
  postToOpenCv,
};
