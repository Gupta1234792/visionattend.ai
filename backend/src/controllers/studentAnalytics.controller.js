const { buildAttendanceInsightsForStudent } = require("./attendanceInsights");

const getStudentAnalytics = async (req, res) => {
  try {
    // Security check: Only students can access their own analytics
    if (!req.user.role || req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Unauthorized access to student analytics" });
    }

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
