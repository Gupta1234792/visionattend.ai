const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorRole: { type: String, default: "system", index: true },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", default: null, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true, index: true },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1, module: 1, action: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
