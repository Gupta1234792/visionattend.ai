const mongoose = require("mongoose");

const ptmScheduleSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    batchId: { type: String, required: true, index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 180 },
    meetingRoomId: { type: String, required: true, unique: true, index: true },
    meetingLink: { type: String, required: true },
    status: {
      type: String,
      enum: ["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
      index: true
    },
    notes: { type: String, default: "" },
    parentConfirmed: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

ptmScheduleSchema.index({ collegeId: 1, scheduledAt: -1 });
ptmScheduleSchema.index({ teacherId: 1, scheduledAt: -1 });
ptmScheduleSchema.index({ studentId: 1, scheduledAt: -1 });

module.exports =
  mongoose.models.PTMSchedule ||
  mongoose.model("PTMSchedule", ptmScheduleSchema);
