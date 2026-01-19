const express = require("express");
const router = express.Router();

const {
  validateInviteToken,
  registerStudent,
  getStudentProfile
} = require("../controllers/student.controller");

const authMiddleware = require("../middlewares/auth.middleware");

// 🔓 PUBLIC ROUTES
router.get("/validate-invite/:token", validateInviteToken);
router.post("/register", registerStudent);

// 🔒 PROTECTED ROUTE
router.get("/me", authMiddleware, getStudentProfile);

module.exports = router;
