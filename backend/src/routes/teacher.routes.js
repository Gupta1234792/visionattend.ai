const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createTeacher, listTeachers, getTeacherGuardrails } = require("../controllers/teacher.controller");

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator", "teacher"),
  listTeachers
);

// only HOD can create teachers
router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod"),
  createTeacher
);

router.get(
  "/me/guardrails",
  authMiddleware,
  roleMiddleware("teacher"),
  getTeacherGuardrails
);

module.exports = router;
