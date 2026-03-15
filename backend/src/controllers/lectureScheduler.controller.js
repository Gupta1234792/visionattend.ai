const crypto = require("crypto");
const OnlineLecture = require("../models/OnlineLecture.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Event = require("../models/Event.model");
const Notification = require("../models/Notification.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const BatchHoliday = require("../models/BatchHoliday.model");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");
const { triggerWebhookEvent } = require("../utils/webhooks");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const VIDEO_ROOM_BASE_URL = process.env.VIDEO_ROOM_BASE_URL || `${FRONTEND_URL}/room`;

const buildMeeting = () => {
  const meetingRoomId = crypto.randomUUID();
  const meetingLink = `${VIDEO_ROOM_BASE_URL}/${meetingRoomId}`;
  return { meetingRoomId, meetingLink };
};

const resolveMeetingLink = (lecture) => {
  const roomId = lecture?.meetingRoomId || "";
  const fallback = roomId ? `${VIDEO_ROOM_BASE_URL}/${roomId}` : "";
  const raw = String(lecture?.meetingLink || "").trim();
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    if (url.hostname === "visionattend.local") {
      return fallback || raw;
    }
    return raw;
  } catch {
    return fallback || raw;
  }
};

const parseBatch = (batchId) => {
  if (!batchId) return null;
  const parts = String(batchId).split("_");
  if (parts.length !== 3) return null;
  return {
    department: parts[0],
    year: parts[1],
    division: parts[2]
  };
};

const canManageLecture = (user, lecture) => {
  if (user.role === "admin") return true;
  if (lecture.collegeId.toString() !== user.college?.toString()) return false;
  const batch = parseBatch(lecture.batchId);
  if (["teacher", "coordinator"].includes(user.role)) {
    if (user.role === "teacher" && lecture.status !== "LIVE") {
      return lecture.teacherId.toString() === user._id.toString();
    }
    if (user.role === "coordinator" && lecture.status !== "LIVE") {
      return lecture.createdBy.toString() === user._id.toString();
    }
    if (!batch || !user.department) return false;
    return batch.department.toString() === user.department.toString();
  }
  if (user.role === "hod") {
    return true;
  }
  return false;
};

