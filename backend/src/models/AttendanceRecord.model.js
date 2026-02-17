const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["OFFLINE", "ONLINE"],
      default: "OFFLINE",
      index: true
    },

    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: function requiredSession() {
        return this.type === "OFFLINE";
      }
    },

    onlineLecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineLecture",
      required: function requiredOnlineLecture() {
        return this.type === "ONLINE";
      }
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true
    },

    classKey: {
      type: String,
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: ["present", "remote", "absent"],
      default: "present"
    },
    locationFlag: {
      type: String,
      enum: ["green", "yellow", "red"],
      default: "green"
    },

    distanceMeters: {
      type: Number,
      default: null
    },

    gpsDistance: {
      type: Number,
      default: null
    },

    location: {
      latitude: Number,
      longitude: Number
    },

    joinTime: {
      type: Date,
      default: null
    },

    leaveTime: {
      type: Date,
      default: null
    },

    duration: {
      type: Number,
      default: 0
    },

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

attendanceRecordSchema.index({ student: 1, classKey: 1 }, { unique: true });
attendanceRecordSchema.index({ type: 1, onlineLecture: 1 });

module.exports =
  mongoose.models.AttendanceRecord ||
  mongoose.model("AttendanceRecord", attendanceRecordSchema);
