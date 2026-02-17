const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  myNotifications,
  markNotificationRead
} = require("../controllers/notification.controller");

router.get(
  "/my",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  myNotifications
);

router.patch(
  "/:notificationId/read",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  markNotificationRead
);

module.exports = router;
