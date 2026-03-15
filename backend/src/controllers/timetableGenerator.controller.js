const crypto = require("crypto");
const OnlineLecture = require("../models/OnlineLecture.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const BatchHoliday = require("../models/BatchHoliday.model");
const Timetable = require("../models/Timetable.model");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");
const { triggerWebhookEvent } = require("../utils/webhooks");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const VIDEO_ROOM_BASE_URL = process.env.VIDEO_ROOM_BASE_URL || `${FRONTEND_URL}/room`;

const buildMeeting = () => {
  const meetingRoomId = crypto.randomUUID();
  const meetingLink = `${VIDEO_ROOM_BASE_URL}/${meetingRoomId}`;
  return { meetingRoomId, meetingLink };
};

const parseBatch = (batchId) => {
  if (!batchId) return null;
  const parts = String(batchId).split("_");
  if (parts.length !== 3) return null;
  return {
    department: parts[0],
    year: parts[1],
    division: parts[2]
  };
};

// Helper function to check for overlapping time slots
const checkTimeOverlap = (date, startTime, endTime, existingSlots) => {
  const start = new Date(`2024-01-01 ${startTime}`);
  const end = endTime ? new Date(`2024-01-01 ${endTime}`) : null;
  
  for (const slot of existingSlots) {
    const slotStart = new Date(`2024-01-01 ${slot.startTime}`);
    const slotEnd = slot.endTime ? new Date(`2024-01-01 ${slot.endTime}`) : null;
    
    // Check for overlap
    if (end && slotEnd) {
      if (start < slotEnd && end > slotStart) {
        return true;
      }
    } else if (!end && !slotEnd) {
      // Both are "onwards" sessions, check if same time
      if (start.getTime() === slotStart.getTime()) {
        return true;
      }
    } else if (end && !slotEnd) {
      // Current has end time, existing is onwards
      if (start < slotStart && end > slotStart) {
        return true;
      }
    } else if (!end && slotEnd) {
      // Current is onwards, existing has end time
      if (start >= slotStart && start < slotEnd) {
        return true;
      }
    }
  }
  return false;
};

// Generate a weekly timetable for a batch
const generateWeeklyTimetable = async (req, res) => {
  try {
    const { batchId, startDate, endDate, dailyLectures = 6, lectureDuration = 60 } = req.body;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required"
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (daysDiff < 1 || daysDiff > 30) {
      return res.status(400).json({
        success: false,
        message: "Date range must be between 1 and 30 days"
      });
    }

    // Get all subjects for this batch's department
    const batch = parseBatch(batchId);
    if (!batch) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchId format"
      });
    }

    const subjects = await Subject.find({
      department: batch.department,
      isActive: true
    }).populate("teacher", "name email");

    if (subjects.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subjects found for this department"
      });
    }

    // Get existing holidays for this batch
    const holidays = await BatchHoliday.find({
      collegeId: req.user.college,
      batchId,
      isActive: true,
      fromDate: { $lte: end },
      toDate: { $gte: start }
    });

    // Get existing lectures for this batch in the date range
    const existingLectures = await OnlineLecture.find({
      collegeId: req.user.college,
      batchId,
      scheduledAt: { $gte: start, $lte: end }
    });

    const generatedLectures = [];
    const errors = [];

    // Generate lectures for each day
    for (let dayOffset = 0; dayOffset <= daysDiff; dayOffset++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + dayOffset);

      // Skip weekends if configured (optional)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue; // Skip Sunday and Saturday
      }

      // Check if this date is a holiday
      const isHoliday = holidays.some(holiday => 
        currentDate >= new Date(holiday.fromDate) && 
        currentDate <= new Date(holiday.toDate)
      );

      if (isHoliday) {
        continue;
      }

      // Check for existing lectures on this day
      const dayLectures = existingLectures.filter(lecture => 
        new Date(lecture.scheduledAt).toDateString() === currentDate.toDateString()
      );

      if (dayLectures.length >= dailyLectures) {
        continue; // Day is full
      }

      // Generate remaining lectures for this day
      const remainingSlots = dailyLectures - dayLectures.length;
      const availableSubjects = [...subjects];

      for (let slot = 0; slot < remainingSlots; slot++) {
        if (availableSubjects.length === 0) break;

        // Pick a random subject
        const randomIndex = Math.floor(Math.random() * availableSubjects.length);
        const subject = availableSubjects.splice(randomIndex, 1)[0];

        // Create time slots throughout the day (9 AM to 5 PM)
        const hour = 9 + (slot % 8); // 9 AM to 4 PM
        const lectureTime = new Date(currentDate);
        lectureTime.setHours(hour, 0, 0, 0);

        // Check for conflicts with existing lectures
        const conflict = existingLectures.some(lecture => {
          const lectureDate = new Date(lecture.scheduledAt);
          return lectureDate.toDateString() === lectureTime.toDateString() &&
                 lectureDate.getHours() === lectureTime.getHours();
        });

        if (conflict) {
          continue;
        }

        try {
          const { meetingRoomId, meetingLink } = buildMeeting();

          const lecture = await OnlineLecture.create({
            title: `${subject.name} - Lecture ${slot + 1}`,
            teacherId: subject.teacher._id,
            subjectId: subject._id,
            batchId,
            collegeId: req.user.college,
            scheduledAt: lectureTime,
            durationMinutes: lectureDuration,
            meetingRoomId,
            meetingLink,
            purpose: "Regular class",
            createdBy: req.user._id
          });

          generatedLectures.push(lecture);

          // Send notifications to students
          const students = await User.find({
            role: "student",
            college: req.user.college,
            department: batch.department,
            year: batch.year,
            division: batch.division,
            isActive: true
          }).select("_id");

          if (students.length) {
            const Notification = require("../models/Notification.model");
            const docs = students.map((s) => ({
              userId: s._id,
              collegeId: req.user.college,
              batchId,
              type: "LECTURE_REMINDER",
              title: "Timetable Generated",
              message: `${lecture.title} scheduled at ${lectureTime.toISOString()}`,
              relatedId: lecture._id,
              status: "scheduled",
              scheduledFor: lecture.scheduledAt
            }));
            await Notification.insertMany(docs);
          }

          await logAudit({
            actor: req.user,
            module: "timetable",
            action: "GENERATE",
            entityType: "OnlineLecture",
            entityId: lecture._id,
            metadata: { batchId, autoGenerated: true, day: currentDate.toDateString() }
          });

          triggerWebhookEvent({
            event: "timetable.generated",
            collegeId: req.user.college,
            payload: {
              event: "timetable.generated",
              lectureId: String(lecture._id),
              title: lecture.title,
              batchId: lecture.batchId,
              subjectId: String(lecture.subjectId),
              teacherId: String(lecture.teacherId),
              scheduledAt: lecture.scheduledAt?.toISOString?.() || new Date(lecture.scheduledAt).toISOString(),
              autoGenerated: true
            }
          }).catch((webhookError) => {
            console.error("timetable.generated webhook error:", webhookError);
          });

        } catch (error) {
          errors.push({
            date: currentDate.toDateString(),
            subject: subject.name,
            error: error.message || "Failed to create lecture"
          });
        }
      }
    }

    return res.status(201).json({
      success: true,
      generatedLectures,
      errors,
      message: `Generated ${generatedLectures.length} lectures. ${errors.length} errors.`
    });

  } catch (error) {
    console.error("generateWeeklyTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate timetable" });
  }
};

