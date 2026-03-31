const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const Department = require("../models/Department.model");
const College = require("../models/College.model");
const ChatMessage = require("../models/ChatMessage.model");
const getDistanceInMeters = require("../utils/distance");
const getBatchKey = require("../utils/batchKey");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");
const { triggerWebhookEvent } = require("../utils/webhooks");
const { getFaceEmbedding, refreshCacheIfNeeded, cosineSimilarity } = require("../utils/faceCache");
const { getOpencvEndpointCandidates, postToOpenCv } = require("../startup/opencv");
const {
  assertImagePayloadLimit,
  filterValidImageDataUrls
} = require("../utils/imagePayload");

const sendPushNotification = async () => false;

const DEFAULT_ATTENDANCE_DURATION_MINUTES = 10;
const FACE_CONFIDENCE_THRESHOLD = Number(process.env.FACE_CONFIDENCE_THRESHOLD) || 0.5;
const LOCATION_GREEN_METERS = Number(process.env.LOCATION_GREEN_METERS) || 50;
const LOCATION_YELLOW_METERS = Number(process.env.LOCATION_YELLOW_METERS) || 150;
const ATTENDANCE_MAX_RADIUS_METERS = Number(process.env.ATTENDANCE_MAX_RADIUS_METERS) || 100;
const LOCATION_MAX_AGE_MS = Number(process.env.LOCATION_MAX_AGE_MS) || 60000;
const LOCATION_FUTURE_SKEW_MS = Number(process.env.LOCATION_FUTURE_SKEW_MS) || 10000;
const IP_GEO_CHECK_ENABLED = String(process.env.IP_GEO_CHECK_ENABLED || "false") === "true";
const IP_GEO_MAX_MISMATCH_METERS = Number(process.env.IP_GEO_MAX_MISMATCH_METERS) || 50000;
const DEV_FORCE_GREEN_ON_MANUAL_BYPASS = String(
  process.env.DEV_FORCE_GREEN_ON_MANUAL_BYPASS || (process.env.NODE_ENV !== "production" ? "true" : "false")
) === "true";
const ALLOW_STUDENT_MANUAL_BYPASS = String(process.env.ALLOW_STUDENT_MANUAL_BYPASS || "false") === "true";
const DEV_FACE_BYPASS = String(process.env.DEV_FACE_BYPASS || "false") === "true";
const DEV_BYPASS_KEY = String(process.env.DEV_BYPASS_KEY || "").trim();
const DEV_BYPASS_ALLOWED_USERS = (() => {
  const raw = String(process.env.DEV_BYPASS_ALLOWED_USERS || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    }
  } catch (_) {
    // fall through to comma-separated parsing
  }
  return raw.split(",").map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
})();
const LIVE_SCAN_MIN_FRAMES = 1;
const FACE_SIMILARITY_THRESHOLD = 0.65;
const ATTENDANCE_SCAN_COOLDOWN_MS = Number(process.env.ATTENDANCE_SCAN_COOLDOWN_MS) || 15000;
const studentScanCooldowns = new Map();

const normalizeSessionDurationMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ATTENDANCE_DURATION_MINUTES;
  }
  return Math.min(240, Math.max(1, Math.round(parsed)));
};

const getSessionDurationMinutes = (session) => {
  if (Number.isFinite(Number(session?.durationMinutes))) {
    return normalizeSessionDurationMinutes(session.durationMinutes);
  }

  const startMs = new Date(session?.startTime || 0).getTime();
  const endMs = new Date(session?.endTime || 0).getTime();
  if (startMs > 0 && endMs > startMs) {
    return normalizeSessionDurationMinutes((endMs - startMs) / (60 * 1000));
  }

  return DEFAULT_ATTENDANCE_DURATION_MINUTES;
};

const getToday = () => new Date().toISOString().split("T")[0];

const buildClassKey = ({ date, batchKey }) => `${date}_${batchKey}`;

