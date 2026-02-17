require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { Server } = require("socket.io");
const { initReminderWorkers } = require("./src/jobs/reminders.worker");

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

connectDB();
require("./src/cron/attendance.cron");
initReminderWorkers();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

require("./src/sockets/socket")(io);

server.listen(PORT, () => {
  console.log(`VisionAttend backend + sockets running on port ${PORT}`);
});
