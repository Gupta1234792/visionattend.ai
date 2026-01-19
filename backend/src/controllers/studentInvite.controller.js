const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");

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

    // 🔑 fetch department to get college
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    // generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // expiry: 48 hours
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invite = await StudentInvite.create({
      token,
      college: department.college, // ✅ FIX HERE
      department: departmentId,
      year,
      division,
      createdBy: req.user._id,
      expiresAt
    });

    return res.status(201).json({
      success: true,
      message: "Student invite link generated",
      inviteLink: `http://localhost:3000/student/register?token=${token}`,
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
