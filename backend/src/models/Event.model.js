const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["LECTURE", "PTM", "EXAM", "NOTICE"],
      required: true,
      index: true
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    scheduledAt: { type: Date, required: true, index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", required: true, index: true },
    batchId: { type: String, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

eventSchema.index({ collegeId: 1, scheduledAt: 1, type: 1 });

module.exports = mongoose.models.Event || mongoose.model("Event", eventSchema);