const isDevFaceBypassAuthorized = (req) => {
  if (!DEV_FACE_BYPASS || !DEV_BYPASS_KEY) {
    return false;
  }

  const requestKey = String(req.headers["x-dev-bypass"] || "").trim();
  const requestEmail = String(req.user?.email || "").trim().toLowerCase();
  if (!requestKey || requestKey !== DEV_BYPASS_KEY) {
    return false;
  }

  return DEV_BYPASS_ALLOWED_USERS.includes(requestEmail);
};

const checkAndSetScanCooldown = (studentId, sessionId) => {
  const key = `${studentId}_${sessionId}`;
  const now = Date.now();
  const existing = studentScanCooldowns.get(key) || 0;
  if (existing > now) {
    return Math.ceil((existing - now) / 1000);
  }
  studentScanCooldowns.set(key, now + ATTENDANCE_SCAN_COOLDOWN_MS);
  setTimeout(() => {
    if (studentScanCooldowns.get(key) === now + ATTENDANCE_SCAN_COOLDOWN_MS) {
      studentScanCooldowns.delete(key);
    }
  }, ATTENDANCE_SCAN_COOLDOWN_MS + 1000);
  return 0;
};

const getEffectiveSessionEndTime = (session) => {
  const durationMinutes = getSessionDurationMinutes(session);
  const hardLimitEnd = new Date(
    new Date(session.startTime).getTime() + durationMinutes * 60 * 1000
  );

  if (!session?.endTime) {
    return hardLimitEnd;
  }

  const storedEnd = new Date(session.endTime);
  return storedEnd.getTime() < hardLimitEnd.getTime() ? storedEnd : hardLimitEnd;
};

const isSessionExpired = (session) => {
  return Date.now() > getEffectiveSessionEndTime(session).getTime();
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

const parseFiniteCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getClientIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rawIp = forwarded || req.ip || req.socket?.remoteAddress || "";
  return String(rawIp).replace(/^::ffff:/, "").trim();
};

const isPrivateOrLocalIp = (ip) => {
  if (!ip) return true;
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
};

const lookupIpLocation = async (ip) => {
  if (!IP_GEO_CHECK_ENABLED || !ip || isPrivateOrLocalIp(ip)) {
    return null;
  }

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2500)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const latitude = parseFiniteCoordinate(data?.latitude);
    const longitude = parseFiniteCoordinate(data?.longitude);

    if (latitude == null || longitude == null) {
      return null;
    }

    return { latitude, longitude };
  } catch (_) {
    return null;
  }
};

const validateGeoContext = async ({ req, college, session, latitude, longitude, locationTimestamp }) => {
  if (latitude == null || longitude == null) {
    return { ok: false, status: 400, message: "Valid latitude and longitude are required", code: "INVALID_LOCATION" };
  }

  if (!Number.isFinite(locationTimestamp)) {
    return { ok: false, status: 400, message: "locationTimestamp is required", code: "LOCATION_TIMESTAMP_REQUIRED" };
  }

  const now = Date.now();
  if (locationTimestamp > now + LOCATION_FUTURE_SKEW_MS) {
    return { ok: false, status: 400, message: "Location timestamp is invalid", code: "INVALID_LOCATION_TIMESTAMP" };
  }

  if (now - locationTimestamp > LOCATION_MAX_AGE_MS) {
    return { ok: false, status: 400, message: "Location data is stale", code: "STALE_LOCATION" };
  }

  if (!college?.location?.latitude || !college?.location?.longitude) {
    return { ok: false, status: 400, message: "College location is not configured", code: "COLLEGE_LOCATION_MISSING" };
  }

  const sessionDistance = getDistanceInMeters(
    latitude,
    longitude,
    session.location.latitude,
    session.location.longitude
  );

  const collegeDistance = getDistanceInMeters(
    latitude,
    longitude,
    college.location.latitude,
    college.location.longitude
  );

  if (collegeDistance > ATTENDANCE_MAX_RADIUS_METERS) {
    return {
      ok: false,
      status: 403,
      message: "You are outside the allowed attendance radius",
      code: "OUTSIDE_ALLOWED_RADIUS",
      sessionDistance,
      collegeDistance
    };
  }

  const ipLocation = await lookupIpLocation(getClientIp(req));
  if (ipLocation) {
    const ipDistance = getDistanceInMeters(
      latitude,
      longitude,
      ipLocation.latitude,
      ipLocation.longitude
    );

    if (ipDistance > IP_GEO_MAX_MISMATCH_METERS) {
      return {
        ok: false,
        status: 403,
        message: "Network location does not match submitted GPS location",
        code: "IP_LOCATION_MISMATCH",
        sessionDistance,
        collegeDistance,
        ipDistance
      };
    }
  }

  return {
    ok: true,
    sessionDistance,
    collegeDistance
  };
};

