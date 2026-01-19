const ChatMessage = require("../models/ChatMessage.model");

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🔌 User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
      socket.join(roomId);
      socket.to(roomId).emit("user-joined", user);
    });

    // 💬 CHAT (PERSISTED)
    socket.on("chat-message", async ({ roomId, message, sender }) => {
      const saved = await ChatMessage.create({
        roomId,
        sender: sender._id,
        senderRole: sender.role,
        message
      });

      io.to(roomId).emit("chat-message", {
        message: saved.message,
        sender,
        time: saved.createdAt
      });
    });

    // WebRTC signaling (unchanged)
    socket.on("webrtc-offer", ({ roomId, offer }) => {
      socket.to(roomId).emit("webrtc-offer", {
        offer,
        senderId: socket.id
      });
    });

    socket.on("webrtc-answer", ({ targetId, answer }) => {
      socket.to(targetId).emit("webrtc-answer", {
        answer,
        senderId: socket.id
      });
    });

    socket.on("webrtc-ice-candidate", ({ targetId, candidate }) => {
      socket.to(targetId).emit("webrtc-ice-candidate", {
        candidate,
        senderId: socket.id
      });
    });

    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
    });
  });
};
