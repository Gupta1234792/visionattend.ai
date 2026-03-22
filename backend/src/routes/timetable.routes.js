const express = require("express");

const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const {
  createTimetable,
  updateTimetable,
  deleteTimetable,
  duplicateTimetable,
  getClassTimetable,
  getTodayTimetable,
  getTeacherTimetable,
  getWeeklyTimetable,
  getTimetableTemplates,
  createTimetableTemplate,
  updateTimetableTemplate,
  deleteTimetableTemplate,
  applyTimetableTemplate,
  bulkApplyTimetableTemplates,
  downloadTimetablePdf
} = require("../controllers/timetable.controller");

router.post("/create", authMiddleware, roleMiddleware("admin", "coordinator"), createTimetable);
router.put("/update/:timetableId", authMiddleware, roleMiddleware("admin", "coordinator"), updateTimetable);
router.delete("/delete/:timetableId", authMiddleware, roleMiddleware("admin", "coordinator"), deleteTimetable);
router.post("/duplicate/:timetableId", authMiddleware, roleMiddleware("admin", "coordinator"), duplicateTimetable);

router.get("/today/:batchKey", authMiddleware, roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"), getTodayTimetable);
router.get("/class/:classKey", authMiddleware, roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"), getClassTimetable);
router.get("/teacher/:teacherId", authMiddleware, roleMiddleware("admin", "hod", "teacher", "coordinator"), getTeacherTimetable);
router.get("/weekly", authMiddleware, roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"), getWeeklyTimetable);

router.get("/templates", authMiddleware, roleMiddleware("admin", "coordinator"), getTimetableTemplates);
router.post("/templates", authMiddleware, roleMiddleware("admin", "coordinator"), createTimetableTemplate);
router.put("/templates/:templateId", authMiddleware, roleMiddleware("admin", "coordinator"), updateTimetableTemplate);
router.delete("/templates/:templateId", authMiddleware, roleMiddleware("admin", "coordinator"), deleteTimetableTemplate);
router.post("/templates/:templateId/apply", authMiddleware, roleMiddleware("admin", "coordinator"), applyTimetableTemplate);
router.post("/templates/bulk-apply", authMiddleware, roleMiddleware("admin", "coordinator"), bulkApplyTimetableTemplates);

router.get("/export/:timetableId/pdf", authMiddleware, roleMiddleware("admin", "hod", "teacher", "coordinator", "student", "parent"), downloadTimetablePdf);

module.exports = router;
