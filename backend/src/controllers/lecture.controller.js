const crypto = require("crypto");
const OnlineLecture = require("../models/OnlineLecture.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Event = require("../models/Event.model");
const Notification = require("../models/Notification.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");

const VIDEO_ROOM_BASE_URL = process.env.VIDEO_ROOM_BASE_URL || "https://visionattend.local/room";

const buildMeeting = () => {
  const meetingRoomId = crypto.randomUUID();
  const meetingLink = `${VIDEO_ROOM_BASE_URL}/${meetingRoomId}`;
  return { meetingRoomId, meetingLink };
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
  if (["teacher", "coordinator"].includes(user.role)) {
    if (user.role === "teacher") {
      return lecture.teacherId.toString() === user._id.toString();
    }
    return lecture.createdBy.toString() === user._id.toString();
  }
  if (user.role === "hod") {
    return true;
  }
  return false;
};

const scheduleLecture = async (req, res) => {
  try {
    const { title, subjectId, batchId, scheduledAt, durationMinutes, recordingUrl } = req.body;

    if (!title || !subjectId || !batchId || !scheduledAt || !durationMinutes) {
      return res.status(400).json({
        success: false,
        message: "title, subjectId, batchId, scheduledAt and durationMinutes are required"
      });
    }

    const subject = await Subject.findById(subjectId).populate("department", "college");
    if (!subject || !subject.department) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    if (subject.department.college.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    if (req.user.role === "teacher") {
      if (subject.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You are not assigned to this subject" });
      }
    }
    if (req.user.role === "coordinator") {
      if (subject.department._id.toString() !== req.user.department?.toString()) {
        return res.status(403).json({ success: false, message: "Subject is outside your department" });
      }
    }

    const { meetingRoomId, meetingLink } = buildMeeting();

    const lecture = await OnlineLecture.create({
      title,
      teacherId: subject.teacher,
      subjectId,
      batchId,
      collegeId: req.user.college,
      scheduledAt: new Date(scheduledAt),
      durationMinutes: Number(durationMinutes),
      meetingRoomId,
      meetingLink,
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
          message: `${title} is scheduled at ${lecture.scheduledAt.toISOString()}`,
          relatedId: lecture._id
        }));
        await Notification.insertMany(docs);
      }
    }

    return res.status(201).json({ success: true, lecture });
  } catch (error) {
    console.error("scheduleLecture error:", error);
    return res.status(500).json({ success: false, message: "Failed to schedule lecture" });
  }
};

const listMyLectures = async (req, res) => {
  try {
    const query = { collegeId: req.user.college };
    if (req.user.role === "coordinator") {
      query.createdBy = req.user._id;
    } else {
      query.teacherId = req.user._id;
    }

    const lectures = await OnlineLecture.find(query)
      .sort({ scheduledAt: -1 })
      .populate("subjectId", "name code")
      .lean();

    return res.json({ success: true, lectures });
  } catch (error) {
    console.error("listMyLectures error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch lectures" });
  }
};

const listBatchLectures = async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (req.user.role === "student" || req.user.role === "parent") {
      const ownBatchId = `${req.user.department}_${req.user.year}_${req.user.division}`;
      if (ownBatchId !== batchId) {
        return res.status(403).json({ success: false, message: "Access denied for this batch" });
      }
    }

    const lectures = await OnlineLecture.find(query)
      .sort({ scheduledAt: 1 })
      .populate("teacherId", "name email")
      .populate("subjectId", "name code")
      .lean();

    return res.json({ success: true, lectures });
  } catch (error) {
    console.error("listBatchLectures error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch batch lectures" });
  }
};

const updateLectureStatus = async (req, res, status) => {
  try {
    const lecture = await OnlineLecture.findById(req.params.lectureId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    if (!canManageLecture(req.user, lecture)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    lecture.status = status;
    if (status === "LIVE") lecture.startedAt = new Date();
    if (status === "ENDED") lecture.endedAt = new Date();

    await lecture.save();

    return res.json({ success: true, lecture });
  } catch (error) {
    console.error("updateLectureStatus error:", error);
    return res.status(500).json({ success: false, message: "Failed to update lecture status" });
  }
};

const startLecture = async (req, res) => updateLectureStatus(req, res, "LIVE");
const endLecture = async (req, res) => updateLectureStatus(req, res, "ENDED");

const joinLecture = async (req, res) => {
  try {
    const lecture = await OnlineLecture.findById(req.params.lectureId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    if (lecture.collegeId.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    const classKey = `online_${lecture._id}`;

    const record = await AttendanceRecord.findOneAndUpdate(
      { student: req.user._id, classKey },
      {
        $setOnInsert: {
          type: "ONLINE",
          onlineLecture: lecture._id,
          student: req.user._id,
          subject: lecture.subjectId,
          classKey,
          status: "present"
        },
        $set: { joinTime: new Date(), markedAt: new Date() }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: "Lecture join recorded",
      attendance: record,
      meetingLink: lecture.meetingLink
    });
  } catch (error) {
    console.error("joinLecture error:", error);
    return res.status(500).json({ success: false, message: "Failed to join lecture" });
  }
};

const leaveLecture = async (req, res) => {
  try {
    const lecture = await OnlineLecture.findById(req.params.lectureId);
    if (!lecture) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    const classKey = `online_${lecture._id}`;
    const record = await AttendanceRecord.findOne({ student: req.user._id, classKey });

    if (!record) {
      return res.status(404).json({ success: false, message: "Join record not found" });
    }

    const leaveTime = new Date();
    const baseJoinTime = record.joinTime || record.createdAt;
    const duration = Math.max(0, Math.floor((leaveTime.getTime() - new Date(baseJoinTime).getTime()) / 60000));

    record.leaveTime = leaveTime;
    record.duration = duration;
    await record.save();

    return res.json({ success: true, attendance: record });
  } catch (error) {
    console.error("leaveLecture error:", error);
    return res.status(500).json({ success: false, message: "Failed to leave lecture" });
  }
};

module.exports = {
  scheduleLecture,
  listMyLectures,
  listBatchLectures,
  startLecture,
  endLecture,
  joinLecture,
  leaveLecture
};
