const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// ================= ROUTE IMPORTS =================
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
// ================= APP INIT =================
const app = express();

// ================= MIDDLEWARES =================
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ================= API ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/hods", hodRoutes);
app.use("/api/coordinators", coordinatorRoutes);

app.use("/api/teachers", teacherRoutes);

app.use("/api/student-invite", studentInviteRoutes); // coordinator → invite
app.use("/api/students", studentRoutes);             // student register / me

app.use("/api/subjects", subjectRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chat", chatRoutes);
// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "VisionAttend backend running"
  });
});

module.exports = app;
