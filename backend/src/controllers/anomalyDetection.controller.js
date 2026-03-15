const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const User = require("../models/User.model");
const Subject = require("../models/Subject.model");
const { logAudit } = require("../utils/audit");

// AI-powered attendance anomaly detection
const detectAttendanceAnomalies = async (req, res) => {
  try {
    const { batchId, startDate, endDate, studentId, subjectId } = req.query;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (startDate || endDate) {
      query.markedAt = {};
      if (startDate) query.markedAt.$gte = new Date(startDate);
      if (endDate) query.markedAt.$lte = new Date(endDate);
    }

    if (studentId) {
      query.student = studentId;
    }

    if (subjectId) {
      query.subject = subjectId;
    }

    const records = await AttendanceRecord.find(query)
      .populate("student", "name rollNo email")
      .populate("subject", "name code")
      .populate("session", "teacher subject date startTime endTime")
      .sort({ markedAt: -1 });

    if (records.length === 0) {
      return res.json({
        success: true,
        anomalies: [],
        message: "No attendance records found for analysis"
      });
    }

    const anomalies = [];
    const studentPatterns = new Map();
    const subjectPatterns = new Map();

    // Analyze patterns and detect anomalies
    for (const record of records) {
      const studentId = record.student._id.toString();
      const subjectId = record.subject._id.toString();
      const date = new Date(record.markedAt).toDateString();
      const hour = new Date(record.markedAt).getHours();

      // Initialize student patterns
      if (!studentPatterns.has(studentId)) {
        studentPatterns.set(studentId, {
          student: record.student,
          totalMarks: 0,
          presentMarks: 0,
          remoteMarks: 0,
          absentMarks: 0,
          lateMarks: 0,
          earlyMarks: 0,
          unusualLocations: [],
          unusualTimes: [],
          dateCounts: new Map(),
          hourCounts: new Map(),
          locationPatterns: new Map()
        });
      }

      const studentPattern = studentPatterns.get(studentId);
      studentPattern.totalMarks++;

      // Count status
      if (record.status === "present") studentPattern.presentMarks++;
      else if (record.status === "remote") studentPattern.remoteMarks++;
      else if (record.status === "absent") studentPattern.absentMarks++;

      // Track date and time patterns
      studentPattern.dateCounts.set(date, (studentPattern.dateCounts.get(date) || 0) + 1);
      studentPattern.hourCounts.set(hour, (studentPattern.hourCounts.get(hour) || 0) + 1);

      // Check for late/early marking
      if (record.session) {
        const sessionStart = new Date(record.session.startTime);
        const sessionEnd = new Date(record.session.endTime);
        const markTime = new Date(record.markedAt);

        if (markTime > new Date(sessionStart.getTime() + 30 * 60 * 1000)) {
          studentPattern.lateMarks++;
          studentPattern.unusualTimes.push({
            type: "late",
            time: record.markedAt,
            sessionStart: record.session.startTime
          });
        }

        if (markTime < new Date(sessionStart.getTime() - 10 * 60 * 1000)) {
          studentPattern.earlyMarks++;
          studentPattern.unusualTimes.push({
            type: "early",
            time: record.markedAt,
            sessionStart: record.session.startTime
          });
        }
      }

      // Check for unusual locations
      if (record.locationFlag === "red" || record.locationFlag === "yellow") {
        studentPattern.unusualLocations.push({
          flag: record.locationFlag,
          distance: record.distanceMeters,
          markedAt: record.markedAt
        });
      }

      // Initialize subject patterns
      if (!subjectPatterns.has(subjectId)) {
        subjectPatterns.set(subjectId, {
          subject: record.subject,
          totalMarks: 0,
          presentRate: 0,
          remoteRate: 0,
          absentRate: 0,
          avgDistance: 0,
          students: new Set(),
          timePatterns: new Map()
        });
      }

      const subjectPattern = subjectPatterns.get(subjectId);
      subjectPattern.totalMarks++;
      subjectPattern.students.add(studentId);

      const hourKey = `${new Date(record.markedAt).getHours()}:00`;
      subjectPattern.timePatterns.set(hourKey, (subjectPattern.timePatterns.get(hourKey) || 0) + 1);
    }

    // Detect anomalies based on patterns
    for (const [studentId, pattern] of studentPatterns) {
      const total = pattern.totalMarks;
      const presentRate = total > 0 ? pattern.presentMarks / total : 0;
      const remoteRate = total > 0 ? pattern.remoteMarks / total : 0;
      const absentRate = total > 0 ? pattern.absentMarks / total : 0;
      const lateRate = total > 0 ? pattern.lateMarks / total : 0;
      const earlyRate = total > 0 ? pattern.earlyMarks / total : 0;

      // Anomaly 1: High absenteeism
      if (absentRate > 0.3) {
        anomalies.push({
          type: "high_absenteeism",
          severity: "high",
          student: pattern.student,
          description: `High absenteeism detected: ${Math.round(absentRate * 100)}% absent rate`,
          details: {
            totalMarks: total,
            presentMarks: pattern.presentMarks,
            remoteMarks: pattern.remoteMarks,
            absentMarks: pattern.absentMarks,
            absentRate: absentRate
          }
        });
      }

      // Anomaly 2: Frequent late marking
      if (lateRate > 0.2) {
        anomalies.push({
          type: "frequent_late",
          severity: "medium",
          student: pattern.student,
          description: `Frequent late marking detected: ${Math.round(lateRate * 100)}% late rate`,
          details: {
            lateMarks: pattern.lateMarks,
            totalMarks: total,
            lateRate: lateRate,
            unusualTimes: pattern.unusualTimes.slice(0, 5)
          }
        });
      }

      // Anomaly 3: Unusual location patterns
      if (pattern.unusualLocations.length > total * 0.3) {
        anomalies.push({
          type: "unusual_location",
          severity: "medium",
          student: pattern.student,
          description: `Frequent unusual location marking: ${pattern.unusualLocations.length} instances`,
          details: {
            unusualLocations: pattern.unusualLocations.slice(0, 5),
            totalMarks: total
          }
        });
      }

      // Anomaly 4: Inconsistent marking times
      const timeVariations = Array.from(pattern.hourCounts.values());
      const avgTimeMarks = timeVariations.reduce((a, b) => a + b, 0) / timeVariations.length;
      const timeStdDev = Math.sqrt(
        timeVariations.reduce((acc, val) => acc + Math.pow(val - avgTimeMarks, 2), 0) / timeVariations.length
      );

      if (timeStdDev > avgTimeMarks * 0.8) {
        anomalies.push({
          type: "inconsistent_timing",
          severity: "low",
          student: pattern.student,
          description: "Inconsistent marking timing pattern detected",
          details: {
            timeVariations: Object.fromEntries(pattern.hourCounts),
            avgTimeMarks,
            timeStdDev
          }
        });
      }

      // Anomaly 5: Sudden behavior change
      const recentRecords = records.filter(r => 
        r.student._id.toString() === studentId && 
        new Date(r.markedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      if (recentRecords.length >= 5) {
        const recentAbsentRate = recentRecords.filter(r => r.status === "absent").length / recentRecords.length;
        const historicalAbsentRate = absentRate;

        if (Math.abs(recentAbsentRate - historicalAbsentRate) > 0.4) {
          anomalies.push({
            type: "sudden_behavior_change",
            severity: "high",
            student: pattern.student,
            description: "Sudden change in attendance behavior detected",
            details: {
              recentAbsentRate,
              historicalAbsentRate,
              change: Math.abs(recentAbsentRate - historicalAbsentRate)
            }
          });
        }
      }
    }

    // Subject-level anomalies
    for (const [subjectId, pattern] of subjectPatterns) {
      const total = pattern.totalMarks;
      const presentRate = total > 0 ? pattern.presentMarks / total : 0;
      const remoteRate = total > 0 ? pattern.remoteMarks / total : 0;
      const absentRate = total > 0 ? pattern.absentMarks / total : 0;

      // Anomaly: Low attendance rate for subject
      if (presentRate < 0.5) {
        anomalies.push({
          type: "low_subject_attendance",
          severity: "medium",
          subject: pattern.subject,
          description: `Low attendance rate for subject: ${Math.round(presentRate * 100)}%`,
          details: {
            presentRate,
            remoteRate,
            absentRate,
            totalMarks: total,
            studentCount: pattern.students.size
          }
        });
      }

      // Anomaly: High remote attendance rate
      if (remoteRate > 0.4) {
        anomalies.push({
          type: "high_remote_attendance",
          severity: "medium",
          subject: pattern.subject,
          description: `High remote attendance rate: ${Math.round(remoteRate * 100)}%`,
          details: {
            remoteRate,
            presentRate,
            absentRate,
            totalMarks: total
          }
        });
      }
    }

    // Sort anomalies by severity and count
    anomalies.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    await logAudit({
      actor: req.user,
      module: "anomaly_detection",
      action: "DETECT",
      entityType: "AttendanceRecord",
      entityId: null,
      metadata: { 
        batchId, 
        analyzedRecords: records.length, 
        detectedAnomalies: anomalies.length,
        dateRange: { startDate, endDate }
      }
    });

    return res.json({
      success: true,
      anomalies,
      summary: {
        totalRecords: records.length,
        totalAnomalies: anomalies.length,
        highSeverity: anomalies.filter(a => a.severity === "high").length,
        mediumSeverity: anomalies.filter(a => a.severity === "medium").length,
        lowSeverity: anomalies.filter(a => a.severity === "low").length
      }
    });

  } catch (error) {
    console.error("detectAttendanceAnomalies error:", error);
    return res.status(500).json({ success: false, message: "Failed to detect anomalies" });
  }
};

// Get anomaly trends over time
const getAnomalyTrends = async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.query;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const records = await AttendanceRecord.find({
      collegeId: req.user.college,
      batchId,
      markedAt: { $gte: start, $lte: end }
    }).populate("student", "name rollNo");

    if (records.length === 0) {
      return res.json({
        success: true,
        trends: [],
        message: "No data available for trend analysis"
      });
    }

    // Group by date and calculate daily metrics
    const dailyStats = new Map();
    const weeklyStats = new Map();

    for (const record of records) {
      const date = new Date(record.markedAt);
      const dateKey = date.toDateString();
      const weekKey = `${date.getFullYear()}-W${Math.ceil((date - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;

      // Daily stats
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, {
          date: dateKey,
          total: 0,
          present: 0,
          remote: 0,
          absent: 0,
          late: 0,
          unusualLocations: 0
        });
      }

      const daily = dailyStats.get(dateKey);
      daily.total++;
      if (record.status === "present") daily.present++;
      else if (record.status === "remote") daily.remote++;
      else if (record.status === "absent") daily.absent++;

      if (record.locationFlag === "red" || record.locationFlag === "yellow") {
        daily.unusualLocations++;
      }

      // Check for late marking
      if (record.session) {
        const sessionStart = new Date(record.session.startTime);
        const markTime = new Date(record.markedAt);
        if (markTime > new Date(sessionStart.getTime() + 30 * 60 * 1000)) {
          daily.late++;
        }
      }

      // Weekly stats
      if (!weeklyStats.has(weekKey)) {
        weeklyStats.set(weekKey, {
          week: weekKey,
          total: 0,
          present: 0,
          remote: 0,
          absent: 0,
          late: 0,
          unusualLocations: 0
        });
      }

      const weekly = weeklyStats.get(weekKey);
      weekly.total++;
      if (record.status === "present") weekly.present++;
      else if (record.status === "remote") weekly.remote++;
      else if (record.status === "absent") weekly.absent++;

      if (record.locationFlag === "red" || record.locationFlag === "yellow") {
        weekly.unusualLocations++;
      }

      if (record.session) {
        const sessionStart = new Date(record.session.startTime);
        const markTime = new Date(record.markedAt);
        if (markTime > new Date(sessionStart.getTime() + 30 * 60 * 1000)) {
          weekly.late++;
        }
      }
    }

    // Calculate trends and anomalies
    const trends = [];
    const dailyArray = Array.from(dailyStats.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    const weeklyArray = Array.from(weeklyStats.values()).sort((a, b) => a.week.localeCompare(b.week));

    // Daily trends
    for (let i = 1; i < dailyArray.length; i++) {
      const prev = dailyArray[i - 1];
      const curr = dailyArray[i];

      const presentChange = curr.present - prev.present;
      const absentChange = curr.absent - prev.absent;
      const lateChange = curr.late - prev.late;

      if (absentChange > prev.absent * 0.5 || lateChange > prev.late * 0.5) {
        trends.push({
          type: "daily_anomaly",
          date: curr.date,
          description: "Significant increase in absenteeism or late marking detected",
          details: {
            previous: prev,
            current: curr,
            changes: {
              presentChange,
              absentChange,
              lateChange
            }
          }
        });
      }
    }

    // Weekly trends
    for (let i = 1; i < weeklyArray.length; i++) {
      const prev = weeklyArray[i - 1];
      const curr = weeklyArray[i];

      const presentRatePrev = prev.total > 0 ? prev.present / prev.total : 0;
      const presentRateCurr = curr.total > 0 ? curr.present / curr.total : 0;
      const absentRatePrev = prev.total > 0 ? prev.absent / prev.total : 0;
      const absentRateCurr = curr.total > 0 ? curr.absent / curr.total : 0;

      if (Math.abs(presentRateCurr - presentRatePrev) > 0.2 || Math.abs(absentRateCurr - absentRatePrev) > 0.2) {
        trends.push({
          type: "weekly_trend",
          week: curr.week,
          description: "Significant weekly attendance pattern change detected",
          details: {
            previous: prev,
            current: curr,
            rateChanges: {
              presentRateChange: presentRateCurr - presentRatePrev,
              absentRateChange: absentRateCurr - absentRatePrev
            }
          }
        });
      }
    }

    return res.json({
      success: true,
      trends,
      summary: {
        analyzedDays: dailyArray.length,
        analyzedWeeks: weeklyArray.length,
        totalTrends: trends.length
      }
    });

  } catch (error) {
    console.error("getAnomalyTrends error:", error);
    return res.status(500).json({ success: false, message: "Failed to analyze trends" });
  }
};

// Generate anomaly report
const generateAnomalyReport = async (req, res) => {
  try {
    const { batchId, startDate, endDate, format = "json" } = req.query;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    const anomalies = await detectAttendanceAnomaliesRaw({
      batchId,
      startDate,
      endDate,
      collegeId: req.user.college
    });

    const report = {
      batchId,
      collegeId: req.user.college,
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate },
      summary: {
        totalAnomalies: anomalies.length,
        highSeverity: anomalies.filter(a => a.severity === "high").length,
        mediumSeverity: anomalies.filter(a => a.severity === "medium").length,
        lowSeverity: anomalies.filter(a => a.severity === "low").length,
        anomalyTypes: [...new Set(anomalies.map(a => a.type))]
      },
      anomalies: anomalies,
      recommendations: generateRecommendations(anomalies)
    };

    if (format === "csv") {
      const csv = convertToCSV(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="anomaly_report_${batchId}_${Date.now()}.csv"`);
      return res.send(csv);
    }

    return res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error("generateAnomalyReport error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate report" });
  }
};

