const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  detectAttendanceAnomalies,
  getAnomalyTrends,
  generateAnomalyReport
} = require("../controllers/anomalyDetection.controller");

// Detect attendance anomalies for a batch
router.get(
  "/detect",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  detectAttendanceAnomalies
);

// Get anomaly trends over time
router.get(
  "/trends",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  getAnomalyTrends
);

// Generate comprehensive anomaly report
router.get(
  "/report",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  generateAnomalyReport
);

module.exports = router;