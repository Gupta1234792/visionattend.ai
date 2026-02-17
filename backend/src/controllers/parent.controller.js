const Parent = require("../models/Parent.model");
const User = require("../models/User.model");

const linkParentToStudent = async (req, res) => {
  try {
    const { parentUserId, studentId, relation } = req.body;

    if (!parentUserId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "parentUserId and studentId are required"
      });
    }

    const [parentUser, studentUser] = await Promise.all([
      User.findById(parentUserId),
      User.findById(studentId)
    ]);

    if (!parentUser || parentUser.role !== "parent") {
      return res.status(404).json({ success: false, message: "Parent user not found" });
    }

    if (!studentUser || studentUser.role !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const targetCollegeId = studentUser.college?.toString();
    if (!targetCollegeId) {
      return res.status(400).json({ success: false, message: "Student college not configured" });
    }

    if (req.user.role !== "admin") {
      if (req.user.college?.toString() !== targetCollegeId) {
        return res.status(403).json({ success: false, message: "Cross-college access denied" });
      }
    }

    if (parentUser.college && parentUser.college.toString() !== targetCollegeId) {
      return res.status(403).json({ success: false, message: "Parent already linked to another college" });
    }

    if (!parentUser.college || parentUser.college.toString() !== targetCollegeId) {
      parentUser.college = studentUser.college;
      await parentUser.save();
    }

    const parent = await Parent.findOneAndUpdate(
      { userId: parentUserId },
      {
        userId: parentUserId,
        studentId,
        collegeId: studentUser.college,
        relation: relation || "GUARDIAN",
        isActive: true
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, parent });
  } catch (error) {
    console.error("linkParentToStudent error:", error);
    return res.status(500).json({ success: false, message: "Failed to link parent" });
  }
};

const myChildren = async (req, res) => {
  try {
    const links = await Parent.find({
      userId: req.user._id,
      collegeId: req.user.college,
      isActive: true
    }).populate("studentId", "name rollNo year division department");

    return res.json({ success: true, children: links });
  } catch (error) {
    console.error("myChildren error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch children" });
  }
};

module.exports = {
  linkParentToStudent,
  myChildren
};