// Generate a semester timetable (more complex scheduling)
const generateSemesterTimetable = async (req, res) => {
  try {
    const { batchId, startDate, endDate, lecturesPerWeek = 3, lectureDuration = 60 } = req.body;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required"
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (daysDiff < 30 || daysDiff > 180) {
      return res.status(400).json({
        success: false,
        message: "Semester date range must be between 30 and 180 days"
      });
    }

    const batch = parseBatch(batchId);
    if (!batch) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchId format"
      });
    }

    const subjects = await Subject.find({
      department: batch.department,
      isActive: true
    }).populate("teacher", "name email");

    if (subjects.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subjects found for this department"
      });
    }

    // Get existing holidays and lectures
    const holidays = await BatchHoliday.find({
      collegeId: req.user.college,
      batchId,
      isActive: true,
      fromDate: { $lte: end },
      toDate: { $gte: start }
    });

    const existingLectures = await OnlineLecture.find({
      collegeId: req.user.college,
      batchId,
      scheduledAt: { $gte: start, $lte: end }
    });

    const generatedLectures = [];
    const errors = [];

    // Calculate how many weeks and distribute lectures per subject
    const weeks = Math.ceil(daysDiff / 7);
    const totalLectures = weeks * lecturesPerWeek;
    const lecturesPerSubject = Math.floor(totalLectures / subjects.length);
    const remainder = totalLectures % subjects.length;

    // Create a schedule array with subjects repeated appropriately
    let scheduleSubjects = [];
    subjects.forEach((subject, index) => {
      const count = lecturesPerSubject + (index < remainder ? 1 : 0);
      for (let i = 0; i < count; i++) {
        scheduleSubjects.push(subject);
      }
    });

    // Shuffle the schedule for variety
    scheduleSubjects = scheduleSubjects.sort(() => Math.random() - 0.5);

    let subjectIndex = 0;

    // Generate lectures for each day
    for (let dayOffset = 0; dayOffset <= daysDiff; dayOffset++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + dayOffset);

      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue; // Skip weekends
      }

      const isHoliday = holidays.some(holiday => 
        currentDate >= new Date(holiday.fromDate) && 
        currentDate <= new Date(holiday.toDate)
      );

      if (isHoliday) {
        continue;
      }

      // Check existing lectures for this day
      const dayLectures = existingLectures.filter(lecture => 
        new Date(lecture.scheduledAt).toDateString() === currentDate.toDateString()
      );

      if (dayLectures.length >= 1) {
        continue; // Only one lecture per day for semester schedule
      }

      if (subjectIndex >= scheduleSubjects.length) {
        break; // No more lectures to schedule
      }

      const subject = scheduleSubjects[subjectIndex];
      subjectIndex++;

      try {
        // Schedule at 10 AM
        const lectureTime = new Date(currentDate);
        lectureTime.setHours(10, 0, 0, 0);

        const { meetingRoomId, meetingLink } = buildMeeting();

        const lecture = await OnlineLecture.create({
          title: `${subject.name} - Week ${Math.ceil(subjectIndex / lecturesPerWeek)}`,
          teacherId: subject.teacher._id,
          subjectId: subject._id,
          batchId,
          collegeId: req.user.college,
          scheduledAt: lectureTime,
          durationMinutes: lectureDuration,
          meetingRoomId,
          meetingLink,
          purpose: "Semester class",
          createdBy: req.user._id
        });

        generatedLectures.push(lecture);

        // Send notifications
        const students = await User.find({
          role: "student",
          college: req.user.college,
          department: batch.department,
          year: batch.year,
          division: batch.division,
          isActive: true
        }).select("_id");

        if (students.length) {
          const Notification = require("../models/Notification.model");
          const docs = students.map((s) => ({
            userId: s._id,
            collegeId: req.user.college,
            batchId,
            type: "LECTURE_REMINDER",
            title: "Semester Timetable Generated",
            message: `${lecture.title} scheduled at ${lectureTime.toISOString()}`,
            relatedId: lecture._id,
            status: "scheduled",
            scheduledFor: lecture.scheduledAt
          }));
          await Notification.insertMany(docs);
        }

        await logAudit({
          actor: req.user,
          module: "timetable",
          action: "GENERATE_SEMESTER",
          entityType: "OnlineLecture",
          entityId: lecture._id,
          metadata: { batchId, semester: true, week: Math.ceil(subjectIndex / lecturesPerWeek) }
        });

        triggerWebhookEvent({
          event: "timetable.semester.generated",
          collegeId: req.user.college,
          payload: {
            event: "timetable.semester.generated",
            lectureId: String(lecture._id),
            title: lecture.title,
            batchId: lecture.batchId,
            subjectId: String(lecture.subjectId),
            teacherId: String(lecture.teacherId),
            scheduledAt: lecture.scheduledAt?.toISOString?.() || new Date(lecture.scheduledAt).toISOString(),
            semester: true
          }
        }).catch((webhookError) => {
          console.error("timetable.semester.generated webhook error:", webhookError);
        });

      } catch (error) {
        errors.push({
          date: currentDate.toDateString(),
          subject: subject.name,
          error: error.message || "Failed to create lecture"
        });
      }
    }

    return res.status(201).json({
      success: true,
      generatedLectures,
      errors,
      message: `Generated ${generatedLectures.length} semester lectures. ${errors.length} errors.`
    });

  } catch (error) {
    console.error("generateSemesterTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate semester timetable" });
  }
};

