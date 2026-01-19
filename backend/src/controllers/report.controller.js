const AttendanceRecord = require("../models/AttendanceRecord.model");
const AttendanceSession = require("../models/AttendanceSession.model");
const Subject = require("../models/Subject.model");

const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

// ================= TEACHER-WISE REPORT =================
exports.teacherReport = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const sessions = await AttendanceSession.find({
      teacher: req.user._id
    });

    const sessionIds = sessions.map(s => s._id);

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

// ================= STUDENT ATTENDANCE PERCENTAGE =================
exports.studentPercentage = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

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

// ================= SUBJECT-WISE REPORT =================
exports.subjectReport = async (req, res) => {
  try {
    const { subjectId } = req.params;

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

// ================= CSV EXPORT =================
exports.exportCSV = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const records = await AttendanceRecord.find({
      subject: subjectId
    }).populate("student", "name rollNo");

    const data = records.map(r => ({
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

// ================= PDF EXPORT =================
exports.exportPDF = async (req, res) => {
  try {
    const { subjectId } = req.params;

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

    records.forEach(r => {
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
