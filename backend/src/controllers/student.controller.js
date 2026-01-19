const User = require("../models/User.model");
const StudentInvite = require("../models/StudentInvite.model");
const { hashPassword } = require("../utils/password");

// ================= VALIDATE STUDENT INVITE =================
const validateInviteToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    const invite = await StudentInvite.findOne({ token });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invalid invite token"
      });
    }

    if (invite.isUsed) {
      return res.status(410).json({
        success: false,
        message: "Invite link already used"
      });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: "Invite link expired"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invite token is valid",
      data: {
        college: invite.college,
        department: invite.department,
        year: invite.year,
        division: invite.division
      }
    });
  } catch (error) {
    console.error("Validate invite token error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to validate invite token"
    });
  }
};

// ================= REGISTER STUDENT =================
const registerStudent = async (req, res) => {
  try {
    const { token, name, email, password, rollNo, parentEmail } = req.body;

    if (!token || !name || !email || !password || !rollNo) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing"
      });
    }

    const invite = await StudentInvite.findOne({ token });

    if (!invite || invite.isUsed || invite.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invite token"
      });
    }

    const existingStudent = await User.findOne({ email });
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: "Student already registered"
      });
    }

    const hashedPassword = await hashPassword(password);

    const student = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student",
      rollNo,
      parentEmail: parentEmail || null,
      college: invite.college,
      department: invite.department,
      year: invite.year,
      division: invite.division
    });

    invite.isUsed = true;
    await invite.save();

    return res.status(201).json({
      success: true,
      message: "Student registered successfully",
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division
      }
    });
  } catch (error) {
    console.error("Student registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register student"
    });
  }
};

// ================= GET LOGGED-IN STUDENT =================
const getStudentProfile = async (req, res) => {
  try {
    const student = await User.findById(req.user._id)
      .select("-password")
      .populate("college", "name code")
      .populate("department", "name code");

    if (!student || student.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    return res.status(200).json({
      success: true,
      student
    });
  } catch (error) {
    console.error("Get student profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch student profile"
    });
  }
};

module.exports = {
  validateInviteToken,
  registerStudent,
  getStudentProfile
};
