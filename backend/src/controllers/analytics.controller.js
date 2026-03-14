const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");

const lowThreshold = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);

const getDateRange = (days) => {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
};

const attendanceOverview = async (req, res) => {
  try {
    const days = Math.max(7, Math.min(365, Number(req.query.days) || 30));
    const { from } = getDateRange(days);
    const collegeId = req.user.college;

    const studentFilter = {
      role: "student",
      isActive: true
    };
    const teacherFilter = {
      role: "teacher",
      isActive: true
    };
    const coordinatorFilter = {
      role: "coordinator",
      isActive: true
    };

    if (collegeId) {
      studentFilter.college = collegeId;
      teacherFilter.college = collegeId;
      coordinatorFilter.college = collegeId;
    }

    const [students, teachers, coordinators] = await Promise.all([
      User.find(studentFilter).select("_id name rollNo department year division").lean(),
      User.find(teacherFilter).select("_id name email department").lean(),
      User.find(coordinatorFilter).select("_id name department year division").lean()
    ]);

    const studentIds = students.map((s) => s._id);
    const teacherIds = teachers.map((t) => t._id);
    const subjectFilter = { isActive: true };
    if (collegeId) {
      const departments = await User.distinct("department", { college: collegeId, department: { $ne: null } });
      subjectFilter.department = { $in: departments };
    }
    const subjects = await Subject.find(subjectFilter).select("_id name code teacher department").lean();
    const subjectIds = subjects.map((s) => s._id);

    const sessionFilter = {
      createdAt: { $gte: from },
      subject: { $in: subjectIds }
    };
    const sessions = await AttendanceSession.find(sessionFilter).select("_id subject batchKey date").lean();
    const sessionIds = sessions.map((s) => s._id);

    const records = sessionIds.length
      ? await AttendanceRecord.find({
          session: { $in: sessionIds },
          student: { $in: studentIds }
        })
          .select("session subject student status markedAt locationFlag location")
          .sort({ markedAt: -1 })
          .lean()
      : [];

    const totalMarks = records.length;
    const presentMarks = records.filter((r) => r.status === "present").length;
    const remoteMarks = records.filter((r) => r.status === "remote").length;
    const absentMarks = records.filter((r) => r.status === "absent").length;

    const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
    const studentMap = new Map(students.map((s) => [String(s._id), s]));
    const teacherSubjectMap = new Map();
    subjects.forEach((subject) => {
      const key = String(subject.teacher || "");
      if (!teacherSubjectMap.has(key)) teacherSubjectMap.set(key, []);
      teacherSubjectMap.get(key).push(subject._id);
    });

    const subjectTrendMap = new Map();
    records.forEach((record) => {
      const key = String(record.subject);
      if (!subjectTrendMap.has(key)) {
        subjectTrendMap.set(key, { total: 0, present: 0, remote: 0, absent: 0 });
      }
      const row = subjectTrendMap.get(key);
      row.total += 1;
      if (record.status === "present") row.present += 1;
      if (record.status === "remote") row.remote += 1;
      if (record.status === "absent") row.absent += 1;
    });

    const subjectTrends = Array.from(subjectTrendMap.entries())
      .map(([subjectId, row]) => {
        const subject = subjectById.get(subjectId);
        const attendanceRate = row.total ? Number((((row.present + row.remote) / row.total) * 100).toFixed(2)) : 0;
        return {
          subjectId,
          subjectName: subject?.name || "-",
          subjectCode: subject?.code || "-",
          total: row.total,
          present: row.present,
          remote: row.remote,
          absent: row.absent,
          attendanceRate
        };
      })
      .sort((a, b) => b.attendanceRate - a.attendanceRate);

    const teacherTrends = teachers.map((teacher) => {
      const assignedSubjectIds = (teacherSubjectMap.get(String(teacher._id)) || []).map((id) => String(id));
      const rows = records.filter((r) => assignedSubjectIds.includes(String(r.subject)));
      const total = rows.length;
      const present = rows.filter((r) => r.status === "present").length;
      const remote = rows.filter((r) => r.status === "remote").length;
      const attendanceRate = total ? Number((((present + remote) / total) * 100).toFixed(2)) : 0;
      return {
        teacherId: teacher._id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        total,
        attendanceRate
      };
    });

    const divisionMap = new Map();
    records.forEach((record) => {
      const student = studentMap.get(String(record.student));
      if (!student) return;
      const key = `${student.department}_${student.year}_${student.division}`;
      if (!divisionMap.has(key)) {
        divisionMap.set(key, { total: 0, present: 0, remote: 0, absent: 0 });
      }
      const row = divisionMap.get(key);
      row.total += 1;
      if (record.status === "present") row.present += 1;
      if (record.status === "remote") row.remote += 1;
      if (record.status === "absent") row.absent += 1;
    });

    const divisionTrends = Array.from(divisionMap.entries()).map(([divisionKey, row]) => ({
      divisionKey,
      total: row.total,
      present: row.present,
      remote: row.remote,
      absent: row.absent,
      attendanceRate: row.total ? Number((((row.present + row.remote) / row.total) * 100).toFixed(2)) : 0
    }));

    const studentStatMap = new Map();
    records.forEach((record) => {
      const key = String(record.student);
      if (!studentStatMap.has(key)) studentStatMap.set(key, { total: 0, attended: 0 });
      const row = studentStatMap.get(key);
      row.total += 1;
      if (record.status === "present" || record.status === "remote") row.attended += 1;
    });

    const atRiskStudents = students
      .map((student) => {
        const stats = studentStatMap.get(String(student._id)) || { total: 0, attended: 0 };
        const attendanceRate = stats.total ? Number(((stats.attended / stats.total) * 100).toFixed(2)) : 0;
        return {
          studentId: student._id,
          attendanceRate,
          total: stats.total,
          attended: stats.attended,
          department: student.department,
          year: student.year,
          division: student.division
        };
      })
      .filter((s) => s.total > 0 && s.attendanceRate < lowThreshold)
      .sort((a, b) => a.attendanceRate - b.attendanceRate)
      .slice(0, 50);

    const coordinatorMetrics = coordinators.map((coordinator) => {
      const key = `${coordinator.department}_${coordinator.year}_${coordinator.division}`;
      const divisionStats = divisionMap.get(key) || { total: 0, present: 0, remote: 0, absent: 0 };
      const attendanceRate = divisionStats.total
        ? Number((((divisionStats.present + divisionStats.remote) / divisionStats.total) * 100).toFixed(2))
        : 0;
      const variance = divisionStats.total
        ? Number((((divisionStats.absent / divisionStats.total) * 100)).toFixed(2))
        : 0;
      return {
        coordinatorId: coordinator._id,
        name: coordinator.name,
        department: coordinator.department,
        year: coordinator.year,
        division: coordinator.division,
        attendanceRate,
        absenceVariancePercent: variance
      };
    });

    const geoActivity = records
      .filter(
        (record) =>
          Number.isFinite(Number(record.location?.latitude)) &&
          Number.isFinite(Number(record.location?.longitude))
      )
      .slice(0, 300)
      .map((record) => {
        const student = studentMap.get(String(record.student));
        const subject = subjectById.get(String(record.subject));
        return {
          id: String(record._id),
          latitude: Number(record.location.latitude),
          longitude: Number(record.location.longitude),
          flag: record.locationFlag || "green",
          label: `${student?.name || "Student"}${student?.rollNo ? ` (${student.rollNo})` : ""}`,
          meta: `${subject?.name || "-"} | ${student?.year || "-"}-${student?.division || "-"} | ${record.status || "-"}`
        };
      });

    return res.json({
      success: true,
      metrics: {
        days,
        totalMarks,
        presentMarks,
        remoteMarks,
        absentMarks,
        overallAttendanceRate: totalMarks ? Number((((presentMarks + remoteMarks) / totalMarks) * 100).toFixed(2)) : 0
      },
      trends: {
        subjects: subjectTrends,
        teachers: teacherTrends,
        divisions: divisionTrends
      },
      alerts: {
        lowAttendanceThreshold: lowThreshold,
        atRiskStudents
      },
      coordinatorMetrics,
      geoActivity
    });
  } catch (error) {
    console.error("attendanceOverview error:", error);
    return res.status(500).json({ success: false, message: "Failed to load attendance analytics" });
  }
};

module.exports = {
  attendanceOverview
};
