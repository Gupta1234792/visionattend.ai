const User = require("../models/User.model");
const AuditLog = require("../models/AuditLog.model");
const { runMonthlyArchive, runRetentionCleanup } = require("../cron/retention.cron");

const listUsers = async (req, res) => {
  try {
    const { collegeId, departmentId, year, division } = req.query;

    const baseQuery = { isActive: true };
    if (collegeId) baseQuery.college = collegeId;
    if (departmentId) baseQuery.department = departmentId;
    if (year) baseQuery.year = year;
    if (division) baseQuery.division = division;

    const users = await User.find({
      ...baseQuery,
      role: { $in: ["hod", "teacher", "student"] }
    })
      .select("name email role rollNo year division college department createdAt")
      .populate("college", "name code")
      .populate("department", "name code")
      .sort({ role: 1, name: 1 })
      .lean();

    const hods = users.filter((u) => u.role === "hod");
    const teachers = users.filter((u) => u.role === "teacher");
    const students = users.filter((u) => u.role === "student");

    const groupedStudents = {};
    students.forEach((student) => {
      const departmentCode = student.department?.code || "NA";
      const key = `${departmentCode}_${student.year || "NA"}_${student.division || "NA"}`;
      if (!groupedStudents[key]) groupedStudents[key] = [];
      groupedStudents[key].push(student);
    });

    return res.json({
      success: true,
      hods,
      teachers,
      students,
      groupedStudents
    });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users"
    });
  }
};

module.exports = {
  listUsers,
  getAuditTrail,
  runArchiveNow
};

async function getAuditTrail(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.user.college) query.collegeId = req.user.college;
    if (req.query.module) query.module = req.query.module;
    if (req.query.action) query.action = req.query.action;

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actorId", "name email role")
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    console.error("getAuditTrail error:", error);
    return res.status(500).json({ success: false, message: "Failed to load audit trail" });
  }
}

async function runArchiveNow(req, res) {
  try {
    await runMonthlyArchive();
    await runRetentionCleanup();
    return res.json({ success: true, message: "Archive/retention job executed" });
  } catch (error) {
    console.error("runArchiveNow error:", error);
    return res.status(500).json({ success: false, message: "Failed to run archive job" });
  }
}
