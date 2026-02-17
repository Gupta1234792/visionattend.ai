const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createTeacher, listTeachers } = require("../controllers/teacher.controller");

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

module.exports = router;
