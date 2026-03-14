const BatchHoliday = require("../models/BatchHoliday.model");
const OnlineLecture = require("../models/OnlineLecture.model");
const Notification = require("../models/Notification.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");
const { triggerWebhookEvent } = require("../utils/webhooks");

const parseBatch = (batchId) => {
  const parts = String(batchId || "").split("_");
  if (parts.length !== 3) return null;
  return { department: parts[0], year: parts[1], division: parts[2] };
};

const createHoliday = async (req, res) => {
  try {
    const { batchId, reason, fromDate, toDate } = req.body;
    if (!batchId || !reason || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "batchId, reason, fromDate and toDate are required"
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ success: false, message: "Invalid holiday date range" });
    }

    const batch = parseBatch(batchId);
    if (!batch) {
      return res.status(400).json({ success: false, message: "Invalid batchId format" });
    }

    if (req.user.role === "coordinator") {
      const ownBatchId = `${req.user.department}_${req.user.year}_${req.user.division}`;
      if (ownBatchId !== batchId) {
        return res.status(403).json({ success: false, message: "Coordinator can manage only assigned classroom batch" });
      }
    }

    const holiday = await BatchHoliday.create({
      collegeId: req.user.college,
      batchId,
      reason: String(reason).trim(),
      fromDate: start,
      toDate: end,
      createdBy: req.user._id
    });

    const canceled = await OnlineLecture.updateMany(
      {
        collegeId: req.user.college,
        batchId,
        status: "SCHEDULED",
        scheduledAt: { $gte: start, $lte: end }
      },
      {
        $set: {
          status: "CANCELED",
          cancelReason: String(reason).trim(),
          canceledByHolidayId: holiday._id
        }
      }
    );

    const students = await User.find({
      role: "student",
      college: req.user.college,
      department: batch.department,
      year: batch.year,
      division: batch.division,
      isActive: true
    }).select("_id");

    if (students.length) {
      await Notification.insertMany(
        students.map((student) => ({
          userId: student._id,
          collegeId: req.user.college,
          batchId,
          type: "HOLIDAY_NOTICE",
          title: "Class Holiday Notice",
          message: `Holiday announced from ${start.toDateString()} to ${end.toDateString()}. Reason: ${reason}`,
          status: "delivered",
          scheduledFor: new Date()
        }))
      );
    }

    await logAudit({
      actor: req.user,
      module: "holiday",
      action: "CREATE",
      entityType: "BatchHoliday",
      entityId: holiday._id,
      metadata: { batchId, canceledLectures: canceled.modifiedCount || 0 }
    });

    triggerWebhookEvent({
      event: "holiday.created",
      collegeId: req.user.college,
      payload: {
        event: "holiday.created",
        holidayId: String(holiday._id),
        batchId,
        reason: holiday.reason,
        fromDate: holiday.fromDate?.toISOString?.() || new Date(holiday.fromDate).toISOString(),
        toDate: holiday.toDate?.toISOString?.() || new Date(holiday.toDate).toISOString(),
        canceledLectures: canceled.modifiedCount || 0,
        createdBy: String(req.user._id)
      }
    }).catch((webhookError) => {
      console.error("holiday.created webhook error:", webhookError);
    });

    return res.status(201).json({
      success: true,
      message: "Holiday created and scheduled lectures canceled",
      holiday,
      canceledLectures: canceled.modifiedCount || 0
    });
  } catch (error) {
    console.error("createHoliday error:", error);
    return res.status(500).json({ success: false, message: "Failed to create holiday" });
  }
};

const listBatchHolidays = async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    if (req.user.role === "student" || req.user.role === "parent") {
      const ownBatchId = `${req.user.department}_${req.user.year}_${req.user.division}`;
      if (ownBatchId !== batchId) {
        return res.status(403).json({ success: false, message: "Access denied for this batch" });
      }
    }

    const holidays = await BatchHoliday.find({
      collegeId: req.user.college,
      batchId,
      isActive: true
    })
      .sort({ fromDate: 1 })
      .lean();

    return res.json({ success: true, holidays });
  } catch (error) {
    console.error("listBatchHolidays error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch holidays" });
  }
};

module.exports = {
  createHoliday,
  listBatchHolidays
};
