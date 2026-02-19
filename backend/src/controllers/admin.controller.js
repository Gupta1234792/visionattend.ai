const User = require("../models/User.model");

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
  listUsers
};

