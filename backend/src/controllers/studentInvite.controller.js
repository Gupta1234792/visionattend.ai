const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");
const { hashPassword } = require("../utils/password");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");

// ================= CREATE STUDENT INVITE =================
const createStudentInvite = async (req, res) => {
  try {
    const { departmentId, year, division, studentName, studentEmail, rollNo } = req.body;

    if (!departmentId || !year || !division || !studentEmail || !rollNo) {
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

    const normalizedStudentEmail = String(studentEmail || "").trim().toLowerCase();
    const normalizedRollNo = String(rollNo || "").trim();
    const existingStudentWithRollNo = await User.exists({
      department: departmentId,
      year,
      division,
      rollNo: normalizedRollNo
    });

    if (existingStudentWithRollNo) {
      return res.status(409).json({
        success: false,
        message: "Roll number already exists in this class"
      });
    }

    const existingStudent = await User.findOne({ email: normalizedStudentEmail });
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: "Student email already registered"
      });
    }

    const tempPassword = crypto.randomBytes(5).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
    const hashedPassword = await hashPassword(tempPassword);

    const student = await User.create({
      name: String(studentName || "").trim() || "Student",
      email: normalizedStudentEmail,
      password: hashedPassword,
      role: "student",
      college: department.college,
      department: departmentId,
      year,
      division,
      rollNo: normalizedRollNo,
      faceRegisteredAt: null,
      isActive: true
    });

    const invite = await StudentInvite.create({
      token: crypto.randomBytes(32).toString("hex"),
      inviteToken: "",
      inviteCode: "",
      college: department.college,
      department: departmentId,
      year,
      division,
      createdBy: req.user._id,
      expiresAt: new Date(),
      studentName: student.name,
      studentEmail: student.email,
      tempPassword,
      rollNo: normalizedRollNo,
      isActivated: true,
      isActive: false
    });

    const emailSent = await sendCredentialsEmail({
      name: student.name,
      email: student.email,
      password: tempPassword,
      role: "student"
    });

    await logAudit({
      actor: req.user,
      module: "invite",
      action: "CREATE",
      entityType: "StudentInvite",
      entityId: invite._id,
      metadata: { year, division, departmentId: String(departmentId), studentId: String(student._id) }
    });

    return res.status(201).json({
      success: true,
      message: "Student created and credentials emailed.",
      emailSent,
      studentId: student._id
    });
  } catch (error) {
    console.error("Create student invite error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create student"
    });
  }
};

const listStudentInvites = async (req, res) => {
  try {
    const query = { createdBy: req.user._id };
    if (req.query.departmentId) query.department = req.query.departmentId;
    if (req.query.year) query.year = req.query.year;
    if (req.query.division) query.division = req.query.division;
    if (typeof req.query.active !== "undefined") query.isActive = String(req.query.active) === "true";

    const invites = await StudentInvite.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("department", "name code")
      .lean();

    return res.json({ success: true, invites });
  } catch (error) {
    console.error("listStudentInvites error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invites" });
  }
};

const disableStudentInvite = async (req, res) => {
  try {
    const invite = await StudentInvite.findOne({
      _id: req.params.inviteId,
      createdBy: req.user._id
    });

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invite not found" });
    }

    invite.isActive = false;
    invite.disabledAt = new Date();
    invite.disabledBy = req.user._id;
    await invite.save();

    await logAudit({
      actor: req.user,
      module: "invite",
      action: "DISABLE",
      entityType: "StudentInvite",
      entityId: invite._id,
      metadata: { inviteCode: invite.inviteCode }
    });

    return res.json({ success: true, message: "Invite disabled", invite });
  } catch (error) {
    console.error("disableStudentInvite error:", error);
    return res.status(500).json({ success: false, message: "Failed to disable invite" });
  }
};

const regenerateStudentInvite = async (req, res) => {
  try {
    const invite = await StudentInvite.findOne({
      _id: req.params.inviteId,
      createdBy: req.user._id
    });

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invite not found" });
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

    invite.token = token;
    invite.inviteCode = inviteCode;
    invite.isActive = true;
    invite.disabledAt = null;
    invite.disabledBy = null;
    invite.expiresAt = new Date(Date.now() + (Number(process.env.STUDENT_INVITE_VALID_DAYS) || 365) * 24 * 60 * 60 * 1000);
    await invite.save();

    await logAudit({
      actor: req.user,
      module: "invite",
      action: "REGENERATE",
      entityType: "StudentInvite",
      entityId: invite._id,
      metadata: { inviteCode }
    });

    return res.json({
      success: true,
      message: "Invite regenerated",
      inviteLink: `${frontendBaseUrl}/student/register?token=${invite.token}`,
      inviteCode: invite.inviteCode,
      invite
    });
  } catch (error) {
    console.error("regenerateStudentInvite error:", error);
    return res.status(500).json({ success: false, message: "Failed to regenerate invite" });
  }
};

module.exports = {
  createStudentInvite,
  listStudentInvites,
  disableStudentInvite,
  regenerateStudentInvite
};
