const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createDepartment } = require("../controllers/department.controller");

// ADMIN → CREATE DEPARTMENT
router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  createDepartment
);

module.exports = router;
