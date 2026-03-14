const express = require("express");
const router = express.Router();

const {
  validateInviteToken,
  resolveInviteCode,
  registerStudent,
  getStudentProfile,
  registerStudentFace,
  confirmStudentFaceRegistration
} = require("../controllers/student.controller");
const { getStudentAnalytics } = require("../controllers/studentAnalytics.controller");

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const opencvAuth = require("../middlewares/opencvAuth.middleware");

// 🔓 PUBLIC ROUTES
router.get("/validate-invite/:token", validateInviteToken);
router.get("/resolve-invite-code/:code", resolveInviteCode);
router.post("/register", registerStudent);

// 🔒 PROTECTED ROUTE
router.get("/me", authMiddleware, getStudentProfile);
router.get("/analytics", authMiddleware, roleMiddleware("student"), getStudentAnalytics);
router.post("/face-register", authMiddleware, roleMiddleware("student"), registerStudentFace);
router.post("/face-register/confirm", opencvAuth, confirmStudentFaceRegistration);

module.exports = router;
