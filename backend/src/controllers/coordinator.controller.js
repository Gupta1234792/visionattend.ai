const User = require("../models/User.model");
const Department = require("../models/Department.model");
const { hashPassword } = require("../utils/password");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");

const createCoordinator = async (req, res) => {
  try {
    const { name, email, password, departmentId, year, division } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!name || !normalizedEmail || !password || !departmentId || !year || !division) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    const allowedYears = ["FY", "SY", "TY", "FINAL"];
    const allowedDivisions = ["A", "B", "C"];

    if (!allowedYears.includes(year)) {
      return res.status(400).json({
        success: false,
        message: "Invalid year"
      });
    }

    if (!allowedDivisions.includes(division)) {
      return res.status(400).json({
        success: false,
        message: "Invalid division"
      });
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    if (department.hod.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not allowed"
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    const existingCoordinator = await User.findOne({
      role: "coordinator",
      department: departmentId,
      year,
      division
    });

    if (existingCoordinator) {
      return res.status(409).json({
        success: false,
        message: "Coordinator already exists for this class"
      });
    }

    const hashedPassword = await hashPassword(password);

    const coordinator = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: "coordinator",
      college: req.user.college,
      department: departmentId,
      year,
      division,
      createdBy: req.user._id
    });

    const emailSent = await sendCredentialsEmail({
      name,
      email: normalizedEmail,
      password,
      role: "coordinator"
    });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Class Coordinator created and credentials email sent successfully"
        : "Class Coordinator created, but credentials email failed",
      coordinator: {
        id: coordinator._id,
        name: coordinator.name,
        email: coordinator.email,
        year,
        division
      }
    });
  } catch (error) {
    console.error("Create coordinator error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create coordinator"
    });
  }
};

module.exports = {
  createCoordinator
};