// Helper function to get raw anomalies without HTTP response
async function detectAttendanceAnomaliesRaw({ batchId, startDate, endDate, collegeId }) {
  const query = {
    collegeId,
    batchId
  };

  if (startDate || endDate) {
    query.markedAt = {};
    if (startDate) query.markedAt.$gte = new Date(startDate);
    if (endDate) query.markedAt.$lte = new Date(endDate);
  }

  const records = await AttendanceRecord.find(query)
    .populate("student", "name rollNo email")
    .populate("subject", "name code");

  const anomalies = [];
  const studentPatterns = new Map();

  for (const record of records) {
    const studentId = record.student._id.toString();
    const date = new Date(record.markedAt).toDateString();
    const hour = new Date(record.markedAt).getHours();

    if (!studentPatterns.has(studentId)) {
      studentPatterns.set(studentId, {
        student: record.student,
        totalMarks: 0,
        presentMarks: 0,
        remoteMarks: 0,
        absentMarks: 0,
        lateMarks: 0,
        unusualLocations: [],
        dateCounts: new Map(),
        hourCounts: new Map()
      });
    }

    const studentPattern = studentPatterns.get(studentId);
    studentPattern.totalMarks++;

    if (record.status === "present") studentPattern.presentMarks++;
    else if (record.status === "remote") studentPattern.remoteMarks++;
    else if (record.status === "absent") studentPattern.absentMarks++;

    studentPattern.dateCounts.set(date, (studentPattern.dateCounts.get(date) || 0) + 1);
    studentPattern.hourCounts.set(hour, (studentPattern.hourCounts.get(hour) || 0) + 1);

    if (record.locationFlag === "red" || record.locationFlag === "yellow") {
      studentPattern.unusualLocations.push({
        flag: record.locationFlag,
        distance: record.distanceMeters,
        markedAt: record.markedAt
      });
    }
  }

  for (const [studentId, pattern] of studentPatterns) {
    const total = pattern.totalMarks;
    const absentRate = total > 0 ? pattern.absentMarks / total : 0;
    const lateRate = total > 0 ? pattern.lateMarks / total : 0;

    if (absentRate > 0.3) {
      anomalies.push({
        type: "high_absenteeism",
        severity: "high",
        student: pattern.student,
        description: `High absenteeism detected: ${Math.round(absentRate * 100)}% absent rate`,
        details: { absentRate, totalMarks: total }
      });
    }

    if (lateRate > 0.2) {
      anomalies.push({
        type: "frequent_late",
        severity: "medium",
        student: pattern.student,
        description: `Frequent late marking detected: ${Math.round(lateRate * 100)}% late rate`,
        details: { lateRate, totalMarks: total }
      });
    }

    if (pattern.unusualLocations.length > total * 0.3) {
      anomalies.push({
        type: "unusual_location",
        severity: "medium",
        student: pattern.student,
        description: `Frequent unusual location marking: ${pattern.unusualLocations.length} instances`,
        details: { unusualLocations: pattern.unusualLocations.length, totalMarks: total }
      });
    }
  }

  return anomalies;
}

