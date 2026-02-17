const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const { createCollege, listColleges } = require("../controllers/college.controller");

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listColleges
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  createCollege
);

module.exports = router;
