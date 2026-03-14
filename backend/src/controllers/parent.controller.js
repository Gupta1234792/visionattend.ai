const Parent = require("../models/Parent.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const Timetable = require("../models/Timetable.model");
const OnlineLecture = require("../models/OnlineLecture.model");
const BatchHoliday = require("../models/BatchHoliday.model");
const User = require("../models/User.model");
const { Parser } = require("json2csv");
const { buildAttendanceInsightsForStudent } = require("./attendanceInsights");
const { syncParentLinksForUser } = require("../utils/parentLinks");

const getBatchIdForStudent = (student) => {
  if (!student?.department || !student?.year || !student?.division) return "";
  return `${student.department}_${student.year}_${student.division}`;
};

const getTodayKey = () => new Date().toISOString().split("T")[0];

const getWeekRangeKeys = () => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    startKey: start.toISOString().split("T")[0],
    endKey: end.toISOString().split("T")[0]
  };
};

const buildStudentDailyRecords = async (student) => {
  if (!student?.department || !student?.year || !student?.division) {
    return { batchKey: "", records: [] };
  }

  const batchKey = `${student.department}_${student.year}_${student.division}`;
  const sessions = await AttendanceSession.find({
    batchKey,
    isActive: { $in: [true, false] }
  })
    .populate("subject", "name code")
    .sort({ date: -1, startTime: -1 })
    .limit(300)
    .lean();

  if (!sessions.length) {
    return { batchKey, records: [] };
  }

  const marks = await AttendanceRecord.find({
    student: student._id,
    session: { $in: sessions.map((session) => session._id) }
  })
    .select("session status locationFlag distanceMeters gpsDistance markedAt")
    .lean();

  const marksBySession = new Map(marks.map((row) => [String(row.session), row]));
  const records = sessions.map((session) => {
    const matched = marksBySession.get(String(session._id));
    return {
      sessionId: session._id,
      date: session.date,
      subject: session.subject?.name || "-",
      subjectCode: session.subject?.code || "-",
      status: matched?.status || "absent",
      locationFlag: matched?.locationFlag || "red",
      distanceMeters: matched?.distanceMeters ?? null,
      gpsDistance: matched?.gpsDistance ?? null,
      markedAt: matched?.markedAt || null
    };
  });

  return { batchKey, records };
};

const ensureLinkedStudent = async (req, studentId) => {
  const link = await Parent.findOne({
    userId: req.user._id,
    studentId,
    collegeId: req.user.college,
    isActive: true
  });

  if (!link) {
    return { error: { code: 403, message: "This student is not linked to your account" } };
  }

  const student = await User.findOne({
    _id: studentId,
    role: "student",
    isActive: true,
    college: req.user.college
  }).select("_id name rollNo year division department college");

  if (!student) {
    return { error: { code: 404, message: "Linked student not found" } };
  }

  return { student };
};

const linkParentToStudent = async (req, res) => {
  try {
    const { parentUserId, studentId, relation } = req.body;

    if (!parentUserId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "parentUserId and studentId are required"
      });
    }

    const [parentUser, studentUser] = await Promise.all([
      User.findById(parentUserId),
      User.findById(studentId)
    ]);

    if (!parentUser || parentUser.role !== "parent") {
      return res.status(404).json({ success: false, message: "Parent user not found" });
    }

    if (!studentUser || studentUser.role !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const targetCollegeId = studentUser.college?.toString();
    if (!targetCollegeId) {
      return res.status(400).json({ success: false, message: "Student college not configured" });
    }

    if (req.user.role !== "admin") {
      if (req.user.college?.toString() !== targetCollegeId) {
        return res.status(403).json({ success: false, message: "Cross-college access denied" });
      }
    }

    if (parentUser.college && parentUser.college.toString() !== targetCollegeId) {
      return res.status(403).json({ success: false, message: "Parent already linked to another college" });
    }

    if (!parentUser.college || parentUser.college.toString() !== targetCollegeId) {
      parentUser.college = studentUser.college;
      await parentUser.save();
    }

    const parent = await Parent.findOneAndUpdate(
      { userId: parentUserId, studentId },
      {
        userId: parentUserId,
        studentId,
        collegeId: studentUser.college,
        relation: relation || "GUARDIAN",
        isActive: true
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, parent });
  } catch (error) {
    console.error("linkParentToStudent error:", error);
    return res.status(500).json({ success: false, message: "Failed to link parent" });
  }
};

