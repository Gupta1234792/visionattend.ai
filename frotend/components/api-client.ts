export type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  message: string;
};

type RequestOptions = {
  apiBaseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH";
  token?: string;
  opencvKey?: string;
  body?: Record<string, unknown>;
};

const readMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    return "Request finished";
  }

  const maybeMessage = (payload as { message?: unknown }).message;
  if (typeof maybeMessage === "string" && maybeMessage.trim()) {
    return maybeMessage;
  }

  return "Request finished";
};

export async function apiRequest<T = unknown>({
  apiBaseUrl,
  path,
  method = "GET",
  token,
  opencvKey,
  body,
}: RequestOptions): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (opencvKey) {
    headers["x-opencv-key"] = opencvKey;
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data: (payload as T) ?? null,
    message: readMessage(payload),
  };
}
