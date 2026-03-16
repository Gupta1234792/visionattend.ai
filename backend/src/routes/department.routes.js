const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createDepartment, listDepartments, getDepartment, updateDepartment, deleteDepartment } = require("../controllers/department.controller");

// GET /api/departments - List all departments (all roles)
router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listDepartments
);

// GET /api/departments/:id - Get specific department (all roles)
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getDepartment
);

// POST /api/departments - Create department (admin, hod)
router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  createDepartment
);

// PUT /api/departments/:id - Update department (admin, hod)
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  updateDepartment
);

// DELETE /api/departments/:id - Delete department (admin, hod)
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  deleteDepartment
);

module.exports = router;
