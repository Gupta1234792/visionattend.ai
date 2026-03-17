const express = require("express");
const { 
  createTimetable, 
  updateTimetable, 
  deleteTimetable, 
  getTodaysTimetable, 
  getTimetableByDate, 
  getBatchTimetables 
} = require("../controllers/timetable.controller");
const { auth } = require("../middlewares/auth.middleware");
const { role } = require("../middlewares/role.middleware");

const router = express.Router();

// Coordinator routes - require coordinator role
router.post("/create", auth, role("coordinator"), createTimetable);
router.put("/update/:id", auth, role("coordinator"), updateTimetable);
router.delete("/delete/:id", auth, role("coordinator"), deleteTimetable);

// Public routes - accessible to all authenticated users
router.get("/today/:batchKey", auth, getTodaysTimetable);
router.get("/date/:batchKey/:date", auth, getTimetableByDate);
router.get("/batch/:batchKey", auth, getBatchTimetables);

module.exports = router;