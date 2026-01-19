const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      uppercase: true
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true
    },
    hod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);
