const mongoose = require("mongoose");

const webhookEndpointSchema = new mongoose.Schema(
  {
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: "",
      trim: true
    },
    events: {
      type: [String],
      default: ["*"]
    },
    secret: {
      type: String,
      required: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    createdByRole: {
      type: String,
      enum: ["admin", "hod"],
      required: true
    },
    lastDeliveryAt: {
      type: Date,
      default: null
    },
    lastStatus: {
      type: String,
      enum: ["idle", "delivered", "failed"],
      default: "idle"
    },
    lastError: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

webhookEndpointSchema.index({ collegeId: 1, isActive: 1, createdAt: -1 });

module.exports =
  mongoose.models.WebhookEndpoint ||
  mongoose.model("WebhookEndpoint", webhookEndpointSchema);
