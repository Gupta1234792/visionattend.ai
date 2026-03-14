const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const collegeRoutes = require("./routes/college.routes");
const departmentRoutes = require("./routes/department.routes");
const hodRoutes = require("./routes/hod.routes");
const coordinatorRoutes = require("./routes/coordinator.routes");
const teacherRoutes = require("./routes/teacher.routes");
const studentRoutes = require("./routes/student.routes");
const studentInviteRoutes = require("./routes/studentInvite.routes");
const subjectRoutes = require("./routes/subject.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const reportRoutes = require("./routes/report.routes");
const chatRoutes = require("./routes/chat.routes");
const classroomRoutes = require("./routes/classroom.routes");
const lectureRoutes = require("./routes/lecture.routes");
const ptmRoutes = require("./routes/ptm.routes");
const eventRoutes = require("./routes/event.routes");
const notificationRoutes = require("./routes/notification.routes");
const holidayRoutes = require("./routes/holiday.routes");
const parentRoutes = require("./routes/parent.routes");
const assistantRoutes = require("./routes/assistant.routes");
const adminRoutes = require("./routes/admin.routes");
const announcementRoutes = require("./routes/announcement.routes");
const timetableRoutes = require("./routes/timetable.routes");
const webhookRoutes = require("./routes/webhook.routes");
const { authRateLimit, inviteRateLimit, attendanceRateLimit } = require("./middlewares/rateLimit.middleware");
const { checkOpenCvHealth } = require("./startup/opencv");

const app = express();
const FRONTEND_URLS = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const PRIVATE_DEV_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/
];
const isAllowedOrigin = (origin) =>
  FRONTEND_URLS.includes(origin) || PRIVATE_DEV_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRateLimit, authRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/hods", hodRoutes);
app.use("/api/coordinators", coordinatorRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/student-invite", inviteRateLimit, studentInviteRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/attendance", attendanceRateLimit, attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/classroom", classroomRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/ptm", ptmRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/timetables", timetableRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/webhooks", webhookRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "VisionAttend backend running"
  });
});


app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Vision Attend Backend is live"
  });
});

app.get("/health/opencv", async (req, res) => {
  const report = await checkOpenCvHealth();
  return res.status(report.ok ? 200 : 503).json({
    success: report.ok,
    ...report
  });
});

module.exports = app;
