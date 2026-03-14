const Timetable = require("../models/Timetable.model");
const TimetableTemplate = require("../models/TimetableTemplate.model");
const User = require("../models/User.model");
const PDFDocument = require("pdfkit");
const getBatchKey = require("../utils/batchKey");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");

const VALID_SLOT_TYPES = new Set(["theory", "practical", "event", "break"]);

const parseDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

const toMinutes = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  if (raw.includes("onwards")) return Number.MAX_SAFE_INTEGER;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
};

const normalizeSlot = async (slot, index, collegeId) => {
  const startTime = String(slot?.startTime || "").trim();
  const endTime = String(slot?.endTime || "").trim();
  const subject = String(slot?.subject || "").trim();
  const type = String(slot?.type || "theory").trim().toLowerCase();
  const notes = String(slot?.notes || "").trim();
  const teacherName = String(slot?.teacherName || "").trim();
  const teacherId = slot?.teacherId || null;

  if (!startTime) {
    return { ok: false, message: `Slot ${index + 1}: startTime is required` };
  }

  if (!subject) {
    return { ok: false, message: `Slot ${index + 1}: subject is required` };
  }

  if (!VALID_SLOT_TYPES.has(type)) {
    return { ok: false, message: `Slot ${index + 1}: invalid slot type` };
  }

  if (type !== "break" && !teacherName && !teacherId) {
    return { ok: false, message: `Slot ${index + 1}: teacher name is required` };
  }

  let resolvedTeacherName = teacherName;
  let resolvedTeacherId = null;

  if (teacherId) {
    const teacher = await User.findOne({
      _id: teacherId,
      role: "teacher",
      college: collegeId,
      isActive: true
    }).select("_id name");

    if (!teacher) {
      return { ok: false, message: `Slot ${index + 1}: teacher not found` };
    }

    resolvedTeacherId = teacher._id;
    resolvedTeacherName = resolvedTeacherName || teacher.name;
  }

  return {
    ok: true,
    slot: {
      startTime,
      endTime,
      subject,
      teacherName: resolvedTeacherName,
      teacherId: resolvedTeacherId,
      type,
      notes,
      order: Number(slot?.order ?? index)
    }
  };
};

const sortSlots = (slots) =>
  [...slots].sort((first, second) => {
    const minuteDiff = toMinutes(first.startTime) - toMinutes(second.startTime);
    if (minuteDiff !== 0) return minuteDiff;
    return Number(first.order || 0) - Number(second.order || 0);
  });

const hasConflict = async ({ timetableId = null, date, collegeId, slots }) => {
  const teacherChecks = slots
    .filter((slot) => slot.type !== "break" && (slot.teacherId || slot.teacherName))
    .map((slot) => ({
      startMinutes: toMinutes(slot.startTime),
      endMinutes: slot.endTime ? toMinutes(slot.endTime) : Number.MAX_SAFE_INTEGER,
      teacherId: slot.teacherId ? String(slot.teacherId) : "",
      teacherName: String(slot.teacherName || "").trim().toLowerCase()
    }));

  if (!teacherChecks.length) {
    return null;
  }

  const query = {
    college: collegeId,
    date,
    isActive: true
  };

  if (timetableId) {
    query._id = { $ne: timetableId };
  }

  const existing = await Timetable.find(query).select("classLabel slots").lean();

  for (const currentSlot of teacherChecks) {
    for (const timetable of existing) {
      for (const slot of timetable.slots || []) {
        const sameTeacher =
          (currentSlot.teacherId && slot.teacherId && String(slot.teacherId) === currentSlot.teacherId) ||
          (currentSlot.teacherName &&
            String(slot.teacherName || "").trim().toLowerCase() === currentSlot.teacherName);

        if (!sameTeacher) continue;

        const otherStart = toMinutes(slot.startTime);
        const otherEnd = slot.endTime ? toMinutes(slot.endTime) : Number.MAX_SAFE_INTEGER;
        const overlap = currentSlot.startMinutes < otherEnd && otherStart < currentSlot.endMinutes;

        if (overlap) {
          return `Teacher conflict with ${slot.teacherName || "assigned teacher"} in class ${timetable.classLabel}`;
        }
      }
    }
  }

  return null;
};

const buildBatchContext = (req, body = {}) => {
  const year = String(body.year || req.user.year || "").trim();
  const division = String(body.division || req.user.division || "").trim();
  const department = body.departmentId || req.user.department;

  if (!department || !year || !division) {
    return null;
  }

  return {
    year,
    division,
    department,
    batchKey: getBatchKey({ department, year, division }),
    classLabel: String(body.classLabel || `${year}-${body.className || division}`).trim()
  };
};

