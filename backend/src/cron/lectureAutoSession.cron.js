const cron = require("node-cron");
const OnlineLecture = require("../models/OnlineLecture.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const College = require("../models/College.model");
const { emitToCollegeRoom } = require("../sockets/gateway");

const ATTENDANCE_LIMIT_MINUTES = 10;
const LECTURE_MAX_DURATION_HOURS = 2; // Auto timeout after 2 hours
const buildClassKey = ({ date, batchKey }) => `${date}_${batchKey}`;

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

      const classKey = buildClassKey({ date: getToday(), batchKey: lecture.batchId });
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
          endTime: created.endTime,
          teacherName: "",
          teacherEmail: ""
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

    // Auto timeout lectures that exceed maximum duration
    const liveLectures = await OnlineLecture.find({
      status: "LIVE",
      startedAt: { $exists: true, $ne: null }
    })
      .select("_id batchId collegeId startedAt")
      .lean();

    for (const lecture of liveLectures) {
      const startedAt = new Date(lecture.startedAt);
      const maxEndTime = new Date(startedAt.getTime() + LECTURE_MAX_DURATION_HOURS * 60 * 60 * 1000);
      
      if (now > maxEndTime) {
        await OnlineLecture.updateOne(
          { _id: lecture._id, status: "LIVE" },
          {
            $set: {
              status: "ENDED",
              endedAt: now
            }
          }
        );

        emitToCollegeRoom(
          String(lecture.collegeId || ""),
          `batch_${lecture.batchId}`,
          "live_class_ended",
          {
            lectureId: String(lecture._id),
            batchId: lecture.batchId,
            endedAt: now.toISOString()
          }
        );
      }
    }
  } catch (error) {
    console.error("lectureAutoSession cron error:", error);
  }
});