// Get timetable conflicts for a batch
const getTimetableConflicts = async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.query;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    const lectures = await OnlineLecture.find(query)
      .populate("teacherId", "name email")
      .populate("subjectId", "name code")
      .sort({ scheduledAt: 1 });

    // Find time conflicts (same teacher at same time)
    const conflicts = [];
    const timeGroups = new Map();

    lectures.forEach(lecture => {
      const timeKey = new Date(lecture.scheduledAt).toISOString();
      if (!timeGroups.has(timeKey)) {
        timeGroups.set(timeKey, []);
      }
      timeGroups.get(timeKey).push(lecture);
    });

    timeGroups.forEach((lecturesAtTime, time) => {
      if (lecturesAtTime.length > 1) {
        const teacherIds = new Set(lecturesAtTime.map(l => l.teacherId._id.toString()));
        if (teacherIds.size < lecturesAtTime.length) {
          conflicts.push({
            time,
            lectures: lecturesAtTime.map(l => ({
              id: l._id,
              title: l.title,
              teacher: l.teacherId.name,
              subject: l.subjectId.name
            }))
          });
        }
      }
    });

    return res.json({
      success: true,
      conflicts,
      totalLectures: lectures.length,
      message: conflicts.length > 0 ? `${conflicts.length} conflicts found` : "No conflicts detected"
    });

  } catch (error) {
    console.error("getTimetableConflicts error:", error);
    return res.status(500).json({ success: false, message: "Failed to check conflicts" });
  }
};

