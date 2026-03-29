require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const mongoose = require("mongoose");
const { connectDB } = require("./src/config/db");
const { Server } = require("socket.io");
const { initReminderWorkers } = require("./src/jobs/reminders.worker");
const { checkOpenCvHealth } = require("./src/startup/opencv");
const { ensureDemoUsers } = require("./src/startup/demoUsers");
const { loadFaceCache } = require("./src/utils/faceCache");
const AttendanceSession = require("./src/models/AttendanceSession.model");
const AttendanceRecord = require("./src/models/AttendanceRecord.model");

const PORT = process.env.PORT || 5000;
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

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Socket CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST"]
  }
});

require("./src/sockets/socket")(io);

const startServer = async () => {
  try {
    await connectDB();
    await ensureDemoUsers();
    await loadFaceCache();
    await AttendanceSession.collection.createIndex({ createdAt: 1, subject: 1 }).catch(() => null);
    await AttendanceRecord.collection.createIndex({ session: 1, student: 1 }).catch(() => null);
    await AttendanceSession.collection.createIndex({ batchKey: 1, startTime: 1 }).catch(() => null);
    await AttendanceRecord.collection.createIndex({ student: 1, session: 1 }).catch(() => null);
    require("./src/cron/attendance.cron");
    require("./src/cron/retention.cron");
    require("./src/cron/lectureAutoSession.cron");
    initReminderWorkers();

    server.listen(PORT, async () => {
      console.log(`VisionAttend backend + sockets running on port ${PORT}`);
      const opencvHealth = await checkOpenCvHealth();
      if (!opencvHealth.ok) {
        console.warn("OpenCV health check failed. Face verification may be unavailable.");
      }
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message || error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.log(`[server] received ${signal}, shutting down`);

  server.close(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      console.log("[server] shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error(`[server] shutdown error: ${error.message || error}`);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  console.error("[server] unhandled rejection:", error);
});
process.on("uncaughtException", (error) => {
  console.error("[server] uncaught exception:", error);
  void shutdown("uncaughtException");
});

void startServer();
