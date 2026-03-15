require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { Server } = require("socket.io");
const { initReminderWorkers } = require("./src/jobs/reminders.worker");
const { checkOpenCvHealth } = require("./src/startup/opencv");

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

connectDB();
require("./src/cron/attendance.cron");
require("./src/cron/retention.cron");
require("./src/cron/lectureAutoSession.cron");
initReminderWorkers();

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

server.listen(PORT, async () => {
  console.log(`VisionAttend backend + sockets running on port ${PORT}`);
  const opencvHealth = await checkOpenCvHealth();
  if (!opencvHealth.ok) {
    console.warn("OpenCV health check failed. Face verification may be unavailable.");
  }
});
