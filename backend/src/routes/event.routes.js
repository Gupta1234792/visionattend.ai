const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createEvent, listEvents } = require("../controllers/event.controller");

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  createEvent
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listEvents
);

module.exports = router;
