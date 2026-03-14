const cron = require("node-cron");
const AttendanceSession = require("../models/AttendanceSession.model");

const ATTENDANCE_LIMIT_MINUTES = 10;

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const fallbackCutoff = new Date(now.getTime() - ATTENDANCE_LIMIT_MINUTES * 60 * 1000);

    const result = await AttendanceSession.updateMany(
      {
        isActive: true,
        $or: [
          { endTime: { $lte: now } },
          { endTime: null, startTime: { $lte: fallbackCutoff } },
          { endTime: { $exists: false }, startTime: { $lte: fallbackCutoff } }
        ]
      },
      {
        $set: {
          isActive: false,
          endTime: now
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Auto-closed ${result.modifiedCount} attendance sessions`);
    }
  } catch (err) {
    console.error("Cron error:", err);
  }
});
