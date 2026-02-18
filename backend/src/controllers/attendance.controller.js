const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const Department = require("../models/Department.model");
const College = require("../models/College.model");
const getDistanceInMeters = require("../utils/distance");
const getBatchKey = require("../utils/batchKey");

const ATTENDANCE_LIMIT_MINUTES = Number(process.env.ATTENDANCE_LIMIT_MINUTES) || 30;
const FACE_CONFIDENCE_THRESHOLD = 0.65;
const LOCATION_GREEN_METERS = Number(process.env.LOCATION_GREEN_METERS) || 50;
const LOCATION_YELLOW_METERS = Number(process.env.LOCATION_YELLOW_METERS) || 150;
const OPENCV_VERIFY_URL = process.env.OPENCV_VERIFY_URL || "";

const getToday = () => new Date().toISOString().split("T")[0];

const buildClassKey = ({ subjectId, date, batchKey }) => `${subjectId}_${date}_${batchKey}`;

const isSessionExpired = (session) => {
  if (session.endTime) {
    return Date.now() > new Date(session.endTime).getTime();
  }

  const elapsedMinutes = (Date.now() - new Date(session.startTime).getTime()) / (1000 * 60);
  return elapsedMinutes > ATTENDANCE_LIMIT_MINUTES;
};

const ensureSubjectTenantAccess = async (subjectId, user) => {
  const subject = await Subject.findById(subjectId).populate("department", "college");
  if (!subject) {
    return { ok: false, status: 404, message: "Subject not found" };
  }

  const department = subject.department;
  if (!department) {
    return { ok: false, status: 400, message: "Subject department not configured" };
  }

  if (user.college && department.college?.toString() !== user.college.toString()) {
    return { ok: false, status: 403, message: "Cross-college access denied" };
  }

  return { ok: true, subject };
};

const startAttendanceSession = async (req, res) => {
  try {
    const { subjectId, latitude, longitude, year, division } = req.body;

    if (
      subjectId == null ||
      latitude == null ||
      longitude == null
    ) {
      return res.status(400).json({
        success: false,
        message: "subjectId, latitude and longitude are required"
      });
    }

    const tenantCheck = await ensureSubjectTenantAccess(subjectId, req.user);
    if (!tenantCheck.ok) {
      return res.status(tenantCheck.status).json({ success: false, message: tenantCheck.message });
    }

    const subject = tenantCheck.subject;

    if (req.user.role === "teacher" && subject.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this subject"
      });
    }

    if (
      req.user.role === "coordinator" &&
      subject.department?._id?.toString() !== req.user.department?.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Subject is outside your department"
      });
    }

    const batchYear = year || req.user.year;
    const batchDivision = division || req.user.division;

    if (!batchYear || !batchDivision) {
      return res.status(400).json({
        success: false,
        message: "year and division are required to start attendance"
      });
    }

    const today = getToday();
    const batchKey = getBatchKey({
      department: subject.department._id || subject.department,
      year: batchYear,
      division: batchDivision
    });

    const classKey = buildClassKey({
      subjectId: subject._id,
      date: today,
      batchKey
    });

    const existing = await AttendanceSession.findOne({ classKey });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Attendance already created for this batch today"
      });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + ATTENDANCE_LIMIT_MINUTES * 60 * 1000);

    const session = await AttendanceSession.create({
      subject: subject._id,
      teacher: req.user._id,
      department: subject.department._id || subject.department,
      batchKey,
      date: today,
      classKey,
      startTime,
      endTime,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      }
    });

    res.status(201).json({
      success: true,
      message: `Attendance session started (${ATTENDANCE_LIMIT_MINUTES} min window)`,
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

const getActiveSessionForStudent = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const tenantCheck = await ensureSubjectTenantAccess(subjectId, req.user);
    if (!tenantCheck.ok) {
      return res.status(tenantCheck.status).json({ success: false, message: tenantCheck.message });
    }

    const subject = tenantCheck.subject;

    if (req.user.department?.toString() !== subject.department._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Subject is outside your department"
      });
    }

    const batchKey = getBatchKey({
      department: req.user.department,
      year: req.user.year,
      division: req.user.division
    });

    const classKey = buildClassKey({
      subjectId,
      date: getToday(),
      batchKey
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

    if (isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = session.endTime || new Date();
      await session.save();

      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
      });
    }

    const remainingMinutes = Math.max(
      0,
      Math.floor((new Date(session.endTime).getTime() - Date.now()) / (1000 * 60))
    );

    res.json({
      success: true,
      session,
      remainingMinutes
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch session"
    });
  }
};

const markAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude } = req.body;

    if (
      !sessionId ||
      latitude == null ||
      longitude == null
    ) {
      return res.status(400).json({
        success: false,
        message: "sessionId, latitude and longitude are required"
      });
    }

    const session = await AttendanceSession.findById(sessionId);
    if (!session || !session.isActive) {
      return res.status(404).json({
        success: false,
        message: "Attendance session not active"
      });
    }

    if (session.department.toString() !== req.user.department?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Session is outside your department"
      });
    }

    const expectedBatchKey = getBatchKey({
      department: req.user.department,
      year: req.user.year,
      division: req.user.division
    });

    if (session.batchKey !== expectedBatchKey) {
      return res.status(403).json({
        success: false,
        message: "Session is not assigned to your batch"
      });
    }

    const studentProfile = await User.findById(req.user._id).select("faceRegisteredAt");
    if (!studentProfile?.faceRegisteredAt) {
      return res.status(403).json({
        success: false,
        message: "Face registration is required before attendance marking"
      });
    }

    const department = await Department.findById(req.user.department).select("college");
    if (!department || department.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Cross-college access denied"
      });
    }

    if (isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = session.endTime || new Date();
      await session.save();

      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
      });
    }

    const sessionDistance = getDistanceInMeters(
      Number(latitude),
      Number(longitude),
      session.location.latitude,
      session.location.longitude
    );

    const college = await College.findById(req.user.college).select("location");
    if (!college?.location?.latitude || !college?.location?.longitude) {
      return res.status(400).json({
        success: false,
        message: "College location is not configured"
      });
    }

    const collegeDistance = getDistanceInMeters(
      Number(latitude),
      Number(longitude),
      college.location.latitude,
      college.location.longitude
    );

    let status = "absent";
    let locationFlag = "red";
    if (collegeDistance <= LOCATION_GREEN_METERS) {
      status = "present";
      locationFlag = "green";
    } else if (collegeDistance <= LOCATION_YELLOW_METERS) {
      status = "remote";
      locationFlag = "yellow";
    }

    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      subject: session.subject,
      classKey: session.classKey,
      status,
      locationFlag,
      distanceMeters: collegeDistance,
      gpsDistance: sessionDistance,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      }
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