const startAttendanceSession = async (req, res) => {
  try {
    const { subjectId, latitude, longitude, year, division, durationMinutes } = req.body;

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

    if (req.user.role === "teacher") {
      const assignedCount = await Subject.countDocuments({ teacher: req.user._id, isActive: true });
      if (!assignedCount) {
        return res.status(403).json({
          success: false,
          message: "Subject guardrail: no subject assigned to this teacher"
        });
      }
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
      date: today,
      batchKey
    });

    const existing = await AttendanceSession.findOne({ classKey });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Attendance already started once for this batch today"
      });
    }

    const sessionDurationMinutes = normalizeSessionDurationMinutes(durationMinutes);
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + sessionDurationMinutes * 60 * 1000);

    const session = await AttendanceSession.create({
      subject: subject._id,
      teacher: req.user._id,
      department: subject.department._id || subject.department,
      batchKey,
      date: today,
      classKey,
      startTime,
      endTime,
      durationMinutes: sessionDurationMinutes,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      }
    });

    res.status(201).json({
      success: true,
      message: `Attendance session started (${sessionDurationMinutes} min window)`,
      session
    });

// 🔔 PUSH NOTIFICATION SEND
sendPushNotification(
  "📢 Class Started",
  "Your class has started, open app to mark attendance"
).catch((pushError) => {
  console.error("Attendance start push notification error:", pushError);
});
    triggerWebhookEvent({
      event: "attendance.session.started",
      collegeId: req.user.college,
      payload: {
        event: "attendance.session.started",
        sessionId: String(session._id),
        classKey,
        batchKey,
        subjectId: String(subject._id),
        teacherId: String(req.user._id),
        startedAt: session.startTime?.toISOString?.() || new Date(session.startTime).toISOString(),
        endsAt: session.endTime?.toISOString?.() || new Date(session.endTime).toISOString()
      }
    }).catch((webhookError) => {
      console.error("attendance.session.started webhook error:", webhookError);
    });

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${batchKey}`,
      "ATTENDANCE_SESSION_STARTED",
      {
        sessionId: String(session._id),
        subjectId: String(subject._id),
        batchKey,
        endTime: session.endTime,
        teacherName: req.user.name || "",
        teacherEmail: req.user.email || ""
      }
    );

    // Send system message to notify students
    try {
      const systemMessage = await ChatMessage.create({
        roomId: `room_${batchKey}`,
        sender: null,
        senderRole: "system",
        receiver: null,
        message: `Teacher ${req.user.name} has started attendance. You can now mark your attendance.`,
        messageType: "system",
        delivered: true
      });

      emitToCollegeRoom(
        String(req.user.college || ""),
        `batch_${batchKey}`,
        "SYSTEM_MESSAGE",
        {
          messageId: String(systemMessage._id),
          message: systemMessage.message,
          timestamp: systemMessage.createdAt
        }
      );
    } catch (err) {
      console.error("Failed to send system message:", err);
    }

    await logAudit({
      actor: req.user,
      module: "attendance",
      action: "START_SESSION",
      entityType: "AttendanceSession",
      entityId: session._id,
      metadata: { subjectId: String(subject._id), batchKey }
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

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${session.batchKey}`,
      "ATTENDANCE_SESSION_CLOSED",
      {
        sessionId: String(session._id),
        batchKey: session.batchKey,
        endTime: session.endTime
      }
    );

    await logAudit({
      actor: req.user,
      module: "attendance",
      action: "CLOSE_SESSION",
      entityType: "AttendanceSession",
      entityId: session._id,
      metadata: { classKey: session.classKey }
    });

    res.json({
      success: true,
      message: "Attendance session closed"
    });

    triggerWebhookEvent({
      event: "attendance.session.closed",
      collegeId: req.user.college,
      payload: {
        event: "attendance.session.closed",
        sessionId: String(session._id),
        classKey: session.classKey,
        batchKey: session.batchKey,
        teacherId: String(req.user._id),
        closedAt: session.endTime?.toISOString?.() || new Date(session.endTime).toISOString()
      }
    }).catch((webhookError) => {
      console.error("attendance.session.closed webhook error:", webhookError);
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
      date: getToday(),
      batchKey
    });

    const session = await AttendanceSession.findOne({
      classKey,
      batchKey,
      isActive: true
    }).populate("teacher", "name email");

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
      Math.floor((getEffectiveSessionEndTime(session).getTime() - Date.now()) / (1000 * 60))
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

