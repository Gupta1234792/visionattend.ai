const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
];

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getConfiguredApiOrigin = () => {
  const explicitBase = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (explicitBase) {
    return trimTrailingSlash(explicitBase).replace(/\/api$/i, "");
  }

  const explicitUrl = String(process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (explicitUrl) {
    return trimTrailingSlash(explicitUrl);
  }

  return "http://localhost:5000";
};

const resolveOriginForCurrentHost = (configuredOrigin: string) => {
  if (typeof window === "undefined") {
    return configuredOrigin;
  }

  try {
    const browserUrl = new URL(window.location.origin);
    const configuredUrl = new URL(configuredOrigin);
    const currentHost = browserUrl.hostname;
    const isPrivateHost = PRIVATE_HOST_PATTERNS.some((pattern) =>
      pattern.test(currentHost),
    );

    if (!isPrivateHost) {
      return trimTrailingSlash(configuredOrigin);
    }

    const protocol = configuredUrl.protocol || browserUrl.protocol;
    const port = configuredUrl.port || "5000";
    return `${protocol}//${currentHost}:${port}`;
  } catch {
    return trimTrailingSlash(configuredOrigin);
  }
};

export const resolveApiBaseUrl = () => {
  const configuredOrigin = getConfiguredApiOrigin();
  const resolvedOrigin = resolveOriginForCurrentHost(configuredOrigin);
  return `${trimTrailingSlash(resolvedOrigin)}/api`;
};

export const resolveSocketBaseUrl = () => {
  const configuredSocket = String(process.env.NEXT_PUBLIC_SOCKET_URL || "").trim();
  if (configuredSocket) {
    return trimTrailingSlash(configuredSocket);
  }

  const configuredOrigin = getConfiguredApiOrigin();
  return resolveOriginForCurrentHost(configuredOrigin);
};
