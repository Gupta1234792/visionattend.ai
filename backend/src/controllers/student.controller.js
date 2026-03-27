const User = require("../models/User.model");
const StudentInvite = require("../models/StudentInvite.model");
const { hashPassword } = require("../utils/password");
const { generateToken } = require("../utils/jwt");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const { triggerWebhookEvent } = require("../utils/webhooks");
const { updateFaceCache } = require("../utils/faceCache");
const { getOpencvEndpointCandidates, postToOpenCv } = require("../startup/opencv");
const FACE_REGISTRATION_CONFIDENCE = Number(process.env.FACE_REGISTRATION_CONFIDENCE) || 0.7;
const DEV_MODE = process.env.DEV_MODE === "true";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        division: invite.division,
        studentName: invite.studentName || "",
        studentEmail: invite.studentEmail || "",
        rollNo: invite.rollNo || "",
        hasDirectActivation: Boolean(invite.studentEmail && invite.tempPassword && invite.rollNo),
        isActivated: Boolean(invite.isActivated)
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

    if (!normalizedToken) {
      return res.status(400).json({
        success: false,
        message: "Invite token is required"
      });
    }

    const invite = await StudentInvite.findOne({ token: normalizedToken });

    if (!invite) {
      return res.status(400).json({
        success: false,
        message: "Invalid invite token"
      });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: "Invite link expired"
      });
    }

    if (!invite.isActive) {
      return res.status(400).json({
        success: false,
        message: invite.isUsed
          ? "Invite already used. Please login with your student account."
          : "Invite is inactive"
      });
    }

    if (
      normalizedCode &&
      (!invite.inviteCode || String(invite.inviteCode).toUpperCase() !== normalizedCode)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid invite code for this invite link"
      });
    }

    const finalName = String(name || invite.studentName || "").trim();
    const finalEmail = String(email || invite.studentEmail || "").trim().toLowerCase();
    const finalPassword = String(password || invite.tempPassword || "").trim();
    const finalRollNo = String(rollNo || invite.rollNo || "").trim().toUpperCase();
    const finalParentEmail = String(parentEmail || "").trim().toLowerCase();

    if (!finalName || !finalEmail || !finalPassword || !finalRollNo) {
      return res.status(400).json({
        success: false,
        message: "Student details are incomplete for activation"
      });
    }

    if (!EMAIL_PATTERN.test(finalEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid student email"
      });
    }

    if (finalParentEmail && !EMAIL_PATTERN.test(finalParentEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid parent email"
      });
    }

    if (finalPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    if (invite.studentEmail && finalEmail !== String(invite.studentEmail).trim().toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Email does not match the invited student"
      });
    }

    const existingStudent = await User.findOne({ email: finalEmail });
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        message: "Student already registered. Please login."
      });
    }

    const existingRollNo = await User.findOne({
      department: invite.department,
      year: invite.year,
      division: invite.division,
      rollNo: finalRollNo
    });

    if (existingRollNo) {
      return res.status(409).json({
        success: false,
        message: "Roll number already exists in this class"
      });
    }

    const hashedPassword = await hashPassword(finalPassword);
    let student;
    try {
      student = await User.create({
        name: finalName,
        email: finalEmail,
        password: hashedPassword,
        role: "student",
        rollNo: finalRollNo,
        parentEmail: finalParentEmail || null,
        college: invite.college,
        department: invite.department,
        year: invite.year,
        division: invite.division,
        faceRegisteredAt: null
      });
    } catch (createError) {
      if (createError?.code === 11000) {
        const duplicateField = Object.keys(createError.keyPattern || {})[0] || "field";
        const duplicateMessage = duplicateField === "email"
          ? "Student already registered. Please login."
          : duplicateField === "rollNo"
            ? "Roll number already exists in this class"
            : "Student already exists";
        return res.status(409).json({
          success: false,
          message: duplicateMessage
        });
      }

      if (createError?.name === "ValidationError") {
        const firstMessage = Object.values(createError.errors || {})[0]?.message;
        return res.status(400).json({
          success: false,
          message: firstMessage || "Invalid student details"
        });
      }

      throw createError;
    }

    const authToken = generateToken({
      userId: student._id,
      role: student.role
    });

    setImmediate(() => {
      Promise.allSettled([
        StudentInvite.updateOne(
          { _id: invite._id },
          {
            $set: {
              isUsed: true,
              isActivated: true,
              isActive: false,
              studentName: finalName,
              studentEmail: finalEmail,
              rollNo: finalRollNo
            }
          }
        ),
        sendCredentialsEmail({
          name: finalName,
          email: finalEmail,
          password: finalPassword,
          role: "student"
        })
      ]).catch((error) => {
        console.error("Post-registration async task error:", error);
      });
    });

    return res.status(201).json({
      success: true,
      message: "Student registered successfully. Continue with face registration.",
      token: authToken,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo,
        year: student.year,
        division: student.division,
        faceRegistered: false
      },
      user: {
        id: student._id,
        name: student.name,
        email: student.email,
        role: student.role,
        college: student.college || null,
        department: student.department || null,
        year: student.year || null,
        division: student.division || null,
        faceRegistered: false
      },
      nextStep: "/student/face-register"
    });
  } catch (error) {
    console.error("Student registration error:", error);

    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      const duplicateMessage = duplicateField === "email"
        ? "Student already registered. Please login."
        : duplicateField === "rollNo"
          ? "Roll number already exists in this class"
          : "Student already exists";
      return res.status(409).json({
        success: false,
        message: duplicateMessage
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to register student"
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

    // DEV_MODE: Skip face registration check
    if (DEV_MODE) {
      return res.status(200).json({
        success: true,
        student: {
          ...student.toObject(),
          faceRegistered: true,
          faceRegisteredAt: new Date().toISOString()
        },
        devMode: true
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
    const { image, frames, blinkFrames } = req.body;
    const validFrames = Array.isArray(frames)
      ? frames.filter((frame) => typeof frame === "string" && frame.startsWith("data:image/"))
      : [];
    const validBlinkFrames = Array.isArray(blinkFrames)
      ? blinkFrames.filter((frame) => typeof frame === "string" && frame.startsWith("data:image/"))
      : [];
    const primaryImage = typeof image === "string" && image.startsWith("data:image/")
      ? image
      : validFrames[0] || "";

    if (!primaryImage) {
      return res.status(400).json({
        success: false,
        message: "Face image is required"
      });
    }

    if (validFrames.length < 1 && !primaryImage) {
      return res.status(400).json({
        success: false,
        message: "At least one registration frame is required"
      });
    }

    const parts = primaryImage.split(",");
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

    // DEV MODE
    if (DEV_MODE) {
      student.faceRegisteredAt = new Date();
      await student.save();

      return res.status(200).json({
        success: true,
        message: "Face registration completed (DEV_MODE)",
        faceRegistered: true,
        confidence: 1.0
      });
    }

    if (student.faceRegisteredAt) {
      return res.status(200).json({
        success: true,
        message: "Face already registered",
        faceRegistered: true
      });
    }

    if (!getOpencvEndpointCandidates("register").length) {
      return res.status(503).json({
        success: false,
        message: "OpenCV register service not configured"
      });
    }

    const { response: registerRes, data: registerData } = await postToOpenCv(
      "register",
      {
        userId: String(student._id),
        collegeId: student.college ? String(student.college) : "",
        departmentId: student.department ? String(student.department) : "",
        year: student.year || "",
        division: student.division || "",
        image: primaryImage,
        frames: validFrames.length ? validFrames : [primaryImage]
      },
      { timeoutMs: 10000 }
    );

    const confidenceValue = Number(registerData?.confidence);
    const embedding = registerData?.embedding;

    if (
      !registerRes.ok ||
      !registerData?.success ||
      !Number.isFinite(confidenceValue) ||
      confidenceValue < FACE_REGISTRATION_CONFIDENCE
    ) {
      let failureMessage = registerData?.message || "Face registration failed";
      let existingUserName = null;
      if (
        registerRes.status === 403 &&
        String(registerData?.message || "").toLowerCase().includes("already registered") &&
        registerData?.existingUserId
      ) {
        const existingUser = await User.findById(registerData.existingUserId).select("name email").lean();
        if (existingUser?.name) {
          existingUserName = existingUser.name;
          failureMessage = `Face already registered with another account (${existingUser.name})`;
        }
      }

      return res.status(403).json({
        success: false,
        message: failureMessage,
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
        existingUserName
      });
    }

    student.faceRegisteredAt = new Date();
    await student.save();

    await StudentInvite.updateMany(
      { studentEmail: String(student.email || "").toLowerCase(), isActive: true },
      { $set: { isActivated: true, isUsed: true } }
    );

    /* 🔥 CRITICAL CACHE FIX */
    try {
      if (Array.isArray(embedding)) {
        updateFaceCache(student._id.toString(), embedding);
        console.log("Face cache updated:", student._id);
      } else {
        console.warn("Embedding missing from OpenCV response. Cache not updated.");
      }
    } catch (cacheError) {
      console.warn("Face cache update error:", cacheError.message);
    }

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
        registeredAt: student.faceRegisteredAt.toISOString()
      }
    }).catch((webhookError) => {
      console.error("student.face.registered webhook error:", webhookError);
    });

    return res.status(200).json({
      success: true,
      message: "Face registration completed",
      faceRegistered: true,
      confidence: confidenceValue,
      frameCount: validFrames.length || 1,
      blinkVerified: false
    });

  } catch (error) {
    console.error("Register student face error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "Face registration timeout"
      });
    }

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
