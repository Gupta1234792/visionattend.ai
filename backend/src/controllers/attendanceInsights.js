const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const getBatchKey = require("../utils/batchKey");

const LOW_ATTENDANCE_THRESHOLD = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);
const YEAR_RANGE_DAYS = 365;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const dateKey = (value) => new Date(value).toISOString().split("T")[0];

async function buildAttendanceInsightsForStudent(student) {
  if (!student?.department || !student?.year || !student?.division) {
    return {
      overallAttendance: 0,
      totalLectures: 0,
      present: 0,
      absent: 0,
      totalClassesAttended: 0,
      totalClassesMissed: 0,
      streak: 0,
      classesToday: 0,
      monthlyAttendance: [],
      subjectStats: [],
      weeklyDistribution: [],
      attendanceBreakdown: [],
      heatmapData: [],
      prediction: null,
      lowAttendanceAlert: null
    };
  }

  const batchKey = getBatchKey({
    department: student.department,
    year: student.year,
    division: student.division
  });

  const today = new Date();
  const todayKey = dateKey(today);
  const fromDate = startOfDay(new Date(today.getTime() - YEAR_RANGE_DAYS * 24 * 60 * 60 * 1000));

  const sessions = await AttendanceSession.find({
    batchKey,
    isActive: { $in: [true, false] },
    startTime: { $gte: fromDate }
  })
    .populate("subject", "name code")
    .sort({ date: 1, startTime: 1 })
    .lean();

  const sessionIds = sessions.map((session) => session._id);
  const records = sessionIds.length
    ? await AttendanceRecord.find({
        student: student._id,
        session: { $in: sessionIds }
      })
        .select("session subject status markedAt")
        .lean()
    : [];

  const recordBySession = new Map(records.map((record) => [String(record.session), record]));
  const totalLectures = sessions.length;

  let present = 0;
  let absent = 0;
  let remote = 0;
  let classesToday = 0;

  const monthlyMap = new Map();
  const subjectMap = new Map();
  const weekdayMap = new Map(WEEKDAY_LABELS.map((label) => [label, { present: 0, absent: 0, remote: 0, total: 0 }]));
  const dailyMap = new Map();

  sessions.forEach((session) => {
    const sessionDate = new Date(session.startTime || `${session.date}T00:00:00.000Z`);
    const sessionDateKey = session.date || dateKey(sessionDate);
    const record = recordBySession.get(String(session._id));
    const status = String(record?.status || "absent").toLowerCase();
    const attended = status === "present" || status === "remote";
    const monthKey = `${sessionDate.getUTCFullYear()}-${String(sessionDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const weekdayIndex = (sessionDate.getUTCDay() + 6) % 7;
    const weekdayLabel = WEEKDAY_LABELS[weekdayIndex];
    const subjectId = String(session.subject?._id || session.subject || "unknown");
    const subjectName = session.subject?.name || "General";
    const subjectCode = session.subject?.code || "";

    if (status === "present") present += 1;
    if (status === "remote") remote += 1;
    if (status === "absent") absent += 1;
    if (sessionDateKey === todayKey) classesToday += 1;

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        monthKey,
        label: `${MONTH_LABELS[sessionDate.getUTCMonth()]} ${sessionDate.getUTCFullYear()}`,
        present: 0,
        absent: 0,
        remote: 0,
        total: 0
      });
    }
    const monthRow = monthlyMap.get(monthKey);
    monthRow.total += 1;
    if (status === "present") monthRow.present += 1;
    if (status === "remote") monthRow.remote += 1;
    if (status === "absent") monthRow.absent += 1;

    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subjectId,
        subject: subjectName,
        subjectCode,
        present: 0,
        absent: 0,
        remote: 0,
        total: 0
      });
    }
    const subjectRow = subjectMap.get(subjectId);
    subjectRow.total += 1;
    if (status === "present") subjectRow.present += 1;
    if (status === "remote") subjectRow.remote += 1;
    if (status === "absent") subjectRow.absent += 1;

    const weekdayRow = weekdayMap.get(weekdayLabel);
    weekdayRow.total += 1;
    if (status === "present") weekdayRow.present += 1;
    if (status === "remote") weekdayRow.remote += 1;
    if (status === "absent") weekdayRow.absent += 1;

    if (!dailyMap.has(sessionDateKey)) {
      dailyMap.set(sessionDateKey, {
        date: sessionDateKey,
        subjects: [],
        total: 0,
        attended: 0,
        remote: 0
      });
    }
    const dayRow = dailyMap.get(sessionDateKey);
    dayRow.total += 1;
    if (attended) dayRow.attended += 1;
    if (status === "remote") dayRow.remote += 1;
    dayRow.subjects.push(`${subjectName}${subjectCode ? ` (${subjectCode})` : ""}: ${status}`);
  });

  const totalClassesAttended = present + remote;
  const totalClassesMissed = absent;
  const overallAttendance = totalLectures ? Number(((totalClassesAttended / totalLectures) * 100).toFixed(2)) : 0;

  const sortedDates = Array.from(dailyMap.keys()).sort((first, second) => new Date(second).getTime() - new Date(first).getTime());
  let streak = 0;
  for (const key of sortedDates) {
    const row = dailyMap.get(key);
    if (!row || row.total === 0 || row.attended === 0) break;
    streak += 1;
  }

  const monthlyAttendance = Array.from(monthlyMap.values())
    .sort((first, second) => first.monthKey.localeCompare(second.monthKey))
    .map((row) => ({
      month: row.label,
      percentage: row.total ? Number((((row.present + row.remote) / row.total) * 100).toFixed(2)) : 0,
      present: row.present + row.remote,
      absent: row.absent,
      total: row.total
    }));

  const subjectStats = Array.from(subjectMap.values())
    .map((row) => ({
      ...row,
      attendancePercentage: row.total ? Number((((row.present + row.remote) / row.total) * 100).toFixed(2)) : 0
    }))
    .sort((first, second) => second.attendancePercentage - first.attendancePercentage);

  const weeklyDistribution = WEEKDAY_LABELS.map((label) => {
    const row = weekdayMap.get(label);
    return {
      day: label,
      present: row.present + row.remote,
      absent: row.absent,
      total: row.total,
      percentage: row.total ? Number((((row.present + row.remote) / row.total) * 100).toFixed(2)) : 0
    };
  });

  const attendanceBreakdown = [
    { name: "Present", value: totalClassesAttended },
    { name: "Absent", value: totalClassesMissed }
  ];

  const heatmapData = [];
  for (let index = YEAR_RANGE_DAYS; index >= 0; index -= 1) {
    const day = new Date(today.getTime() - index * 24 * 60 * 60 * 1000);
    const key = dateKey(day);
    const row = dailyMap.get(key);

    if (!row) {
      heatmapData.push({
        date: key,
        count: 0,
        status: "no-class",
        subject: "No class",
        tooltip: `${key}: No class`
      });
      continue;
    }

    let status = "absent";
    if (row.attended === row.total && row.remote === 0) status = "present";
    else if (row.attended === row.total && row.remote > 0) status = "late";
    else if (row.attended > 0 && row.attended < row.total) status = "late";

    heatmapData.push({
      date: key,
      count: row.attended || row.total,
      status,
      subject: row.subjects.join(", "),
      tooltip: `${key}: ${row.subjects.join(" | ")}`
    });
  }

  const ifAttendNext5 = totalLectures + 5 ? Number((((totalClassesAttended + 5) / (totalLectures + 5)) * 100).toFixed(2)) : overallAttendance;
  const ifMissNext2 = totalLectures + 2 ? Number(((totalClassesAttended / (totalLectures + 2)) * 100).toFixed(2)) : overallAttendance;
  const classesNeededFor75 = overallAttendance >= LOW_ATTENDANCE_THRESHOLD
    ? 0
    : Math.max(
        0,
        Math.ceil((LOW_ATTENDANCE_THRESHOLD * totalLectures - 100 * totalClassesAttended) / (100 - LOW_ATTENDANCE_THRESHOLD))
      );

  const prediction = {
    threshold: LOW_ATTENDANCE_THRESHOLD,
    ifAttendNext5,
    ifMissNext2,
    classesNeededFor75,
    primaryMessage:
      classesNeededFor75 > 0
        ? `If this student attends the next ${classesNeededFor75} classes, attendance can recover to ${LOW_ATTENDANCE_THRESHOLD}%.`
        : `If this student attends the next 5 classes, attendance can improve to ${ifAttendNext5}%.`,
    riskMessage:
      ifMissNext2 < LOW_ATTENDANCE_THRESHOLD
        ? `If this student misses 2 more lectures, attendance may drop to ${ifMissNext2}%.`
        : `This student remains above ${LOW_ATTENDANCE_THRESHOLD}% even if 2 more lectures are missed.`
  };

  const lowAttendanceAlert = overallAttendance < LOW_ATTENDANCE_THRESHOLD
    ? {
        active: true,
        threshold: LOW_ATTENDANCE_THRESHOLD,
        classesNeeded: classesNeededFor75,
        message: `Attendance is below ${LOW_ATTENDANCE_THRESHOLD}%. ${classesNeededFor75} more attended classes are needed for recovery.`
      }
    : null;

  return {
    overallAttendance,
    totalLectures,
    present: totalClassesAttended,
    absent: totalClassesMissed,
    totalClassesAttended,
    totalClassesMissed,
    streak,
    classesToday,
    monthlyAttendance,
    subjectStats,
    weeklyDistribution,
    attendanceBreakdown,
    heatmapData,
    prediction,
    lowAttendanceAlert
  };
}

module.exports = {
  buildAttendanceInsightsForStudent
};
