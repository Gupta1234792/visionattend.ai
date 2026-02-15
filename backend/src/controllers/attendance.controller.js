const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const getDistanceInMeters = require("../utils/distance");
const getBatchKey = require("../utils/batchKey");

// ================= CONFIG =================
const ATTENDANCE_LIMIT_MINUTES =
  Number(process.env.ATTENDANCE_LIMIT_MINUTES) || 30;

const FACE_CONFIDENCE_THRESHOLD = 0.65;
// =========================================


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

    // 🔑 NEW: batchKey (ADDED, NOT REPLACING ANYTHING)
    const batchKey = getBatchKey({
      department: subject.department,
      year: req.user.year,
      division: req.user.division
    });

    const existing = await AttendanceSession.findOne({
      classKey,
      isActive: true
    });

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
      batchKey,              // ✅ ADDED
      date: today,
      classKey,
      startTime: new Date(),
      location: { latitude, longitude }
    });

    res.status(201).json({
      success: true,
      message: "Attendance session started (30 min window)",
      session
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to start attendance"
    });
  }
};


// ================= CLOSE SESSION =================
const closeAttendanceSession = async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found"
      });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    session.isActive = false;
    session.endTime = new Date();
    await session.save();

    res.json({
      success: true,
      message: "Attendance session closed"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to close session"
    });
  }
};


// ================= GET ACTIVE SESSION (STUDENT) =================
const getActiveSessionForStudent = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const classKey = `${req.params.subjectId}_${today}`;

    // 🔑 NEW: batchKey check (ADDED)
 const batchKey = getBatchKey({
  department: subject.department,
  year: req.user.year,        // undefined for teacher → handled
  division: req.user.division // undefined for teacher → handled
});

    const session = await AttendanceSession.findOne({
      classKey,
      batchKey,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active attendance session"
      });
    }

    const elapsed =
      (Date.now() - new Date(session.startTime)) / (1000 * 60);

    if (elapsed > ATTENDANCE_LIMIT_MINUTES) {
      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
      });
    }

    res.json({
      success: true,
      session,
      remainingMinutes: Math.max(
        0,
        Math.floor(ATTENDANCE_LIMIT_MINUTES - elapsed)
      )
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch session"
    });
  }
};


// ================= MARK ATTENDANCE (GPS) =================
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

    const elapsed =
      (Date.now() - new Date(session.startTime)) / (1000 * 60);

    if (elapsed > ATTENDANCE_LIMIT_MINUTES) {
      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
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

    res.status(201).json({
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
    res.status(500).json({
      success: false,
      message: "Failed to mark attendance"
    });
  }
};


// ================= FACE ATTENDANCE (OPENCV) =================
const markAttendanceViaFace = async (req, res) => {
  try {
    // ✅ BACKWARD COMPATIBLE PAYLOAD
    const {
      user_id,
      subject_id,
      userId,
      subjectId,
      confidence
    } = req.body;

    const finalUserId = user_id || userId;
    const finalSubjectId = subject_id || subjectId;

    if (!finalUserId || !finalSubjectId) {
      return res.status(400).json({
        success: false,
        message: "user_id and subject_id required"
      });
    }

    if (confidence < FACE_CONFIDENCE_THRESHOLD) {
      return res.status(403).json({
        success: false,
        message: "Face confidence too low"
      });
    }

    const student = await User.findById(finalUserId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const classKey = `${finalSubjectId}_${today}`;

    const batchKey = getBatchKey({
      department: student.department,
      year: student.year,
      division: student.division
    });

    const session = await AttendanceSession.findOne({
      classKey,
      batchKey,
      isActive: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active attendance session"
      });
    }

    const already = await AttendanceRecord.findOne({
      student: finalUserId,
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
      student: finalUserId,
      subject: session.subject,
      classKey,
      status: "present",
      faceVerified: true,
      faceConfidence: confidence,
      distanceMeters: 0
    });

    res.json({
      success: true,
      message: "Attendance marked via face"
    });
  } catch (err) {
    console.error("Face attendance error:", err);
    res.status(500).json({
      success: false,
      message: "Face attendance failed"
    });
  }
};


// ================= EXPORTS (UNCHANGED STRUCTURE) =================
module.exports = {
  startAttendanceSession,
  closeAttendanceSession,
  getActiveSessionForStudent,
  markAttendance,
  markAttendanceViaFace
};
