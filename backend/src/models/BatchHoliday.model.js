const mongoose = require("mongoose");

const batchHolidaySchema = new mongoose.Schema(
  {
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true
    },
    batchId: {
      type: String,
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    fromDate: {
      type: Date,
      required: true,
      index: true
    },
    toDate: {
      type: Date,
      required: true,
      index: true
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

batchHolidaySchema.index({ collegeId: 1, batchId: 1, fromDate: 1, toDate: 1, isActive: 1 });

module.exports =
  mongoose.models.BatchHoliday ||
  mongoose.model("BatchHoliday", batchHolidaySchema);
