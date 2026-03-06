const resolveOpencvHealthUrl = () => {
  const verifyUrl = process.env.OPENCV_VERIFY_URL || "";
  if (!verifyUrl) return "";

  if (verifyUrl.endsWith("/verify")) {
    return verifyUrl.replace(/\/verify\/?$/, "/health");
  }
  return `${verifyUrl.replace(/\/$/, "")}/health`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkOpenCvHealth = async () => {
  const healthUrl = resolveOpencvHealthUrl();
  if (!healthUrl) {
    const message = "OPENCV_VERIFY_URL missing. Face scan routes will be unavailable.";
    console.error(message);
    return { ok: false, healthUrl: null, message };
  }

  const attempts = Math.max(1, Number(process.env.OPENCV_HEALTH_RETRIES || 6));
  const delayMs = Math.max(250, Number(process.env.OPENCV_HEALTH_RETRY_DELAY_MS || 2000));
  const timeoutMs = Math.max(1000, Number(process.env.OPENCV_HEALTH_TIMEOUT_MS || 5000));

  let lastMessage = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs)
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

  console.error(lastMessage);
  return { ok: false, healthUrl, message: lastMessage };
};

module.exports = {
  checkOpenCvHealth,
  resolveOpencvHealthUrl
};