// NEW: Get active class attendance session (subject-agnostic)
const getActiveClassSession = async (req, res) => {
  try {
    const batchKey = getBatchKey({
      department: req.user.department,
      year: req.user.year,
      division: req.user.division
    });

    const session = await AttendanceSession.findOne({
      batchKey,
      isActive: true
    })
      .sort({ startTime: -1, createdAt: -1 })
      .populate("teacher", "name email")
      .populate("subject", "name code");

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

    const remainingSeconds = Math.max(
      0,
      Math.floor((getEffectiveSessionEndTime(session).getTime() - Date.now()) / 1000)
    );

    res.json({
  success: true,
  session,
  remainingSeconds,
  serverTime: new Date().toISOString()
});
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch class session"
    });
  }
};

// NEW: Mark attendance for class session (subject-agnostic)
const markClassAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude, locationTimestamp, manualBypass, userId } = req.body;

    if (userId && String(userId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own attendance",
        code: "USER_MISMATCH"
      });
    }

    if (
      !sessionId ||
      latitude == null ||
      longitude == null ||
      locationTimestamp == null
    ) {
      return res.status(400).json({
        success: false,
        message: "sessionId, latitude, longitude and locationTimestamp are required"
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

    const remainingCooldown = checkAndSetScanCooldown(String(req.user._id), String(session._id));
    if (remainingCooldown) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingCooldown}s before retrying attendance`
      });
    }

    // Check if student already marked attendance today for this batch
    const todayDate = getToday();
    const existingRecord = await AttendanceRecord.findOne({
      student: req.user._id,
      classKey: session.classKey
    });

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }

    const studentProfile = await User.findById(req.user._id).select("faceRegisteredAt email");
    const bypassRequested = Boolean(manualBypass);
    const bypassAllowed =
      (ALLOW_STUDENT_MANUAL_BYPASS && bypassRequested) ||
      (bypassRequested && isDevFaceBypassAuthorized(req));

    if (!studentProfile?.faceRegisteredAt && !bypassAllowed) {
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

    const college = await College.findById(req.user.college).select("location");
    const geoValidation = await validateGeoContext({
      req,
      college,
      session,
      latitude: parseFiniteCoordinate(latitude),
      longitude: parseFiniteCoordinate(longitude),
      locationTimestamp: Number(locationTimestamp)
    });
    if (!geoValidation.ok) {
      return res.status(geoValidation.status).json({
        success: false,
        message: geoValidation.message,
        code: geoValidation.code
      });
    }

    const sessionDistance = geoValidation.sessionDistance;
    const collegeDistance = geoValidation.collegeDistance;

    let status = "absent";
    let locationFlag = "red";
    if (collegeDistance <= LOCATION_GREEN_METERS) {
      status = "present";
      locationFlag = "green";
    } else if (collegeDistance <= LOCATION_YELLOW_METERS) {
      status = "remote";
      locationFlag = "yellow";
    }
    if (
      bypassAllowed &&
      DEV_FORCE_GREEN_ON_MANUAL_BYPASS &&
      collegeDistance <= LOCATION_YELLOW_METERS
    ) {
      status = "present";
      locationFlag = "green";
    }

    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      subject: session.subject,
      batchKey: session.batchKey,
      date: todayDate,
      classKey: session.classKey,
      status,
      locationFlag,
      distanceMeters: collegeDistance,
      gpsDistance: sessionDistance,
      location: {
        latitude: parseFiniteCoordinate(latitude),
        longitude: parseFiniteCoordinate(longitude),
        lat: parseFiniteCoordinate(latitude),
        lng: parseFiniteCoordinate(longitude)
      }
    });

    res.status(201).json({
      success: true,
      message: "Attendance marked",
      attendance: record
    });

    triggerWebhookEvent({
      event: "attendance.marked",
      collegeId: req.user.college,
      payload: {
        event: "attendance.marked",
        sessionId: String(session._id),
        attendanceId: String(record._id),
        classKey: session.classKey,
        batchKey: session.batchKey,
        studentId: String(req.user._id),
        subjectId: String(session.subject),
        status,
        locationFlag,
        verificationMode: bypassAllowed ? "manual-bypass" : "manual",
        markedAt: record.markedAt?.toISOString?.() || new Date(record.markedAt).toISOString()
      }
    }).catch((webhookError) => {
      console.error("attendance.marked webhook error:", webhookError);
    });

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${session.batchKey}`,
      "ATTENDANCE_MARKED",
      {
        sessionId: String(session._id),
        subjectId: String(session.subject),
        studentId: String(req.user._id),
        status,
        locationFlag,
        markedAt: record.markedAt
      }
    );
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

// NEW: Mark class attendance via face scan
const scanFaceAndMarkClassAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude, locationTimestamp, frames, manualBypass, userId } = req.body;

    if (userId && String(userId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own attendance",
        code: "USER_MISMATCH"
      });
    }

    const validFrames = filterValidImageDataUrls(frames);
    if (!sessionId || latitude == null || longitude == null || locationTimestamp == null || validFrames.length < LIVE_SCAN_MIN_FRAMES) {
      return res.status(400).json({
        success: false,
        message: `sessionId, latitude, longitude, locationTimestamp and at least ${LIVE_SCAN_MIN_FRAMES} live frames are required`
      });
    }

    try {
      assertImagePayloadLimit({
        image: validFrames[validFrames.length - 1],
        frames: validFrames
      });
    } catch (payloadError) {
      return res.status(413).json({
        success: false,
        message: payloadError.message,
        code: "IMAGE_PAYLOAD_TOO_LARGE"
      });
    }

    if (!getOpencvEndpointCandidates("verify").length) {
      return res.status(503).json({
        success: false,
        message: "OpenCV verify service not configured",
        code: "OPENCV_NOT_CONFIGURED"
      });
    }

    const session = await AttendanceSession.findById(sessionId);
    if (!session || !session.isActive) {
      return res.status(404).json({
        success: false,
        message: "Attendance session not active",
        code: "SESSION_NOT_ACTIVE"
      });
    }

    if (session.department.toString() !== req.user.department?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Session is outside your department",
        code: "DEPARTMENT_MISMATCH"
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
        message: "Session is not assigned to your batch",
        code: "BATCH_MISMATCH"
      });
    }

    const remainingCooldown = checkAndSetScanCooldown(String(req.user._id), String(session._id));
    if (remainingCooldown) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingCooldown}s before retrying face scan`,
        code: "SCAN_COOLDOWN"
      });
    }

    // Check if student already marked attendance today for this batch
    const todayDate = getToday();
    const existingRecord = await AttendanceRecord.findOne({
      student: req.user._id,
      classKey: session.classKey
    });

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }

    const studentProfile = await User.findById(req.user._id).select("faceRegisteredAt email");
    const bypassRequested = Boolean(manualBypass);
    const bypassAllowed =
      (ALLOW_STUDENT_MANUAL_BYPASS && bypassRequested) ||
      (bypassRequested && isDevFaceBypassAuthorized(req));

    if (!studentProfile?.faceRegisteredAt && !bypassAllowed) {
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

    console.log(`[VERIFY] userId=${req.user._id}`);
    const { response: opencvRes, data: opencvData, url: opencvUrl } = await postToOpenCv(
      "verify",
      {
        userId: String(req.user._id),
        subjectId: String(session.subject),
        image: validFrames[validFrames.length - 1],
        frames: validFrames
      },
      { timeoutMs: 12000, retries: 3 }
    );
    console.log("[OpenCV] calling:", opencvUrl);
    const confidenceValue = Number(opencvData?.confidence);
    const matched = Boolean(opencvData?.matched || opencvData?.success);

    if (
      !opencvRes.ok ||
      !matched ||
      !Number.isFinite(confidenceValue) ||
      confidenceValue < FACE_CONFIDENCE_THRESHOLD
    ) {
      return res.status(403).json({
        success: false,
        message: opencvData?.message || "Face not recognized",
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
        blinkDetected: Boolean(opencvData?.blinkDetected),
        code: opencvData?.code || "FACE_NOT_RECOGNIZED"
      });
    }

    const college = await College.findById(req.user.college).select("location");
    const geoValidation = await validateGeoContext({
      req,
      college,
      session,
      latitude: parseFiniteCoordinate(latitude),
      longitude: parseFiniteCoordinate(longitude),
      locationTimestamp: Number(locationTimestamp)
    });
    if (!geoValidation.ok) {
      return res.status(geoValidation.status).json({
        success: false,
        message: geoValidation.message,
        code: geoValidation.code
      });
    }

    const sessionDistance = geoValidation.sessionDistance;
    const collegeDistance = geoValidation.collegeDistance;

    let status = "absent";
    let locationFlag = "red";
    if (collegeDistance <= LOCATION_GREEN_METERS) {
      status = "present";
      locationFlag = "green";
    } else if (collegeDistance <= LOCATION_YELLOW_METERS) {
      status = "remote";
      locationFlag = "yellow";
    }

    const insertResult = await AttendanceRecord.updateOne(
      {
        student: req.user._id,
        classKey: session.classKey
      },
      {
        $setOnInsert: {
          session: session._id,
          student: req.user._id,
          subject: session.subject,
          batchKey: session.batchKey,
          date: todayDate,
          classKey: session.classKey,
          status,
          locationFlag,
          distanceMeters: collegeDistance,
          gpsDistance: sessionDistance,
          location: {
            latitude: parseFiniteCoordinate(latitude),
            longitude: parseFiniteCoordinate(longitude),
            lat: parseFiniteCoordinate(latitude),
            lng: parseFiniteCoordinate(longitude)
          },
          faceVerified: true,
          faceConfidence: confidenceValue
        }
      },
      {
        upsert: true
      }
    );

    if (!insertResult.upsertedCount) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today",
        code: "ATTENDANCE_ALREADY_MARKED"
      });
    }

    const record = await AttendanceRecord.findOne({
      student: req.user._id,
      classKey: session.classKey
    });

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${session.batchKey}`,
      "ATTENDANCE_MARKED",
      {
        sessionId: String(session._id),
        subjectId: String(session.subject),
        studentId: String(req.user._id),
        status,
        locationFlag,
        markedAt: record.markedAt,
        faceVerified: true
      }
    );

    triggerWebhookEvent({
      event: "attendance.marked",
      collegeId: req.user.college,
      payload: {
        event: "attendance.marked",
        sessionId: String(session._id),
        attendanceId: String(record._id),
        classKey: session.classKey,
        batchKey: session.batchKey,
        studentId: String(req.user._id),
        subjectId: String(session.subject),
        status,
        locationFlag,
        verificationMode: "face",
        blinkDetected: Boolean(opencvData?.blinkDetected),
        faceConfidence: confidenceValue,
        markedAt: record.markedAt?.toISOString?.() || new Date(record.markedAt).toISOString()
      }
    }).catch((webhookError) => {
      console.error("attendance.face webhook error:", webhookError);
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
        message: "Attendance already marked today",
        code: "ATTENDANCE_ALREADY_MARKED"
      });
    }
    if (err.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "Face verification timeout",
        code: "OPENCV_TIMEOUT"
      });
    }
    console.error("scanFaceAndMarkClassAttendance error:", err);
    return res.status(500).json({
      success: false,
      message: "Face attendance failed",
      code: "FACE_ATTENDANCE_FAILED"
    });
  }
};

