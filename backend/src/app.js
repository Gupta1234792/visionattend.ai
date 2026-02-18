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
const parentRoutes = require("./routes/parent.routes");
const assistantRoutes = require("./routes/assistant.routes");

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/hods", hodRoutes);
app.use("/api/coordinators", coordinatorRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/student-invite", studentInviteRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/classroom", classroomRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/ptm", ptmRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/assistant", assistantRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "VisionAttend backend running"
  });
});

module.exports = app;
