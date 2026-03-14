const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createCoordinator,
  listCoordinators
} = require("../controllers/coordinator.controller");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "coordinator"),
  listCoordinators
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod"),
  createCoordinator
);

module.exports = router;
