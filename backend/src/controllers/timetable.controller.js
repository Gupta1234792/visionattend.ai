const Timetable = require("../models/Timetable.model");
const User = require("../models/User.model");
const Department = require("../models/Department.model");

/**
 * Create a new timetable for a batch
 */
const createTimetable = async (req, res) => {
  try {
    const {
      batchKey,
      classLabel,
      date,
      year,
      division,
      slots,
      isPublished
    } = req.body;

    // 🔥 VALIDATION
    if (!batchKey || !classLabel || !date || !year || !division || !slots?.length) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // 🔥 SLOT VALIDATION
    const validatedSlots = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      let { startTime, endTime, subject, teacher, type } = slot;

      type = String(type).toLowerCase().trim();

      if (!startTime) {
        return res.status(400).json({
          success: false,
          message: `Slot ${i + 1}: startTime required`
        });
      }

      const validTypes = ["lecture", "lab", "break"];

      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Slot ${i + 1}: invalid slot type`
        });
      }

      // 🔥 BREAK FIX
      if (type === "break") {
        slot.subject = null;
        slot.teacher = null;
      } else {
        if (!subject || !teacher) {
          return res.status(400).json({
            success: false,
            message: `Slot ${i + 1}: subject and teacher required`
          });
        }
      }

      validatedSlots.push({
        startTime,
        endTime,
        subject,
        teacher,
        type,
        order: i
      });
    }

    // 🔥 CREATE
    const timetable = await Timetable.create({
      batchKey,
      classLabel,
      date,
      year,
      division,
      slots: validatedSlots,
      isPublished: isPublished ?? true,
      isActive: true
    });

    return res.json({
      success: true,
      timetable
    });

  } catch (error) {
    console.error("CREATE TIMETABLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create timetable"
    });
  }
};

/**
 * Update an existing timetable
 */
const updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      periods,
      breaks
    } = req.body;

    // Find timetable
    const timetable = await Timetable.findById(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "Timetable not found"
      });
    }

    // Check if user is coordinator for this department
    const user = await User.findById(req.user._id).populate("department");
    if (!user || user.role !== "coordinator") {
      return res.status(403).json({
        success: false,
        message: "Only coordinators can update timetables"
      });
    }

    // Verify batch belongs to user's department
    const batchParts = timetable.batchKey.split("_");
    const [departmentId] = batchParts;
    if (user.department?._id.toString() !== departmentId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: timetable not in your department"
      });
    }

    // Validate periods if provided
    let validatedPeriods = timetable.periods;
    if (periods !== undefined) {
      validatedPeriods = [];
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        const { startTime, endTime, subject, teacher, type = "lecture" } = period;

        if (!startTime || !endTime || !subject) {
          return res.status(400).json({
            success: false,
            message: `Period ${i + 1}: startTime, endTime, and subject are required`
          });
        }

        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
          return res.status(400).json({
            success: false,
            message: `Period ${i + 1}: Invalid time format. Use HH:MM`
          });
        }

        const validTypes = ["lecture", "lab", "tutorial", "break"];
        if (!validTypes.includes(type)) {
          return res.status(400).json({
            success: false,
            message: `Period ${i + 1}: Invalid type. Must be one of: ${validTypes.join(", ")}`
          });
        }

        validatedPeriods.push({
          periodNumber: i + 1,
          startTime,
          endTime,
          subject,
          teacher: teacher || null,
          type
        });
      }
    }

    // Validate breaks if provided
    let validatedBreaks = timetable.breaks;
    if (breaks !== undefined) {
      validatedBreaks = [];
      for (let i = 0; i < breaks.length; i++) {
        const breakItem = breaks[i];
        const { startTime, endTime, reason } = breakItem;

        if (!startTime || !endTime || !reason) {
          return res.status(400).json({
            success: false,
            message: `Break ${i + 1}: startTime, endTime, and reason are required`
          });
        }

        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
          return res.status(400).json({
            success: false,
            message: `Break ${i + 1}: Invalid time format. Use HH:MM`
          });
        }

        validatedBreaks.push({
          startTime,
          endTime,
          reason
        });
      }
    }

    // Check for overlapping periods
    const allSlots = [...validatedPeriods, ...validatedBreaks];
    allSlots.sort((a, b) => {
      if (a.startTime < b.startTime) return -1;
      if (a.startTime > b.startTime) return 1;
      return 0;
    });

    for (let i = 0; i < allSlots.length - 1; i++) {
      const current = allSlots[i];
      const next = allSlots[i + 1];
      
      if (current.endTime > next.startTime) {
        return res.status(400).json({
          success: false,
          message: "Overlapping time slots detected"
        });
      }
    }

    // Update timetable
    timetable.periods = validatedPeriods;
    timetable.breaks = validatedBreaks;
    timetable.updatedAt = new Date();

    await timetable.save();

    res.json({
      success: true,
      message: "Timetable updated successfully",
      timetable
    });

  } catch (error) {
    console.error("Update timetable error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update timetable"
    });
  }
};

/**
 * Delete a timetable
 */
const deleteTimetable = async (req, res) => {
  try {
    const { id } = req.params;

    // Find timetable
    const timetable = await Timetable.findById(id);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "Timetable not found"
      });
    }

    // Check if user is coordinator for this department
    const user = await User.findById(req.user._id).populate("department");
    if (!user || user.role !== "coordinator") {
      return res.status(403).json({
        success: false,
        message: "Only coordinators can delete timetables"
      });
    }

    // Verify batch belongs to user's department
    const batchParts = timetable.batchKey.split("_");
    const [departmentId] = batchParts;
    if (user.department?._id.toString() !== departmentId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: timetable not in your department"
      });
    }

    // Delete timetable
    await Timetable.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Timetable deleted successfully"
    });

  } catch (error) {
    console.error("Delete timetable error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete timetable"
    });
  }
};

/**
 * Get today's timetable for a batch
 */
const getTodaysTimetable = async (req, res) => {
  try {
    const { batchKey } = req.params;
    console.log("BACKEND batchKey:", batchKey);
    const today = new Date().toISOString().split('T')[0];
    console.log("BACKEND today:", today);
    
    // Try exact date match
    let timetable = await Timetable.findOne({
      batchKey,
      date: today
    }).sort({ createdAt: -1 });

    // 🔥 FALLBACK (CRITICAL FIX)
    if (!timetable) {
      timetable = await Timetable.findOne({
        batchKey
      }).sort({ createdAt: -1 });
    }

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "No timetable found"
      });
    }

    return res.json({
      success: true,
      timetable
    });

  } catch (error) {
    console.error("Get today's timetable error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch today's timetable"
    });
  }
};

/**
 * Get timetable for a specific date
 */
const getTimetableByDate = async (req, res) => {
  try {
    const { batchKey, date } = req.params;

    const timetable = await Timetable.findOne({
      batchKey,
      date
    });

    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "No timetable found for the specified date"
      });
    }

    res.json({
      success: true,
      timetable
    });

  } catch (error) {
    console.error("Get timetable by date error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch timetable"
    });
  }
};

/**
 * Get all timetables for a batch (last 30 days)
 */
const getBatchTimetables = async (req, res) => {
  try {
    const { batchKey } = req.params;
    
    // Get timetables for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

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