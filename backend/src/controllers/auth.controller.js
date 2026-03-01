const User = require("../models/User.model");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateToken } = require("../utils/jwt");
const { logAudit } = require("../utils/audit");

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

    await logAudit({
      actor: user,
      module: "auth",
      action: "REGISTER",
      entityType: "User",
      entityId: user._id,
      metadata: { role: user.role, email: user.email }
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
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
  login
};
