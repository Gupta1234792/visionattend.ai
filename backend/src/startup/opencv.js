const resolveOpencvHealthUrl = () => {
  const verifyUrl = process.env.OPENCV_VERIFY_URL || "";
  if (!verifyUrl) return "";

  if (verifyUrl.endsWith("/verify")) {
    return verifyUrl.replace(/\/verify\/?$/, "/health");
  }
  return `${verifyUrl.replace(/\/$/, "")}/health`;
};

const checkOpenCvHealth = async () => {
  const healthUrl = resolveOpencvHealthUrl();
  if (!healthUrl) {
    const message = "OPENCV_VERIFY_URL missing. Face scan routes will be unavailable.";
    console.error(message);
    return { ok: false, healthUrl: null, message };
  }

  try {
    const response = await fetch(healthUrl, { method: "GET" });
    if (!response.ok) {
      const message = `OpenCV health check failed with status ${response.status} at ${healthUrl}`;
      console.error(message);
      return { ok: false, healthUrl, message };
    }
    const payload = await response.json().catch(() => ({}));
    const message = `OpenCV service healthy at ${healthUrl}`;
    console.log(message);
    return { ok: true, healthUrl, payload, message };
  } catch (error) {
    const message = `OpenCV health check unreachable at ${healthUrl}: ${error?.message || error}`;
    console.error(message);
    return { ok: false, healthUrl, message };
  }
};

module.exports = {
  checkOpenCvHealth,
  resolveOpencvHealthUrl
};