// Optimize existing timetable (resolve conflicts)
const optimizeTimetable = async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.body;

    if (!batchId) {
      return res.status(400).json({ success: false, message: "batchId is required" });
    }

    const query = {
      collegeId: req.user.college,
      batchId
    };

    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    const lectures = await OnlineLecture.find(query)
      .populate("teacherId", "name email")
      .populate("subjectId", "name code");

    const conflicts = [];
    const timeGroups = new Map();

    // Group lectures by time slot
    lectures.forEach(lecture => {
      const timeKey = new Date(lecture.scheduledAt).toISOString();
      if (!timeGroups.has(timeKey)) {
        timeGroups.set(timeKey, []);
      }
      timeGroups.get(timeKey).push(lecture);
    });

    // Find conflicts
    timeGroups.forEach((lecturesAtTime, time) => {
      if (lecturesAtTime.length > 1) {
        const teacherIds = new Set(lecturesAtTime.map(l => l.teacherId._id.toString()));
        if (teacherIds.size < lecturesAtTime.length) {
          conflicts.push({
            time,
            lectures: lecturesAtTime
          });
        }
      }
    });

    if (conflicts.length === 0) {
      return res.json({
        success: true,
        message: "No conflicts found to optimize"
      });
    }

    // Try to resolve conflicts by moving lectures to nearby time slots
    const resolvedLectures = [];
    const errors = [];

    for (const conflict of conflicts) {
      const lecturesAtTime = conflict.lectures;
      const originalTime = new Date(conflict.time);

      // Try to find alternative time slots
      for (let offset = 1; offset <= 4; offset++) {
        const alternativeTimes = [
          new Date(originalTime.getTime() + offset * 60 * 60 * 1000), // +1 hour
          new Date(originalTime.getTime() - offset * 60 * 60 * 1000)  // -1 hour
        ];

        for (const altTime of alternativeTimes) {
          // Check if alternative time is valid (not weekend, not holiday, not conflicting)
          const dayOfWeek = altTime.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) continue;

          // Check for holidays
          const holidays = await BatchHoliday.find({
            collegeId: req.user.college,
            batchId,
            isActive: true,
            fromDate: { $lte: altTime },
            toDate: { $gte: altTime }
          });

          if (holidays.length > 0) continue;

          // Check for existing lectures at alternative time
          const existingAtAlt = await OnlineLecture.findOne({
            collegeId: req.user.college,
            batchId,
            scheduledAt: altTime
          });

          if (existingAtAlt) continue;

          // Found a valid alternative time, update the lecture
          const lectureToUpdate = lecturesAtTime.find(l => 
            !resolvedLectures.some(r => r._id.toString() === l._id.toString())
          );

          if (lectureToUpdate) {
            lectureToUpdate.scheduledAt = altTime;
            await lectureToUpdate.save();
            resolvedLectures.push(lectureToUpdate);

            await logAudit({
              actor: req.user,
              module: "timetable",
              action: "OPTIMIZE",
              entityType: "OnlineLecture",
              entityId: lectureToUpdate._id,
              metadata: { 
                originalTime: conflict.time, 
                newTime: altTime.toISOString(),
                optimized: true 
              }
            });

            break;
          }
        }
      }
    }

    return res.json({
      success: true,
      resolvedLectures: resolvedLectures.length,
      errors,
      message: `Optimized ${resolvedLectures.length} lectures to resolve conflicts`
    });

  } catch (error) {
    console.error("optimizeTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to optimize timetable" });
  }
};

