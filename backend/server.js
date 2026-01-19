require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");

// 🔌 Socket
const { Server } = require("socket.io");

const PORT = process.env.PORT || 5000;

// connect database
connectDB();
require("./src/cron/attendance.cron");


// create HTTP server
const server = http.createServer(app);

// attach socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // later restrict to frontend URL
    methods: ["GET", "POST"]
  }
});

// load socket handlers
require("./src/sockets/socket")(io);

// start server
server.listen(PORT, () => {
  console.log(`🚀 VisionAttend backend + sockets running on port ${PORT}`);
});
