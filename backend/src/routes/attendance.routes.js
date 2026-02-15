const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const opencvAuth = require("../middlewares/opencvAuth.middleware");

const {
  startAttendanceSession,
  markAttendance,
  getActiveSessionForStudent,
  markAttendanceViaFace
} = require("../controllers/attendance.controller");

/* ================= TEACHER ================= */

router.post(
  "/start",
  authMiddleware,
  roleMiddleware("teacher"),
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

/* ================= OPENCV ================= */

router.post(
  "/face",
  opencvAuth,
  markAttendanceViaFace
);

module.exports = router;