const markAttendanceViaFace = async (req, res) => {
  try {
    const { user_id, subject_id, userId, subjectId, confidence } = req.body;

    const finalUserId = user_id || userId;
    const finalSubjectId = subject_id || subjectId;
    const confidenceValue = Number(confidence);

    if (!finalUserId || !finalSubjectId) {
      return res.status(400).json({
        success: false,
        message: "user_id and subject_id required"
      });
    }

    if (!Number.isFinite(confidenceValue)) {
      return res.status(400).json({
        success: false,
        message: "confidence must be a number"
      });
    }

    if (confidenceValue < FACE_CONFIDENCE_THRESHOLD) {
      return res.status(403).json({
        success: false,
        message: "Face confidence too low"
      });
    }

    const student = await User.findById(finalUserId).select(
      "_id role isActive college department year division faceRegisteredAt"
    );

    if (!student || student.role !== "student" || !student.isActive) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    if (!student.faceRegisteredAt) {
      return res.status(403).json({
        success: false,
        message: "Student face is not registered"
      });
    }

    const subject = await Subject.findById(finalSubjectId).populate("department", "college");
    if (!subject || !subject.department) {
      return res.status(404).json({
        success: false,
        message: "Subject not found"
      });
    }

    if (
      student.college?.toString() !== subject.department.college?.toString() ||
      student.department?.toString() !== subject.department._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Cross-tenant or cross-department access denied"
      });
    }

    const batchKey = getBatchKey({
      department: student.department,
      year: student.year,
      division: student.division
    });

    const classKey = buildClassKey({
      subjectId: finalSubjectId,
      date: getToday(),
      batchKey
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

    if (isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = session.endTime || new Date();
      await session.save();

      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
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
      locationFlag: "green",
      faceVerified: true,
      faceConfidence: confidenceValue,
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

const scanFaceAndMarkAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude, image } = req.body;

    if (!sessionId || latitude == null || longitude == null || !image) {
      return res.status(400).json({
        success: false,
        message: "sessionId, latitude, longitude and image are required"
      });
    }

    if (!OPENCV_VERIFY_URL) {
      return res.status(503).json({
        success: false,
        message: "OpenCV verify service not configured"
      });
    }

    const session = await AttendanceSession.findById(sessionId);
    if (!session || !session.isActive) {
      return res.status(404).json({
        success: false,
        message: "Attendance session not active"
      });
    }

    if (session.department.toString() !== req.user.department?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Session is outside your department"
      });
    }

    const expectedBatchKey = getBatchKey({
      department: req.user.department,
      year: req.user.year,
      division: req.user.division
    });

    if (session.batchKey !== expectedBatchKey) {
      return res.status(403).json({
        success: false,
        message: "Session is not assigned to your batch"
      });
    }

    const student = await User.findById(req.user._id).select("faceRegisteredAt college department year division");
    if (!student?.faceRegisteredAt) {
      return res.status(403).json({
        success: false,
        message: "Face registration is required before attendance marking"
      });
    }

    const department = await Department.findById(req.user.department).select("college");
    if (!department || department.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Cross-college access denied"
      });
    }

    if (isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = session.endTime || new Date();
      await session.save();

      return res.status(403).json({
        success: false,
        message: "Attendance window closed"
      });
    }

    const opencvRes = await fetch(OPENCV_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: String(req.user._id),
        subjectId: String(session.subject),
        image
      })
    });

    const opencvData = await opencvRes.json().catch(() => ({}));
    const confidenceValue = Number(opencvData?.confidence);
    const matched = Boolean(opencvData?.matched || opencvData?.success);

    if (!opencvRes.ok || !matched || !Number.isFinite(confidenceValue) || confidenceValue < FACE_CONFIDENCE_THRESHOLD) {
      return res.status(403).json({
        success: false,
        message: "Face not recognized",
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null
      });
    }

    const college = await College.findById(req.user.college).select("location");
    if (!college?.location?.latitude || !college?.location?.longitude) {
      return res.status(400).json({
        success: false,
        message: "College location is not configured"
      });
    }

    const sessionDistance = getDistanceInMeters(
      Number(latitude),
      Number(longitude),
      session.location.latitude,
      session.location.longitude
    );

    const collegeDistance = getDistanceInMeters(
      Number(latitude),
      Number(longitude),
      college.location.latitude,
      college.location.longitude
    );

    let status = "absent";
    let locationFlag = "red";
    if (collegeDistance <= LOCATION_GREEN_METERS) {
      status = "present";
      locationFlag = "green";
    } else if (collegeDistance <= LOCATION_YELLOW_METERS) {
      status = "remote";
      locationFlag = "yellow";
    }

    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      subject: session.subject,
      classKey: session.classKey,
      status,
      locationFlag,
      distanceMeters: collegeDistance,
      gpsDistance: sessionDistance,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      },
      faceVerified: true,
      faceConfidence: confidenceValue
    });

    return res.status(201).json({
      success: true,
      message: "Attendance marked via face scan",
      attendance: record
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }
    console.error("scanFaceAndMarkAttendance error:", err);
    return res.status(500).json({
      success: false,
      message: "Face attendance failed"
    });
  }
};

module.exports = {
  startAttendanceSession,
  closeAttendanceSession,
  getActiveSessionForStudent,
  markAttendance,
  markAttendanceViaFace,
  scanFaceAndMarkAttendance
};
