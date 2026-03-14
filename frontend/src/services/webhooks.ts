import api from "./api";

export type WebhookEndpoint = {
  _id: string;
  collegeId: string;
  url: string;
  description?: string;
  events: string[];
  isActive: boolean;
  createdBy?: string;
  createdByRole?: string;
  lastDeliveryAt?: string | null;
  lastStatus?: "idle" | "delivered" | "failed";
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type WebhookDelivery = {
  _id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attemptCount: number;
  responseStatus?: number | null;
  responseBody?: string | null;
  errorMessage?: string | null;
  deliveredAt?: string | null;
  lastAttemptAt?: string | null;
  createdAt?: string;
  endpoint?: {
    _id: string;
    url: string;
    description?: string;
  } | null;
};

export async function getWebhooks(collegeId?: string) {
  const { data } = await api.get("/webhooks", {
    params: collegeId ? { collegeId } : undefined,
  });
  return data as { success: boolean; webhooks: WebhookEndpoint[] };
}

export async function createWebhook(payload: {
  url: string;
  secret: string;
  description?: string;
  events: string[];
  collegeId?: string;
}) {
  const { data } = await api.post("/webhooks", payload);
  return data as { success: boolean; webhook: WebhookEndpoint; message?: string };
}

export async function updateWebhook(
  webhookId: string,
  payload: Partial<{
    url: string;
    secret: string;
    description: string;
    events: string[];
    isActive: boolean;
    collegeId: string;
  }>,
) {
  const { data } = await api.patch(`/webhooks/${webhookId}`, payload);
  return data as { success: boolean; webhook: WebhookEndpoint; message?: string };
}

export async function deleteWebhook(webhookId: string, collegeId?: string) {
  const { data } = await api.delete(`/webhooks/${webhookId}`, {
    data: collegeId ? { collegeId } : undefined,
  });
  return data as { success: boolean; message?: string };
}

export async function sendWebhookTest(webhookId: string, collegeId?: string) {
  const { data } = await api.post(
    `/webhooks/${webhookId}/test`,
    collegeId ? { collegeId } : undefined,
  );
  return data as { success: boolean; delivery?: WebhookDelivery | null; message?: string };
}

export async function getWebhookDeliveries(params?: {
  collegeId?: string;
  status?: string;
  event?: string;
}) {
  const { data } = await api.get("/webhooks/deliveries/list", { params });
  return data as { success: boolean; deliveries: WebhookDelivery[] };
}

export async function retryWebhookDelivery(deliveryId: string, collegeId?: string) {
  const { data } = await api.post(
    `/webhooks/deliveries/${deliveryId}/retry`,
    collegeId ? { collegeId } : undefined,
  );
  return data as { success: boolean; delivery?: WebhookDelivery; message?: string };
}
