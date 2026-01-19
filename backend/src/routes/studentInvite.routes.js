const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createStudentInvite } = require("../controllers/studentInvite.controller");

// only CLASS COORDINATOR can create invite
router.post(
  "/",
  authMiddleware,
  roleMiddleware("coordinator"),
  createStudentInvite
);

module.exports = router;
