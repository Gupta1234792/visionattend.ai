const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");

const {
  teacherReport,
  studentPercentage,
  subjectReport,
  exportCSV,
  exportPDF
} = require("../controllers/report.controller");

// ================= 📊 REPORTS =================

// Teacher-wise report (logged-in teacher)
router.get(
  "/teacher",
  authMiddleware,
  teacherReport
);

// Student attendance percentage (logged-in student)
router.get(
  "/student",
  authMiddleware,
  studentPercentage
);

// Subject-wise detailed report
router.get(
  "/subject/:subjectId",
  authMiddleware,
  subjectReport
);

// ================= 📄 EXPORTS =================

// CSV export (subject-wise)
router.get(
  "/subject/:subjectId/csv",
  authMiddleware,
  exportCSV
);

// PDF export (subject-wise)
router.get(
  "/subject/:subjectId/pdf",
  authMiddleware,
  exportPDF
);

module.exports = router;