const iterateDateRange = (startValue, endValue, onDate) => {
  const current = new Date(startValue);
  const last = new Date(endValue);
  while (current <= last) {
    onDate(new Date(current));
    current.setDate(current.getDate() + 1);
  }
};

const buildTemplateSlots = (template) =>
  sortSlots(
    (template.slots || []).map((slot, index) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      subject: slot.subject,
      teacherName: slot.teacherName,
      teacherId: slot.teacherId || null,
      type: slot.type,
      notes: slot.notes,
      order: Number(slot.order ?? index)
    }))
  );

const applyTemplateToDates = async ({ template, reqUser, dateKeys, publish }) => {
  const created = [];
  const skipped = [];

  for (const dateKey of dateKeys) {
    const existing = await Timetable.findOne({
      batchKey: template.batchKey,
      date: dateKey,
      isActive: true
    }).select("_id");

    if (existing) {
      skipped.push({ date: dateKey, reason: "Timetable already exists" });
      continue;
    }

    const slots = buildTemplateSlots(template);
    const conflictMessage = await hasConflict({
      date: dateKey,
      collegeId: reqUser.college,
      slots
    });

    if (conflictMessage) {
      skipped.push({ date: dateKey, reason: conflictMessage });
      continue;
    }

    const timetable = await Timetable.create({
      classLabel: template.classLabel,
      date: dateKey,
      department: template.department,
      college: template.college,
      batchKey: template.batchKey,
      year: template.year,
      division: template.division,
      slots,
      createdBy: reqUser._id,
      isPublished: publish
    });

    created.push({ id: timetable._id, date: dateKey });

    if (publish) {
      emitToCollegeRoom(String(reqUser.college || ""), `batch_${template.batchKey}`, "TIMETABLE_PUBLISHED", {
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        slots: timetable.slots.length
      });
    }
  }

  return { created, skipped };
};

const createTimetable = async (req, res) => {
  try {
    const { date, slots, isPublished = false } = req.body;
    const context = buildBatchContext(req, req.body);

    if (!context) {
      return res.status(400).json({ success: false, message: "year, division and department are required" });
    }

    if (!date || !Array.isArray(slots) || !slots.length) {
      return res.status(400).json({ success: false, message: "date and slots are required" });
    }

    const dateKey = parseDateKey(date);
    if (!dateKey) {
      return res.status(400).json({ success: false, message: "Invalid timetable date" });
    }

    const normalizedSlots = [];
    for (let index = 0; index < slots.length; index += 1) {
      const result = await normalizeSlot(slots[index], index, req.user.college);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message });
      }
      normalizedSlots.push(result.slot);
    }

    const sortedSlots = sortSlots(normalizedSlots);
    const conflictMessage = await hasConflict({
      date: dateKey,
      collegeId: req.user.college,
      slots: sortedSlots
    });
    if (conflictMessage) {
      return res.status(409).json({ success: false, message: conflictMessage });
    }

    const existing = await Timetable.findOne({
      batchKey: context.batchKey,
      date: dateKey,
      isActive: true
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Timetable already exists for this class and date" });
    }

    const timetable = await Timetable.create({
      classLabel: context.classLabel,
      date: dateKey,
      department: context.department,
      college: req.user.college,
      batchKey: context.batchKey,
      year: context.year,
      division: context.division,
      slots: sortedSlots,
      createdBy: req.user._id,
      isPublished: Boolean(isPublished)
    });

    if (timetable.isPublished) {
      emitToCollegeRoom(String(req.user.college || ""), `batch_${context.batchKey}`, "TIMETABLE_PUBLISHED", {
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        slots: timetable.slots.length
      });
    }

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: timetable.isPublished ? "PUBLISH" : "CREATE_DRAFT",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { batchKey: context.batchKey, date: dateKey, slots: timetable.slots.length }
    });

    return res.status(201).json({ success: true, timetable });
  } catch (error) {
    console.error("createTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to create timetable" });
  }
};

