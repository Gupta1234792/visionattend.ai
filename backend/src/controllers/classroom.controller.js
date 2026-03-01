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
    const batchParts = String(batchKey).split("_");
    const batchDepartment = batchParts[0] || "";
    const batchYear = batchParts[batchParts.length - 2] || "";
    const batchDivision = batchParts[batchParts.length - 1] || "";

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
      .populate("subject", "name code")
      .populate("teacher", "name email role")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const sessionIds = sessions.map((s) => s._id);

    const attendance = sessionIds.length
      ? await AttendanceRecord.find({ session: { $in: sessionIds } })
          .populate("student", "name rollNo")
          .populate("subject", "name code")
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

    const teacherIds = teachers.map((teacher) => teacher._id);
    const teacherSubjects = teacherIds.length
      ? await Subject.find({
          teacher: { $in: teacherIds },
          department: user.department || sessionFilter.department
        })
          .select("name code teacher")
          .lean()
      : [];

    const subjectsByTeacher = new Map();
    teacherSubjects.forEach((subject) => {
      const key = String(subject.teacher);
      const existing = subjectsByTeacher.get(key) || [];
      existing.push({ name: subject.name, code: subject.code });
      subjectsByTeacher.set(key, existing);
    });

    const teachersWithSubjects = teachers.map((teacher) => ({
      ...teacher,
      subjects: subjectsByTeacher.get(String(teacher._id)) || []
    }));

    const coordinatorQuery = {
      role: "coordinator",
      isActive: true,
      year: batchYear,
      division: batchDivision
    };

    if (user.college) coordinatorQuery.college = user.college;
    if (batchDepartment) coordinatorQuery.department = batchDepartment;
    if (user.role === "hod" || user.role === "coordinator" || user.role === "student") {
      coordinatorQuery.department = user.department;
    }

    const coordinators = await User.find(coordinatorQuery)
      .select("name email year division department")
      .lean();

    const studentQuery = {
      role: "student",
      isActive: true,
      year: batchYear,
      division: batchDivision
    };

    if (user.college) {
      studentQuery.college = user.college;
    }
    if (user.department) {
      studentQuery.department = user.department;
    }

    const students = await User.find(studentQuery)
      .select("name email rollNo parentEmail year division faceRegisteredAt createdAt")
      .sort({ rollNo: 1, name: 1 })
      .lean();

    const departmentDoc = await Department.findById(batchDepartment || user.department)
      .select("name code")
      .lean();

    return res.json({
      success: true,
      batchInfo: {
        departmentId: batchDepartment || user.department || "",
        departmentName: departmentDoc?.name || "",
        departmentCode: departmentDoc?.code || "",
        year: batchYear,
        division: batchDivision
      },
      teachers: teachersWithSubjects,
      coordinators,
      students,
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
