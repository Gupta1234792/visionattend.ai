const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  generateWeeklyTimetable,
  generateSemesterTimetable,
  getTimetableConflicts,
  optimizeTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTodaysTimetable,
  getTimetableByDateRange
} = require("../controllers/timetableGenerator.controller");

// Generate weekly timetable for a batch (keep for backward compatibility)
router.post(
  "/weekly",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator"),
  generateWeeklyTimetable
);

// Generate semester timetable for a batch (keep for backward compatibility)
router.post(
  "/semester",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator"),
  generateSemesterTimetable
);

// Get timetable conflicts for a batch
router.get(
  "/conflicts",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  getTimetableConflicts
);

// Optimize existing timetable (resolve conflicts)
router.post(
  "/optimize",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator"),
  optimizeTimetable
);

// Manual timetable management (Coordinator only)
router.post(
  "/manual",
  authMiddleware,
  roleMiddleware("admin", "coordinator"),
  createTimetableEntry
);

router.put(
  "/manual/:timetableId",
  authMiddleware,
  roleMiddleware("admin", "coordinator"),
  updateTimetableEntry
);

router.delete(
  "/manual/:timetableId",
  authMiddleware,
  roleMiddleware("admin", "coordinator"),
  deleteTimetableEntry
);

// Get timetable for students and teachers
router.get(
  "/today/:batchId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getTodaysTimetable
);

router.get(
  "/range/:batchId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getTimetableByDateRange
);

module.exports = router;
