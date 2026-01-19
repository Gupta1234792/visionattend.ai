/* cron/attendance.cron.js
 */

const cron = require("node-cron");
const AttendanceSession = require("../models/AttendanceSession.model");

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const result = await AttendanceSession.updateMany(
      {
        endTime: { $lt: now },
        isActive: true
      },
      { isActive: false }
    );

    if (result.modifiedCount > 0) {
      console.log(`⏱️ Auto-closed ${result.modifiedCount} attendance sessions`);
    }
  } catch (err) {
    console.error("Cron error:", err);
  }
});
