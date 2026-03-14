const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    senderRole: {
      type: String,
      enum: ["admin", "hod", "teacher", "coordinator", "student", "parent", "system"],
      required: true
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    message: { type: String, required: true },

    seen: {
      type: Boolean,
      default: false
    },

    delivered: {
      type: Boolean,
      default: false
    },

    messageType: {
      type: String,
      enum: ["text", "system"],
      default: "text"
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ roomId: 1, createdAt: 1 });
chatMessageSchema.index({ sender: 1 });
chatMessageSchema.index({ receiver: 1 });

module.exports =
  mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", chatMessageSchema);
