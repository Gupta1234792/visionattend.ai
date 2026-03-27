const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_VALID_DAYS = Number(process.env.STUDENT_INVITE_VALID_DAYS || 2);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const createGeneratedPassword = () =>
  crypto.randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

const createGeneratedName = (email) => {
  const localPart = email.split("@")[0] || "student";
  return (
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Student"
  );
};

const createGeneratedRollNo = (email) => {
  const localPart = (email.split("@")[0] || "student").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${localPart.slice(0, 6) || "STD"}${suffix}`;
};

const generateInviteCode = () => crypto.randomBytes(4).toString("hex").toUpperCase();

const createUniqueInviteCode = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const exists = await StudentInvite.exists({ inviteCode });
    if (!exists) {
      return inviteCode;
    }
  }

  return `${generateInviteCode()}${crypto.randomBytes(1).toString("hex").toUpperCase()}`;
};

const getResolvedDepartmentId = (req) => {
  const requestDepartmentId = req.body?.departmentId;
  const requestDepartmentObjectId =
    requestDepartmentId && typeof requestDepartmentId === "object" && requestDepartmentId._id
      ? String(requestDepartmentId._id)
      : "";
  return (
    (typeof requestDepartmentId === "string" && requestDepartmentId.trim()) ||
    requestDepartmentObjectId ||
    (req.user?.department?._id ? String(req.user.department._id) : "") ||
    (req.user?.department ? String(req.user.department) : "")
  );
};

const buildInviteLink = (token) => {
  const frontendBase = process.env.FRONTEND_URL || process.env.FRONTEND_LOGIN_URL || "http://localhost:3000";
  const normalizedBase = String(frontendBase).replace(/\/auth(?:\?.*)?$/i, "").replace(/\/$/, "");
  return `${normalizedBase}/student/register?token=${token}`;
};

const createStudentInvite = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.studentEmail);
    const resolvedDepartmentId = getResolvedDepartmentId(req);
    const year = String(req.body?.year || req.user?.year || "").trim().toUpperCase();
    const division = String(req.body?.division || req.user?.division || "").trim().toUpperCase();
    const studentName = String(req.body?.studentName || createGeneratedName(email)).trim();
    const rollNo = String(req.body?.rollNo || createGeneratedRollNo(email)).trim().toUpperCase();

    if (!email || !year || !division) {
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

    if (!resolvedDepartmentId) {
      return res.status(400).json({
        success: false,
        message: "Department mapping missing for this account"
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
      return res.status(409).json({
        success: false,
        message: "Student already registered. Please login."
      });
    }

    const existingRollNo = await User.findOne({
      department: resolvedDepartmentId,
      year,
      division,
      rollNo
    });
    if (existingRollNo) {
      return res.status(409).json({
        success: false,
        message: "Roll number already exists in this class"
      });
    }

    const tempPassword = createGeneratedPassword();
    const activeInvite = await StudentInvite.findOne({
      department: resolvedDepartmentId,
      year,
      division,
      studentEmail: email,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    const invite = activeInvite || new StudentInvite();
    if (!activeInvite) {
      invite.token = crypto.randomBytes(32).toString("hex");
      invite.createdBy = req.user._id;
      invite.college = department.college;
      invite.department = resolvedDepartmentId;
      invite.year = year;
      invite.division = division;
      invite.expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
    }

    invite.inviteCode = await createUniqueInviteCode();
    invite.studentName = studentName;
    invite.studentEmail = email;
    invite.tempPassword = tempPassword;
    invite.rollNo = rollNo;
    invite.inviteToken = invite.token;
    invite.isActivated = false;
    invite.isUsed = false;
    invite.isActive = true;
    invite.disabledAt = null;
    invite.disabledBy = null;
    invite.deliveryStatus = "manual";
    invite.deliveryError = "";
    invite.deliveryAttemptedAt = new Date();
    invite.sentAt = null;
    await invite.save();

    const inviteLink = buildInviteLink(invite.token);
    await logAudit({
      actor: req.user,
      module: "invite",
      action: activeInvite ? "UPDATE" : "CREATE",
      entityType: "StudentInvite",
      entityId: invite._id,
      metadata: {
        email,
        year,
        division,
        departmentId: String(resolvedDepartmentId),
        deliveryStatus: "manual"
      }
    });

    return res.status(activeInvite ? 200 : 201).json({
      success: true,
      message: "Student invite generated successfully. Share link and code with the student.",
      invite: {
        _id: invite._id,
        token: invite.token,
        inviteCode: invite.inviteCode,
        studentEmail: invite.studentEmail,
        studentName: invite.studentName,
        rollNo: invite.rollNo,
        year: invite.year,
        division: invite.division,
        expiresAt: invite.expiresAt,
        isActive: invite.isActive,
        isActivated: invite.isActivated,
        deliveryStatus: invite.deliveryStatus,
        deliveryError: invite.deliveryError,
        createdAt: invite.createdAt
      },
      inviteLink,
      inviteCode: invite.inviteCode,
      temporaryPassword: invite.tempPassword
    });
  } catch (error) {
    console.error("Create student invite error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate invite link"
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

    if (student) {
      return res.status(409).json({
        success: false,
        message: "Student already registered. Ask the student to log in."
      });
    }

    invite.tempPassword = createGeneratedPassword();
    invite.inviteCode = await createUniqueInviteCode();
    invite.expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
    invite.isActive = true;
    invite.isUsed = false;
    invite.isActivated = false;
    invite.disabledAt = null;
    invite.disabledBy = null;
    invite.deliveryStatus = "manual";
    invite.deliveryError = "";
    invite.deliveryAttemptedAt = new Date();
    invite.sentAt = null;
    await invite.save();

    await logAudit({
      actor: req.user,
      module: "invite",
      action: "UPDATE",
      entityType: "StudentInvite",
      entityId: invite._id,
      metadata: {
        email: invite.studentEmail,
        year: invite.year,
        division: invite.division,
        departmentId: String(invite.department),
        deliveryStatus: "manual"
      }
    });
    const inviteLink = buildInviteLink(invite.token);

    return res.json({
      success: true,
      message: "Invite regenerated successfully. Share the new link and code with the student.",
      inviteLink,
      inviteCode: invite.inviteCode,
      temporaryPassword: invite.tempPassword
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
