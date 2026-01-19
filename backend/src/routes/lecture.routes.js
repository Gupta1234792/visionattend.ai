const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createLecture } = require("../controllers/lecture.controller");

// Teacher creates lecture
router.post(
  "/",
  authMiddleware,
  roleMiddleware("teacher"),
  createLecture
);

module.exports = router;
