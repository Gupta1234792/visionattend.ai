const mongoose = require("mongoose");

const timetableSlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true,
      trim: true
    },
    endTime: {
      type: String,
      default: "",
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    teacherName: {
      type: String,
      default: "",
      trim: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    type: {
      type: String,
      enum: ["theory", "practical", "event", "break"],
      default: "theory"
    },
    notes: {
      type: String,
      default: "",
      trim: true
    },
    order: {
      type: Number,
      default: 0
    }
  },
  { _id: true }
);

const timetableSchema = new mongoose.Schema(
  {
    classLabel: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: String,
      required: true,
      index: true
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true
    },
    batchKey: {
      type: String,
      required: true,
      index: true
    },
    year: {
      type: String,
      enum: ["FY", "SY", "TY", "FINAL"],
      required: true
    },
    division: {
      type: String,
      enum: ["A", "B", "C"],
      required: true
    },
    slots: {
      type: [timetableSlotSchema],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    isPublished: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

timetableSchema.index({ batchKey: 1, date: 1, isActive: 1 });
timetableSchema.index({ college: 1, date: 1 });
timetableSchema.index({ "slots.teacherId": 1, date: 1, isPublished: 1 });

module.exports =
  mongoose.models.Timetable ||
  mongoose.model("Timetable", timetableSchema);
