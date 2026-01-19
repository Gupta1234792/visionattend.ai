const ChatMessage = require("../models/ChatMessage.model");

// 🔹 GET CHAT HISTORY
const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;

    const messages = await ChatMessage.find({ roomId })
      .populate("sender", "name role")
      .sort({ createdAt: 1 });

    return res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load chat history"
    });
  }
};

module.exports = { getChatHistory };
