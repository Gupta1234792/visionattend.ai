const cron = require("node-cron");
const OnlineLecture = require("../models/OnlineLecture.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const College = require("../models/College.model");
const { emitToCollegeRoom } = require("../sockets/gateway");

const ATTENDANCE_LIMIT_MINUTES = Number(process.env.ATTENDANCE_LIMIT_MINUTES) || 30;

const parseBatch = (batchId) => {
  const parts = String(batchId || "").split("_");
  if (parts.length !== 3) return null;
  return { department: parts[0], year: parts[1], division: parts[2] };
};

const getToday = () => new Date().toISOString().split("T")[0];

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const candidates = await OnlineLecture.find({
      status: { $in: ["SCHEDULED", "LIVE"] },
      scheduledAt: { $lte: now },
      autoAttendanceStartedAt: null
    })
      .select("_id subjectId teacherId batchId collegeId scheduledAt durationMinutes status")
      .lean();

    for (const lecture of candidates) {
      const lectureEnd = new Date(new Date(lecture.scheduledAt).getTime() + Number(lecture.durationMinutes || 0) * 60 * 1000);
      if (now > lectureEnd) continue;

      const batch = parseBatch(lecture.batchId);
      if (!batch) continue;

      const classKey = `${lecture.subjectId}_${getToday()}_${lecture.batchId}`;
      const existing = await AttendanceSession.findOne({ classKey }).select("_id").lean();
      if (!existing) {
        const college = await College.findById(lecture.collegeId).select("location").lean();
        const endTime = new Date(Math.min(lectureEnd.getTime(), now.getTime() + ATTENDANCE_LIMIT_MINUTES * 60 * 1000));

        const created = await AttendanceSession.create({
          subject: lecture.subjectId,
          teacher: lecture.teacherId,
          department: batch.department,
          batchKey: lecture.batchId,
          date: getToday(),
          classKey,
          startTime: now,
          endTime,
          location: {
            latitude: Number(college?.location?.latitude || 0),
            longitude: Number(college?.location?.longitude || 0)
          },
          isActive: true
        });

        emitToCollegeRoom(String(lecture.collegeId || ""), `batch_${lecture.batchId}`, "ATTENDANCE_SESSION_STARTED", {
          sessionId: String(created._id),
          subjectId: String(lecture.subjectId),
          batchKey: lecture.batchId,
          endTime: created.endTime
        });
      }

      await OnlineLecture.updateOne(
        { _id: lecture._id, autoAttendanceStartedAt: null },
        {
          $set: {
            autoAttendanceStartedAt: now,
            status: "LIVE",
            startedAt: now
          }
        }
      );
    }
  } catch (error) {
    console.error("lectureAutoSession cron error:", error);
  }
});
