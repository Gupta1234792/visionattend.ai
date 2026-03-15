const crypto = require("crypto");
const User = require("../models/User.model");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateToken } = require("../utils/jwt");
const { logAudit } = require("../utils/audit");
const { getEligibleStudentsForParentEmail, normalizeEmail, syncParentLinksForUser } = require("../utils/parentLinks");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const sendPasswordResetEmail = require("../utils/sendPasswordResetEmail");
const DEV_MODE = process.env.DEV_MODE === "true";

const register = async (req, res) => {
  try {
    const { name, email, password, role, bootstrapKey } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = String(role || "").trim().toLowerCase();

    if (!name || !normalizedEmail || !password || !normalizedRole) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (normalizedRole === "student") {
      return res.status(400).json({
        success: false,
        message: "Student registration is invite-only. Use class invite link or code."
      });
    }

    if (normalizedRole === "hod") {
      return res.status(403).json({
        success: false,
        message: "HOD signup is disabled on public endpoint. Create HOD via admin panel."
      });
    }

    if (!["admin", "parent"].includes(normalizedRole)) {
      return res.status(403).json({
        success: false,
        message: "Public signup is restricted."
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    let assignedCollege = null;

    if (normalizedRole === "admin") {
      const existingAdminCount = await User.countDocuments({ role: "admin" });
      const expectedBootstrapKey = process.env.ADMIN_BOOTSTRAP_KEY || "";
      const shouldRequireKey = existingAdminCount > 0 || Boolean(expectedBootstrapKey);
      if (shouldRequireKey && (!bootstrapKey || bootstrapKey !== expectedBootstrapKey)) {
        return res.status(403).json({
          success: false,
          message: "Invalid admin bootstrap key"
        });
      }
    }

    if (normalizedRole === "parent") {
      const linkedStudents = await getEligibleStudentsForParentEmail(normalizedEmail);
      if (!linkedStudents.length) {
        return res.status(403).json({
          success: false,
          message: "Parent signup is allowed only if this email is already linked to a student."
        });
      }

      const collegeIds = [
        ...new Set(linkedStudents.map((student) => (student.college ? String(student.college) : "")).filter(Boolean))
      ];

      if (collegeIds.length > 1) {
        return res.status(403).json({
          success: false,
          message: "This parent email is linked to students in multiple colleges. Ask admin to create the parent account."
        });
      }

      assignedCollege = collegeIds[0] || null;
    }

    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
      college: assignedCollege
    });

    if (normalizedRole === "parent") {
      const syncResult = await syncParentLinksForUser(user);
      if (syncResult.error) {
        await User.findByIdAndDelete(user._id);
        return res.status(403).json({
          success: false,
          message: syncResult.error
        });
      }
    }

    const emailSent = await sendCredentialsEmail({
      name,
      email: normalizedEmail,
      password,
      role: normalizedRole
    });

    await logAudit({
      actor: user,
      module: "auth",
      action: "REGISTER",
      entityType: "User",
      entityId: user._id,
      metadata: { role: user.role, email: user.email, emailSent }
    });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "User registered successfully. Credentials sent on email."
        : "User registered successfully. Credentials email could not be sent.",
      emailSent,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college || null,
        department: user.department || null,
        year: user.year || null,
        division: user.division || null,
        faceRegistered: Boolean(user.faceRegisteredAt)
      }
    });
  } catch (error) {
    console.error("Register error:", error);
    if (error?.name === "ValidationError") {
      const firstError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstError?.message || "Validation failed"
      });
    }
    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await User.findOne({ email, isActive: true });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email exists, a reset link has been sent."
      });
    }

    await PasswordResetToken.deleteMany({ userId: user._id });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + Number(process.env.RESET_TOKEN_EXP_MINUTES || 20) * 60 * 1000);

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt
    });

    const emailSent = await sendPasswordResetEmail({
      name: user.name,
      email: user.email,
      resetToken: rawToken
    });

    await logAudit({
      actor: user,
      module: "auth",
      action: "REQUEST_PASSWORD_RESET",
      entityType: "User",
      entityId: user._id,
      metadata: {
        email: user.email,
        emailSent
      }
    });

    return res.status(200).json({
      success: true,
      message: emailSent
        ? "If this email exists, a reset link has been sent."
        : "Reset link could not be emailed right now. Please contact admin.",
      emailSent
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process forgot password request"
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "token and newPassword are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const resetDoc = await PasswordResetToken.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() }
    });

    if (!resetDoc) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token"
      });
    }

    const user = await User.findById(resetDoc.userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive"
      });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    resetDoc.usedAt = new Date();
    await resetDoc.save();
    await PasswordResetToken.deleteMany({ userId: user._id, _id: { $ne: resetDoc._id } });

    await logAudit({
      actor: user,
      module: "auth",
      action: "RESET_PASSWORD",
      entityType: "User",
      entityId: user._id,
      metadata: { email: user.email }
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successful. Please login with new password."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password"
    });
  }
};

const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "").trim().toLowerCase();

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Email, password and role are required"
      });
    }

    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: role === "parent"
          ? "Parent account not found. Register first using the linked parent email."
          : "Invalid credentials"
      });
    }

    const storedPassword = String(user.password || "");
    let isMatch = false;

    if (/^\$2[aby]\$\d{2}\$/.test(storedPassword)) {
      isMatch = await comparePassword(password, storedPassword);
    } else if (storedPassword && storedPassword === password) {
      isMatch = true;
      user.password = await hashPassword(password);
      await user.save();
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (role !== user.role) {
      return res.status(403).json({
        success: false,
        message: "Invalid role selected. Please login with correct role."
      });
    }

    if (user.role === "parent") {
      const syncResult = await syncParentLinksForUser(user);
      if (syncResult.error) {
        return res.status(403).json({
          success: false,
          message: syncResult.error
        });
      }
    }

    const token = generateToken({
      userId: user._id,
      role: user.role
    });

    await logAudit({
      actor: user,
      module: "auth",
      action: "LOGIN",
      entityType: "User",
      entityId: user._id,
      metadata: { role: user.role }
    });

    // DEV_MODE: Skip face registration check for students
    if (user.role === "student" && DEV_MODE) {
      return res.status(200).json({
        success: true,
        message: "Login successful (DEV_MODE)",
        token,
        role: user.role,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          college: user.college || null,
          department: user.department || null,
          year: user.year || null,
          division: user.division || null,
          faceRegistered: true
        },
        devMode: true
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college || null,
        department: user.department || null,
        year: user.year || null,
        division: user.division || null,
        faceRegistered: Boolean(user.faceRegisteredAt)
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword
};
