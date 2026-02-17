const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createSubject,
  getMySubjects,
  getAccessibleSubjects
} = require("../controllers/subject.controller");

// HOD creates subject
router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod"),
  createSubject
);

// Teacher gets own subjects
router.get(
  "/my",
  authMiddleware,
  roleMiddleware("teacher"),
  getMySubjects
);

// Role-based subjects list without exposing raw lookup UX on frontend
router.get(
  "/mine",
  authMiddleware,
  roleMiddleware("hod", "coordinator", "teacher", "student"),
  getAccessibleSubjects
);

module.exports = router;
