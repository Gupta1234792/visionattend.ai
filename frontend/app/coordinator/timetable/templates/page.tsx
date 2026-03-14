"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, CopyPlus, Plus, Save, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import {
  applyTimetableTemplate,
  bulkApplyTimetableTemplates,
  createTimetableTemplate,
  deleteTimetableTemplate,
  getTimetableTemplates,
  TimetableSlotInput,
  TimetableTemplate,
  updateTimetableTemplate
} from "@/src/services/timetable";

type BuilderSlot = TimetableSlotInput & { key: string };
type SubjectRow = {
  _id: string;
  name: string;
  code: string;
  teacher?: { _id?: string; name?: string };
};

const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const createEmptySlot = (): BuilderSlot => ({
  key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  startTime: "",
  endTime: "",
  subject: "",
  teacherName: "",
  teacherId: "",
  type: "theory",
  notes: "",
});

const todayKey = () => new Date().toISOString().split("T")[0];

const buildQuickRanges = () => {
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const nextWeekStart = new Date(today);
  nextWeekStart.setDate(today.getDate() + mondayOffset + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

  const toKey = (value: Date) => value.toISOString().split("T")[0];

  return {
    nextWeek: { startDate: toKey(nextWeekStart), endDate: toKey(nextWeekEnd) },
    currentMonth: { startDate: toKey(currentMonthStart), endDate: toKey(currentMonthEnd) },
    nextMonth: { startDate: toKey(nextMonthStart), endDate: toKey(nextMonthEnd) }
  };
};

export default function TimetableTemplatesPage() {
  const { user } = useAuth();
  const [templateName, setTemplateName] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [slots, setSlots] = useState<BuilderSlot[]>([createEmptySlot()]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [templates, setTemplates] = useState<TimetableTemplate[]>([]);
  const [editingId, setEditingId] = useState("");
  const [applyRange, setApplyRange] = useState<Record<string, { startDate: string; endDate: string }>>({});
  const [bulkPlanner, setBulkPlanner] = useState(() => ({ ...buildQuickRanges().nextWeek }));
  const [message, setMessage] = useState("Create a weekly template, then apply it across a date range.");

  const year = String(user?.year || "TY");
  const division = String(user?.division || "A");
  const batchKey = useMemo(
    () => (user?.department ? `${user.department}_${year}_${division}` : ""),
    [user?.department, year, division]
  );

  useEffect(() => {
    if (!classLabel) {
      setClassLabel(`${year}-${division}`);
    }
  }, [classLabel, division, year]);

  const loadTemplates = async () => {
    if (!batchKey) return;
    try {
      const res = await getTimetableTemplates(batchKey);
      const rows = res.templates || [];
      setTemplates(rows);
      setApplyRange(
        rows.reduce<Record<string, { startDate: string; endDate: string }>>((acc, row) => {
          const today = todayKey();
          acc[row._id] = { startDate: today, endDate: today };
          return acc;
        }, {})
      );
    } catch {
      setTemplates([]);
    }
  };

  useEffect(() => {
    const load = async () => {
      await loadTemplates();
      try {
        const res = await api.get("/subjects/mine");
        setSubjects(res.data?.subjects || []);
      } catch {
        setSubjects([]);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey]);

  const updateSlot = (key: string, patch: Partial<BuilderSlot>) => {
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)));
  };

  const normalisedSlots = slots
    .filter((slot) => slot.startTime && slot.subject)
    .map((slot, index) => ({
      startTime: slot.startTime,
      endTime: slot.endTime || "",
      subject: slot.subject.trim(),
      teacherName: slot.teacherName?.trim() || "",
      teacherId: slot.teacherId || "",
      type: slot.type,
      notes: slot.notes?.trim() || "",
      order: index
    }));

  const resetForm = () => {
    setEditingId("");
    setTemplateName("");
    setWeekday(1);
    setSlots([createEmptySlot()]);
  };

  const submit = async () => {
    if (!templateName.trim()) {
      setMessage("Template name is required.");
      return;
    }
    if (!normalisedSlots.length) {
      setMessage("Add at least one valid template slot.");
      return;
    }

    try {
      const payload = {
        templateName: templateName.trim(),
        classLabel: classLabel.trim() || `${year}-${division}`,
        year,
        division,
        weekday,
        slots: normalisedSlots
      };

      const result = editingId
        ? await updateTimetableTemplate(editingId, payload)
        : await createTimetableTemplate(payload);

      if (!result.success) {
        setMessage(result.message || "Failed to save weekly template.");
        return;
      }

      resetForm();
      setMessage("Weekly template saved.");
      await loadTemplates();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to save weekly template.");
    }
  };

  const hydrate = (template: TimetableTemplate) => {
    setEditingId(template._id);
    setTemplateName(template.templateName);
    setClassLabel(template.classLabel);
    setWeekday(template.weekday);
    setSlots(
      template.slots.map((slot, index) => {
        const teacherRef = slot.teacherId as string | { _id: string } | undefined;
        return {
          key: slot._id || `${template._id}_${index}`,
          startTime: slot.startTime,
          endTime: slot.endTime || "",
          subject: slot.subject,
          teacherName: slot.teacherName || "",
          teacherId: typeof teacherRef === "string" ? teacherRef : teacherRef?._id || "",
          type: slot.type,
          notes: slot.notes || "",
          order: index
        };
      })
    );
    setMessage(`Editing template ${template.templateName}.`);
  };

  const removeTemplate = async (templateId: string) => {
    try {
      const result = await deleteTimetableTemplate(templateId);
      setMessage(result.message || "Template deleted.");
      await loadTemplates();
    } catch {
      setMessage("Failed to delete template.");
    }
  };

  const applyTemplate = async (templateId: string) => {
    const range = applyRange[templateId];
    if (!range?.startDate || !range?.endDate) {
      setMessage("Choose start and end date first.");
      return;
    }

    try {
      const result = await applyTimetableTemplate(templateId, {
        startDate: range.startDate,
        endDate: range.endDate,
        isPublished: true
      });
      const skipped = result.skipped?.length || 0;
      setMessage(`${result.message || "Template applied."}${skipped ? ` ${skipped} day(s) skipped.` : ""}`);
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to apply template.");
    }
  };

  const applyBulkPlanner = async () => {
    if (!bulkPlanner.startDate || !bulkPlanner.endDate) {
      setMessage("Choose bulk planner start and end date first.");
      return;
    }

    try {
      const result = await bulkApplyTimetableTemplates({
        year,
        division,
        classLabel: classLabel.trim() || `${year}-${division}`,
        startDate: bulkPlanner.startDate,
        endDate: bulkPlanner.endDate,
        isPublished: true
      });
      const skipped = result.skipped?.length || 0;
      setMessage(`${result.message || "Bulk planner applied."}${skipped ? ` ${skipped} day(s) skipped.` : ""}`);
      await loadTemplates();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to apply bulk planner.");
    }
  };

  return (
    <ProtectedRoute allow={["coordinator"]}>
      <DashboardLayout title="Weekly Timetable Templates">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recurring Templates</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Create weekly timetable patterns</h1>
            <p className="mt-2 text-sm text-slate-600">Save a weekday template once and publish it across a whole date range later.</p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                value={classLabel}
                onChange={(e) => setClassLabel(e.target.value)}
                placeholder="Class label"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {weekdays.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 space-y-3">
              {slots.map((slot, index) => (
                <article key={slot.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Template Slot {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setSlots((current) => current.filter((item) => item.key !== slot.key))}
                      className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <input type="time" value={slot.startTime} onChange={(e) => updateSlot(slot.key, { startTime: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                    <input type="time" value={slot.endTime} onChange={(e) => updateSlot(slot.key, { endTime: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                    <select value={slot.type} onChange={(e) => updateSlot(slot.key, { type: e.target.value as BuilderSlot["type"] })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <option value="theory">Theory</option>
                      <option value="practical">Practical</option>
                      <option value="event">Event</option>
                      <option value="break">Break</option>
                    </select>
                    <select
                      value={
                        subjects.find((subject) =>
                          slot.subject.startsWith(subject.name)
                        )?._id || ""
                      }
                      onChange={(e) => {
                        const subject = subjects.find((item) => item._id === e.target.value);
                        if (!subject) return;
                        updateSlot(slot.key, {
                          subject: `${subject.name}${subject.code ? ` (${subject.code})` : ""}`,
                          teacherId: subject.teacher?._id || slot.teacherId,
                          teacherName: subject.teacher?.name || slot.teacherName,
                        });
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <option value="">Pick from subject list</option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.name} {subject.code ? `(${subject.code})` : ""}
                        </option>
                      ))}
                    </select>
                    <input value={slot.subject} onChange={(e) => updateSlot(slot.key, { subject: e.target.value })} placeholder="Subject or session name" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2" />
                    <input value={slot.teacherName} onChange={(e) => updateSlot(slot.key, { teacherName: e.target.value })} placeholder="Teacher name" className="rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                    <textarea value={slot.notes} onChange={(e) => updateSlot(slot.key, { notes: e.target.value })} placeholder="Optional notes" rows={2} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2 xl:col-span-3" />
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSlots((current) => [...current, createEmptySlot()])} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                <Plus className="h-4 w-4" />
                Add Slot
              </button>
              <button type="button" onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-full bg-[#1459d2] px-5 py-2 text-sm font-semibold text-white shadow-sm">
                <Save className="h-4 w-4" />
                Save Template
              </button>
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1459d2] text-white">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bulk Planner</p>
                  <h2 className="text-xl font-semibold text-slate-900">Plan next week or full month</h2>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setBulkPlanner(buildQuickRanges().nextWeek)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Next Week
                </button>
                <button type="button" onClick={() => setBulkPlanner(buildQuickRanges().currentMonth)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Current Month
                </button>
                <button type="button" onClick={() => setBulkPlanner(buildQuickRanges().nextMonth)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Next Month
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  type="date"
                  value={bulkPlanner.startDate || todayKey()}
                  onChange={(e) => setBulkPlanner((current) => ({ ...current, startDate: e.target.value }))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
                <input
                  type="date"
                  value={bulkPlanner.endDate || todayKey()}
                  onChange={(e) => setBulkPlanner((current) => ({ ...current, endDate: e.target.value }))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </div>

              <button type="button" onClick={() => void applyBulkPlanner()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1459d2] px-5 py-2 text-sm font-semibold text-white shadow-sm">
                <CopyPlus className="h-4 w-4" />
                Apply All Templates
              </button>
            </section>

            <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <CalendarRange className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Saved Templates</p>
                  <h2 className="text-xl font-semibold text-slate-900">Apply to date range</h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {templates.map((template) => (
                  <article key={template._id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{template.templateName}</p>
                        <p className="text-xs text-slate-500">{template.classLabel} • {weekdays.find((day) => day.value === template.weekday)?.label}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{template.slots.length} slots</span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {template.slots.slice(0, 3).map((slot) => (
                        <div key={slot._id || `${template._id}-${slot.startTime}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <p className="font-medium">{slot.startTime}{slot.endTime ? ` - ${slot.endTime}` : " onwards"} | {slot.subject}</p>
                          <p className="text-xs text-slate-500">{slot.teacherName || "No teacher"} • {slot.type}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <input
                        type="date"
                        value={applyRange[template._id]?.startDate || ""}
                        onChange={(e) => setApplyRange((current) => ({ ...current, [template._id]: { ...current[template._id], startDate: e.target.value } }))}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                      <input
                        type="date"
                        value={applyRange[template._id]?.endDate || ""}
                        onChange={(e) => setApplyRange((current) => ({ ...current, [template._id]: { ...current[template._id], endDate: e.target.value } }))}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => hydrate(template)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Edit
                      </button>
                      <button type="button" onClick={() => void applyTemplate(template._id)} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        <CopyPlus className="h-4 w-4" />
                        Apply to Range
                      </button>
                      <button type="button" onClick={() => void removeTemplate(template._id)} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {templates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    No weekly templates created yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
