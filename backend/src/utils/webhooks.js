const crypto = require("crypto");
const WebhookEndpoint = require("../models/WebhookEndpoint.model");
const WebhookDelivery = require("../models/WebhookDelivery.model");

const WEBHOOK_TIMEOUT_MS = Math.max(2000, Number(process.env.WEBHOOK_TIMEOUT_MS || 8000));

const normalizeEvents = (events) => {
  if (!Array.isArray(events) || !events.length) return ["*"];
  const normalized = events
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : ["*"];
};

const signPayload = (secret, rawBody, timestamp) =>
  crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

const buildHeaders = (endpoint, event, rawBody, deliveryId) => {
  const timestamp = `${Date.now()}`;
  const signature = signPayload(endpoint.secret, rawBody, timestamp);
  return {
    "Content-Type": "application/json",
    "User-Agent": "VisionAttend-Webhooks/1.0",
    "X-VisionAttend-Event": event,
    "X-VisionAttend-Delivery": String(deliveryId),
    "X-VisionAttend-Timestamp": timestamp,
    "X-VisionAttend-Signature": signature
  };
};

const truncate = (value, limit = 1500) => {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const deliverWebhook = async (endpoint, delivery) => {
  const rawBody = JSON.stringify(delivery.payload);
  const headers = buildHeaders(endpoint, delivery.event, rawBody, delivery._id);
  const attemptedAt = new Date();

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    });

    const responseText = truncate(await response.text().catch(() => ""));
    const delivered = response.ok;

    delivery.status = delivered ? "delivered" : "failed";
    delivery.responseStatus = response.status;
    delivery.responseBody = responseText || null;
    delivery.errorMessage = delivered ? null : `Webhook returned ${response.status}`;
    delivery.lastAttemptAt = attemptedAt;
    delivery.attemptCount += 1;
    delivery.deliveredAt = delivered ? attemptedAt : null;
    await delivery.save();

    endpoint.lastDeliveryAt = attemptedAt;
    endpoint.lastStatus = delivered ? "delivered" : "failed";
    endpoint.lastError = delivered ? null : delivery.errorMessage;
    await endpoint.save();

    return delivery;
  } catch (error) {
    delivery.status = "failed";
    delivery.responseStatus = null;
    delivery.responseBody = null;
    delivery.errorMessage = truncate(error?.message || error || "Webhook request failed");
    delivery.lastAttemptAt = attemptedAt;
    delivery.attemptCount += 1;
    delivery.deliveredAt = null;
    await delivery.save();

    endpoint.lastDeliveryAt = attemptedAt;
    endpoint.lastStatus = "failed";
    endpoint.lastError = delivery.errorMessage;
    await endpoint.save();

    return delivery;
  }
};

const triggerWebhookEvent = async ({ event, collegeId, payload }) => {
  if (!event || !collegeId || !payload) return [];

  const normalizedEvent = String(event).trim().toLowerCase();
  const endpoints = await WebhookEndpoint.find({
    collegeId,
    isActive: true,
    $or: [
      { events: "*" },
      { events: normalizedEvent }
    ]
  });

  if (!endpoints.length) return [];

  const deliveries = await Promise.all(
    endpoints.map(async (endpoint) => {
      const delivery = await WebhookDelivery.create({
        endpoint: endpoint._id,
        collegeId,
        event: normalizedEvent,
        payload,
        status: "pending"
      });
      return deliverWebhook(endpoint, delivery);
    })
  );

  return deliveries;
};

const retryWebhookDelivery = async (deliveryId, collegeId) => {
  const delivery = await WebhookDelivery.findOne({ _id: deliveryId, collegeId });
  if (!delivery) {
    return null;
  }

  const endpoint = await WebhookEndpoint.findOne({
    _id: delivery.endpoint,
    collegeId,
    isActive: true
  });

  if (!endpoint) {
    delivery.status = "failed";
    delivery.errorMessage = "Webhook endpoint not found or inactive";
    await delivery.save();
    return delivery;
  }

  return deliverWebhook(endpoint, delivery);
};

module.exports = {
  normalizeEvents,
  triggerWebhookEvent,
  retryWebhookDelivery
};
