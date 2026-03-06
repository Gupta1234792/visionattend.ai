const mongoose = require("mongoose");

const onlineLectureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    batchId: { type: String, required: true, index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 480 },
    meetingRoomId: { type: String, required: true, unique: true, index: true },
    meetingLink: { type: String, required: true },
    status: {
      type: String,
      enum: ["SCHEDULED", "LIVE", "ENDED", "CANCELED"],
      default: "SCHEDULED",
      index: true
    },
    purpose: { type: String, default: "" },
    recordingUrl: { type: String, default: null },
    autoAttendanceStartedAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    canceledByHolidayId: { type: mongoose.Schema.Types.ObjectId, ref: "BatchHoliday", default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

onlineLectureSchema.index({ collegeId: 1, batchId: 1, scheduledAt: -1 });
onlineLectureSchema.index({ teacherId: 1, scheduledAt: -1 });

module.exports =
  mongoose.models.OnlineLecture ||
  mongoose.model("OnlineLecture", onlineLectureSchema);
