const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", required: true, index: true },
    relation: { type: String, enum: ["MOTHER", "FATHER", "GUARDIAN"], default: "GUARDIAN" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

parentSchema.index({ studentId: 1, collegeId: 1 });

module.exports = mongoose.models.Parent || mongoose.model("Parent", parentSchema);
