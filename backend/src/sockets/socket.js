const ChatMessage = require("../models/ChatMessage.model");

module.exports = (io) => {
  io.on("connection", (socket) => {

    socket.on("join-room", ({ roomId }) => {
      socket.join(roomId);
    });

    socket.on("chat-message", async ({ roomId, message, sender }) => {

      if (!["teacher", "coordinator"].includes(sender.role)) {
        return; // 🚫 students blocked
      }

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

  });
};
