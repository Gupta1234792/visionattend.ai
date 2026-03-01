const { createWorker, isEnabled } = require("./queue");
const sendEmail = require("../utils/sendEmail");
const Notification = require("../models/Notification.model");

const initReminderWorkers = () => {
  if (!isEnabled) {
    console.log("BullMQ disabled: reminder workers not started");
    return;
  }

  createWorker("reminders", async (job) => {
    if (job.name === "send-email-reminder") {
      const { to, subject, html } = job.data;
      await sendEmail({ to, subject, html });
    }

    if (job.name === "generate-report") {
      // Reserved for async report generation pipeline.
      return { ok: true };
    }

    if (job.name === "deliver-notification") {
      const { notificationId } = job.data || {};
      if (!notificationId) return { ok: false };

      const notification = await Notification.findById(notificationId);
      if (!notification) return { ok: false };

      notification.status = "delivered";
      notification.deliveredAt = new Date();
      notification.deliveryError = null;
      await notification.save();
      return { ok: true };
    }

    return { ok: true };
  });

  console.log("BullMQ reminder workers started");

  setInterval(async () => {
    try {
      const now = new Date();
      const pending = await Notification.find({
        status: "scheduled",
        scheduledFor: { $lte: now }
      }).limit(200);

      if (!pending.length) return;

      const updates = pending.map((item) => ({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: { status: "delivered", deliveredAt: now, deliveryError: null }
          }
        }
      }));
      await Notification.bulkWrite(updates);
    } catch (error) {
      console.error("Scheduled notification delivery sweep failed:", error);
    }
  }, 60 * 1000);
};

module.exports = {
  initReminderWorkers
};
