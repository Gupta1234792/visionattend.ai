const { buildAttendanceInsightsForStudent } = require("./attendanceInsights");

const getStudentAnalytics = async (req, res) => {
  try {
    const payload = await buildAttendanceInsightsForStudent(req.user);

    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    console.error("getStudentAnalytics error:", error);
    return res.status(500).json({ success: false, message: "Failed to load student analytics" });
  }
};

module.exports = {
  getStudentAnalytics
};
