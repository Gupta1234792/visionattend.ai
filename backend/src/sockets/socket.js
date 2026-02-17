const ChatMessage = require("../models/ChatMessage.model");
const User = require("../models/User.model");
const OnlineLecture = require("../models/OnlineLecture.model");
const PTMSchedule = require("../models/PTMSchedule.model");
const { verifyToken } = require("../utils/jwt");

const getTokenFromHandshake = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken && typeof authToken === "string") {
    return authToken.startsWith("Bearer ") ? authToken.slice(7) : authToken;
  }

  const headerToken = socket.handshake?.headers?.authorization;
  if (headerToken && typeof headerToken === "string") {
    return headerToken.startsWith("Bearer ") ? headerToken.slice(7) : headerToken;
  }

  return null;
};

const isStaff = (role) => ["admin", "hod", "teacher", "coordinator"].includes(role);

module.exports = (io) => {
  const collegeNamespace = io.of(/^\/college\/[a-fA-F0-9]{24}$/);

  collegeNamespace.use(async (socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);
      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select(
        "_id name role isActive college department year division"
      );

      if (!user || !user.isActive) {
        return next(new Error("Unauthorized"));
      }

      const namespaceCollegeId = socket.nsp.name.split("/").pop();
      if (user.role !== "admin" && user.college?.toString() !== namespaceCollegeId) {
        return next(new Error("College namespace access denied"));
      }

      socket.user = user;
      socket.collegeId = namespaceCollegeId;
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  collegeNamespace.on("connection", (socket) => {
    socket.on("disconnecting", () => {
      try {
        for (const roomId of socket.rooms) {
          if (roomId === socket.id) continue;
          socket.to(roomId).emit("room-peer-left", {
            roomId,
            socketId: socket.id
          });
        }
      } catch {
        // ignore
      }
    });

    socket.on("join-batch-room", ({ batchId }) => {
      if (!batchId || typeof batchId !== "string") return;
      socket.join(`batch_${batchId}`);
    });

    socket.on("join-lecture-room", ({ lectureId }) => {
      if (!lectureId || typeof lectureId !== "string") return;
      socket.join(`lecture_${lectureId}`);
    });

    socket.on("join-ptm-room", ({ ptmId }) => {
      if (!ptmId || typeof ptmId !== "string") return;
      socket.join(`ptm_${ptmId}`);
    });

    socket.on("join-room", ({ roomId }) => {
      if (!roomId || typeof roomId !== "string") return;
      socket.join(roomId);
      socket.to(roomId).emit("room-peer-joined", {
        roomId,
        socketId: socket.id,
        user: {
          _id: socket.user._id,
          name: socket.user.name,
          role: socket.user.role
        }
      });
    });

    socket.on("webrtc-ready", ({ roomId }) => {
      if (!roomId || typeof roomId !== "string") return;
      socket.to(roomId).emit("webrtc-ready", {
        roomId,
        from: socket.id
      });
    });

    socket.on("webrtc-signal", ({ roomId, to, signal }) => {
      if (!roomId || typeof roomId !== "string") return;
      if (!signal || typeof signal !== "object") return;

      const payload = {
        roomId,
        from: socket.id,
        signal
      };

      if (to && typeof to === "string") {
        collegeNamespace.to(to).emit("webrtc-signal", payload);
        return;
      }

      socket.to(roomId).emit("webrtc-signal", payload);
    });

    socket.on("chat-message", async ({ roomId, message }) => {
      try {
        if (!roomId || typeof roomId !== "string") return;
        if (!message || typeof message !== "string" || !message.trim()) return;
        if (!["teacher", "coordinator"].includes(socket.user.role)) return;

        const saved = await ChatMessage.create({
          roomId,
          sender: socket.user._id,
          senderRole: socket.user.role,
          message: message.trim()
        });

        collegeNamespace.to(roomId).emit("chat-message", {
          roomId,
          message: saved.message,
          sender: {
            _id: socket.user._id,
            name: socket.user.name,
            role: socket.user.role
          },
          time: saved.createdAt
        });
      } catch (err) {
        socket.emit("chat-error", {
          success: false,
          message: "Failed to send message"
        });
      }
    });

    socket.on("lecture-started", async ({ lectureId }) => {
      try {
        if (!isStaff(socket.user.role)) return;
        const lecture = await OnlineLecture.findById(lectureId);
        if (!lecture || lecture.collegeId.toString() !== socket.collegeId) return;

        collegeNamespace.to(`batch_${lecture.batchId}`).emit("LECTURE_STARTED", {
          lectureId: lecture._id,
          batchId: lecture.batchId,
          status: "LIVE",
          startedAt: new Date().toISOString()
        });

        collegeNamespace.to(`lecture_${lecture._id}`).emit("LECTURE_STARTED", {
          lectureId: lecture._id,
          batchId: lecture.batchId,
          status: "LIVE"
        });
      } catch (err) {
        socket.emit("socket-error", { message: "Failed to process lecture-started" });
      }
    });

    socket.on("lecture-ended", async ({ lectureId }) => {
      try {
        if (!isStaff(socket.user.role)) return;
        const lecture = await OnlineLecture.findById(lectureId);
        if (!lecture || lecture.collegeId.toString() !== socket.collegeId) return;

        collegeNamespace.to(`batch_${lecture.batchId}`).emit("LECTURE_ENDED", {
          lectureId: lecture._id,
          batchId: lecture.batchId,
          status: "ENDED",
          endedAt: new Date().toISOString()
        });

        collegeNamespace.to(`lecture_${lecture._id}`).emit("LECTURE_ENDED", {
          lectureId: lecture._id,
          batchId: lecture.batchId,
          status: "ENDED"
        });
      } catch (err) {
        socket.emit("socket-error", { message: "Failed to process lecture-ended" });
      }
    });

    socket.on("ptm-started", async ({ ptmId }) => {
      try {
        if (!isStaff(socket.user.role)) return;
        const ptm = await PTMSchedule.findById(ptmId);
        if (!ptm || ptm.collegeId.toString() !== socket.collegeId) return;

        collegeNamespace.to(`ptm_${ptm._id}`).emit("PTM_STARTED", {
          ptmId: ptm._id,
          status: "LIVE",
          startedAt: new Date().toISOString()
        });
      } catch (err) {
        socket.emit("socket-error", { message: "Failed to process ptm-started" });
      }
    });

    socket.on("ptm-ended", async ({ ptmId }) => {
      try {
        if (!isStaff(socket.user.role)) return;
        const ptm = await PTMSchedule.findById(ptmId);
        if (!ptm || ptm.collegeId.toString() !== socket.collegeId) return;

        collegeNamespace.to(`ptm_${ptm._id}`).emit("PTM_ENDED", {
          ptmId: ptm._id,
          status: "COMPLETED",
          endedAt: new Date().toISOString()
        });
      } catch (err) {
        socket.emit("socket-error", { message: "Failed to process ptm-ended" });
      }
    });
  });
};
