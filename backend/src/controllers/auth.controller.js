const User = require("../models/User.model");
const crypto = require("crypto");
const PasswordResetToken = require("../models/PasswordResetToken.model");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateToken } = require("../utils/jwt");
const { logAudit } = require("../utils/audit");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const sendPasswordResetEmail = require("../utils/sendPasswordResetEmail");

// ================= REGISTER =================
const register = async (req, res) => {
  try {
    const { name, email, password, role, bootstrapKey } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (role === "student") {
      return res.status(400).json({
        success: false,
        message: "Student registration is invite-only. Use class invite link or code."
      });
    }

    if (role === "hod") {
      return res.status(403).json({
        success: false,
        message: "HOD signup is disabled on public endpoint. Create HOD via admin panel."
      });
    }

    if (role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Public signup is restricted."
      });
    }

    const existingAdminCount = await User.countDocuments({ role: "admin" });
    const expectedBootstrapKey = process.env.ADMIN_BOOTSTRAP_KEY || "";
    const shouldRequireKey = existingAdminCount > 0 || Boolean(expectedBootstrapKey);
    if (shouldRequireKey && (!bootstrapKey || bootstrapKey !== expectedBootstrapKey)) {
      return res.status(403).json({
        success: false,
        message: "Invalid admin bootstrap key"
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists"
      });
    }

    // ✅ HASH PASSWORD (THIS WAS MISSING)
    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role
    });
    const emailSent = await sendCredentialsEmail({
      name,
      email,
      password,
      role
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

// ================= FORGOT PASSWORD =================
const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await User.findOne({ email, isActive: true });

    // Do not reveal whether account exists.
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

// ================= RESET PASSWORD =================
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

// ================= LOGIN =================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const isMatch = await comparePassword(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
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

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
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