// Create a new manual timetable entry
const createTimetableEntry = async (req, res) => {
  try {
    const { classLabel, date, department, year, division, slots } = req.body;

    if (!classLabel || !date || !department || !year || !division || !slots) {
      return res.status(400).json({
        success: false,
        message: "classLabel, date, department, year, division, and slots are required"
      });
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({
        success: false,
        message: "slots must be a non-empty array"
      });
    }

    // Validate department exists and belongs to college
    const Department = require("../models/Department.model");
    const dept = await Department.findById(department);
    if (!dept || dept.college.toString() !== req.user.college.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid department or department not found"
      });
    }

    // Check for existing timetable for this date and batch
    const batchKey = `${year}_${division}`;
    const existingTimetable = await Timetable.findOne({
      college: req.user.college,
      batchKey,
      date,
      isActive: true
    });

    if (existingTimetable) {
      return res.status(409).json({
        success: false,
        message: "Timetable already exists for this date and batch"
      });
    }

    // Validate slots for overlaps
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      
      // Validate required fields
      if (!slot.startTime || !slot.subject || !slot.type) {
        return res.status(400).json({
          success: false,
          message: `Slot ${i + 1}: startTime, subject, and type are required`
        });
      }

      // Validate type
      if (!["lecture", "practical", "break", "custom"].includes(slot.type)) {
        return res.status(400).json({
          success: false,
          message: `Slot ${i + 1}: Invalid type. Must be lecture, practical, break, or custom`
        });
      }

      // For non-break slots, validate teacher if provided
      if (slot.type !== "break" && slot.teacherId) {
        const teacher = await User.findById(slot.teacherId);
        if (!teacher || teacher.role !== "teacher" || teacher.college.toString() !== req.user.college.toString()) {
          return res.status(400).json({
            success: false,
            message: `Slot ${i + 1}: Invalid teacher or teacher not found`
          });
        }
      }

      // Check for time overlaps
      const overlap = checkTimeOverlap(date, slot.startTime, slot.endTime, slots.slice(0, i));
      if (overlap) {
        return res.status(400).json({
          success: false,
          message: `Slot ${i + 1}: Time overlap detected with previous slot`
        });
      }
    }

    // Create timetable entry
    const timetable = await Timetable.create({
      classLabel,
      date,
      department,
      college: req.user.college,
      batchKey,
      year,
      division,
      slots,
      createdBy: req.user._id,
      isPublished: true
    });

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "CREATE_MANUAL",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { batchKey, date, slotCount: slots.length }
    });

    triggerWebhookEvent({
      event: "timetable.manual.created",
      collegeId: req.user.college,
      payload: {
        event: "timetable.manual.created",
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        batchKey: timetable.batchKey,
        slotCount: timetable.slots.length,
        createdBy: String(req.user._id)
      }
    }).catch((webhookError) => {
      console.error("timetable.manual.created webhook error:", webhookError);
    });

    // Emit realtime event for timetable updates
    emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      classLabel: timetable.classLabel,
      date: timetable.date,
      batchKey: timetable.batchKey,
      slots: timetable.slots.length,
      action: "created"
    });

    return res.status(201).json({
      success: true,
      timetable,
      message: "Timetable entry created successfully"
    });

  } catch (error) {
    console.error("createTimetableEntry error:", error);
    return res.status(500).json({ success: false, message: "Failed to create timetable entry" });
  }
};