const myChildren = async (req, res) => {
  try {
    await syncParentLinksForUser(req.user);

    const links = await Parent.find({
      userId: req.user._id,
      collegeId: req.user.college,
      isActive: true
    }).populate("studentId", "name rollNo year division department");

    return res.json({ success: true, children: links });
  } catch (error) {
    console.error("myChildren error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch children" });
  }
};

const childAnalytics = async (req, res) => {
  try {
    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const { student, error } = await ensureLinkedStudent(req, studentId);
    if (error) {
      return res.status(error.code).json({ success: false, message: error.message });
    }

    const analytics = await buildAttendanceInsightsForStudent(student);

    return res.json({
      success: true,
      student: {
        id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division
      },
      ...analytics
    });
  } catch (error) {
    console.error("childAnalytics error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch child analytics" });
  }
};

const childSummary = async (req, res) => {
  try {
    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const { student, error } = await ensureLinkedStudent(req, studentId);
    if (error) {
      return res.status(error.code).json({ success: false, message: error.message });
    }

    const batchId = getBatchIdForStudent(student);
    if (!batchId) {
      return res.status(400).json({ success: false, message: "Student batch is not configured" });
    }

    const todayKey = getTodayKey();
    const { startKey, endKey } = getWeekRangeKeys();
    const now = new Date();

    const [todayTimetable, weeklyTimetables, upcomingLectures, holidays] = await Promise.all([
      Timetable.findOne({
        batchKey: batchId,
        date: todayKey,
        isPublished: true,
        isActive: true,
        college: req.user.college
      })
        .populate("slots.teacherId", "name email")
        .lean(),
      Timetable.find({
        batchKey: batchId,
        date: { $gte: startKey, $lte: endKey },
        isPublished: true,
        isActive: true,
        college: req.user.college
      })
        .sort({ date: 1 })
        .populate("slots.teacherId", "name email")
        .lean(),
      OnlineLecture.find({
        batchId,
        collegeId: req.user.college,
        scheduledAt: { $gte: now },
        status: { $in: ["SCHEDULED", "LIVE"] }
      })
        .sort({ scheduledAt: 1 })
        .limit(6)
        .populate("teacherId", "name email")
        .populate("subjectId", "name code")
        .lean(),
      BatchHoliday.find({
        batchId,
        collegeId: req.user.college,
        isActive: true,
        toDate: { $gte: now }
      })
        .sort({ fromDate: 1 })
        .limit(5)
        .lean()
    ]);

    return res.json({
      success: true,
      student: {
        id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division,
        batchId
      },
      summary: {
        todayTimetable,
        weeklyTimetables,
        upcomingLectures,
        holidays
      }
    });
  } catch (error) {
    console.error("childSummary error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch child summary" });
  }
};

const childDailyReport = async (req, res) => {
  try {
    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const { student, error } = await ensureLinkedStudent(req, studentId);
    if (error) {
      return res.status(error.code).json({ success: false, message: error.message });
    }

    const { batchKey, records } = await buildStudentDailyRecords(student);
    return res.json({
      success: true,
      student: {
        id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division,
        batchKey
      },
      records
    });
  } catch (error) {
    console.error("childDailyReport error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch child daily report" });
  }
};

const exportChildDailyCsv = async (req, res) => {
  try {
    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const { student, error } = await ensureLinkedStudent(req, studentId);
    if (error) {
      return res.status(error.code).json({ success: false, message: error.message });
    }

    const { records } = await buildStudentDailyRecords(student);
    const parser = new Parser();
    const csv = parser.parse(
      records.map((record) => ({
        Date: record.date,
        Subject: record.subject,
        SubjectCode: record.subjectCode,
        Status: record.status,
        Flag: record.locationFlag,
        CollegeDistanceMeters: record.distanceMeters ?? "",
        SessionDistanceMeters: record.gpsDistance ?? "",
        MarkedAt: record.markedAt ? new Date(record.markedAt).toISOString() : ""
      }))
    );

    res.header("Content-Type", "text/csv");
    res.attachment(`parent_child_daily_attendance_${student.rollNo || student._id}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error("exportChildDailyCsv error:", error);
    return res.status(500).json({ success: false, message: "Failed to export child daily report" });
  }
};

module.exports = {
  linkParentToStudent,
  myChildren,
  childAnalytics,
  childSummary,
  childDailyReport,
  exportChildDailyCsv
};
