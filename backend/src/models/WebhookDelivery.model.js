const mongoose = require("mongoose");

const webhookDeliverySchema = new mongoose.Schema(
  {
    endpoint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WebhookEndpoint",
      required: true,
      index: true
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true
    },
    event: {
      type: String,
      required: true,
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
      index: true
    },
    attemptCount: {
      type: Number,
      default: 0
    },
    responseStatus: {
      type: Number,
      default: null
    },
    responseBody: {
      type: String,
      default: null
    },
    errorMessage: {
      type: String,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    lastAttemptAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

webhookDeliverySchema.index({ collegeId: 1, createdAt: -1 });

module.exports =
  mongoose.models.WebhookDelivery ||
  mongoose.model("WebhookDelivery", webhookDeliverySchema);
