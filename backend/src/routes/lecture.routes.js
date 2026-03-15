const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  scheduleLecture,
  listMyLectures,
  listBatchLectures,
  startLecture,
  endLecture,
  joinLecture,
  leaveLecture,
  getActiveLecture
} = require("../controllers/lecture.controller");

router.post(
  "/",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  scheduleLecture
);

router.get(
  "/my",
  authMiddleware,
  roleMiddleware("teacher", "coordinator"),
  listMyLectures
);

router.get(
  "/batch/:batchId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  listBatchLectures
);

router.patch(
  "/:lectureId/start",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  startLecture
);

router.patch(
  "/:lectureId/end",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator"),
  endLecture
);

router.post(
  "/:lectureId/join",
  authMiddleware,
  roleMiddleware("student", "parent", "teacher", "coordinator"),
  joinLecture
);

router.post(
  "/:lectureId/leave",
  authMiddleware,
  roleMiddleware("student", "parent", "teacher", "coordinator"),
  leaveLecture
);

router.get(
  "/active/:batchId",
  authMiddleware,
  roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"),
  getActiveLecture
);

module.exports = router;