// Update an existing timetable entry
const updateTimetableEntry = async (req, res) => {
  try {
    const { timetableId } = req.params;
    const { classLabel, date, slots } = req.body;

    const timetable = await Timetable.findById(timetableId);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "Timetable entry not found"
      });
    }

    if (timetable.college.toString() !== req.user.college.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    if (timetable.createdBy.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the creator or admin can update this timetable"
      });
    }

    // Validate slots if provided
    if (slots) {
      if (!Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({
          success: false,
          message: "slots must be a non-empty array"
        });
      }

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        
        if (!slot.startTime || !slot.subject || !slot.type) {
          return res.status(400).json({
            success: false,
            message: `Slot ${i + 1}: startTime, subject, and type are required`
          });
        }

        if (!["lecture", "practical", "break", "custom"].includes(slot.type)) {
          return res.status(400).json({
            success: false,
            message: `Slot ${i + 1}: Invalid type. Must be lecture, practical, break, or custom`
          });
        }

        // Check for time overlaps
        const overlap = checkTimeOverlap(date || timetable.date, slot.startTime, slot.endTime, slots.slice(0, i));
        if (overlap) {
          return res.status(400).json({
            success: false,
            message: `Slot ${i + 1}: Time overlap detected with previous slot`
          });
        }
      }

      timetable.slots = slots;
    }

    if (classLabel) timetable.classLabel = classLabel;
    if (date) timetable.date = date;

    await timetable.save();

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "UPDATE_MANUAL",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { updatedFields: Object.keys(req.body) }
    });

    triggerWebhookEvent({
      event: "timetable.manual.updated",
      collegeId: req.user.college,
      payload: {
        event: "timetable.manual.updated",
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        slotCount: timetable.slots.length,
        updatedBy: String(req.user._id)
      }
    }).catch((webhookError) => {
      console.error("timetable.manual.updated webhook error:", webhookError);
    });

    // Emit realtime event for timetable updates
    emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      classLabel: timetable.classLabel,
      date: timetable.date,
      batchKey: timetable.batchKey,
      slots: timetable.slots.length,
      action: "updated"
    });

    return res.json({
      success: true,
      timetable,
      message: "Timetable entry updated successfully"
    });

  } catch (error) {
    console.error("updateTimetableEntry error:", error);
    return res.status(500).json({ success: false, message: "Failed to update timetable entry" });
  }
};

// Delete a timetable entry
const deleteTimetableEntry = async (req, res) => {
  try {
    const { timetableId } = req.params;

    const timetable = await Timetable.findById(timetableId);
    if (!timetable) {
      return res.status(404).json({
        success: false,
        message: "Timetable entry not found"
      });
    }

    if (timetable.college.toString() !== req.user.college.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    if (timetable.createdBy.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only the creator or admin can delete this timetable"
      });
    }

    // Soft delete
    timetable.isActive = false;
    await timetable.save();

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "DELETE_MANUAL",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { reason: "Manual deletion" }
    });

    triggerWebhookEvent({
      event: "timetable.manual.deleted",
      collegeId: req.user.college,
      payload: {
        event: "timetable.manual.deleted",
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        deletedBy: String(req.user._id)
      }
    }).catch((webhookError) => {
      console.error("timetable.manual.deleted webhook error:", webhookError);
    });

    // Emit realtime event for timetable updates
    emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      classLabel: timetable.classLabel,
      date: timetable.date,
      batchKey: timetable.batchKey,
      slots: timetable.slots.length,
      action: "deleted"
    });

    return res.json({
      success: true,
      message: "Timetable entry deleted successfully"
    });

  } catch (error) {
    console.error("deleteTimetableEntry error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable entry" });
  }
};

// Get today's timetable for a batch
const getTodaysTimetable = async (req, res) => {
  try {
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    const batch = parseBatch(batchId);
    if (!batch) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchId format"
      });
    }

    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    const timetable = await Timetable.findOne({
      college: req.user.college,
      batchKey: `${batch.year}_${batch.division}`,
      date: todayString,
      isActive: true
    }).populate("department", "name").populate("slots.teacherId", "name email");

    if (!timetable) {
      return res.json({
        success: true,
        timetable: null,
        message: "No timetable found for today"
      });
    }

    return res.json({
      success: true,
      timetable
    });

  } catch (error) {
    console.error("getTodaysTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to get today's timetable" });
  }
};

// Get timetable for a specific date range
const getTimetableByDateRange = async (req, res) => {
  try {
    const { batchId, startDate, endDate } = req.query;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "batchId is required"
      });
    }

    const batch = parseBatch(batchId);
    if (!batch) {
      return res.status(400).json({
        success: false,
        message: "Invalid batchId format"
      });
    }

    const query = {
      college: req.user.college,
      batchKey: `${batch.year}_${batch.division}`,
      isActive: true
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    } else {
      // Default to current month
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      query.date = {
        $gte: firstDay.toISOString().split('T')[0],
        $lte: lastDay.toISOString().split('T')[0]
      };
    }

    const timetables = await Timetable.find(query)
      .populate("department", "name")
      .populate("slots.teacherId", "name email")
      .sort({ date: 1 });

    return res.json({
      success: true,
      timetables
    });

  } catch (error) {
    console.error("getTimetableByDateRange error:", error);
    return res.status(500).json({ success: false, message: "Failed to get timetable" });
  }
};

module.exports = {
  generateWeeklyTimetable,
  generateSemesterTimetable,
  getTimetableConflicts,
  optimizeTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTodaysTimetable,
  getTimetableByDateRange
};
