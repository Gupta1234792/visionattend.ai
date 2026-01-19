const User = require("../models/User.model");
const { hashPassword } = require("../utils/password");
const sendEmail = require("../utils/sendEmail");

// ================= CREATE TEACHER =================
const createTeacher = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // check HOD role safety (extra)
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

    const hashedPassword = await hashPassword(password);

    const teacher = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "teacher",
      college: req.user.college,
      department: req.user.department
    });

    // 📧 send email credentials
    await sendEmail({
      to: email,
      subject: "VisionAttend Teacher Account Created",
      html: `
        <h2>Welcome to VisionAttend</h2>
        <p>Your teacher account has been created.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p>Please login and start using the system.</p>
      `
    });

    return res.status(201).json({
      success: true,
      message: "Teacher created successfully",
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

module.exports = {
  createTeacher
};
