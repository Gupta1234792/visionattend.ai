const Notification = require("../models/Notification.model");

const myNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user._id,
      collegeId: req.user.college
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, notifications });
  } catch (error) {
    console.error("myNotifications error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      userId: req.user._id,
      collegeId: req.user.college
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    return res.json({ success: true, notification });
  } catch (error) {
    console.error("markNotificationRead error:", error);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
};

module.exports = {
  myNotifications,
  markNotificationRead
};
