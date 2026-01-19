const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createTeacher } = require("../controllers/teacher.controller");

// only HOD can create teachers
router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod"),
  createTeacher
);

module.exports = router;
