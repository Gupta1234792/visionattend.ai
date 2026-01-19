const User = require("../models/User.model");
const Department = require("../models/Department.model");
const { hashPassword } = require("../utils/password");
const sendEmail = require("../utils/sendEmail");

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

    // ✅ PERMANENT FIX: HOD KNOWS DEPARTMENT
    const hod = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "hod",
      college: collegeId,
      department: departmentId
    });

    // ✅ PERMANENT FIX: DEPARTMENT KNOWS HOD
    department.hod = hod._id;
    await department.save();

    // 📧 EMAIL (use env-based frontend URL)
    await sendEmail({
      to: email,
      subject: "VisionAttend - HOD Account Created",
      html: `
        <h3>Hello ${name},</h3>
        <p>Your <b>HOD account</b> has been created on <b>VisionAttend</b>.</p>
        <p><b>Login URL:</b> ${process.env.FRONTEND_URL}/login</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p>Please keep this information secure.</p>
        <br/>
        <p>Regards,<br/>VisionAttend Team</p>
      `
    });

    return res.status(201).json({
      success: true,
      message: "HOD created and email sent successfully",
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
