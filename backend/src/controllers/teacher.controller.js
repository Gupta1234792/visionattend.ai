const User = require("../models/User.model");
const { hashPassword } = require("../utils/password");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const Subject = require("../models/Subject.model");

const createTeacher = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (req.user.role !== "hod") {
      return res.status(403).json({
        success: false,
        message: "Only HOD can create teachers"
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Teacher already exists"
      });
    }

    const departmentTeacherCount = await User.countDocuments({
      role: "teacher",
      department: req.user.department,
      isActive: true
    });

    if (departmentTeacherCount >= 5) {
      return res.status(400).json({
        success: false,
        message: "Teacher limit reached (max 5 per department)"
      });
    }

    const hashedPassword = await hashPassword(password);

    const teacher = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "teacher",
      college: req.user.college,
      department: req.user.department
    });

    const emailSent = await sendCredentialsEmail({
      name,
      email,
      password,
      role: "teacher"
    });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Teacher created and credentials email sent successfully"
        : "Teacher created, but credentials email failed",
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email
      }
    });
  } catch (error) {
    console.error("Create teacher error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create teacher"
    });
  }
};

const listTeachers = async (req, res) => {
  try {
    const query = {
      role: "teacher",
      isActive: true
    };

    if (req.user.role === "admin") {
      if (req.query.departmentId) {
        query.department = req.query.departmentId;
      }
    } else if (req.user.department) {
      query.department = req.user.department;
    }

    if (req.user.role !== "admin" && req.user.college) {
      query.college = req.user.college;
    }

    const teachers = await User.find(query)
      .select("name email department")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      teachers
    });
  } catch (error) {
    console.error("List teacher error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch teachers"
    });
  }
};

module.exports = {
  createTeacher,
  listTeachers,
  getTeacherGuardrails
};

async function getTeacherGuardrails(req, res) {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ success: false, message: "Only teacher can access guardrails" });
    }

    const subjects = await Subject.find({
      teacher: req.user._id,
      isActive: true
    })
      .select("_id name code")
      .lean();

    return res.json({
      success: true,
      guardrails: {
        hasAssignedSubjects: subjects.length > 0,
        assignedSubjectsCount: subjects.length,
        canStartAttendance: subjects.length > 0,
        canScheduleLecture: subjects.length > 0
      },
      subjects
    });
  } catch (error) {
    console.error("getTeacherGuardrails error:", error);
    return res.status(500).json({ success: false, message: "Failed to load subject guardrails" });
  }
}
