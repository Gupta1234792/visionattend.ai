const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const opencvAuth = require("../middlewares/opencvAuth.middleware");

const {
  startAttendanceSession,
  markAttendance,
  closeAttendanceSession,
  getActiveSessionForStudent,
  markAttendanceViaFace
} = require("../controllers/attendance.controller");

/* =========================================================
   TEACHER ROUTES
   ========================================================= */

// ▶ Start day-wise attendance (ONE per subject per day)
router.post(
  "/start",
  authMiddleware,
  roleMiddleware("teacher"),
  startAttendanceSession
);

// ⏹ Manually close attendance session
router.post(
  "/close/:sessionId",
  authMiddleware,
  roleMiddleware("teacher"),
  closeAttendanceSession
);

/* =========================================================
   STUDENT ROUTES
   ========================================================= */

// 🔎 Get active attendance session (for today)
router.get(
  "/active/:subjectId",
  authMiddleware,
  roleMiddleware("student"),
  getActiveSessionForStudent
);

// ✅ Manual attendance (GPS / fallback)
router.post(
  "/mark",
  authMiddleware,
  roleMiddleware("student"),
  markAttendance
);

/* =========================================================
   OPENCV ROUTE (NO JWT ❌, ONLY API KEY ✅)
   ========================================================= */

router.post(
  "/face",
  opencvAuth,          // 🔐 THIS IS IMPORTANT
  markAttendanceViaFace
);

module.exports = router;
