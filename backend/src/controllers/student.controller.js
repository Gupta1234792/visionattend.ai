const User = require("../models/User.model");
const StudentInvite = require("../models/StudentInvite.model");
const { hashPassword } = require("../utils/password");
const { generateToken } = require("../utils/jwt");
const sendCredentialsEmail = require("../utils/sendCredentialsEmail");
const { triggerWebhookEvent } = require("../utils/webhooks");
const { updateFaceCache } = require("../utils/faceCache");
const { getOpencvEndpointCandidates, postToOpenCv } = require("../startup/opencv");
const {
  assertImagePayloadLimit,
  estimateBase64Bytes,
  isValidImageDataUrl
} = require("../utils/imagePayload");

const FACE_REGISTRATION_CONFIDENCE = Number(process.env.FACE_REGISTRATION_CONFIDENCE) || 0.2;
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
      return res.status(400).json({ success: false, message: "Invite token is required" });
    }

    const invite = await StudentInvite.findOne({ token: normalizedToken });
    if (!invite) {
      return res.status(400).json({ success: false, message: "Invalid invite token" });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ success: false, message: "Invite link expired" });
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
      return res.status(400).json({ success: false, message: "Enter a valid student email" });
    }

    if (finalParentEmail && !EMAIL_PATTERN.test(finalParentEmail)) {
      return res.status(400).json({ success: false, message: "Enter a valid parent email" });
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
        const duplicateMessage =
          duplicateField === "email"
            ? "Student already registered. Please login."
            : duplicateField === "rollNo"
            ? "Roll number already exists in this class"
            : "Student already exists";
        return res.status(409).json({ success: false, message: duplicateMessage });
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

    const authToken = generateToken({ userId: student._id, role: student.role });

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
        sendCredentialsEmail({ name: finalName, email: finalEmail, password: finalPassword, role: "student" })
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
      const duplicateMessage =
        duplicateField === "email"
          ? "Student already registered. Please login."
          : duplicateField === "rollNo"
          ? "Roll number already exists in this class"
          : "Student already exists";
      return res.status(409).json({ success: false, message: duplicateMessage });
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
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // DEV_MODE: skip face registration check
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

    return res.status(200).json({ success: true, student });
  } catch (error) {
    console.error("Get student profile error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch student profile" });
  }
};

// ================= RESOLVE INVITE CODE =================
const resolveInviteCode = async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = String(code || "").trim();

    if (!normalizedCode) {
      return res.status(400).json({ success: false, message: "Invite code is required" });
    }

    let invite = await StudentInvite.findOne({ inviteCode: normalizedCode.toUpperCase() });
    if (!invite) {
      invite = await StudentInvite.findOne({ token: normalizedCode.toLowerCase() });
    }
    if (!invite || !invite.isActive || invite.expiresAt < new Date()) {
      return res.status(404).json({ success: false, message: "Invalid or expired invite code" });
    }

    return res.status(200).json({
      success: true,
      token: invite.token,
      inviteLink: `${process.env.FRONTEND_URL || "http://localhost:3000"}/student/register?token=${invite.token}`
    });
  } catch (error) {
    console.error("Resolve invite code error:", error);
    return res.status(500).json({ success: false, message: "Failed to resolve invite code" });
  }
};