// NEW: Schedule multiple lectures at once
const scheduleMultipleLectures = async (req, res) => {
  try {
    const { lectures } = req.body;

    if (!Array.isArray(lectures) || lectures.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of lectures is required"
      });
    }

    if (lectures.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Maximum 50 lectures can be scheduled at once"
      });
    }

    const createdLectures = [];
    const errors = [];

    for (let i = 0; i < lectures.length; i++) {
      const lectureData = lectures[i];
      const { title, subjectId, batchId, scheduledAt, durationMinutes, recordingUrl, purpose } = lectureData;

      if (!title || !subjectId || !batchId || !scheduledAt || !durationMinutes) {
        errors.push({
          index: i,
          error: "title, subjectId, batchId, scheduledAt and durationMinutes are required"
        });
        continue;
      }

      try {
        const subject = await Subject.findById(subjectId).populate("department", "college");
        if (!subject || !subject.department) {
          errors.push({
            index: i,
            error: "Subject not found"
          });
          continue;
        }

        if (subject.department.college.toString() !== req.user.college?.toString()) {
          errors.push({
            index: i,
            error: "Cross-college access denied"
          });
          continue;
        }

        if (req.user.role === "teacher") {
          if (subject.teacher.toString() !== req.user._id.toString()) {
            errors.push({
              index: i,
              error: "You are not assigned to this subject"
            });
            continue;
          }
        }
        if (req.user.role === "coordinator") {
          if (subject.department._id.toString() !== req.user.department?.toString()) {
            errors.push({
              index: i,
              error: "Subject is outside your department"
            });
            continue;
          }
        }

        const scheduleDate = new Date(scheduledAt);
        const overlappingHoliday = await BatchHoliday.findOne({
          collegeId: req.user.college,
          batchId,
          isActive: true,
          fromDate: { $lte: scheduleDate },
          toDate: { $gte: scheduleDate }
        }).lean();

        if (overlappingHoliday) {
          errors.push({
            index: i,
            error: `Holiday active for selected batch: ${overlappingHoliday.reason}`
          });
          continue;
        }

        const { meetingRoomId, meetingLink } = buildMeeting();

        const lecture = await OnlineLecture.create({
          title,
          teacherId: subject.teacher,
          subjectId,
          batchId,
          collegeId: req.user.college,
          scheduledAt: scheduleDate,
          durationMinutes: Number(durationMinutes),
          meetingRoomId,
          meetingLink,
          purpose: String(purpose || "").trim(),
          recordingUrl: recordingUrl || null,
          createdBy: req.user._id
        });

        await Event.create({
          title,
          type: "LECTURE",
          relatedId: lecture._id,
          scheduledAt: lecture.scheduledAt,
          collegeId: req.user.college,
          batchId,
          createdBy: req.user._id
        });

        createdLectures.push(lecture);

        // Send notifications to students
        const batch = parseBatch(batchId);
        if (batch) {
          const students = await User.find({
            role: "student",
            college: req.user.college,
            department: batch.department,
            year: batch.year,
            division: batch.division,
            isActive: true
          }).select("_id");

          if (students.length) {
            const docs = students.map((s) => ({
              userId: s._id,
              collegeId: req.user.college,
              batchId,
              type: "LECTURE_REMINDER",
              title: "Lecture Scheduled",
              message: `${title} is scheduled at ${lecture.scheduledAt.toISOString()}${lecture.purpose ? ` | Purpose: ${lecture.purpose}` : ""}`,
              relatedId: lecture._id,
              status: "scheduled",
              scheduledFor: lecture.scheduledAt
            }));
            await Notification.insertMany(docs);
          }
        }

        await logAudit({
          actor: req.user,
          module: "lecture",
          action: "CREATE",
          entityType: "OnlineLecture",
          entityId: lecture._id,
          metadata: { subjectId: String(subjectId), batchId, bulk: true }
        });

        triggerWebhookEvent({
          event: "lecture.scheduled",
          collegeId: req.user.college,
          payload: {
            event: "lecture.scheduled",
            lectureId: String(lecture._id),
            title: lecture.title,
            batchId: lecture.batchId,
            subjectId: String(lecture.subjectId),
            teacherId: String(lecture.teacherId),
            scheduledAt: lecture.scheduledAt?.toISOString?.() || new Date(lecture.scheduledAt).toISOString(),
            durationMinutes: lecture.durationMinutes,
            meetingRoomId: lecture.meetingRoomId,
            bulk: true
          }
        }).catch((webhookError) => {
          console.error("lecture.scheduled webhook error:", webhookError);
        });

      } catch (error) {
        errors.push({
          index: i,
          error: error.message || "Failed to create lecture"
        });
      }
    }

    return res.status(201).json({
      success: true,
      createdLectures,
      errors,
      message: `Created ${createdLectures.length} lectures. ${errors.length} errors.`
    });
  } catch (error) {
    console.error("scheduleMultipleLectures error:", error);
    return res.status(500).json({ success: false, message: "Failed to schedule lectures" });
  }
};

// NEW: Get lecture schedule for a specific date range
const getLectureSchedule = async (req, res) => {
  try {
    const { batchId, startDate, endDate, teacherId } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (teacherId) {
      query.teacherId = teacherId;
    }

    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    const lectures = await OnlineLecture.find(query)
      .sort({ scheduledAt: 1 })
      .populate("teacherId", "name email")
      .populate("subjectId", "name code")
      .lean();

    const normalized = lectures.map((lecture) => ({
      ...lecture,
      meetingLink: resolveMeetingLink(lecture)
    }));

    return res.json({ success: true, lectures: normalized });
  } catch (error) {
    console.error("getLectureSchedule error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch lecture schedule" });
  }
};

