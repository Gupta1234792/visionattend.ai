const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  scheduleMultipleLectures,
  getLectureSchedule,
  cancelLectures,
  getLectureStats
} = require("../controllers/lectureScheduler.controller");

// Schedule multiple lectures at once (bulk scheduling)
router.post(
  "/bulk",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  scheduleMultipleLectures
);

// Get lecture schedule for a date range
router.get(
  "/schedule",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getLectureSchedule
);

// Cancel multiple lectures
router.post(
  "/cancel/bulk",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  cancelLectures
);

// Get lecture statistics for a batch
router.get(
  "/stats",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  getLectureStats
);

module.exports = router;