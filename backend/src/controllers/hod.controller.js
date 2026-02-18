const User = require("../models/User.model");
const Department = require("../models/Department.model");
const { hashPassword } = require("../utils/password");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");

const createHOD = async (req, res) => {
  try {
    const { name, email, password, collegeId, departmentId } = req.body;

    if (!name || !email || !password || !collegeId || !departmentId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    if (department.hod) {
      return res.status(409).json({
        success: false,
        message: "HOD already assigned to this department"
      });
    }

    const hashedPassword = await hashPassword(password);

    const hod = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "hod",
      college: collegeId,
      department: departmentId
    });

    department.hod = hod._id;
    await department.save();

    const emailSent = await sendCredentialsEmail({
      name,
      email,
      password,
      role: "hod"
    });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "HOD created and credentials email sent successfully"
        : "HOD created, but credentials email failed",
      hod: {
        id: hod._id,
        name: hod.name,
        email: hod.email
      }
    });
  } catch (error) {
    console.error("Create HOD error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create HOD"
    });
  }
};

module.exports = { createHOD };

