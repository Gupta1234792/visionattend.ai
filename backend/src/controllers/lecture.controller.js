const Lecture = require("../models/Lecture.model");
const Subject = require("../models/Subject.model");
const crypto = require("crypto");

// ================= CREATE LECTURE =================
const createLecture = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can create lectures"
      });
    }

    const { subjectId, title, description, startTime, endTime } = req.body;

    if (!subjectId || !title) {
      return res.status(400).json({
        success: false,
        message: "Subject and title required"
      });
    }

    const subject = await Subject.findById(subjectId);
    if (!subject || subject.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not allowed for this subject"
      });
    }

    const meetingId = crypto.randomUUID();

    const lecture = await Lecture.create({
      teacher: req.user._id,
      subject: subjectId,
      title,
      description,
      meetingId,
      startTime,
      endTime
    });

    return res.status(201).json({
      success: true,
      message: "Lecture created",
      lecture
    });
  } catch (error) {
    console.error("Create lecture error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create lecture"
    });
  }
};

module.exports = { createLecture };
