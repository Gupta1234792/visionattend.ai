const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createCollege,
  listColleges,
  getCollegeById,
  updateCollege
} = require("../controllers/college.controller");

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

router.get(
  "/:collegeId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getCollegeById
);

router.patch(
  "/:collegeId",
  authMiddleware,
  roleMiddleware("admin"),
  updateCollege
);

module.exports = router;
