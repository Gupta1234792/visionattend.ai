const Event = require("../models/Event.model");

const createEvent = async (req, res) => {
  try {
    const { title, type, relatedId, scheduledAt, batchId } = req.body;

    if (!title || !type || !scheduledAt) {
      return res.status(400).json({
        success: false,
        message: "title, type and scheduledAt are required"
      });
    }

    const event = await Event.create({
      title,
      type,
      relatedId: relatedId || null,
      scheduledAt: new Date(scheduledAt),
      collegeId: req.user.college,
      batchId: batchId || null,
      createdBy: req.user._id
    });

    return res.status(201).json({ success: true, event });
  } catch (error) {
    console.error("createEvent error:", error);
    return res.status(500).json({ success: false, message: "Failed to create event" });
  }
};

const listEvents = async (req, res) => {
  try {
    const { batchId, from, to, type } = req.query;
    const query = { collegeId: req.user.college };

    if (batchId) query.batchId = batchId;
    if (type) query.type = type;
    if (from || to) {
      query.scheduledAt = {};
      if (from) query.scheduledAt.$gte = new Date(from);
      if (to) query.scheduledAt.$lte = new Date(to);
    }

    const events = await Event.find(query).sort({ scheduledAt: 1 }).lean();
    return res.json({ success: true, events });
  } catch (error) {
    console.error("listEvents error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch events" });
  }
};

module.exports = {
  createEvent,
  listEvents
};
