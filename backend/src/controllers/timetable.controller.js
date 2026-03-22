const PDFDocument = require("pdfkit");
const Timetable = require("../models/Timetable.model");
const TimetableTemplate = require("../models/TimetableTemplate.model");
const Department = require("../models/Department.model");
const { logAudit } = require("../utils/audit");
const { emitToCollegeRoom } = require("../sockets/gateway");

const parseBatchKey = (batchKey) => {
  const parts = String(batchKey || "").split("_");
  if (parts.length !== 3) return null;
  return {
    department: parts[0],
    year: parts[1],
    division: parts[2]
  };
};

const resolveBatchVariants = ({ department, year, division }) => {
  return [`${department}_${year}_${division}`, `${year}_${division}`];
};

const sortSlots = (slots = []) =>
  [...slots]
    .map((slot, index) => ({
      startTime: String(slot.startTime || "").trim(),
      endTime: String(slot.endTime || "").trim(),
      subject: String(slot.subject || "").trim(),
      teacherName: String(slot.teacherName || slot.teacher || "").trim(),
      teacherId: slot.teacherId || null,
      type: String(slot.type || "theory").trim().toLowerCase(),
      notes: String(slot.notes || "").trim(),
      order: Number.isFinite(Number(slot.order)) ? Number(slot.order) : index
    }))
    .filter((slot) => slot.startTime && slot.subject)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.startTime.localeCompare(b.startTime);
    });

const normalizeSlotType = (value) => {
  const lowered = String(value || "theory").toLowerCase();
  if (["lecture", "theory"].includes(lowered)) return "theory";
  if (["practical", "lab"].includes(lowered)) return "practical";
  if (["event", "custom"].includes(lowered)) return "event";
  if (lowered === "break") return "break";
  return "theory";
};

const mapTimetableResponse = (timetable) => {
  const json = timetable.toObject ? timetable.toObject() : timetable;
  return {
    ...json,
    slots: sortSlots(json.slots || []).map((slot) => ({
      ...slot,
      type: normalizeSlotType(slot.type)
    }))
  };
};

const requireDepartmentContext = async (user, departmentId) => {
  const department = await Department.findById(departmentId).select("_id college");
  if (!department || department.college?.toString() !== user.college?.toString()) {
    return null;
  }
  return department;
};

const validateSlots = (slots) => {
  if (!Array.isArray(slots) || !slots.length) {
    return "At least one lecture slot is required";
  }

  const normalized = sortSlots(slots).map((slot) => ({
    ...slot,
    type: normalizeSlotType(slot.type)
  }));

  for (const slot of normalized) {
    if (!slot.startTime || !slot.subject) {
      return "Each slot must include start time and subject";
    }
  }

  return null;
};

