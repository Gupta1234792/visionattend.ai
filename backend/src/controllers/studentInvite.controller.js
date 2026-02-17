const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");

const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

const generateInviteCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();

// ================= CREATE STUDENT INVITE =================
const createStudentInvite = async (req, res) => {
  try {
    const { departmentId, year, division } = req.body;

    if (!departmentId || !year || !division) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    let inviteCode = generateInviteCode();
    let attempts = 0;

    while (attempts < 5) {
      const exists = await StudentInvite.exists({ inviteCode });
      if (!exists) break;
      inviteCode = generateInviteCode();
      attempts += 1;
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invite = await StudentInvite.create({
      token,
      inviteCode,
      college: department.college,
      department: departmentId,
      year,
      division,
      createdBy: req.user._id,
      expiresAt
    });

    return res.status(201).json({
      success: true,
      message: "Student invite link generated",
      inviteLink: `${frontendBaseUrl}/student/register?token=${token}`,
      inviteCode,
      invite
    });
  } catch (error) {
    console.error("Create student invite error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate invite link"
    });
  }
};

module.exports = {
  createStudentInvite
};
