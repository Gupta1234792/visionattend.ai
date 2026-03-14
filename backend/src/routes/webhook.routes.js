const express = require("express");

const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  retryWebhook,
  sendWebhookTest
} = require("../controllers/webhook.controller");

router.use(authMiddleware, roleMiddleware("admin", "hod"));

router.get("/", listWebhooks);
router.post("/", createWebhook);
router.patch("/:webhookId", updateWebhook);
router.delete("/:webhookId", deleteWebhook);
router.post("/:webhookId/test", sendWebhookTest);

router.get("/deliveries/list", listWebhookDeliveries);
router.post("/deliveries/:deliveryId/retry", retryWebhook);

module.exports = router;
