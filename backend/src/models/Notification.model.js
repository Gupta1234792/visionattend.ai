const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", required: true, index: true },
    batchId: { type: String, default: null, index: true },
    type: {
      type: String,
      enum: [
        "LOW_ATTENDANCE",
        "PTM_SCHEDULED",
        "LECTURE_REMINDER",
        "SUSPICIOUS_ATTENDANCE",
        "PARENT_NOTIFICATION",
        "GENERAL"
      ],
      required: true,
      index: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["scheduled", "delivered", "failed"],
      default: "delivered",
      index: true
    },
    scheduledFor: { type: Date, default: null, index: true },
    deliveredAt: { type: Date, default: Date.now },
    deliveryError: { type: String, default: null },
    retryCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
