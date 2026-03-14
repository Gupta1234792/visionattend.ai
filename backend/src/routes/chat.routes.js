const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");

const {
  getChatContacts,
  sendMessage,
  getMessages,
  getRoomMessages,
  markMessageAsRead,
  sendSystemMessage
} = require("../controllers/chat.controller");

/* ================= ALL ROLES ================= */

router.post(
  "/send",
  authMiddleware,
  sendMessage
);

router.get(
  "/contacts",
  authMiddleware,
  getChatContacts
);

router.get(
  "/messages",
  authMiddleware,
  getMessages
);

router.get(
  "/room/:roomId",
  authMiddleware,
  getRoomMessages
);

router.patch(
  "/read/:messageId",
  authMiddleware,
  markMessageAsRead
);

// System message endpoint (for backend use)
router.post(
  "/system",
  sendSystemMessage
);

module.exports = router;
