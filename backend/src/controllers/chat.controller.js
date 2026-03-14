const ChatMessage = require("../models/ChatMessage.model");
const User = require("../models/User.model");
const { logAudit } = require("../utils/audit");
const { emitToUserRoom } = require("../sockets/gateway");

const ALLOWED_RECEIVER_ROLES = {
  admin: ["hod", "coordinator", "teacher", "student", "parent"],
  hod: ["admin", "teacher", "coordinator", "student"],
  coordinator: ["hod", "teacher", "student"],
  teacher: ["hod", "coordinator", "student"]
};

const buildDirectRoomId = (firstId, secondId) =>
  `direct_${[String(firstId), String(secondId)].sort().join("_")}`;

const canSendMessage = (senderRole, receiverRole) =>
  (ALLOWED_RECEIVER_ROLES[senderRole] || []).includes(receiverRole);

const canAccessUser = (sender, receiver) => {
  if (!receiver || !receiver.isActive) return false;

  if (sender.role === "admin") {
    return !sender.college || String(sender.college) === String(receiver.college || "");
  }

  if (String(sender.college || "") !== String(receiver.college || "")) {
    return false;
  }

  if (receiver.role === "admin") {
    return sender.role === "hod";
  }

  return String(sender.department || "") === String(receiver.department || "");
};

const buildContactsQuery = (user, roleFilter) => {
  const allowedRoles = ALLOWED_RECEIVER_ROLES[user.role] || [];
  if (!allowedRoles.length) {
    return null;
  }

  const query = {
    role: { $in: roleFilter ? allowedRoles.filter((role) => role === roleFilter) : allowedRoles },
    isActive: true,
    _id: { $ne: user._id }
  };

  if (user.college) {
    query.college = user.college;
  }

  if (user.role !== "admin") {
    query.$or = [
      { role: "admin" },
      { department: user.department }
    ];
  }

  return query;
};

const getChatContacts = async (req, res) => {
  try {
    const roleFilter = String(req.query.role || "").trim().toLowerCase();
    const query = buildContactsQuery(req.user, roleFilter || "");

    if (!query || !query.role.$in.length) {
      return res.json({ success: true, users: [] });
    }

    const users = await User.find(query)
      .select("name email role department year division")
      .sort({ role: 1, name: 1 })
      .lean();

    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch chat contacts"
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message, messageType = "text" } = req.body;

    if (!receiverId || !message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "receiverId and message are required"
      });
    }

    const receiver = await User.findById(receiverId).select(
      "_id name email role isActive college department"
    );
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found"
      });
    }

    if (!canSendMessage(req.user.role, receiver.role)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to message this role"
      });
    }

    if (!canAccessUser(req.user, receiver)) {
      return res.status(403).json({
        success: false,
        message: "Access denied for this conversation"
      });
    }

    const roomId = buildDirectRoomId(req.user._id, receiver._id);
    const chatMessage = await ChatMessage.create({
      roomId,
      sender: req.user._id,
      senderRole: req.user.role,
      receiver: receiver._id,
      message: String(message).trim(),
      messageType,
      delivered: true
    });

    const payload = {
      _id: String(chatMessage._id),
      roomId,
      sender: {
        _id: String(req.user._id),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      senderRole: req.user.role,
      receiver: {
        _id: String(receiver._id),
        name: receiver.name,
        email: receiver.email,
        role: receiver.role
      },
      message: chatMessage.message,
      seen: chatMessage.seen,
      delivered: chatMessage.delivered,
      messageType: chatMessage.messageType,
      createdAt: chatMessage.createdAt
    };

    emitToUserRoom(String(req.user.college || ""), req.user._id, "direct-message", payload);
    emitToUserRoom(String(req.user.college || ""), receiver._id, "direct-message", payload);

    await logAudit({
      actor: req.user,
      module: "chat",
      action: "SEND_MESSAGE",
      entityType: "ChatMessage",
      entityId: chatMessage._id,
      metadata: {
        receiverId: String(receiver._id),
        roomId
      }
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      chatMessage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to send message"
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { withUserId, roomId } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    let query = null;

    if (withUserId) {
      const otherUser = await User.findById(withUserId).select(
        "_id role isActive college department"
      );
      if (!otherUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      if (!canSendMessage(req.user.role, otherUser.role) || !canAccessUser(req.user, otherUser)) {
        return res.status(403).json({
          success: false,
          message: "Access denied for this conversation"
        });
      }

      query = { roomId: buildDirectRoomId(req.user._id, otherUser._id) };
    } else if (roomId) {
      query = { roomId: String(roomId) };
    } else {
      return res.status(400).json({
        success: false,
        message: "withUserId or roomId is required"
      });
    }

    const [messages, total] = await Promise.all([
      ChatMessage.find(query)
        .populate("sender", "name email role")
        .populate("receiver", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ChatMessage.countDocuments(query)
    ]);

    return res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages"
    });
  }
};

const getRoomMessages = async (req, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "roomId is required"
      });
    }

    const messages = await ChatMessage.find({ roomId })
      .populate("sender", "name email role")
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      messages
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch room messages"
    });
  }
};

const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    if (!message.receiver || message.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only mark your own messages as read"
      });
    }

    message.seen = true;
    await message.save();

    emitToUserRoom(
      String(req.user.college || ""),
      message.sender,
      "direct-message-read",
      {
        messageId: String(message._id),
        roomId: message.roomId,
        readerId: String(req.user._id),
        seen: true
      }
    );

    await logAudit({
      actor: req.user,
      module: "chat",
      action: "MARK_READ",
      entityType: "ChatMessage",
      entityId: message._id,
      metadata: { messageId }
    });

    return res.json({
      success: true,
      message: "Message marked as read"
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark message as read"
    });
  }
};

const sendSystemMessage = async (req, res) => {
  try {
    if ((!req.user || req.user.role !== "admin") && !req.headers["x-system-auth"]) {
      return res.status(403).json({
        success: false,
        message: "Only system can send system messages"
      });
    }

    const { message, batchKey } = req.body;

    if (!message || !batchKey) {
      return res.status(400).json({
        success: false,
        message: "Message and batchKey are required for system messages"
      });
    }

    const systemMessage = await ChatMessage.create({
      roomId: `room_${batchKey}`,
      sender: null,
      senderRole: "system",
      receiver: null,
      message,
      messageType: "system",
      delivered: true
    });

    return res.status(201).json({
      success: true,
      message: "System message sent successfully",
      systemMessage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to send system message"
    });
  }
};

module.exports = {
  getChatContacts,
  sendMessage,
  getMessages,
  getRoomMessages,
  markMessageAsRead,
  sendSystemMessage
};