const updateTimetable = async (req, res) => {
  try {
    const timetableId = req.params.timetableId || req.body.timetableId;
    if (!timetableId) {
      return res.status(400).json({ success: false, message: "timetableId is required" });
    }

    const timetable = await Timetable.findById(timetableId);
    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    if (String(timetable.college) !== String(req.user.college || "")) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    const nextDate = parseDateKey(req.body.date || timetable.date);
    if (!nextDate) {
      return res.status(400).json({ success: false, message: "Invalid timetable date" });
    }

    const nextSlotsInput = Array.isArray(req.body.slots) ? req.body.slots : timetable.slots;
    const nextSlots = [];
    for (let index = 0; index < nextSlotsInput.length; index += 1) {
      const result = await normalizeSlot(nextSlotsInput[index], index, req.user.college);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message });
      }
      nextSlots.push(result.slot);
    }

    const sortedSlots = sortSlots(nextSlots);
    const conflictMessage = await hasConflict({
      timetableId: timetable._id,
      date: nextDate,
      collegeId: req.user.college,
      slots: sortedSlots
    });
    if (conflictMessage) {
      return res.status(409).json({ success: false, message: conflictMessage });
    }

    timetable.classLabel = String(req.body.classLabel || timetable.classLabel).trim();
    timetable.date = nextDate;
    timetable.isPublished = Boolean(req.body.isPublished ?? timetable.isPublished);
    timetable.slots = sortedSlots;
    await timetable.save();

    if (timetable.isPublished) {
      emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_PUBLISHED", {
        timetableId: String(timetable._id),
        classLabel: timetable.classLabel,
        date: timetable.date,
        slots: timetable.slots.length
      });
    }

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "UPDATE",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { date: timetable.date, isPublished: timetable.isPublished, slots: timetable.slots.length }
    });

    return res.json({ success: true, timetable });
  } catch (error) {
    console.error("updateTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to update timetable" });
  }
};

const duplicateTimetable = async (req, res) => {
  try {
    const timetableId = req.params.timetableId || req.body.timetableId;
    const targetDate = parseDateKey(req.body.targetDate);

    if (!timetableId || !targetDate) {
      return res.status(400).json({ success: false, message: "timetableId and targetDate are required" });
    }

    const source = await Timetable.findById(timetableId);
    if (!source || !source.isActive) {
      return res.status(404).json({ success: false, message: "Source timetable not found" });
    }

    if (String(source.college) !== String(req.user.college || "")) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    const existing = await Timetable.findOne({
      batchKey: source.batchKey,
      date: targetDate,
      isActive: true
    }).select("_id");

    if (existing) {
      return res.status(409).json({ success: false, message: "Timetable already exists for the selected date" });
    }

    const slots = sortSlots(
      (source.slots || []).map((slot, index) => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        subject: slot.subject,
        teacherName: slot.teacherName,
        teacherId: slot.teacherId || null,
        type: slot.type,
        notes: slot.notes,
        order: Number(slot.order ?? index)
      }))
    );

    const conflictMessage = await hasConflict({
      date: targetDate,
      collegeId: req.user.college,
      slots
    });
    if (conflictMessage) {
      return res.status(409).json({ success: false, message: conflictMessage });
    }

    const duplicate = await Timetable.create({
      classLabel: String(req.body.classLabel || source.classLabel).trim(),
      date: targetDate,
      department: source.department,
      college: source.college,
      batchKey: source.batchKey,
      year: source.year,
      division: source.division,
      slots,
      createdBy: req.user._id,
      isPublished: Boolean(req.body.isPublished ?? source.isPublished)
    });

    if (duplicate.isPublished) {
      emitToCollegeRoom(String(req.user.college || ""), `batch_${duplicate.batchKey}`, "TIMETABLE_PUBLISHED", {
        timetableId: String(duplicate._id),
        classLabel: duplicate.classLabel,
        date: duplicate.date,
        slots: duplicate.slots.length
      });
    }

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: duplicate.isPublished ? "DUPLICATE_PUBLISH" : "DUPLICATE_DRAFT",
      entityType: "Timetable",
      entityId: duplicate._id,
      metadata: { sourceTimetableId: String(source._id), targetDate, slots: duplicate.slots.length }
    });

    return res.status(201).json({ success: true, timetable: duplicate });
  } catch (error) {
    console.error("duplicateTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to duplicate timetable" });
  }
};

const listTimetableTemplates = async (req, res) => {
  try {
    const context = buildBatchContext(req, req.query);
    const batchKey = context?.batchKey || String(req.query.batchKey || "").trim();

    if (!batchKey) {
      return res.status(400).json({ success: false, message: "batchKey is required" });
    }

    const templates = await TimetableTemplate.find({
      batchKey,
      college: req.user.college,
      isActive: true
    })
      .sort({ weekday: 1, createdAt: -1 })
      .populate("slots.teacherId", "name email");

    return res.json({ success: true, templates });
  } catch (error) {
    console.error("listTimetableTemplates error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch timetable templates" });
  }
};

