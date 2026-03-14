const WebhookEndpoint = require("../models/WebhookEndpoint.model");
const WebhookDelivery = require("../models/WebhookDelivery.model");
const { normalizeEvents, retryWebhookDelivery, triggerWebhookEvent } = require("../utils/webhooks");

const getScopedCollegeId = (req) => {
  if (req.user?.role === "admin") {
    const candidate =
      req.query?.collegeId ||
      req.body?.collegeId ||
      req.params?.collegeId ||
      req.user?.college;
    return candidate ? String(candidate) : "";
  }
  return req.user?.college ? String(req.user.college) : "";
};

const sanitizeEndpoint = (endpoint) => ({
  _id: endpoint._id,
  collegeId: endpoint.collegeId,
  url: endpoint.url,
  description: endpoint.description,
  events: endpoint.events,
  isActive: endpoint.isActive,
  createdBy: endpoint.createdBy,
  createdByRole: endpoint.createdByRole,
  lastDeliveryAt: endpoint.lastDeliveryAt,
  lastStatus: endpoint.lastStatus,
  lastError: endpoint.lastError,
  createdAt: endpoint.createdAt,
  updatedAt: endpoint.updatedAt
});

const listWebhooks = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const endpoints = await WebhookEndpoint.find({
      collegeId
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      webhooks: endpoints.map(sanitizeEndpoint)
    });
  } catch (error) {
    console.error("listWebhooks error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch webhooks" });
  }
};

const createWebhook = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const url = String(req.body?.url || "").trim();
    const secret = String(req.body?.secret || "").trim();
    const description = String(req.body?.description || "").trim();
    const events = normalizeEvents(req.body?.events);

    if (!url || !secret) {
      return res.status(400).json({ success: false, message: "url and secret are required" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ success: false, message: "Invalid webhook URL" });
    }

    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return res.status(400).json({ success: false, message: "Webhook URL must use http or https" });
    }

    const webhook = await WebhookEndpoint.create({
      collegeId,
      url: parsedUrl.toString(),
      description,
      secret,
      events,
      createdBy: req.user._id,
      createdByRole: req.user.role
    });

    return res.status(201).json({
      success: true,
      webhook: sanitizeEndpoint(webhook.toObject())
    });
  } catch (error) {
    console.error("createWebhook error:", error);
    return res.status(500).json({ success: false, message: "Failed to create webhook" });
  }
};

const updateWebhook = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const webhook = await WebhookEndpoint.findOne({
      _id: req.params.webhookId,
      collegeId
    });

    if (!webhook) {
      return res.status(404).json({ success: false, message: "Webhook not found" });
    }

    if (typeof req.body?.url !== "undefined") {
      const nextUrl = String(req.body.url || "").trim();
      if (!nextUrl) {
        return res.status(400).json({ success: false, message: "Webhook URL cannot be empty" });
      }
      try {
        const parsedUrl = new URL(nextUrl);
        if (!/^https?:$/.test(parsedUrl.protocol)) {
          return res.status(400).json({ success: false, message: "Webhook URL must use http or https" });
        }
        webhook.url = parsedUrl.toString();
      } catch {
        return res.status(400).json({ success: false, message: "Invalid webhook URL" });
      }
    }

    if (typeof req.body?.secret !== "undefined") {
      const secret = String(req.body.secret || "").trim();
      if (!secret) {
        return res.status(400).json({ success: false, message: "secret cannot be empty" });
      }
      webhook.secret = secret;
    }

    if (typeof req.body?.description !== "undefined") {
      webhook.description = String(req.body.description || "").trim();
    }

    if (typeof req.body?.isActive !== "undefined") {
      webhook.isActive = Boolean(req.body.isActive);
    }

    if (typeof req.body?.events !== "undefined") {
      webhook.events = normalizeEvents(req.body.events);
    }

    await webhook.save();

    return res.json({
      success: true,
      webhook: sanitizeEndpoint(webhook.toObject())
    });
  } catch (error) {
    console.error("updateWebhook error:", error);
    return res.status(500).json({ success: false, message: "Failed to update webhook" });
  }
};

const deleteWebhook = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const webhook = await WebhookEndpoint.findOneAndDelete({
      _id: req.params.webhookId,
      collegeId
    });

    if (!webhook) {
      return res.status(404).json({ success: false, message: "Webhook not found" });
    }

    await WebhookDelivery.deleteMany({ endpoint: webhook._id, collegeId });
    return res.json({ success: true, message: "Webhook deleted" });
  } catch (error) {
    console.error("deleteWebhook error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete webhook" });
  }
};

const listWebhookDeliveries = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const query = { collegeId };
    if (req.query.status) {
      query.status = String(req.query.status);
    }
    if (req.query.event) {
      query.event = String(req.query.event).toLowerCase();
    }

    const deliveries = await WebhookDelivery.find(query)
      .populate("endpoint", "url description")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, deliveries });
  } catch (error) {
    console.error("listWebhookDeliveries error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch webhook deliveries" });
  }
};

const retryWebhook = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const delivery = await retryWebhookDelivery(req.params.deliveryId, collegeId);
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Webhook delivery not found" });
    }

    return res.json({ success: true, delivery });
  } catch (error) {
    console.error("retryWebhook error:", error);
    return res.status(500).json({ success: false, message: "Failed to retry webhook" });
  }
};

const sendWebhookTest = async (req, res) => {
  try {
    const collegeId = getScopedCollegeId(req);
    if (!collegeId) {
      return res.status(400).json({ success: false, message: "collegeId is required" });
    }

    const webhook = await WebhookEndpoint.findOne({
      _id: req.params.webhookId,
      collegeId,
      isActive: true
    });

    if (!webhook) {
      return res.status(404).json({ success: false, message: "Webhook not found" });
    }

    const deliveries = await triggerWebhookEvent({
      event: "system.webhook.test",
      collegeId,
      payload: {
        event: "system.webhook.test",
        collegeId,
        actorRole: req.user.role,
        actorId: String(req.user._id || ""),
        createdAt: new Date().toISOString(),
        targetWebhookId: String(webhook._id)
      }
    });

    const delivery = deliveries.find((item) => String(item.endpoint) === String(webhook._id)) || null;
    return res.json({ success: true, delivery });
  } catch (error) {
    console.error("sendWebhookTest error:", error);
    return res.status(500).json({ success: false, message: "Failed to send test webhook" });
  }
};

module.exports = {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  retryWebhook,
  sendWebhookTest
};
