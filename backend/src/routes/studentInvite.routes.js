const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createStudentInvite,
  listStudentInvites,
  disableStudentInvite,
  regenerateStudentInvite
} = require("../controllers/studentInvite.controller");

// class coordinator or teacher can create invite
router.post(
  "/",
  authMiddleware,
  roleMiddleware("coordinator", "teacher"),
  createStudentInvite
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware("coordinator", "teacher"),
  listStudentInvites
);

router.patch(
  "/:inviteId/disable",
  authMiddleware,
  roleMiddleware("coordinator", "teacher"),
  disableStudentInvite
);

router.post(
  "/:inviteId/regenerate",
  authMiddleware,
  roleMiddleware("coordinator", "teacher"),
  regenerateStudentInvite
);

module.exports = router;
