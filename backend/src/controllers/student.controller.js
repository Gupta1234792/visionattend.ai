const User = require("../models/User.model");
const StudentInvite = require("../models/StudentInvite.model");
const { hashPassword } = require("../utils/password");
const { triggerWebhookEvent } = require("../utils/webhooks");
const FACE_REGISTRATION_CONFIDENCE = Number(process.env.FACE_REGISTRATION_CONFIDENCE) || 0.7;
const OPENCV_REGISTER_URL = process.env.OPENCV_REGISTER_URL ||
  (process.env.OPENCV_VERIFY_URL
    ? process.env.OPENCV_VERIFY_URL.replace(/\/verify\/?$/, "/register")
    : "");

// ================= VALIDATE STUDENT INVITE =================
const validateInviteToken = async (req, res) => {
  try {
    const { token } = req.params;
    const normalizedToken = String(token || "").trim().toLowerCase();

    if (!normalizedToken) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    const invite = await StudentInvite.findOne({ token: normalizedToken });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: "Invalid invite token"
      });
    }

    if (!invite.isActive || invite.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: "Invite link expired"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invite token is valid",
      data: {
        college: invite.college,
        department: invite.department,
        year: invite.year,
        division: invite.division
      }
    });
  } catch (error) {
    console.error("Validate invite token error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to validate invite token"
    });
  }
};

// ================= REGISTER STUDENT =================
const registerStudent = async (req, res) => {
  try {
    const { token, inviteCode, name, email, password, rollNo, parentEmail } = req.body;
    const normalizedToken = String(token || "").trim().toLowerCase();
    const normalizedCode = String(inviteCode || "").trim().toUpperCase();

    if (!normalizedToken || !normalizedCode || !name || !email || !password || !rollNo) {
      return res.status(400).json({
        success: false,
        message: "Invite token, invite code and required fields are missing"
      });
    }

    const invite = await StudentInvite.findOne({ token: normalizedToken });

    if (!invite || !invite.isActive || invite.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired invite token"
      });
    }
    if (!invite.inviteCode || String(invite.inviteCode).toUpperCase() !== normalizedCode) {
      return res.status(400).json({
        success: false,
        message: "Invalid invite code for this invite link"
      });
    }

    const existingStudent = await User.findOne({ email });
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: "Student already registered. Please login."
      });
    }

    const hashedPassword = await hashPassword(password);

    const student = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student",
      rollNo,
      parentEmail: parentEmail || null,
      college: invite.college,
      department: invite.department,
      year: invite.year,
      division: invite.division
    });

    return res.status(201).json({
      success: true,
      message: "Student registered successfully",
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division
      }
    });
  } catch (error) {
    console.error("Student registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register student"
    });
  }
};

// ================= GET LOGGED-IN STUDENT =================
const getStudentProfile = async (req, res) => {
  try {
    const student = await User.findById(req.user._id)
      .select("-password")
      .populate("college", "name code")
      .populate("department", "name code");

    if (!student || student.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    return res.status(200).json({
      success: true,
      student
    });
  } catch (error) {
    console.error("Get student profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch student profile"
    });
  }
};

const resolveInviteCode = async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || "").trim();

    if (!normalizedCode) {
      return res.status(400).json({
        success: false,
        message: "Invite code is required"
      });
    }

    let invite = await StudentInvite.findOne({ inviteCode: normalizedCode.toUpperCase() });
    if (!invite) {
      invite = await StudentInvite.findOne({ token: normalizedCode.toLowerCase() });
    }
    if (!invite || !invite.isActive || invite.expiresAt < new Date()) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired invite code"
      });
    }

    return res.status(200).json({
      success: true,
      token: invite.token,
      inviteLink: `${process.env.FRONTEND_URL || "http://localhost:3000"}/student/register?token=${invite.token}`
    });
  } catch (error) {
    console.error("Resolve invite code error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resolve invite code"
    });
  }
};

const registerStudentFace = async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        success: false,
        message: "Face image is required"
      });
    }

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid image format"
      });
    }

    const parts = image.split(",");
    if (parts.length !== 2 || !parts[1]) {
      return res.status(400).json({
        success: false,
        message: "Invalid image payload"
      });
    }

    const approxBytes = Math.floor((parts[1].length * 3) / 4);
    if (approxBytes < 12000) {
      return res.status(400).json({
        success: false,
        message: "Image too small. Capture a clear face frame."
      });
    }

    const student = await User.findById(req.user._id);
    if (!student || student.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    if (student.faceRegisteredAt) {
      return res.status(200).json({
        success: true,
        message: "Face already registered",
        faceRegistered: true
      });
    }

    if (!OPENCV_REGISTER_URL) {
      return res.status(503).json({
        success: false,
        message: "OpenCV register service not configured"
      });
    }

    const registerRes = await fetch(OPENCV_REGISTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: String(student._id),
        collegeId: student.college ? String(student.college) : "",
        departmentId: student.department ? String(student.department) : "",
        year: student.year || "",
        division: student.division || "",
        image
      })
    });

    const registerData = await registerRes.json().catch(() => ({}));
    const confidenceValue = Number(registerData?.confidence);

    if (
      !registerRes.ok ||
      !registerData?.success ||
      !Number.isFinite(confidenceValue) ||
      confidenceValue < FACE_REGISTRATION_CONFIDENCE
    ) {
      return res.status(403).json({
        success: false,
        message: registerData?.message || "Face registration failed",
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null
      });
    }

    student.faceRegisteredAt = new Date();
    await student.save();

    triggerWebhookEvent({
      event: "student.face.registered",
      collegeId: student.college,
      payload: {
        event: "student.face.registered",
        studentId: String(student._id),
        departmentId: student.department ? String(student.department) : "",
        year: student.year || "",
        division: student.division || "",
        confidence: confidenceValue,
        registeredAt: student.faceRegisteredAt?.toISOString?.() || new Date(student.faceRegisteredAt).toISOString()
      }
    }).catch((webhookError) => {
      console.error("student.face.registered webhook error:", webhookError);
    });

    return res.status(200).json({
      success: true,
      message: "Face registration completed",
      faceRegistered: true,
      confidence: confidenceValue
    });
  } catch (error) {
    console.error("Register student face error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register face"
    });
  }
};

const confirmStudentFaceRegistration = async (req, res) => {
  try {
    const { user_id, userId, confidence } = req.body;
    const targetUserId = user_id || userId;
    const confidenceValue = Number(confidence);

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "user_id is required"
      });
    }

    if (!Number.isFinite(confidenceValue)) {
      return res.status(400).json({
        success: false,
        message: "confidence must be a number"
      });
    }

    if (confidenceValue < FACE_REGISTRATION_CONFIDENCE) {
      return res.status(403).json({
        success: false,
        message: "Face confidence too low"
      });
    }

    const student = await User.findById(targetUserId);
    if (!student || student.role !== "student" || !student.isActive) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    student.faceRegisteredAt = new Date();
    await student.save();

    return res.status(200).json({
      success: true,
      message: "Face registration verified",
      faceRegistered: true
    });
  } catch (error) {
    console.error("Confirm student face registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm face registration"
    });
  }
};

module.exports = {
  validateInviteToken,
  resolveInviteCode,
  registerStudent,
  getStudentProfile,
  registerStudentFace,
  confirmStudentFaceRegistration
};