const createTimetable = async (req, res) => {
  try {
    const { classLabel, year, division, date, slots, isPublished } = req.body;
    const departmentId = req.body.department || req.user.department;

    if (!departmentId || !year || !division || !date || !classLabel) {
      return res.status(400).json({ success: false, message: "department, year, division, date and classLabel are required" });
    }

    const department = await requireDepartmentContext(req.user, departmentId);
    if (!department) {
      return res.status(403).json({ success: false, message: "Department access denied" });
    }

    const slotError = validateSlots(slots);
    if (slotError) {
      return res.status(400).json({ success: false, message: slotError });
    }

    const fullBatchKey = `${department._id}_${year}_${division}`;
    const existing = await Timetable.findOne({
      college: req.user.college,
      date,
      isActive: true,
      $or: [
        { batchKey: fullBatchKey },
        { department: department._id, year, division }
      ]
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Timetable already exists for this class and date" });
    }

    const timetable = await Timetable.create({
      classLabel,
      date,
      department: department._id,
      college: req.user.college,
      batchKey: fullBatchKey,
      year,
      division,
      slots: sortSlots(slots).map((slot) => ({
        ...slot,
        type: normalizeSlotType(slot.type)
      })),
      createdBy: req.user._id,
      isPublished: Boolean(isPublished),
      isActive: true
    });

    emitToCollegeRoom(String(req.user.college || ""), `batch_${fullBatchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      batchKey: fullBatchKey,
      date,
      action: "created"
    });

    await logAudit({
      actor: req.user,
      module: "timetable",
      action: "CREATE",
      entityType: "Timetable",
      entityId: timetable._id,
      metadata: { batchKey: fullBatchKey, date }
    });

    return res.status(201).json({ success: true, timetable: mapTimetableResponse(timetable) });
  } catch (error) {
    console.error("createTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to create timetable" });
  }
};

const updateTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.timetableId);
    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    if (timetable.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const slotError = req.body.slots ? validateSlots(req.body.slots) : null;
    if (slotError) {
      return res.status(400).json({ success: false, message: slotError });
    }

    if (req.body.classLabel) timetable.classLabel = req.body.classLabel;
    if (req.body.date) timetable.date = req.body.date;
    if (typeof req.body.isPublished !== "undefined") timetable.isPublished = Boolean(req.body.isPublished);
    if (req.body.slots) {
      timetable.slots = sortSlots(req.body.slots).map((slot) => ({
        ...slot,
        type: normalizeSlotType(slot.type)
      }));
    }

    await timetable.save();

    emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      batchKey: timetable.batchKey,
      date: timetable.date,
      action: "updated"
    });

    return res.json({ success: true, timetable: mapTimetableResponse(timetable) });
  } catch (error) {
    console.error("updateTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to update timetable" });
  }
};

const deleteTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.timetableId);
    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    if (timetable.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    timetable.isActive = false;
    await timetable.save();

    emitToCollegeRoom(String(req.user.college || ""), `batch_${timetable.batchKey}`, "TIMETABLE_UPDATED", {
      timetableId: String(timetable._id),
      batchKey: timetable.batchKey,
      date: timetable.date,
      action: "deleted"
    });

    return res.json({ success: true, message: "Timetable deleted" });
  } catch (error) {
    console.error("deleteTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable" });
  }
};

const duplicateTimetable = async (req, res) => {
  try {
    const source = await Timetable.findById(req.params.timetableId);
    if (!source || !source.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    const targetDate = String(req.body.targetDate || "").trim();
    if (!targetDate) {
      return res.status(400).json({ success: false, message: "targetDate is required" });
    }

    const exists = await Timetable.findOne({
      college: source.college,
      batchKey: source.batchKey,
      date: targetDate,
      isActive: true
    });
    if (exists) {
      return res.status(409).json({ success: false, message: "Target date already has a timetable" });
    }

    const duplicated = await Timetable.create({
      classLabel: req.body.classLabel || source.classLabel,
      date: targetDate,
      department: source.department,
      college: source.college,
      batchKey: source.batchKey,
      year: source.year,
      division: source.division,
      slots: source.slots,
      createdBy: req.user._id,
      isPublished: typeof req.body.isPublished === "undefined" ? source.isPublished : Boolean(req.body.isPublished),
      isActive: true
    });

    return res.status(201).json({ success: true, timetable: mapTimetableResponse(duplicated) });
  } catch (error) {
    console.error("duplicateTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to duplicate timetable" });
  }
};

const getClassTimetable = async (req, res) => {
  try {
    const parsed = parseBatchKey(req.params.classKey);
    if (!parsed) {
      return res.status(400).json({ success: false, message: "Invalid class key" });
    }

    const date = String(req.query.date || new Date().toISOString().split("T")[0]);
    const batchVariants = resolveBatchVariants(parsed);

    const timetable = await Timetable.findOne({
      college: req.user.college,
      date,
      isActive: true,
      $or: [
        { batchKey: { $in: batchVariants } },
        { department: parsed.department, year: parsed.year, division: parsed.division }
      ]
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      timetable: timetable ? mapTimetableResponse(timetable) : null
    });
  } catch (error) {
    console.error("getClassTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch class timetable" });
  }
};

const getTodayTimetable = async (req, res) => {
  try {
    const parsed = parseBatchKey(req.params.batchKey);
    if (!parsed) {
      return res.status(400).json({ success: false, message: "Invalid batch key" });
    }

    const date = new Date().toISOString().split("T")[0];
    const batchVariants = resolveBatchVariants(parsed);

    const timetable = await Timetable.findOne({
      college: req.user.college,
      date,
      isActive: true,
      $or: [
        { batchKey: { $in: batchVariants } },
        { department: parsed.department, year: parsed.year, division: parsed.division }
      ]
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      timetable: timetable ? mapTimetableResponse(timetable) : null
    });
  } catch (error) {
    console.error("getTodayTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch today's timetable" });
  }
};

const getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.params.teacherId === "me" ? String(req.user._id) : String(req.params.teacherId);
    const date = String(req.query.date || new Date().toISOString().split("T")[0]);

    const timetables = await Timetable.find({
      college: req.user.college,
      date,
      isActive: true,
      "slots.teacherId": teacherId
    }).sort({ date: 1, createdAt: -1 });

    const lectures = timetables.flatMap((timetable) => {
      const mapped = mapTimetableResponse(timetable);
      return mapped.slots
        .filter((slot) => {
          const slotTeacherId = typeof slot.teacherId === "string" ? slot.teacherId : slot.teacherId?._id;
          return slotTeacherId === teacherId;
        })
        .map((slot) => ({
          timetableId: mapped._id,
          classLabel: mapped.classLabel,
          date: mapped.date,
          slot
        }));
    });

    return res.json({ success: true, lectures });
  } catch (error) {
    console.error("getTeacherTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch teacher timetable" });
  }
};

const getWeeklyTimetable = async (req, res) => {
  try {
    const parsed = parseBatchKey(req.query.batchKey || "");
    if (!parsed) {
      return res.status(400).json({ success: false, message: "batchKey is required" });
    }

    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const dateFrom = start.toISOString().split("T")[0];
    const dateTo = end.toISOString().split("T")[0];
    const batchVariants = resolveBatchVariants(parsed);

    const timetables = await Timetable.find({
      college: req.user.college,
      date: { $gte: dateFrom, $lte: dateTo },
      isActive: true,
      $or: [
        { batchKey: { $in: batchVariants } },
        { department: parsed.department, year: parsed.year, division: parsed.division }
      ]
    }).sort({ date: 1, createdAt: -1 });

    return res.json({ success: true, timetables: timetables.map(mapTimetableResponse) });
  } catch (error) {
    console.error("getWeeklyTimetable error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch weekly timetable" });
  }
};

const getTimetableTemplates = async (req, res) => {
  try {
    const parsed = parseBatchKey(req.query.batchKey || "");
    if (!parsed) {
      return res.status(400).json({ success: false, message: "batchKey is required" });
    }

    const batchVariants = resolveBatchVariants(parsed);
    const templates = await TimetableTemplate.find({
      college: req.user.college,
      isActive: true,
      $or: [
        { batchKey: { $in: batchVariants } },
        { department: parsed.department, year: parsed.year, division: parsed.division }
      ]
    }).sort({ weekday: 1, createdAt: -1 });

    return res.json({ success: true, templates: templates.map(mapTimetableResponse) });
  } catch (error) {
    console.error("getTimetableTemplates error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch timetable templates" });
  }
};

const createTimetableTemplate = async (req, res) => {
  try {
    const { templateName, classLabel, year, division, weekday, slots } = req.body;
    const departmentId = req.user.department;
    if (!departmentId || !templateName || !classLabel || !year || !division || typeof weekday === "undefined") {
      return res.status(400).json({ success: false, message: "templateName, classLabel, year, division and weekday are required" });
    }

    const slotError = validateSlots(slots);
    if (slotError) {
      return res.status(400).json({ success: false, message: slotError });
    }

    const template = await TimetableTemplate.create({
      templateName,
      classLabel,
      weekday: Number(weekday),
      department: departmentId,
      college: req.user.college,
      batchKey: `${departmentId}_${year}_${division}`,
      year,
      division,
      slots: sortSlots(slots).map((slot) => ({
        ...slot,
        type: normalizeSlotType(slot.type)
      })),
      createdBy: req.user._id,
      isActive: true
    });

    return res.status(201).json({ success: true, template: mapTimetableResponse(template) });
  } catch (error) {
    console.error("createTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to create timetable template" });
  }
};

const updateTimetableTemplate = async (req, res) => {
  try {
    const template = await TimetableTemplate.findById(req.params.templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    if (template.college?.toString() !== req.user.college?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (req.body.templateName) template.templateName = req.body.templateName;
    if (req.body.classLabel) template.classLabel = req.body.classLabel;
    if (typeof req.body.weekday !== "undefined") template.weekday = Number(req.body.weekday);
    if (req.body.slots) {
      const slotError = validateSlots(req.body.slots);
      if (slotError) {
        return res.status(400).json({ success: false, message: slotError });
      }
      template.slots = sortSlots(req.body.slots).map((slot) => ({
        ...slot,
        type: normalizeSlotType(slot.type)
      }));
    }

    await template.save();
    return res.json({ success: true, template: mapTimetableResponse(template) });
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
    return res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    console.error("deleteTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete timetable template" });
  }
};

const applyTemplateForRange = async (template, startDate, endDate, actorId, isPublished) => {
  const created = [];
  const skipped = [];
  const current = new Date(startDate);
  const last = new Date(endDate);

  while (current <= last) {
    if (current.getDay() === Number(template.weekday)) {
      const date = current.toISOString().split("T")[0];
      const existing = await Timetable.findOne({
        college: template.college,
        batchKey: template.batchKey,
        date,
        isActive: true
      });

      if (existing) {
        skipped.push({ date, reason: "Timetable already exists" });
      } else {
        const timetable = await Timetable.create({
          classLabel: template.classLabel,
          date,
          department: template.department,
          college: template.college,
          batchKey: template.batchKey,
          year: template.year,
          division: template.division,
          slots: template.slots,
          createdBy: actorId,
          isPublished: Boolean(isPublished),
          isActive: true
        });
        created.push({ id: String(timetable._id), date });
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return { created, skipped };
};

const applyTimetableTemplate = async (req, res) => {
  try {
    const template = await TimetableTemplate.findById(req.params.templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const { startDate, endDate, isPublished } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "startDate and endDate are required" });
    }

    const result = await applyTemplateForRange(template, startDate, endDate, req.user._id, isPublished);
    return res.json({
      success: true,
      message: `Created ${result.created.length} timetable day(s)`,
      ...result
    });
  } catch (error) {
    console.error("applyTimetableTemplate error:", error);
    return res.status(500).json({ success: false, message: "Failed to apply timetable template" });
  }
};

const bulkApplyTimetableTemplates = async (req, res) => {
  try {
    const departmentId = req.user.department;
    const { year, division, startDate, endDate, isPublished } = req.body;
    if (!departmentId || !year || !division || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "year, division, startDate and endDate are required" });
    }

    const templates = await TimetableTemplate.find({
      college: req.user.college,
      department: departmentId,
      year,
      division,
      isActive: true
    });

    const created = [];
    const skipped = [];

    for (const template of templates) {
      const result = await applyTemplateForRange(template, startDate, endDate, req.user._id, isPublished);
      created.push(...result.created.map((row) => ({ ...row, templateName: template.templateName })));
      skipped.push(...result.skipped.map((row) => ({ ...row, templateName: template.templateName })));
    }

    return res.json({
      success: true,
      message: `Created ${created.length} timetable day(s) from ${templates.length} template(s)`,
      created,
      skipped
    });
  } catch (error) {
    console.error("bulkApplyTimetableTemplates error:", error);
    return res.status(500).json({ success: false, message: "Failed to bulk apply templates" });
  }
};

const downloadTimetablePdf = async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.timetableId);
    if (!timetable || !timetable.isActive) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }

    const mapped = mapTimetableResponse(timetable);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="timetable-${mapped.date}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text(mapped.classLabel);
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Date: ${mapped.date}`);
    doc.text(`Batch: ${mapped.year}-${mapped.division}`);
    doc.moveDown();

    mapped.slots.forEach((slot, index) => {
      doc.fontSize(12).text(`${index + 1}. ${slot.startTime}${slot.endTime ? ` - ${slot.endTime}` : ""}`);
      doc.fontSize(11).text(`${slot.subject} | ${slot.teacherName || "No teacher"} | ${slot.type}`);
      if (slot.notes) doc.text(slot.notes);
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (error) {
    console.error("downloadTimetablePdf error:", error);
    return res.status(500).json({ success: false, message: "Failed to export timetable" });
  }
};

module.exports = {
  createTimetable,
  updateTimetable,
  deleteTimetable,
  duplicateTimetable,
  getClassTimetable,
  getTodayTimetable,
  getTeacherTimetable,
  getWeeklyTimetable,
  getTimetableTemplates,
  createTimetableTemplate,
  updateTimetableTemplate,
  deleteTimetableTemplate,
  applyTimetableTemplate,
  bulkApplyTimetableTemplates,
  downloadTimetablePdf
};