const markAttendance = async (req, res) => {
  try {
    const { sessionId, latitude, longitude, locationTimestamp, manualBypass, userId } = req.body;

    if (userId && String(userId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own attendance",
        code: "USER_MISMATCH"
      });
    }

    if (
      !sessionId ||
      latitude == null ||
      longitude == null ||
      locationTimestamp == null
    ) {
      return res.status(400).json({
        success: false,
        message: "sessionId, latitude, longitude and locationTimestamp are required"
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
    const bypassRequested = Boolean(manualBypass);
    const bypassAllowed = ALLOW_STUDENT_MANUAL_BYPASS && bypassRequested;

    if (!studentProfile?.faceRegisteredAt && !bypassAllowed) {
      return res.status(403).json({
        success: false,
        message: "Face registration is required before attendance marking",
        code: "FACE_REGISTRATION_REQUIRED"
      });
    }

    const department = await Department.findById(req.user.department).select("college");
    if (!department || department.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Cross-college access denied",
        code: "COLLEGE_MISMATCH"
      });
    }

    if (isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = session.endTime || new Date();
      await session.save();

      return res.status(403).json({
        success: false,
        message: "Attendance window closed",
        code: "SESSION_EXPIRED"
      });
    }

    const college = await College.findById(req.user.college).select("location");
    const geoValidation = await validateGeoContext({
      req,
      college,
      session,
      latitude: parseFiniteCoordinate(latitude),
      longitude: parseFiniteCoordinate(longitude),
      locationTimestamp: Number(locationTimestamp)
    });
    if (!geoValidation.ok) {
      return res.status(geoValidation.status).json({
        success: false,
        message: geoValidation.message,
        code: geoValidation.code
      });
    }

    const sessionDistance = geoValidation.sessionDistance;
    const collegeDistance = geoValidation.collegeDistance;

    let status = "absent";
    let locationFlag = "red";
    if (collegeDistance <= LOCATION_GREEN_METERS) {
      status = "present";
      locationFlag = "green";
    } else if (collegeDistance <= LOCATION_YELLOW_METERS) {
      status = "remote";
      locationFlag = "yellow";
    }
    if (
      bypassAllowed &&
      DEV_FORCE_GREEN_ON_MANUAL_BYPASS &&
      collegeDistance <= LOCATION_YELLOW_METERS
    ) {
      status = "present";
      locationFlag = "green";
    }

    const record = await AttendanceRecord.create({
      session: session._id,
      student: req.user._id,
      subject: session.subject,
      batchKey: session.batchKey,
      date: getToday(),
      classKey: session.classKey,
      status,
      locationFlag,
      distanceMeters: collegeDistance,
      gpsDistance: sessionDistance,
      location: {
        latitude: parseFiniteCoordinate(latitude),
        longitude: parseFiniteCoordinate(longitude),
        lat: parseFiniteCoordinate(latitude),
        lng: parseFiniteCoordinate(longitude)
      }
    });

    res.status(201).json({
      success: true,
      message: "Attendance marked",
      attendance: record
    });

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${session.batchKey}`,
      "ATTENDANCE_MARKED",
      {
        sessionId: String(session._id),
        subjectId: String(session.subject),
        studentId: String(req.user._id),
        status,
        locationFlag,
        markedAt: record.markedAt
      }
    );
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }

    console.error("Attendance marking error:", err);
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

    // Check for duplicate attendance
    const already = await AttendanceRecord.findOne({
      student: finalUserId,
      classKey
    });

    if (already) {
      return res.status(409).json({
        success: false,
        message: "Attendance already marked today"
      });
    }

    await AttendanceRecord.create({
      session: session._id,
      student: finalUserId,
      subject: session.subject,
      batchKey,
      date: getToday(),
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
    const { sessionId, latitude, longitude, locationTimestamp, frames, userId } = req.body;

    if (userId && String(userId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own attendance",
        code: "USER_MISMATCH"
      });
    }

    const validFrames = filterValidImageDataUrls(frames);
    if (!sessionId || latitude == null || longitude == null || locationTimestamp == null || validFrames.length < LIVE_SCAN_MIN_FRAMES) {
      return res.status(400).json({
        success: false,
        message: `sessionId, latitude, longitude, locationTimestamp and at least ${LIVE_SCAN_MIN_FRAMES} live frames are required`
      });
    }

    try {
      assertImagePayloadLimit({
        image: validFrames[validFrames.length - 1],
        frames: validFrames
      });
    } catch (payloadError) {
      return res.status(413).json({
        success: false,
        message: payloadError.message,
        code: "IMAGE_PAYLOAD_TOO_LARGE"
      });
    }

    if (!getOpencvEndpointCandidates("verify").length) {
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

    console.log(`[VERIFY] userId=${req.user._id}`);
    const { response: opencvRes, data: opencvData, url: opencvUrl } = await postToOpenCv(
      "verify",
      {
        userId: String(req.user._id),
        subjectId: String(session.subject),
        image: validFrames[validFrames.length - 1],
        frames: validFrames
      },
      { timeoutMs: 12000, retries: 3 }
    );
    console.log("[OpenCV] calling:", opencvUrl);
    const confidenceValue = Number(opencvData?.confidence);
    const matched = Boolean(opencvData?.matched || opencvData?.success);

    if (
      !opencvRes.ok ||
      !matched ||
      !Number.isFinite(confidenceValue) ||
      confidenceValue < FACE_CONFIDENCE_THRESHOLD
    ) {
      return res.status(403).json({
        success: false,
        message: opencvData?.message || "Face not recognized",
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
        blinkDetected: Boolean(opencvData?.blinkDetected),
        code: opencvData?.code || "FACE_NOT_RECOGNIZED"
      });
    }

    const college = await College.findById(req.user.college).select("location");
    const geoValidation = await validateGeoContext({
      req,
      college,
      session,
      latitude: parseFiniteCoordinate(latitude),
      longitude: parseFiniteCoordinate(longitude),
      locationTimestamp: Number(locationTimestamp)
    });
    if (!geoValidation.ok) {
      return res.status(geoValidation.status).json({
        success: false,
        message: geoValidation.message,
        code: geoValidation.code
      });
    }

    const sessionDistance = geoValidation.sessionDistance;
    const collegeDistance = geoValidation.collegeDistance;

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
      batchKey: session.batchKey,
      date: getToday(),
      classKey: session.classKey,
      status,
      locationFlag,
      distanceMeters: collegeDistance,
      gpsDistance: sessionDistance,
      location: {
        latitude: parseFiniteCoordinate(latitude),
        longitude: parseFiniteCoordinate(longitude),
        lat: parseFiniteCoordinate(latitude),
        lng: parseFiniteCoordinate(longitude)
      },
      faceVerified: true,
      faceConfidence: confidenceValue
    });

    emitToCollegeRoom(
      String(req.user.college || ""),
      `batch_${session.batchKey}`,
      "ATTENDANCE_MARKED",
      {
        sessionId: String(session._id),
        subjectId: String(session.subject),
        studentId: String(req.user._id),
        status,
        locationFlag,
        markedAt: record.markedAt,
        faceVerified: true
      }
    );

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
  scanFaceAndMarkAttendance,
  getActiveClassSession,
  markClassAttendance,
  scanFaceAndMarkClassAttendance
};