// Generate recommendations based on anomalies
function generateRecommendations(anomalies) {
  const recommendations = [];
  const anomalyTypes = anomalies.map(a => a.type);

  if (anomalyTypes.includes("high_absenteeism")) {
    recommendations.push({
      priority: "high",
      category: "attendance",
      action: "Contact students with high absenteeism for counseling",
      description: "Reach out to students with >30% absenteeism rate for support and intervention"
    });
  }

  if (anomalyTypes.includes("frequent_late")) {
    recommendations.push({
      priority: "medium",
      category: "timing",
      action: "Review session start times and student schedules",
      description: "Consider adjusting session timings if many students are consistently late"
    });
  }

  if (anomalyTypes.includes("unusual_location")) {
    recommendations.push({
      priority: "medium",
      category: "location",
      action: "Verify location settings and student circumstances",
      description: "Check if students are marking from unusual locations due to valid reasons"
    });
  }

  if (anomalyTypes.includes("sudden_behavior_change")) {
    recommendations.push({
      priority: "high",
      category: "behavior",
      action: "Investigate sudden changes in student behavior",
      description: "Follow up with students showing sudden attendance pattern changes"
    });
  }

  return recommendations;
}

// Convert report to CSV format
function convertToCSV(report) {
  const headers = ["Type", "Severity", "Student", "Description", "Details"];
  const rows = report.anomalies.map(anomaly => [
    anomaly.type,
    anomaly.severity,
    `${anomaly.student?.name || ""} (${anomaly.student?.rollNo || ""})`,
    anomaly.description,
    JSON.stringify(anomaly.details || {})
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

module.exports = {
  detectAttendanceAnomalies,
  getAnomalyTrends,
  generateAnomalyReport
};