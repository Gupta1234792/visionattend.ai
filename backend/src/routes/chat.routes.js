const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const { getChatHistory } = require("../controllers/chat.controller");

// Fetch chat history for lecture
router.get(
  "/:roomId",
  authMiddleware,
  getChatHistory
);

module.exports = router;
