const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { Parser } = require("json2csv");
const AttendanceRecord = require("../models/AttendanceRecord.model");

const RETENTION_DAYS = Number(process.env.ATTENDANCE_RETENTION_DAYS) || 365;
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(process.cwd(), "archives");

const ensureArchiveDir = () => {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
};

const buildMonthRange = () => {
  const now = new Date();
  const firstDayThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const firstDayPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
  return { from: firstDayPrevMonth, to: firstDayThisMonth };
};

const runMonthlyArchive = async () => {
  try {
    const { from, to } = buildMonthRange();
    const rows = await AttendanceRecord.find({
      createdAt: { $gte: from, $lt: to }
    })
      .select("type session onlineLecture student subject classKey status locationFlag distanceMeters gpsDistance markedAt createdAt")
      .lean();

    if (!rows.length) {
      console.log("Retention archive: no attendance rows for previous month");
      return;
    }

    ensureArchiveDir();
    const fileTag = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
    const jsonPath = path.join(ARCHIVE_DIR, `attendance_${fileTag}.json`);
    const csvPath = path.join(ARCHIVE_DIR, `attendance_${fileTag}.csv`);

    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");
    const parser = new Parser();
    fs.writeFileSync(csvPath, parser.parse(rows), "utf8");

    console.log(`Retention archive completed: ${rows.length} rows exported to ${ARCHIVE_DIR}`);
  } catch (error) {
    console.error("Retention archive job failed:", error);
  }
};

const runRetentionCleanup = async () => {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await AttendanceRecord.deleteMany({ createdAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`Retention cleanup deleted ${result.deletedCount} attendance rows older than ${RETENTION_DAYS} days`);
    }
  } catch (error) {
    console.error("Retention cleanup failed:", error);
  }
};

cron.schedule("0 2 1 * *", async () => {
  await runMonthlyArchive();
  await runRetentionCleanup();
});

module.exports = {
  runMonthlyArchive,
  runRetentionCleanup
};
