const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true
    },

    date: {
      type: String, // YYYY-MM-DD
      required: true
    },

    classKey: {
      type: String,
      required: true,
      unique: true
    },

    startTime: Date,
    endTime: Date,

    location: {
      latitude: Number,
      longitude: Number
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.AttendanceSession ||
  mongoose.model("AttendanceSession", attendanceSessionSchema);
