const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true // lecture.meetingId
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    senderRole: {
      type: String,
      enum: ["teacher", "student"],
      required: true
    },

    message: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", chatMessageSchema);
