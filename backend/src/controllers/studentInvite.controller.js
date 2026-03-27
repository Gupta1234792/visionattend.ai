const crypto = require("crypto");
const StudentInvite = require("../models/StudentInvite.model");
const Department = require("../models/Department.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");
const { hashPassword } = require("../utils/password");
const sendStudentInviteEmail = require("../utils/sendStudentInviteEmail");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");

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

const sendInviteMail = async ({ invite, password }) => {
  const inviteLink = buildInviteLink(invite.token);
  try {
    const emailSent = await sendStudentInviteEmail({
      name: invite.studentName,
      email: invite.studentEmail,
      password,
      inviteLink,
      inviteCode: invite.inviteCode,
      year: invite.year,
      division: invite.division
    });

    return {
      emailSent,
      inviteLink,
      error: emailSent ? "" : "Email provider rejected or did not confirm delivery"
    };
  } catch (error) {
    return {
      emailSent: false,
      inviteLink,
      error: error?.message || "Email send failed"
    };
  }
};

const finalizeInviteDelivery = async ({ invite, password, actor, resolvedDepartmentId, email, year, division, action }) => {
  const mailResult = await sendInviteMail({
    invite,
    password
  });

  const deliveryStatus = mailResult?.emailSent ? "sent" : "failed";
  const deliveryError = mailResult?.emailSent ? "" : String(mailResult?.error || "Email send failed");

  invite.deliveryStatus = deliveryStatus;
  invite.deliveryError = deliveryError;
  invite.deliveryAttemptedAt = new Date();
  invite.sentAt = mailResult?.emailSent ? new Date() : null;
  await invite.save();

  await logAudit({
    actor,
    module: "invite",
    action,
    entityType: "StudentInvite",
    entityId: invite._id,
    metadata: {
      email,
      year,
      division,
      departmentId: String(resolvedDepartmentId),
      emailSent: Boolean(mailResult?.emailSent),
      deliveryStatus,
      deliveryError
    }
  });

  return { mailResult, deliveryStatus, deliveryError };
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
    invite.deliveryStatus = "pending";
    invite.deliveryError = "";
    invite.deliveryAttemptedAt = null;
    invite.sentAt = null;
    await invite.save();

    const inviteLink = buildInviteLink(invite.token);
    const { mailResult, deliveryError } = await finalizeInviteDelivery({
      invite,
      password: tempPassword,
      actor: req.user,
      resolvedDepartmentId,
      email,
      year,
      division,
      action: activeInvite ? "UPDATE" : "CREATE"
    });

    return res.status(activeInvite ? 200 : 201).json({
      success: Boolean(mailResult?.emailSent),
      message: mailResult?.emailSent
        ? "Student invite sent successfully"
        : `Invite created but email failed: ${deliveryError}`,
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
      inviteCode: invite.inviteCode
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
      const password = createGeneratedPassword();
      student.password = await hashPassword(password);
      student.isActive = true;
      await student.save();

      const emailSent = await sendCredentialsEmail({
        name: student.name,
        email: student.email,
        password,
        role: "student"
      }).catch((error) => {
        console.error("Student credential resend email error:", error);
        return false;
      });

      return res.json({
        success: Boolean(emailSent),
        message: emailSent
          ? "Student credentials regenerated successfully"
          : "Credentials updated but email could not be sent"
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
    invite.deliveryStatus = "pending";
    invite.deliveryError = "";
    invite.deliveryAttemptedAt = null;
    invite.sentAt = null;
    await invite.save();

    const inviteLink = buildInviteLink(invite.token);
    const { mailResult, deliveryError } = await finalizeInviteDelivery({
      invite,
      password: invite.tempPassword,
      actor: req.user,
      resolvedDepartmentId: invite.department,
      email: invite.studentEmail,
      year: invite.year,
      division: invite.division,
      action: "UPDATE"
    });

    return res.json({
      success: Boolean(mailResult?.emailSent),
      message: mailResult?.emailSent
        ? "Invite regenerated successfully"
        : `Invite regenerated but email failed: ${deliveryError}`,
      inviteLink,
      inviteCode: invite.inviteCode,
      deliveryStatus: invite.deliveryStatus,
      deliveryError: invite.deliveryError
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
