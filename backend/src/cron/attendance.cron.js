const cron = require("node-cron");
const AttendanceSession = require("../models/AttendanceSession.model");

const DEFAULT_ATTENDANCE_DURATION_MINUTES = 10;

const getEffectiveEndTime = (session) => {
  const startMs = new Date(session.startTime || 0).getTime();
  const storedEndMs = new Date(session.endTime || 0).getTime();
  const durationMinutes = Number.isFinite(Number(session.durationMinutes))
    ? Math.max(1, Math.round(Number(session.durationMinutes)))
    : DEFAULT_ATTENDANCE_DURATION_MINUTES;

  if (!startMs) {
    return new Date(storedEndMs || Date.now());
  }

  const derivedEndMs = startMs + durationMinutes * 60 * 1000;
  if (storedEndMs > 0) {
    return new Date(Math.min(storedEndMs, derivedEndMs));
  }

  return new Date(derivedEndMs);
};

cron.schedule("* * * * *", async () => {
  try {
    const now = Date.now();
    const activeSessions = await AttendanceSession.find({ isActive: true })
      .select("_id startTime endTime durationMinutes")
      .lean();

    const expiredIds = activeSessions
      .filter((session) => getEffectiveEndTime(session).getTime() <= now)
      .map((session) => session._id);

    if (!expiredIds.length) {
      return;
    }

    const result = await AttendanceSession.updateMany(
      { _id: { $in: expiredIds }, isActive: true },
      {
        $set: {
          isActive: false,
          endTime: new Date(now),
        },
      },
    );

    if (result.modifiedCount > 0) {
      console.log(`Auto-closed ${result.modifiedCount} attendance sessions`);
    }
  } catch (err) {
    console.error("Cron error:", err);
  }
});
