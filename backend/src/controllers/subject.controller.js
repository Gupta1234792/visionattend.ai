const Subject = require("../models/Subject.model");
const User = require("../models/User.model");

// ================= CREATE SUBJECT (HOD) =================
const createSubject = async (req, res) => {
  try {
    const { name, code, teacherId } = req.body;

    if (!name || !code || !teacherId) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (req.user.role !== "hod") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    // ✅ Always trust DB, not token
    const hod = await User.findById(req.user._id);

    if (!hod || !hod.department) {
      return res.status(400).json({
        success: false,
        message: "HOD department not assigned"
      });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      return res.status(404).json({
        success: false,
        message: "Teacher not found"
      });
    }

    const existing = await Subject.findOne({
      code,
      department: hod.department
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Subject already exists"
      });
    }

    const subject = await Subject.create({
      name,
      code,
      teacher: teacherId,
      department: hod.department
    });

    return res.status(201).json({
      success: true,
      message: "Subject created successfully",
      subject
    });
  } catch (error) {
    console.error("Create subject error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create subject"
    });
  }
};

// ================= GET SUBJECTS FOR TEACHER =================
const getMySubjects = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const subjects = await Subject.find({
      teacher: req.user._id,
      isActive: true
    }).populate("department", "name code");

    return res.status(200).json({
      success: true,
      subjects
    });
  } catch (error) {
    console.error("Get my subjects error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subjects"
    });
  }
};

const getAccessibleSubjects = async (req, res) => {
  try {
    const user = req.user;
    const query = { isActive: true };

    if (user.role === "teacher") {
      query.teacher = user._id;
    } else if (["hod", "coordinator", "student"].includes(user.role)) {
      if (!user.department) {
        return res.status(400).json({
          success: false,
          message: "User department not configured"
        });
      }
      query.department = user.department;
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const subjects = await Subject.find(query)
      .populate("department", "name code")
      .populate("teacher", "name email")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      subjects
    });
  } catch (error) {
    console.error("Get accessible subjects error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subjects"
    });
  }
};

module.exports = {
  createSubject,
  getMySubjects,
  getAccessibleSubjects
};
