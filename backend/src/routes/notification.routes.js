const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  myNotifications,
  markNotificationRead,
  markAllRead,
  retryFailedNotifications
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

router.patch(
  "/read-all",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  markAllRead
);

router.post(
  "/retry-failed",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  retryFailedNotifications
);

module.exports = router;
