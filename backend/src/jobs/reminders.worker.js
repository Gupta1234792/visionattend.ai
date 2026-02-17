const { createWorker, isEnabled } = require("./queue");
const sendEmail = require("../utils/sendEmail");

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

    return { ok: true };
  });

  console.log("BullMQ reminder workers started");
};

module.exports = {
  initReminderWorkers
};
