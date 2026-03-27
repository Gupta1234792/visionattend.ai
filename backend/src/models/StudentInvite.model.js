const mongoose = require("mongoose");

const studentInviteSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true
    },
    inviteCode: {
      type: String,
      uppercase: true,
      unique: true,
      sparse: true
    },

    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    studentName: {
      type: String,
      trim: true,
      default: ""
    },
    studentEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
      index: true
    },
    tempPassword: {
      type: String,
      default: ""
    },
    rollNo: {
      type: String,
      trim: true,
      default: ""
    },
    inviteToken: {
      type: String,
      default: ""
    },
    isActivated: {
      type: Boolean,
      default: false
    },

    expiresAt: {
      type: Date,
      required: true
    },

    isUsed: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    disabledAt: {
      type: Date,
      default: null
    },
    disabledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

studentInviteSchema.index({ studentEmail: 1, department: 1, year: 1, division: 1 });
studentInviteSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("StudentInvite", studentInviteSchema);
