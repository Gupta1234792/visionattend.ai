const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createDepartment, listDepartments } = require("../controllers/department.controller");

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listDepartments
);

// ADMIN → CREATE DEPARTMENT
router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  createDepartment
);

module.exports = router;
