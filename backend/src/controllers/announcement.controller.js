const Announcement = require("../models/Announcement.model");
const Notification = require("../models/Notification.model");
const User = require("../models/User.model");
const getBatchKey = require("../utils/batchKey");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");
const { triggerWebhookEvent } = require("../utils/webhooks");

const ALLOWED_TARGET_ROLES = {
  admin: ["hod", "coordinator", "teacher", "student", "parent"],
  hod: ["teacher", "coordinator", "student"],
  coordinator: ["student", "teacher"],
  teacher: ["student"]
};

const resolveAnnouncementScope = (reqUser, body) => {
  const requestedRoles = Array.isArray(body.targetRoles)
    ? body.targetRoles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const allowedRoles = ALLOWED_TARGET_ROLES[reqUser.role] || [];
  const targetRoles = requestedRoles.filter((role) => allowedRoles.includes(role));

  if (!targetRoles.length) {
    return { ok: false, message: "Select at least one valid target role" };
  }

  if (reqUser.role === "admin") {
    const college = reqUser.college || body.collegeId || null;
    if (!college) {
      return { ok: false, message: "Select a college for admin announcement" };
    }
    return {
      ok: true,
      scopeType: "college",
      college,
      department: body.departmentId || null,
      batchKey: body.batchKey || null,
      year: body.year || null,
      division: body.division || null,
      targetRoles
    };
  }

  if (reqUser.role === "hod") {
    return {
      ok: true,
      scopeType: "department",
      college: reqUser.college,
      department: reqUser.department,
      batchKey: body.batchKey || null,
      year: body.year || null,
      division: body.division || null,
      targetRoles
    };
  }

  const year = body.year || reqUser.year;
  const division = body.division || reqUser.division;
  if (!reqUser.department || !year || !division) {
    return { ok: false, message: "Batch context is required for this announcement" };
  }

  return {
    ok: true,
    scopeType: "batch",
    college: reqUser.college,
    department: reqUser.department,
    batchKey: getBatchKey({
      department: reqUser.department,
      year,
      division
    }),
    year,
    division,
    targetRoles
  };
};

const buildRecipientQuery = (scope) => {
  const query = {
    role: { $in: scope.targetRoles },
    college: scope.college,
    isActive: true
  };

  if (scope.department) {
    query.department = scope.department;
  }

  if (scope.scopeType === "batch" && scope.year && scope.division) {
    query.year = scope.year;
    query.division = scope.division;
  }

  return query;
};

const createAnnouncement = async (req, res) => {
  try {
    if (!["admin", "hod", "coordinator", "teacher"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only staff can create announcements"
      });
    }

    const { title, message, expiresAt } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required"
      });
    }

    const scope = resolveAnnouncementScope(req.user, req.body);
    if (!scope.ok) {
      return res.status(400).json({
        success: false,
        message: scope.message
      });
    }

    const announcement = await Announcement.create({
      title: String(title).trim(),
      message: String(message).trim(),
      createdBy: req.user._id,
      createdByRole: req.user.role,
      college: scope.college,
      department: scope.department,
      batchKey: scope.batchKey,
      year: scope.year,
      division: scope.division,
      scopeType: scope.scopeType,
      targetRoles: scope.targetRoles,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    const recipients = await User.find(buildRecipientQuery(scope)).select("_id");
    if (recipients.length) {
      const now = new Date();
      await Notification.insertMany(
        recipients.map((recipient) => ({
          userId: recipient._id,
          collegeId: scope.college,
          batchId: scope.batchKey || null,
          type: "GENERAL",
          title: announcement.title,
          message: announcement.message,
          relatedId: announcement._id,
          status: "delivered",
          deliveredAt: now
        }))
      );
    }

    if (scope.batchKey) {
      emitToCollegeRoom(
        String(req.user.college || ""),
        `batch_${scope.batchKey}`,
        "ANNOUNCEMENT_CREATED",
        {
          announcementId: String(announcement._id),
          title: announcement.title,
          message: announcement.message,
          targetRoles: announcement.targetRoles,
          createdAt: announcement.createdAt
        }
      );

      emitToCollegeRoom(
        String(req.user.college || ""),
        `batch_${scope.batchKey}`,
        "notification:new",
        {
          title: announcement.title,
          message: announcement.message,
          createdAt: announcement.createdAt
        }
      );
    }

    await logAudit({
      actor: req.user,
      module: "announcement",
      action: "CREATE",
      entityType: "Announcement",
      entityId: announcement._id,
      metadata: {
        title: announcement.title,
        scopeType: announcement.scopeType,
        batchKey: announcement.batchKey,
        targetRoles: announcement.targetRoles
      }
    });

    triggerWebhookEvent({
      event: "announcement.created",
      collegeId: scope.college,
      payload: {
        event: "announcement.created",
        announcementId: String(announcement._id),
        title: announcement.title,
        message: announcement.message,
        scopeType: announcement.scopeType,
        batchKey: announcement.batchKey,
        departmentId: announcement.department ? String(announcement.department) : "",
        targetRoles: announcement.targetRoles,
        createdBy: String(req.user._id),
        createdByRole: req.user.role,
        createdAt: announcement.createdAt?.toISOString?.() || new Date(announcement.createdAt).toISOString()
      }
    }).catch((webhookError) => {
      console.error("announcement.created webhook error:", webhookError);
    });

    return res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      announcement
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to create announcement"
    });
  }
};

const getAnnouncements = async (req, res) => {
  try {
    const today = new Date();
    const collegeId = req.user.role === "admin" ? req.query.collegeId || req.user.college : req.user.college;
    if (!collegeId) {
      return res.json({ success: true, announcements: [] });
    }
    const ownBatchKey =
      req.user.department && req.user.year && req.user.division
        ? getBatchKey({
            department: req.user.department,
            year: req.user.year,
            division: req.user.division
          })
        : null;

    const announcements = await Announcement.find({
      college: collegeId,
      isActive: true,
      $or: [
        { targetRoles: req.user.role },
        { createdBy: req.user._id }
      ],
      $and: [
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: today } }
          ]
        }
      ]
    })
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 })
      .lean();

    const filteredAnnouncements = announcements.filter((announcement) => {
      if (String(announcement.createdBy?._id || announcement.createdBy || "") === String(req.user._id)) {
        return true;
      }
      if (announcement.scopeType === "college") {
        return !announcement.department || String(announcement.department) === String(req.user.department || "");
      }
      if (announcement.scopeType === "department") {
        return String(announcement.department || "") === String(req.user.department || "");
      }
      if (announcement.scopeType === "batch") {
        return ownBatchKey && String(announcement.batchKey || "") === ownBatchKey;
      }
      return false;
    });

    return res.json({
      success: true,
      announcements: filteredAnnouncements
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch announcements"
    });
  }
};

module.exports = {
  createAnnouncement,
  getAnnouncements
};