const createTimetableTemplate = async (req, res) => {
  try {
    const { templateName, weekday, slots } = req.body;
    const context = buildBatchContext(req, req.body);

    if (!context) {
      return res.status(400).json({ success: false, message: "year, division and department are required" });
    }

    if (!templateName || !Array.isArray(slots) || !slots.length) {
      return res.status(400).json({ success: false, message: "templateName and slots are required" });
    }

    const weekdayNumber = Number(weekday);
    if (!Number.isInteger(weekdayNumber) || weekdayNumber < 0 || weekdayNumber > 6) {
      return res.status(400).json({ success: false, message: "weekday must be between 0 and 6" });
    }

    const normalizedSlots = [];
    for (let index = 0; index < slots.length; index += 1) {
      const result = await normalizeSlot(slots[index], index, req.user.college);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message });
      }
      normalizedSlots.push(result.slot);
    }

    const template = await TimetableTemplate.create({
      templateName: String(templateName).trim(),
      classLabel: context.classLabel,
      weekday: weekdayNumber,
      department: context.department,
      college: req.user.college,
      batchKey: context.batchKey,
      year: context.year,
      division: context.division,
      slots: sortSlots(normalizedSlots),
      createdBy: req.user._id
    });

    await logAudit({
      actor: req.user,
      module: "timetable-template",
      action: "CREATE",
      entityType: "TimetableTemplate",
      entityId: template._id,
      metadata: { batchKey: context.batchKey, weekday: weekdayNumber, slots: template.slots.length }
    });

    return res.status(201).json({ success: true, template });
  } catch (error) {
    console.error("createTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to create timetable template" });
  }
};

const updateTimetableTemplate = async (req, res) => {
  try {
    const templateId = req.params.templateId;
    const template = await TimetableTemplate.findById(templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    if (String(template.college) !== String(req.user.college || "")) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    if (req.body.weekday !== undefined) {
      const weekdayNumber = Number(req.body.weekday);
      if (!Number.isInteger(weekdayNumber) || weekdayNumber < 0 || weekdayNumber > 6) {
        return res.status(400).json({ success: false, message: "weekday must be between 0 and 6" });
      }
      template.weekday = weekdayNumber;
    }

    if (req.body.templateName) {
      template.templateName = String(req.body.templateName).trim();
    }

    if (req.body.classLabel) {
      template.classLabel = String(req.body.classLabel).trim();
    }

    if (Array.isArray(req.body.slots)) {
      const nextSlots = [];
      for (let index = 0; index < req.body.slots.length; index += 1) {
        const result = await normalizeSlot(req.body.slots[index], index, req.user.college);
        if (!result.ok) {
          return res.status(400).json({ success: false, message: result.message });
        }
        nextSlots.push(result.slot);
      }
      template.slots = sortSlots(nextSlots);
    }

    await template.save();

    await logAudit({
      actor: req.user,
      module: "timetable-template",
      action: "UPDATE",
      entityType: "TimetableTemplate",
      entityId: template._id,
      metadata: { weekday: template.weekday, slots: template.slots.length }
    });

    return res.json({ success: true, template });
  } catch (error) {
    console.error("updateTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to update timetable template" });
  }
};

const deleteTimetableTemplate = async (req, res) => {
  try {
    const template = await TimetableTemplate.findById(req.params.templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    template.isActive = false;
    await template.save();

    await logAudit({
      actor: req.user,
      module: "timetable-template",
      action: "DELETE",
      entityType: "TimetableTemplate",
      entityId: template._id,
      metadata: { batchKey: template.batchKey, weekday: template.weekday }
    });

    return res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    console.error("deleteTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable template" });
  }
};

