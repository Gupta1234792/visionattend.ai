const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const opencvAuth = require("../middlewares/opencvAuth.middleware");
const requireFaceRegistration = require("../middlewares/requireFaceRegistration");

const {
  startAttendanceSession,
  markAttendance,
  getActiveSessionForStudent,
  markAttendanceViaFace,
  scanFaceAndMarkAttendance,
  getActiveClassSession,
  markClassAttendance,
  scanFaceAndMarkClassAttendance
} = require("../controllers/attendance.controller");

/* ================= TEACHER ================= */

router.post(
  "/start",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  startAttendanceSession
);

/* ================= STUDENT ================= */

router.get(
  "/active/:subjectId",
  authMiddleware,
  roleMiddleware("student"),
  getActiveSessionForStudent
);

router.post(
  "/mark",
  authMiddleware,
  roleMiddleware("student"),
  requireFaceRegistration,
  markAttendance
);

router.post(
  "/scan-face",
  authMiddleware,
  roleMiddleware("student"),
  requireFaceRegistration,
  scanFaceAndMarkAttendance
);

// NEW: Get active class session (subject-agnostic)
router.get(
  "/active-class",
  authMiddleware,
  roleMiddleware("student"),
  getActiveClassSession
);

// NEW: Mark class attendance (subject-agnostic)
router.post(
  "/mark-class",
  authMiddleware,
  roleMiddleware("student"),
  requireFaceRegistration,
  markClassAttendance
);

// NEW: Scan face and mark class attendance (subject-agnostic)
router.post(
  "/scan-face-class",
  authMiddleware,
  roleMiddleware("student"),
  requireFaceRegistration,
  scanFaceAndMarkClassAttendance
);

/* ================= OPENCV ================= */

router.post(
  "/face",
  opencvAuth,
  markAttendanceViaFace
);

module.exports = router;
