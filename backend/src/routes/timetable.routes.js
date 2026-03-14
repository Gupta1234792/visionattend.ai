const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createTimetable,
  updateTimetable,
  duplicateTimetable,
  listTimetableTemplates,
  createTimetableTemplate,
  updateTimetableTemplate,
  deleteTimetableTemplate,
  applyTimetableTemplate,
  bulkApplyTimetableTemplates,
  deleteTimetable,
  getClassTimetable,
  getTeacherTimetable,
  getBatchWeeklyTimetable,
  exportTimetablePdf
} = require("../controllers/timetable.controller");

const router = express.Router();

router.post(
  "/create",
  authMiddleware,
  roleMiddleware("coordinator"),
  createTimetable
);

router.put(
  "/update/:timetableId",
  authMiddleware,
  roleMiddleware("coordinator"),
  updateTimetable
);

router.post(
  "/duplicate/:timetableId",
  authMiddleware,
  roleMiddleware("coordinator"),
  duplicateTimetable
);

router.get(
  "/templates",
  authMiddleware,
  roleMiddleware("coordinator"),
  listTimetableTemplates
);

router.post(
  "/templates",
  authMiddleware,
  roleMiddleware("coordinator"),
  createTimetableTemplate
);

router.put(
  "/templates/:templateId",
  authMiddleware,
  roleMiddleware("coordinator"),
  updateTimetableTemplate
);

router.delete(
  "/templates/:templateId",
  authMiddleware,
  roleMiddleware("coordinator"),
  deleteTimetableTemplate
);

router.post(
  "/templates/:templateId/apply",
  authMiddleware,
  roleMiddleware("coordinator"),
  applyTimetableTemplate
);

router.post(
  "/templates/bulk-apply",
  authMiddleware,
  roleMiddleware("coordinator"),
  bulkApplyTimetableTemplates
);

router.delete(
  "/delete/:timetableId",
  authMiddleware,
  roleMiddleware("coordinator"),
  deleteTimetable
);

router.get(
  "/class/:classKey",
  authMiddleware,
  roleMiddleware("student", "teacher", "coordinator", "admin", "hod", "parent"),
  getClassTimetable
);

router.get(
  "/teacher/:teacherId",
  authMiddleware,
  roleMiddleware("teacher", "coordinator", "admin", "hod"),
  getTeacherTimetable
);

router.get(
  "/weekly",
  authMiddleware,
  roleMiddleware("student", "teacher", "coordinator", "admin", "hod", "parent"),
  getBatchWeeklyTimetable
);

router.get(
  "/export/:timetableId/pdf",
  authMiddleware,
  roleMiddleware("coordinator", "teacher", "admin", "hod"),
  exportTimetablePdf
);

module.exports = router;
