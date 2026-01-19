const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },

    title: {
      type: String,
      required: true
    },

    description: String,

    meetingId: {
      type: String,
      required: true,
      unique: true
    },
status: {
  type: String,
  enum: ["scheduled", "live", "ended"],
  default: "scheduled"
}
,
    startTime: Date,
    endTime: Date,

    isLive: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Lecture ||
  mongoose.model("Lecture", lectureSchema);
