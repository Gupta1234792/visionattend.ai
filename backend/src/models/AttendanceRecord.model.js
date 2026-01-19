const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },

    // 🔐 One attendance per student per subject per day
    classKey: {
      type: String,
      required: true
      // example: <subjectId>_2026-01-17
    },

    status: {
      type: String,
      enum: ["present", "remote"],
      default: "present"
    },

    distanceMeters: {
      type: Number,
      required: true
    },

    location: {
      latitude: Number,
      longitude: Number
    },

    // 🧠 OpenCV payload (future)
    faceVerified: {
      type: Boolean,
      default: false
    },

    faceConfidence: {
      type: Number,
      default: null
    },

    markedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// 🚫 HARD RULE: ONE ATTENDANCE PER DAY
attendanceRecordSchema.index(
  { student: 1, classKey: 1 },
  { unique: true }
);

// ✅ SAFE EXPORT
module.exports =
  mongoose.models.AttendanceRecord ||
  mongoose.model("AttendanceRecord", attendanceRecordSchema);
