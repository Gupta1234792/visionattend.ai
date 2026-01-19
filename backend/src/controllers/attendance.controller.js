const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Subject = require("../models/Subject.model");
const getDistanceInMeters = require("../utils/distance");

// ================= START DAY ATTENDANCE =================
const startAttendanceSession = async (req, res) => {
  try {
    const { subjectId, latitude, longitude } = req.body;

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    if (subject.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this subject"
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const classKey = `${subject._id}_${today}`;

    // 🚫 Prevent parallel session
    const existing = await AttendanceSession.findOne({ classKey, isActive: true });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Attendance already started for today"
      });
    }

    const session = await AttendanceSession.create({
      subject: subject._id,
      teacher: req.user._id,
      department: subject.department,
      date: today,
      classKey,
      startTime: new Date(),
      location: { latitude, longitude }
    });

    return res.status(201).json({
      success: true,
      message: "Day attendance session started",
      session
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to start attendance" });
  }
};


const closeAttendanceSession = async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    session.isActive = false;
    session.endTime = new Date();
    await session.save();

    res.json({
      success: true,
      message: "Attendance session closed"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to close session" });
  }
};

const getActiveSessionForStudent = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const classKey = `${req.params.subjectId}_${today}`;

    const session = await AttendanceSession.findOne({
      classKey,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active attendance session"
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch session"
    });
  }
};



// ================= MARK ATTENDANCE =================
const markAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude } = req.body;

    const session = await AttendanceSession.findById(sessionId);
    if (!session || !session.isActive) {
      return res.status(404).json({
        success: false,
        message: "Attendance session not active"
      });
    }

    if (req.user.department.toString() !== session.department.toString()) {
      return res.status(403).json({
        success: false,
        message: "Student not part of this class"
      });
    }

    const distance = getDistanceInMeters(
      latitude,
      longitude,
      session.location.latitude,
      session.location.longitude
    );

    const status = distance <= 50 ? "present" : "remote";

    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      subject: session.subject,
      classKey: session.classKey,
      status,
      distanceMeters: distance,
      location: { latitude, longitude }
    });

    return res.status(201).json({
      success: true,
      message: "Attendance marked",
      attendance: record
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Failed to mark attendance" });
  }
};

// ================= FACE ATTENDANCE (OPENCV) =================
const markAttendanceViaFace = async (req, res) => {
  try {
    const { userId, subjectId, confidence } = req.body;

    if (!userId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "userId and subjectId required"
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const classKey = `${subjectId}_${today}`;

    const session = await AttendanceSession.findOne({
      classKey,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active attendance session"
      });
    }

    const already = await AttendanceRecord.findOne({
      student: userId,
      classKey
    });

    if (already) {
      return res.json({
        success: true,
        message: "Attendance already marked"
      });
    }

    await AttendanceRecord.create({
      session: session._id,
      student: userId,
      subject: session.subject,
      classKey,
      status: "present",
      faceVerified: true,
      faceConfidence: confidence || null,
      distanceMeters: 0
    });

    return res.json({
      success: true,
      message: "Attendance marked via face"
    });
  } catch (err) {
    console.error("Face attendance error:", err);
    return res.status(500).json({
      success: false,
      message: "Face attendance failed"
    });
  }
};


module.exports = {
  startAttendanceSession,
  markAttendance,
  closeAttendanceSession,
  getActiveSessionForStudent,
  markAttendanceViaFace   // 👈 ADD
};
