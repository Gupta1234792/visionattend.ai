const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const {
  teacherReport,
  studentPercentage,
  studentDailyReport,
  exportStudentDailyCSV,
  subjectReport,
  exportCSV,
  exportPDF
} = require("../controllers/report.controller");

router.get(
  "/teacher",
  authMiddleware,
  roleMiddleware("teacher"),
  teacherReport
);

router.get(
  "/student",
  authMiddleware,
  roleMiddleware("student"),
  studentPercentage
);

router.get(
  "/student/daily",
  authMiddleware,
  roleMiddleware("student"),
  studentDailyReport
);

router.get(
  "/student/daily/csv",
  authMiddleware,
  roleMiddleware("student"),
  exportStudentDailyCSV
);

router.get(
  "/subject/:subjectId",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator", "teacher"),
  subjectReport
);

router.get(
  "/subject/:subjectId/csv",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator", "teacher"),
  exportCSV
);

router.get(
  "/subject/:subjectId/pdf",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator", "teacher"),
  exportPDF
);

module.exports = router;
