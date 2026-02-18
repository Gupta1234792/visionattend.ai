const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const opencvAuth = require("../middlewares/opencvAuth.middleware");

const {
  startAttendanceSession,
  markAttendance,
  getActiveSessionForStudent,
  markAttendanceViaFace,
  scanFaceAndMarkAttendance
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
  markAttendance
);

router.post(
  "/scan-face",
  authMiddleware,
  roleMiddleware("student"),
  scanFaceAndMarkAttendance
);

/* ================= OPENCV ================= */

router.post(
  "/face",
  opencvAuth,
  markAttendanceViaFace
);

module.exports = router;
