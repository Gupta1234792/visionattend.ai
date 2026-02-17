const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  schedulePTM,
  listMyPTMs,
  confirmPTM,
  startPTM,
  completePTM,
  cancelPTM,
  addPTMNotes
} = require("../controllers/ptm.controller");

router.post(
  "/",
  authMiddleware,
  roleMiddleware("teacher", "coordinator", "hod"),
  schedulePTM
);

router.get(
  "/my",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listMyPTMs
);

router.post(
  "/:ptmId/confirm",
  authMiddleware,
  roleMiddleware("parent", "admin", "hod", "teacher", "coordinator"),
  confirmPTM
);

router.patch(
  "/:ptmId/start",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  startPTM
);

router.patch(
  "/:ptmId/complete",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  completePTM
);

router.patch(
  "/:ptmId/cancel",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  cancelPTM
);

router.patch(
  "/:ptmId/notes",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  addPTMNotes
);

module.exports = router;