// ================= REGISTER STUDENT FACE =================
const registerStudentFace = async (req, res) => {
  try {
    const { image, frames } = req.body;

    // ✅ FIX 1: Valid frames filter
    const validFrames = Array.isArray(frames)
      ? frames.filter((frame) => isValidImageDataUrl(frame))
      : [];

    const primaryImage = isValidImageDataUrl(image) ? image : validFrames[0] || "";

    // ✅ FIX 2: At least one frame OR image required
    if (!primaryImage && validFrames.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Face image is required",
        code: "MISSING_IMAGE"
      });
    }

    // ✅ FIX 3: Relaxed image size check (5KB instead of 12KB)
    const payloadValidation = assertImagePayloadLimit(
      primaryImage,
      validFrames.length ? validFrames : [primaryImage]
    );
    if (!payloadValidation.ok) {
      return res.status(413).json({
        success: false,
        message: payloadValidation.message,
        code: payloadValidation.code || "IMAGE_PAYLOAD_TOO_LARGE"
      });
    }

    const approxBytes = estimateBase64Bytes(primaryImage);
    if (approxBytes < 5000) {
      return res.status(400).json({
        success: false,
        message: "Image too small. Capture a clear face frame close to the camera.",
        code: "LOW_QUALITY_IMAGE"
      });
    }

    const student = await User.findById(req.user._id);
    if (!student || student.role !== "student") {
      return res.status(404).json({
        success: false,
        message: "Student not found",
        code: "STUDENT_NOT_FOUND"
      });
    }

    // ✅ DEV_MODE: bypass opencv entirely
    if (DEV_MODE) {
      student.faceRegisteredAt = new Date();
      await student.save();
      console.log("[face-register] DEV_MODE — skipped opencv, marked registered:", student._id);
      return res.status(200).json({
        success: true,
        message: "Face registration completed (DEV_MODE)",
        faceRegistered: true,
        confidence: 1.0
      });
    }

    // ✅ FIX 4: Already registered — allow re-registration (upsert in opencv-ai anyway)
    if (student.faceRegisteredAt) {
      console.log("[face-register] Student already registered — allowing re-registration (upsert):", student._id);
      // Do NOT block — fall through to opencv call so embedding gets updated
    }

    // ✅ FIX 5: Check opencv configured
    if (!getOpencvEndpointCandidates("register").length) {
      return res.status(503).json({
        success: false,
        message: "OpenCV register service not configured",
        code: "OPENCV_NOT_CONFIGURED"
      });
    }

    console.log("[face-register] Calling opencv-ai /register for userId:", student._id);
    console.log("[face-register] Frames count:", validFrames.length, "| Has image:", !!primaryImage);

    // ✅ FIX 6: Call opencv-ai with full payload
    let registerRes, registerData;
    try {
      const result = await postToOpenCv(
        "register",
        {
          userId: String(student._id),
          collegeId: student.college ? String(student.college) : "",
          departmentId: student.department ? String(student.department) : "",
          year: student.year || "",
          division: student.division || "",
          image: primaryImage,
          frames: validFrames.length > 0 ? validFrames : [primaryImage]
        },
        { timeoutMs: 30000 }
      );
      registerRes = result.response;
      registerData = result.data;
    } catch (opencvError) {
      console.error("[face-register] OpenCV call failed:", opencvError?.message || opencvError);
      return res.status(503).json({
        success: false,
        message: "Face recognition service unreachable. Please retry in a moment.",
        code: "OPENCV_UNREACHABLE"
      });
    }

    console.log("[face-register] OpenCV response status:", registerRes.status);
    console.log("[face-register] OpenCV response data:", JSON.stringify(registerData));

    const confidenceValue = Number(registerData?.confidence);
    const embedding = registerData?.embedding;

    // ✅ FIX 7: Handle duplicate face gracefully
    if (registerData?.code === "DUPLICATE_FACE") {
      let existingUserName = null;
      if (registerData?.existingUserId) {
        try {
          const existingUser = await User.findById(registerData.existingUserId)
            .select("name email")
            .lean();
          if (existingUser?.name) {
            existingUserName = existingUser.name;
          }
        } catch (_) {}
      }
      return res.status(409).json({
        success: false,
        message: existingUserName
          ? `Face already registered with another account (${existingUserName})`
          : "Face already registered with another account",
        code: "DUPLICATE_FACE",
        existingUserName
      });
    }

    // ✅ FIX 8: Handle opencv failure with clear message
    if (!registerRes.ok || !registerData?.success) {
      const failureMessage = registerData?.message || "Face registration failed. Try again with better lighting.";
      console.error("[face-register] OpenCV returned failure:", failureMessage);
      return res.status(400).json({
        success: false,
        message: failureMessage,
        confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
        code: registerData?.code || "FACE_REGISTRATION_FAILED"
      });
    }

    // ✅ SUCCESS — mark faceRegisteredAt
    student.faceRegisteredAt = new Date();
    await student.save();
    console.log("[face-register] SUCCESS — faceRegisteredAt set for:", student._id);

    // Update invite
    StudentInvite.updateMany(
      { studentEmail: String(student.email || "").toLowerCase(), isActive: true },
      { $set: { isActivated: true, isUsed: true } }
    ).catch((inviteError) => {
      console.warn("Student invite activation update error:", inviteError?.message || inviteError);
    });

    // Update face cache if embedding returned
    if (Array.isArray(embedding)) {
      try {
        updateFaceCache(student._id.toString(), embedding);
        console.log("[face-register] Face cache updated for:", student._id);
      } catch (cacheError) {
        console.warn("[face-register] Face cache update error:", cacheError.message);
      }
    } else {
      console.warn("[face-register] No embedding in opencv response — cache not updated");
    }

    // Webhook
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
      frameCount: validFrames.length,
      blinkVerified: false
    });

  } catch (error) {
    console.error("[face-register] Unexpected error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "Face recognition service timed out. Please retry.",
        code: "OPENCV_TIMEOUT"
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to register face",
      code: "FACE_REGISTRATION_FAILED"
    });
  }
};

// ================= CONFIRM STUDENT FACE REGISTRATION (opencv callback) =================
const confirmStudentFaceRegistration = async (req, res) => {
  try {
    const { user_id, userId, confidence } = req.body;
    const targetUserId = user_id || userId;
    const confidenceValue = Number(confidence);

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    if (!Number.isFinite(confidenceValue)) {
      return res.status(400).json({ success: false, message: "confidence must be a number" });
    }

    if (confidenceValue < FACE_REGISTRATION_CONFIDENCE) {
      return res.status(403).json({ success: false, message: "Face confidence too low" });
    }

    const student = await User.findById(targetUserId);
    if (!student || student.role !== "student" || !student.isActive) {
      return res.status(404).json({ success: false, message: "Student not found" });
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
    return res.status(500).json({ success: false, message: "Failed to confirm face registration" });
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
