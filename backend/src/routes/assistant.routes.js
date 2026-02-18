const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { chatWithAssistant } = require("../controllers/assistant.controller");

router.post(
  "/chat",
  authMiddleware,
  roleMiddleware("student"),
  chatWithAssistant
);

module.exports = router;

