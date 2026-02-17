const crypto = require("crypto");
const PTMSchedule = require("../models/PTMSchedule.model");
const Event = require("../models/Event.model");
const Notification = require("../models/Notification.model");
const Parent = require("../models/Parent.model");
const User = require("../models/User.model");
const sendEmail = require("../utils/sendEmail");

const VIDEO_ROOM_BASE_URL = process.env.VIDEO_ROOM_BASE_URL || "https://visionattend.local/room";

const buildMeeting = () => {
  const meetingRoomId = crypto.randomUUID();
  const meetingLink = `${VIDEO_ROOM_BASE_URL}/${meetingRoomId}`;
  return { meetingRoomId, meetingLink };
};

const schedulePTM = async (req, res) => {
  try {
    const { studentId, parentId, batchId, scheduledAt, durationMinutes, notes } = req.body;

    if (!studentId || !batchId || !scheduledAt || !durationMinutes) {
      return res.status(400).json({
        success: false,
        message: "studentId, batchId, scheduledAt and durationMinutes are required"
      });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (student.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    let resolvedParentId = parentId || null;
    if (!resolvedParentId) {
      const parentLink = await Parent.findOne({ studentId: student._id, collegeId: req.user.college });
      if (parentLink) {
        resolvedParentId = parentLink.userId;
      }
    }

    const { meetingRoomId, meetingLink } = buildMeeting();

    const ptm = await PTMSchedule.create({
      teacherId: req.user._id,
      studentId: student._id,
      parentId: resolvedParentId,
      batchId,
      collegeId: req.user.college,
      scheduledAt: new Date(scheduledAt),
      durationMinutes: Number(durationMinutes),
      meetingRoomId,
      meetingLink,
      notes: notes || "",
      createdBy: req.user._id
    });

    await Event.create({
      title: `PTM - ${student.name}`,
      type: "PTM",
      relatedId: ptm._id,
      scheduledAt: ptm.scheduledAt,
      collegeId: req.user.college,
      batchId,
      createdBy: req.user._id
    });

    const notifications = [
      {
        userId: student._id,
        collegeId: req.user.college,
        batchId,
        type: "PTM_SCHEDULED",
        title: "PTM Scheduled",
        message: `Your PTM is scheduled at ${ptm.scheduledAt.toISOString()}`,
        relatedId: ptm._id
      }
    ];

    if (resolvedParentId) {
      notifications.push({
        userId: resolvedParentId,
        collegeId: req.user.college,
        batchId,
        type: "PARENT_NOTIFICATION",
        title: "PTM Scheduled",
        message: `PTM scheduled for ${student.name} at ${ptm.scheduledAt.toISOString()}`,
        relatedId: ptm._id
      });
    }

    await Notification.insertMany(notifications);

    if (student.parentEmail) {
      await sendEmail({
        to: student.parentEmail,
        subject: "VisionAttend PTM Scheduled",
        html: `<p>PTM scheduled for ${student.name} on ${ptm.scheduledAt.toISOString()}.</p><p>Meeting Link: ${meetingLink}</p>`
      });
    }

    return res.status(201).json({ success: true, ptm });
  } catch (error) {
    console.error("schedulePTM error:", error);
    return res.status(500).json({ success: false, message: "Failed to schedule PTM" });
  }
};

const listMyPTMs = async (req, res) => {
  try {
    const query = { collegeId: req.user.college };

    if (["teacher", "coordinator"].includes(req.user.role)) {
      query.teacherId = req.user._id;
    } else if (req.user.role === "student") {
      query.studentId = req.user._id;
    } else if (req.user.role === "parent") {
      query.parentId = req.user._id;
    }

    const ptms = await PTMSchedule.find(query)
      .sort({ scheduledAt: -1 })
      .populate("teacherId", "name email")
      .populate("studentId", "name rollNo")
      .populate("parentId", "name email")
      .lean();

    return res.json({ success: true, ptms });
  } catch (error) {
    console.error("listMyPTMs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch PTMs" });
  }
};

const confirmPTM = async (req, res) => {
  try {
    const ptm = await PTMSchedule.findById(req.params.ptmId);
    if (!ptm) {
      return res.status(404).json({ success: false, message: "PTM not found" });
    }

    if (ptm.collegeId.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    if (req.user.role === "parent" && ptm.parentId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    ptm.parentConfirmed = true;
    await ptm.save();

    return res.json({ success: true, ptm });
  } catch (error) {
    console.error("confirmPTM error:", error);
    return res.status(500).json({ success: false, message: "Failed to confirm PTM" });
  }
};

const updatePTMStatus = async (req, res, status) => {
  try {
    const ptm = await PTMSchedule.findById(req.params.ptmId);
    if (!ptm) {
      return res.status(404).json({ success: false, message: "PTM not found" });
    }

    if (ptm.collegeId.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    if (["teacher", "coordinator"].includes(req.user.role) && ptm.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    ptm.status = status;
    if (status === "LIVE") ptm.startedAt = new Date();
    if (status === "COMPLETED" || status === "CANCELLED") ptm.endedAt = new Date();
    if (status === "CANCELLED") {
      const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
      if (reason) {
        const nextNotes = ptm.notes ? `${ptm.notes}\n\nCancel reason: ${reason}` : `Cancel reason: ${reason}`;
        ptm.notes = nextNotes;
      }
    }
    await ptm.save();

    return res.json({ success: true, ptm });
  } catch (error) {
    console.error("updatePTMStatus error:", error);
    return res.status(500).json({ success: false, message: "Failed to update PTM" });
  }
};

const startPTM = async (req, res) => updatePTMStatus(req, res, "LIVE");
const completePTM = async (req, res) => updatePTMStatus(req, res, "COMPLETED");
const cancelPTM = async (req, res) => updatePTMStatus(req, res, "CANCELLED");

const addPTMNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    if (typeof notes !== "string") {
      return res.status(400).json({ success: false, message: "notes must be a string" });
    }

    const ptm = await PTMSchedule.findById(req.params.ptmId);
    if (!ptm) {
      return res.status(404).json({ success: false, message: "PTM not found" });
    }

    if (["teacher", "coordinator"].includes(req.user.role) && ptm.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    ptm.notes = notes;
    await ptm.save();

    return res.json({ success: true, ptm });
  } catch (error) {
    console.error("addPTMNotes error:", error);
    return res.status(500).json({ success: false, message: "Failed to update PTM notes" });
  }
};

module.exports = {
  schedulePTM,
  listMyPTMs,
  confirmPTM,
  startPTM,
  completePTM,
  cancelPTM,
  addPTMNotes
};
