const User = require("../models/User.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const AttendanceRecord = require("../models/AttendanceRecord.model");

exports.getClassroomData = async (req, res) => {
  const { batchKey } = req.params;

  const teachers = await User.find({
    role: "teacher",
    department: req.user.department,
    year: req.user.year,
    division: req.user.division
  }).select("name email");

  const sessions = await AttendanceSession.find({ batchKey });

  const attendance = await AttendanceRecord.find({
    session: { $in: sessions.map(s => s._id) }
  }).populate("student", "name rollNo");

  res.json({
    success: true,
    teachers,
    sessions,
    attendance
  });
};