// NEW: Cancel multiple lectures
const cancelLectures = async (req, res) => {
  try {
    const { lectureIds } = req.body;

    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of lecture IDs is required"
      });
    }

    if (lectureIds.length > 20) {
      return res.status(400).json({
        success: false,
        message: "Maximum 20 lectures can be canceled at once"
      });
    }

    const canceledLectures = [];
    const errors = [];

    for (let i = 0; i < lectureIds.length; i++) {
      const lectureId = lectureIds[i];

      try {
        const lecture = await OnlineLecture.findById(lectureId);
        if (!lecture) {
          errors.push({
            index: i,
            lectureId,
            error: "Lecture not found"
          });
          continue;
        }

        const canManage = canManageLecture(req.user, lecture);
        if (!canManage) {
          errors.push({
            index: i,
            lectureId,
            error: "Access denied"
          });
          continue;
        }

        lecture.status = "CANCELED";
        lecture.cancelReason = req.body.reason || "Canceled by teacher";
        await lecture.save();

        canceledLectures.push(lecture);

        // Send cancellation notifications
        const batch = parseBatch(lecture.batchId);
        if (batch) {
          const students = await User.find({
            role: "student",
            college: lecture.collegeId,
            department: batch.department,
            year: batch.year,
            division: batch.division,
            isActive: true
          }).select("_id");

          if (students.length) {
            const now = new Date();
            await Notification.insertMany(
              students.map((student) => ({
                userId: student._id,
                collegeId: lecture.collegeId,
                batchId: lecture.batchId,
                type: "GENERAL",
                title: "Lecture Canceled",
                message: `${lecture.title} has been canceled. Reason: ${lecture.cancelReason}`,
                relatedId: lecture._id,
                status: "delivered",
                deliveredAt: now
              }))
            );
          }
        }

        await logAudit({
          actor: req.user,
          module: "lecture",
          action: "CANCEL",
          entityType: "OnlineLecture",
          entityId: lecture._id,
          metadata: { batchId: lecture.batchId, reason: lecture.cancelReason }
        });

        triggerWebhookEvent({
          event: "lecture.canceled",
          collegeId: lecture.collegeId,
          payload: {
            event: "lecture.canceled",
            lectureId: String(lecture._id),
            title: lecture.title,
            batchId: lecture.batchId,
            reason: lecture.cancelReason,
            canceledAt: new Date().toISOString()
          }
        }).catch((webhookError) => {
          console.error("lecture.canceled webhook error:", webhookError);
        });

      } catch (error) {
        errors.push({
          index: i,
          lectureId,
          error: error.message || "Failed to cancel lecture"
        });
      }
    }

    return res.json({
      success: true,
      canceledLectures,
      errors,
      message: `Canceled ${canceledLectures.length} lectures. ${errors.length} errors.`
    });
  } catch (error) {
    console.error("cancelLectures error:", error);
    return res.status(500).json({ success: false, message: "Failed to cancel lectures" });
  }
};

// NEW: Get lecture statistics for a batch
const getLectureStats = async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    const lectures = await OnlineLecture.find(query).lean();

    const stats = {
      total: lectures.length,
      scheduled: lectures.filter(l => l.status === "SCHEDULED").length,
      live: lectures.filter(l => l.status === "LIVE").length,
      ended: lectures.filter(l => l.status === "ENDED").length,
      canceled: lectures.filter(l => l.status === "CANCELED").length,
      withRecordings: lectures.filter(l => l.recordingUrl).length
    };

    // Get attendance stats for online lectures
    const onlineLectureIds = lectures.map(l => l._id);
    const attendanceRecords = await AttendanceRecord.find({
      onlineLecture: { $in: onlineLectureIds },
      status: { $in: ["present", "remote"] }
    }).lean();

    const uniqueStudents = new Set(attendanceRecords.map(r => r.student.toString()));
    const avgAttendancePerLecture = onlineLectureIds.length > 0 
      ? Math.round((attendanceRecords.length / onlineLectureIds.length) * 100) / 100 
      : 0;

    stats.attendance = {
      totalMarks: attendanceRecords.length,
      uniqueStudents: uniqueStudents.size,
      avgAttendancePerLecture
    };

    return res.json({ success: true, stats });
  } catch (error) {
    console.error("getLectureStats error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch lecture stats" });
  }
};

module.exports = {
  scheduleMultipleLectures,
  getLectureSchedule,
  cancelLectures,
  getLectureStats
};