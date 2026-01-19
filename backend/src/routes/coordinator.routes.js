const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createCoordinator } = require("../controllers/coordinator.controller");

// HOD → CREATE CLASS COORDINATOR
router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod"),
  createCoordinator
);

module.exports = router;
