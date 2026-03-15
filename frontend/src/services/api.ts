import axios from "axios";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
];

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const getConfiguredApiOrigin = () => {
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

const resolveApiBaseUrl = () => {
  const configuredOrigin = getConfiguredApiOrigin();

  if (typeof window === "undefined") {
    return `${configuredOrigin}/api`;
  }

  try {
    const browserUrl = new URL(window.location.origin);
    const configuredUrl = new URL(configuredOrigin);
    const currentHost = browserUrl.hostname;
    const isPrivateHost = PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(currentHost));

    if (isPrivateHost) {
      const protocol = configuredUrl.protocol || browserUrl.protocol;
      const port = configuredUrl.port || "5000";
      return `${protocol}//${currentHost}:${port}/api`;
    }

    return `${trimTrailingSlash(configuredOrigin)}/api`;
  } catch {
    return `${trimTrailingSlash(configuredOrigin)}/api`;
  }
};

const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("va_token") || localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
