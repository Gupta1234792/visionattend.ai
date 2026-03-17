

 const timetables = await Timetable.find({
      batchKey,
      date: { $gte: thirtyDaysAgoStr }
    }).sort({ date: -1 });

    res.json({
      success: true,
      timetables
    });

  } catch (error) {
    console.error("Get batch timetables error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch timetables"
    });
  }
};

module.exports = {
  createTimetable,
  updateTimetable,
  deleteTimetable,
  getTodaysTimetable,
  getTimetableByDate,
  getBatchTimetables
};