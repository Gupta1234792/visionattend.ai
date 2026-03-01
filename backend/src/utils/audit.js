const AuditLog = require("../models/AuditLog.model");

const logAudit = async ({
  actor = null,
  module,
  action,
  entityType,
  entityId,
  metadata = {}
}) => {
  try {
    await AuditLog.create({
      actorId: actor?._id || null,
      actorRole: actor?.role || "system",
      collegeId: actor?.college || metadata?.collegeId || null,
      module,
      action,
      entityType,
      entityId: String(entityId),
      metadata
    });
  } catch (error) {
    console.error("Audit log write failed:", error?.message || error);
  }
};

module.exports = { logAudit };
