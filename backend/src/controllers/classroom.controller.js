const User = require("../models/User.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");
const Subject = require("../models/Subject.model");
const Department = require("../models/Department.model");
const getBatchKey = require("../utils/batchKey");

exports.getClassroomData = async (req, res) => {
  try {
    const { batchKey } = req.params;

    if (!batchKey) {
      return res.status(400).json({
        success: false,
        message: "batchKey is required"
      });
    }

    const user = req.user;
    const sessionFilter = { batchKey };

    if (["student", "coordinator"].includes(user.role)) {
      const ownBatchKey = getBatchKey({
        department: user.department,
        year: user.year,
        division: user.division
      });

      if (ownBatchKey !== batchKey) {
        return res.status(403).json({
          success: false,
          message: "Access denied for this batch"
        });
      }
    }

    if (user.role !== "admin") {
      const departmentIds = await Department.find({ college: user.college }).distinct("_id");
      sessionFilter.department = { $in: departmentIds };
    }

    if (user.role === "teacher") {
      const teacherSubjectIds = await Subject.find({ teacher: user._id }).distinct("_id");
      sessionFilter.subject = { $in: teacherSubjectIds };
    }

    if (user.role === "hod" || user.role === "coordinator" || user.role === "student") {
      sessionFilter.department = user.department;
    }

    const sessions = await AttendanceSession.find(sessionFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const sessionIds = sessions.map((s) => s._id);

    const attendance = sessionIds.length
      ? await AttendanceRecord.find({ session: { $in: sessionIds } })
          .populate("student", "name rollNo")
          .lean()
      : [];

    const teacherQuery = {
      role: "teacher",
      isActive: true
    };

    if (user.college) {
      teacherQuery.college = user.college;
    }
    if (user.department) {
      teacherQuery.department = user.department;
    }

    const teachers = await User.find(teacherQuery)
      .select("name email")
      .lean();

    return res.json({
      success: true,
      teachers,
      sessions,
      attendance
    });
  } catch (err) {
    console.error("Classroom data error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load classroom data"
    });
  }
};
