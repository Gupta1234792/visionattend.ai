const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const createGeneratedPassword = () =>
  crypto.randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

const createGeneratedName = (email) => {
  const localPart = email.split("@")[0] || "student";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Student";
};

const createGeneratedRollNo = (email) => {
  const localPart = (email.split("@")[0] || "student").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${localPart.slice(0, 6) || "STD"}${suffix}`;
};

const createStudentInvite = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.studentEmail);
    const requestDepartmentId = req.body?.departmentId;
    const resolvedDepartmentId =
      (typeof requestDepartmentId === "string" && requestDepartmentId.trim()) ||
      (req.user?.department?._id ? String(req.user.department._id) : "") ||
      (req.user?.department ? String(req.user.department) : "");
    const { year, division } = req.body;

    if (!email || !resolvedDepartmentId || !year || !division) {
      return res.status(400).json({
        success: false,
        message: "Email, year and division are required"
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email"
      });
    }

    const department = await Department.findById(resolvedDepartmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    const existingStudent = await User.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: "Student already exists"
      });
    }

    const password = createGeneratedPassword();
    const student = await User.create({
      name: createGeneratedName(email),
      email,
      password,
      role: "student",
      college: department.college,
      department: resolvedDepartmentId,
      year,
      division,
      rollNo: createGeneratedRollNo(email),
      faceRegisteredAt: null,
      isActive: true
    });

    const inviteLog = await StudentInvite.create({
      token: crypto.randomBytes(32).toString("hex"),
      inviteToken: "",
      inviteCode: "",
      college: department.college,
      department: resolvedDepartmentId,
      year,
      division,
      createdBy: req.user._id,
      studentName: student.name,
      studentEmail: email,
      tempPassword: password,
      rollNo: student.rollNo,
      isActivated: true,
      isUsed: true,
      isActive: false,
      expiresAt: new Date()
    });

    let emailSent = false;
    let responseMessage = "Student created and credentials sent to email";

    try {
      emailSent = await sendCredentialsEmail({
        name: student.name,
        email,
        password,
        role: "student"
      });

      if (!emailSent) {
        responseMessage = "Student created but email could not be sent";
      }
    } catch (error) {
      console.error("Student credentials email error:", error);
      responseMessage = "Student created but email could not be sent";
    }

    await logAudit({
      actor: req.user,
      module: "invite",
      action: "CREATE",
      entityType: "StudentInvite",
      entityId: inviteLog._id,
      metadata: {
        email,
        year,
        division,
        departmentId: String(resolvedDepartmentId),
        studentId: String(student._id),
        emailSent
      }
    });

    return res.status(201).json({
      success: true,
      message: responseMessage
    });
  } catch (error) {
    console.error("Create student invite error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

const listStudentInvites = async (req, res) => {
  try {
    const query = { createdBy: req.user._id };
    if (req.query.departmentId) query.department = req.query.departmentId;
    if (req.query.year) query.year = req.query.year;
    if (req.query.division) query.division = req.query.division;

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

    const student = await User.findOne({ email: normalizeEmail(invite.studentEmail) });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const password = createGeneratedPassword();
    student.password = password;
    await student.save();

    invite.tempPassword = password;
    invite.disabledAt = null;
    invite.disabledBy = null;
    await invite.save();

    let emailSent = false;
    let responseMessage = "Credentials regenerated";

    try {
      emailSent = await sendCredentialsEmail({
        name: student.name,
        email: student.email,
        password,
        role: "student"
      });

      if (!emailSent) {
        responseMessage = "Credentials regenerated but email could not be sent";
      }
    } catch (error) {
      console.error("Regenerate student credentials email error:", error);
      responseMessage = "Credentials regenerated but email could not be sent";
    }

    return res.json({
      success: true,
      message: responseMessage
    });
  } catch (error) {
    console.error("regenerateStudentInvite error:", error);
    return res.status(500).json({ success: false, message: "Failed to regenerate credentials" });
  }
};

module.exports = {
  createStudentInvite,
  listStudentInvites,
  disableStudentInvite,
  regenerateStudentInvite
};
