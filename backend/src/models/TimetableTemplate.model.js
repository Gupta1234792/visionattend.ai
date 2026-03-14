const mongoose = require("mongoose");

const timetableTemplateSlotSchema = new mongoose.Schema(
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

const timetableTemplateSchema = new mongoose.Schema(
  {
    templateName: {
      type: String,
      required: true,
      trim: true
    },
    classLabel: {
      type: String,
      required: true,
      trim: true
    },
    weekday: {
      type: Number,
      min: 0,
      max: 6,
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
      required: true,
      index: true
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
      type: [timetableTemplateSlotSchema],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

timetableTemplateSchema.index({ batchKey: 1, weekday: 1, isActive: 1 });
timetableTemplateSchema.index({ college: 1, createdBy: 1, isActive: 1 });

module.exports =
  mongoose.models.TimetableTemplate ||
  mongoose.model("TimetableTemplate", timetableTemplateSchema);
