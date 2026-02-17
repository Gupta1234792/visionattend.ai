const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const Subject = require("../models/Subject.model");

const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

const canAccessSubject = async (user, subjectId) => {
  const subject = await Subject.findById(subjectId).populate("department", "college");

  if (!subject || !subject.department) {
    return { ok: false, status: 404, message: "Subject not found" };
  }

  if (user.role === "admin") {
    return { ok: true, subject };
  }

  if (user.college && subject.department.college?.toString() !== user.college.toString()) {
    return { ok: false, status: 403, message: "Cross-college access denied" };
  }

  if (user.role === "teacher") {
    if (subject.teacher.toString() !== user._id.toString()) {
      return { ok: false, status: 403, message: "You are not assigned to this subject" };
    }
    return { ok: true, subject };
  }

  if (["hod", "coordinator"].includes(user.role)) {
    if (subject.department._id.toString() !== user.department?.toString()) {
      return { ok: false, status: 403, message: "Access denied for this department" };
    }
    return { ok: true, subject };
  }

  return { ok: false, status: 403, message: "Access denied" };
};

exports.teacherReport = async (req, res) => {
  try {
    const sessions = await AttendanceSession.find({
      teacher: req.user._id,
      isActive: { $in: [true, false] }
    }).select("_id");

    const sessionIds = sessions.map((s) => s._id);

    const report = await AttendanceRecord.aggregate([
      {
        $match: { session: { $in: sessionIds } }
      },
      {
        $group: {
          _id: {
            subject: "$subject",
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$markedAt"
              }
            }
          },
          present: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          remote: {
            $sum: {
              $cond: [{ $eq: ["$status", "remote"] }, 1, 0]
            }
          },
          total: { $sum: 1 }
        }
      }
    ]);

    return res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error("Teacher report error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate teacher report"
    });
  }
};

exports.studentPercentage = async (req, res) => {
  try {
    const attendance = await AttendanceRecord.aggregate([
      {
        $match: { student: req.user._id }
      },
      {
        $group: {
          _id: "$subject",
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          subject: "$_id",
          percentage: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$present", "$total"] },
                  100
                ]
              },
              2
            ]
          }
        }
      }
    ]);

    return res.json({
      success: true,
      attendance
    });
  } catch (error) {
    console.error("Student percentage error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to calculate attendance percentage"
    });
  }
};

exports.studentDailyReport = async (req, res) => {
  try {
    if (!req.user.department || !req.user.year || !req.user.division) {
      return res.status(200).json({ success: true, records: [] });
    }

    const batchKey = `${req.user.department}_${req.user.year}_${req.user.division}`;
    const sessions = await AttendanceSession.find({
      batchKey,
      isActive: { $in: [true, false] }
    })
      .populate("subject", "name code")
      .sort({ date: -1, startTime: -1 })
      .limit(200)
      .lean();

    if (!sessions.length) {
      return res.status(200).json({ success: true, records: [] });
    }

    const sessionIds = sessions.map((s) => s._id);
    const marks = await AttendanceRecord.find({
      student: req.user._id,
      session: { $in: sessionIds }
    })
      .select("session status locationFlag distanceMeters gpsDistance markedAt")
      .lean();

    const marksBySession = new Map(marks.map((row) => [String(row.session), row]));

    const records = sessions.map((session) => {
      const matched = marksBySession.get(String(session._id));
      return {
        sessionId: session._id,
        date: session.date,
        subject: session.subject?.name || "-",
        subjectCode: session.subject?.code || "-",
        status: matched?.status || "absent",
        locationFlag: matched?.locationFlag || "red",
        distanceMeters: matched?.distanceMeters ?? null,
        gpsDistance: matched?.gpsDistance ?? null,
        markedAt: matched?.markedAt || null
      };
    });

    return res.status(200).json({
      success: true,
      records
    });
  } catch (error) {
    console.error("Student daily report error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch daily attendance report"
    });
  }
};

exports.exportStudentDailyCSV = async (req, res) => {
  try {
    if (!req.user.department || !req.user.year || !req.user.division) {
      const parser = new Parser();
      const csv = parser.parse([]);
      res.header("Content-Type", "text/csv");
      res.attachment("student_daily_attendance.csv");
      return res.send(csv);
    }

    const batchKey = `${req.user.department}_${req.user.year}_${req.user.division}`;
    const sessions = await AttendanceSession.find({
      batchKey,
      isActive: { $in: [true, false] }
    })
      .populate("subject", "name code")
      .sort({ date: -1, startTime: -1 })
      .limit(500)
      .lean();

    const sessionIds = sessions.map((s) => s._id);
    const marks = await AttendanceRecord.find({
      student: req.user._id,
      session: { $in: sessionIds }
    })
      .select("session status locationFlag distanceMeters gpsDistance markedAt")
      .lean();

    const marksBySession = new Map(marks.map((row) => [String(row.session), row]));

    const rows = sessions.map((session) => {
      const matched = marksBySession.get(String(session._id));
      return {
        Date: session.date,
        Subject: session.subject?.name || "-",
        SubjectCode: session.subject?.code || "-",
        Status: matched?.status || "absent",
        Flag: matched?.locationFlag || "red",
        CollegeDistanceMeters: matched?.distanceMeters ?? "",
        SessionDistanceMeters: matched?.gpsDistance ?? "",
        MarkedAt: matched?.markedAt ? new Date(matched.markedAt).toISOString() : ""
      };
    });

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment("student_daily_attendance.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Student daily CSV export error:", error);
    return res.status(500).json({
      success: false,
      message: "CSV export failed"
    });
  }
};

exports.subjectReport = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const access = await canAccessSubject(req.user, subjectId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const records = await AttendanceRecord.find({
      subject: subjectId
    })
      .populate("student", "name rollNo")
      .sort({ markedAt: -1 });

    return res.json({
      success: true,
      records
    });
  } catch (error) {
    console.error("Subject report error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subject report"
    });
  }
};

exports.exportCSV = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const access = await canAccessSubject(req.user, subjectId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const records = await AttendanceRecord.find({
      subject: subjectId
    }).populate("student", "name rollNo");

    const data = records.map((r) => ({
      RollNo: r.student.rollNo,
      Name: r.student.name,
      Status: r.status,
      Date: r.markedAt.toISOString().split("T")[0]
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment("attendance.csv");
    return res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    return res.status(500).json({
      success: false,
      message: "CSV export failed"
    });
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const access = await canAccessSubject(req.user, subjectId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const records = await AttendanceRecord.find({
      subject: subjectId
    }).populate("student", "name rollNo");

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance.pdf"
    );

    doc.pipe(res);

    doc.fontSize(18).text("Attendance Report", {
      align: "center"
    });
    doc.moveDown();

    records.forEach((r) => {
      doc
        .fontSize(12)
        .text(
          `${r.student.rollNo} | ${r.student.name} | ${r.status.toUpperCase()} | ${r.markedAt
            .toISOString()
            .split("T")[0]}`
        );
    });

    doc.end();
  } catch (error) {
    console.error("PDF export error:", error);
    return res.status(500).json({
      success: false,
      message: "PDF export failed"
    });
  }
};
