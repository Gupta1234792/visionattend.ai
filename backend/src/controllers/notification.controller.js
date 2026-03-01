const Notification = require("../models/Notification.model");

const myNotifications = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = {
      userId: req.user._id,
      collegeId: req.user.college
    };

    if (typeof req.query.isRead !== "undefined") {
      query.isRead = String(req.query.isRead) === "true";
    }
    if (req.query.type) {
      query.type = req.query.type;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.from || req.query.to) {
      query.createdAt = {};
      if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
    }

    const [notifications, unread] = await Promise.all([
      Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
      Notification.countDocuments({
        userId: req.user._id,
        collegeId: req.user.college,
        isRead: false
      })
    ]);

    return res.json({
      success: true,
      notifications,
      unread,
      pagination: { page, limit }
    });
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

const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        userId: req.user._id,
        collegeId: req.user.college,
        isRead: false
      },
      {
        $set: { isRead: true, readAt: new Date() }
      }
    );

    return res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error("markAllRead error:", error);
    return res.status(500).json({ success: false, message: "Failed to mark all as read" });
  }
};

const retryFailedNotifications = async (req, res) => {
  try {
    const now = new Date();
    const failed = await Notification.find({
      collegeId: req.user.college,
      status: "failed"
    }).limit(200);

    const operations = failed.map((item) => ({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: { status: "delivered", deliveredAt: now, deliveryError: null },
          $inc: { retryCount: 1 }
        }
      }
    }));

    if (operations.length) {
      await Notification.bulkWrite(operations);
    }

    return res.json({
      success: true,
      retried: operations.length
    });
  } catch (error) {
    console.error("retryFailedNotifications error:", error);
    return res.status(500).json({ success: false, message: "Failed to retry notifications" });
  }
};

module.exports = {
  myNotifications,
  markNotificationRead,
  markAllRead,
  retryFailedNotifications
};