const applyTimetableTemplate = async (req, res) => {
  try {
    const template = await TimetableTemplate.findById(req.params.templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    if (String(template.college) !== String(req.user.college || "")) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    const startDate = parseDateKey(req.body.startDate);
    const endDate = parseDateKey(req.body.endDate || req.body.startDate);
    const publish = Boolean(req.body.isPublished ?? true);

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "startDate and endDate are required" });
    }

    const dates = [];
    iterateDateRange(startDate, endDate, (current) => {
      if (current.getDay() === template.weekday) {
        dates.push(current.toISOString().split("T")[0]);
      }
    });

    const { created, skipped } = await applyTemplateToDates({
      template,
      reqUser: req.user,
      dateKeys: dates,
      publish
    });

    await logAudit({
      actor: req.user,
      module: "timetable-template",
      action: publish ? "APPLY_PUBLISH" : "APPLY_DRAFT",
      entityType: "TimetableTemplate",
      entityId: template._id,
      metadata: { startDate, endDate, created: created.length, skipped: skipped.length }
    });

    return res.json({
      success: true,
      message: `Template applied to ${created.length} day(s).`,
      created,
      skipped
    });
  } catch (error) {
    console.error("applyTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to apply timetable template" });
  }
};

const bulkApplyTimetableTemplates = async (req, res) => {
  try {
    const context = buildBatchContext(req, req.body);
    if (!context) {
      return res.status(400).json({ success: false, message: "year, division and department are required" });
    }

    const startDate = parseDateKey(req.body.startDate);
    const endDate = parseDateKey(req.body.endDate || req.body.startDate);
    const publish = Boolean(req.body.isPublished ?? true);

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "startDate and endDate are required" });
    }

    const templates = await TimetableTemplate.find({
      batchKey: context.batchKey,
      college: req.user.college,
      isActive: true
    }).sort({ weekday: 1, createdAt: -1 });

    if (!templates.length) {
      return res.status(404).json({ success: false, message: "No active weekly templates found for this batch" });
    }

    const created = [];
    const skipped = [];

    for (const template of templates) {
      const dateKeys = [];
      iterateDateRange(startDate, endDate, (current) => {
        if (current.getDay() === template.weekday) {
          dateKeys.push(current.toISOString().split("T")[0]);
        }
      });

      const result = await applyTemplateToDates({
        template,
        reqUser: req.user,
        dateKeys,
        publish
      });

      created.push(...result.created.map((item) => ({ ...item, templateName: template.templateName })));
      skipped.push(...result.skipped.map((item) => ({ ...item, templateName: template.templateName })));
    }

    await logAudit({
      actor: req.user,
      module: "timetable-template",
      action: publish ? "BULK_APPLY_PUBLISH" : "BULK_APPLY_DRAFT",
      entityType: "TimetableTemplate",
      entityId: context.batchKey,
      metadata: { batchKey: context.batchKey, startDate, endDate, created: created.length, skipped: skipped.length }
    });

    return res.json({
      success: true,
      message: `Bulk planner applied ${created.length} timetable day(s).`,
      created,
      skipped
    });
  } catch (error) {
    console.error("bulkApplyTimetableTemplates error:", error);
    return res.status(500).json({ success: false, message: "Failed to bulk apply timetable templates" });
  }
};

const deleteTimetable = async (req, res) => {
  try {
    const timetableId = req.params.timetableId || req.body.timetableId;
    const timetable = await Timetable.findById(timetableId);

    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    timetable.isActive = false;
    await timetable.save();

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "DELETE",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { date: timetable.date, batchKey: timetable.batchKey }
    });

    return res.json({ success: true, message: "Timetable deleted" });
  } catch (error) {
    console.error("deleteTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable" });
  }
};

const getClassTimetable = async (req, res) => {
  try {
    const classKey = String(req.params.classKey || "").trim();
    const dateKey = parseDateKey(req.query.date || new Date());

    if (!classKey) {
      return res.status(400).json({ success: false, message: "classKey is required" });
    }

    const timetable = await Timetable.findOne({
      batchKey: classKey,
      date: dateKey,
      isPublished: true,
      isActive: true,
      college: req.user.college
    }).populate("slots.teacherId", "name email");

    if (!timetable) {
      return res.status(404).json({ success: false, message: "No published timetable found" });
    }

    return res.json({ success: true, timetable });
  } catch (error) {
    console.error("getClassTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch class timetable" });
  }
};

const getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.params.teacherId === "me" ? String(req.user._id) : String(req.params.teacherId || "");
    const dateKey = parseDateKey(req.query.date || new Date());

    const timetables = await Timetable.find({
      date: dateKey,
      isPublished: true,
      isActive: true,
      college: req.user.college,
      $or: [
        { "slots.teacherId": teacherId },
        { "slots.teacherName": req.user.name }
      ]
    }).lean();

    const rows = [];
    timetables.forEach((timetable) => {
      (timetable.slots || []).forEach((slot) => {
        const matches =
          (slot.teacherId && String(slot.teacherId) === teacherId) ||
          String(slot.teacherName || "").trim() === String(req.user.name || "").trim();

        if (!matches) return;
        rows.push({
          timetableId: timetable._id,
          classLabel: timetable.classLabel,
          date: timetable.date,
          slot
        });
      });
    });

    rows.sort((first, second) => toMinutes(first.slot.startTime) - toMinutes(second.slot.startTime));

    return res.json({ success: true, lectures: rows });
  } catch (error) {
    console.error("getTeacherTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch teacher timetable" });
  }
};

const getBatchWeeklyTimetable = async (req, res) => {
  try {
    const batchKey = req.user.role === "student"
      ? getBatchKey({
          department: req.user.department,
          year: req.user.year,
          division: req.user.division
        })
      : String(req.query.batchKey || "").trim();

    if (!batchKey) {
      return res.status(400).json({ success: false, message: "batchKey is required" });
    }

    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startKey = start.toISOString().split("T")[0];
    const endKey = end.toISOString().split("T")[0];

    const timetables = await Timetable.find({
      batchKey,
      date: { $gte: startKey, $lte: endKey },
      isPublished: true,
      isActive: true,
      college: req.user.college
    })
      .sort({ date: 1 })
      .populate("slots.teacherId", "name email");

    return res.json({ success: true, timetables });
  } catch (error) {
    console.error("getBatchWeeklyTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch weekly timetable" });
  }
};

const exportTimetablePdf = async (req, res) => {
  try {
    const timetableId = String(req.params.timetableId || "").trim();
    if (!timetableId) {
      return res.status(400).json({ success: false, message: "timetableId is required" });
    }

    const timetable = await Timetable.findById(timetableId).populate("slots.teacherId", "name email");
    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    if (String(timetable.college) !== String(req.user.college || "")) {
      return res.status(403).json({ success: false, message: "Cross-college access denied" });
    }

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=timetable_${timetable.classLabel}_${timetable.date}.pdf`
    );

    doc.pipe(res);
    doc.fontSize(20).text("VisionAttend Timetable", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Class: ${timetable.classLabel}`);
    doc.text(`Date: ${timetable.date}`);
    doc.text(`Status: ${timetable.isPublished ? "Published" : "Draft"}`);
    doc.moveDown();

    const startX = 40;
    const colWidths = [110, 140, 120, 70, 115];
    const headers = ["Time", "Subject", "Teacher", "Type", "Notes"];
    let cursorY = doc.y;

    const drawRow = (cells, y, header = false) => {
      let x = startX;
      cells.forEach((cell, index) => {
        doc
          .rect(x, y, colWidths[index], header ? 26 : 34)
          .fillAndStroke(header ? "#e2e8f0" : "#ffffff", "#cbd5e1");
        doc
          .fillColor("#0f172a")
          .fontSize(header ? 10 : 9)
          .text(String(cell || "-"), x + 6, y + 8, {
            width: colWidths[index] - 12,
            ellipsis: true
          });
        x += colWidths[index];
      });
    };

    drawRow(headers, cursorY, true);
    cursorY += 26;

    timetable.slots.forEach((slot) => {
      if (cursorY > 740) {
        doc.addPage();
        cursorY = 40;
        drawRow(headers, cursorY, true);
        cursorY += 26;
      }

      const teacherRef = slot.teacherId && typeof slot.teacherId === "object" ? slot.teacherId.name : "";
      drawRow(
        [
          `${slot.startTime}${slot.endTime ? ` - ${slot.endTime}` : " onwards"}`,
          slot.subject,
          teacherRef || slot.teacherName || "-",
          slot.type,
          slot.notes || "-"
        ],
        cursorY
      );
      cursorY += 34;
    });

    doc.end();
  } catch (error) {
    console.error("exportTimetablePdf error:", error);
    return res.status(500).json({ success: false, message: "Failed to export timetable PDF" });
  }
};

module.exports = {
  createTimetable,
  updateTimetable,
  duplicateTimetable,
  listTimetableTemplates,
  createTimetableTemplate,
  updateTimetableTemplate,
  deleteTimetableTemplate,
  applyTimetableTemplate,
  bulkApplyTimetableTemplates,
  deleteTimetable,
  getClassTimetable,
  getTeacherTimetable,
  getBatchWeeklyTimetable,
  exportTimetablePdf
};
