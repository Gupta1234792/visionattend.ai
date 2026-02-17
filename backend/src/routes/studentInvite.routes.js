const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createStudentInvite } = require("../controllers/studentInvite.controller");

// class coordinator or teacher can create invite
router.post(
  "/",
  authMiddleware,
  roleMiddleware("coordinator", "teacher"),
  createStudentInvite
);

module.exports = router;
