"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Copy,
  FileDown,
  GripVertical,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2
} from "lucide-react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import {
  createTimetable,
  deleteTimetable,
  downloadTimetablePdf,
  duplicateTimetable,
  getWeeklyTimetable,
  Timetable,
  TimetableSlotInput,
  updateTimetable,
} from "@/src/services/timetable";

type TeacherRow = { _id: string; name: string; email: string };
type SubjectRow = {
  _id: string;
  name: string;
  code: string;
  teacher?: { _id?: string; name?: string; email?: string };
};

type BuilderSlot = TimetableSlotInput & { key: string };

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

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const getNextDate = (value?: string) => {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + 1);
  return base.toISOString().split("T")[0];
};

export default function CoordinatorTimetableBuilderPage() {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [classLabel, setClassLabel] = useState("");
  const [slots, setSlots] = useState<BuilderSlot[]>([createEmptySlot()]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [weeklyRows, setWeeklyRows] = useState<Timetable[]>([]);
  const [duplicateDates, setDuplicateDates] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Build a timetable draft, then publish it to students and teachers.");
  const [editingId, setEditingId] = useState("");
  const [draggingKey, setDraggingKey] = useState("");

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

  const loadWeeklyRows = async () => {
    const refreshed = await getWeeklyTimetable(batchKey);
    const rows = refreshed.timetables || [];
    setWeeklyRows(rows);
    setDuplicateDates(
      rows.reduce<Record<string, string>>((acc, row) => {
        acc[row._id] = getNextDate(row.date);
        return acc;
      }, {})
    );
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [teacherRes, subjectRes] = await Promise.all([
          api.get("/teachers"),
          api.get("/subjects/mine"),
          loadWeeklyRows()
        ]);
        setTeachers(teacherRes.data?.teachers || []);
        setSubjects(subjectRes.data?.subjects || []);
      } catch {
        setTeachers([]);
        setSubjects([]);
        setWeeklyRows([]);
      }
    };

    if (batchKey) {
      void load();
    }
  }, [batchKey]);

  const updateSlot = (key: string, patch: Partial<BuilderSlot>) => {
    setSlots((current) =>
      current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot))
    );
  };

  const reorderSlots = (fromKey: string, toKey: string) => {
    setSlots((current) => {
      const fromIndex = current.findIndex((slot) => slot.key === fromKey);
      const toIndex = current.findIndex((slot) => slot.key === toKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const updated = [...current];
      const [item] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, item);
      return updated;
    });
  };

  const moveSlot = (key: string, direction: -1 | 1) => {
    setSlots((current) => {
      const index = current.findIndex((slot) => slot.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const updated = [...current];
      const [item] = updated.splice(index, 1);
      updated.splice(nextIndex, 0, item);
      return updated;
    });
  };

  const autoSortSlotsByTime = () => {
    setSlots((current) =>
      [...current].sort((first, second) => {
        if (!first.startTime) return 1;
        if (!second.startTime) return -1;
        return first.startTime.localeCompare(second.startTime);
      })
    );
    setMessage("Slots auto-sorted by start time.");
  };

  const hydrateForm = (timetable: Timetable) => {
    setEditingId(timetable._id);
    setDate(timetable.date);
    setClassLabel(timetable.classLabel);
    setSlots(
      timetable.slots.map((slot, index) => {
        const teacherRef = slot.teacherId as
          | string
          | { _id: string; name?: string; email?: string }
          | undefined;
        const teacherId = typeof teacherRef === "string" ? teacherRef : teacherRef?._id || "";

        return {
          key: slot._id || `${timetable._id}_${index}`,
          startTime: slot.startTime,
          endTime: slot.endTime || "",
          subject: slot.subject,
          teacherName: slot.teacherName || "",
          teacherId,
          type: slot.type,
          notes: slot.notes || "",
          order: index,
        };
      })
    );
    setMessage(`Editing ${timetable.classLabel} timetable for ${timetable.date}.`);
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
      order: index,
    }));

  const submit = async (publish: boolean) => {
    if (!date) {
      setMessage("Select timetable date first.");
      return;
    }

    if (!normalisedSlots.length) {
      setMessage("Add at least one valid timetable slot.");
      return;
    }

    try {
      const payload = {
        classLabel: classLabel.trim() || `${year}-${division}`,
        year,
        division,
        date,
        slots: normalisedSlots,
        isPublished: publish,
      };

      const result = editingId
        ? await updateTimetable(editingId, payload)
        : await createTimetable(payload);

      if (!result.success) {
        setMessage(result.message || "Failed to save timetable.");
        return;
      }

      setMessage(publish ? "Timetable published successfully." : "Timetable saved as draft.");
      setEditingId("");
      setDate("");
      setSlots([createEmptySlot()]);
      await loadWeeklyRows();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to save timetable.");
    }
  };

  const removeTimetableRow = async (id: string) => {
    try {
      const result = await deleteTimetable(id);
      setMessage(result.message || "Timetable deleted.");
      await loadWeeklyRows();
    } catch {
      setMessage("Failed to delete timetable.");
    }
  };

  const duplicateRow = async (row: Timetable, publish: boolean) => {
    const targetDate = duplicateDates[row._id];
    if (!targetDate) {
      setMessage("Choose a target date first.");
      return;
    }

    try {
      const result = await duplicateTimetable(row._id, {
        targetDate,
        classLabel: row.classLabel,
        isPublished: publish
      });

      if (!result.success) {
        setMessage(result.message || "Failed to duplicate timetable.");
        return;
      }

      setMessage(publish ? "Timetable duplicated and published." : "Timetable duplicated as draft.");
      await loadWeeklyRows();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to duplicate timetable.");
    }
  };

  const exportPdf = async (row: Timetable) => {
    try {
      const blob = await downloadTimetablePdf(row._id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `timetable_${row.classLabel}_${row.date}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Timetable PDF exported.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to export timetable PDF.");
    }
  };

  return (
    <ProtectedRoute allow={["coordinator"]}>
      <DashboardLayout title="Smart Timetable Builder">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[1.9rem] border border-white/60 bg-white/65 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Coordinator Tool</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-900">Daily timetable builder</h1>
                <p className="mt-2 text-sm text-slate-600">Drag slots into order, duplicate timetable plans, and export printable PDF sheets for class circulation.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold">{classLabel || `${year}-${division}`}</p>
                <p>{date || "No date selected"}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Class Label</span>
                <input
                  value={classLabel}
                  onChange={(e) => setClassLabel(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  placeholder="TY-IT"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSlots((current) => [...current, createEmptySlot()])} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                <Plus className="h-4 w-4" />
                Add Slot
              </button>
              <button type="button" onClick={autoSortSlotsByTime} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                <Sparkles className="h-4 w-4" />
                Auto-sort by time
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {slots.map((slot, index) => (
                <article
                  key={slot.key}
                  draggable
                  onDragStart={() => setDraggingKey(slot.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingKey) {
                      reorderSlots(draggingKey, slot.key);
                      setDraggingKey("");
                    }
                  }}
                  onDragEnd={() => setDraggingKey("")}
                  className={`rounded-[1.6rem] border bg-white/80 p-4 shadow-sm transition ${
                    draggingKey === slot.key ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 cursor-grab items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Slot {index + 1}</p>
                        <p className="text-sm text-slate-600">Theory, practical, event, break, or special session.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => moveSlot(slot.key, -1)} className="rounded-xl border border-slate-200 p-2 text-slate-600">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => moveSlot(slot.key, 1)} className="rounded-xl border border-slate-200 p-2 text-slate-600">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setSlots((current) => current.filter((item) => item.key !== slot.key))} className="rounded-xl border border-rose-200 p-2 text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                    <input value={slot.subject} onChange={(e) => updateSlot(slot.key, { subject: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2" placeholder="Custom subject or session name" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={slot.teacherId || ""}
                        onChange={(e) => {
                          const teacherId = e.target.value;
                          const teacher = teachers.find((item) => item._id === teacherId);
                          updateSlot(slot.key, { teacherId, teacherName: teacher?.name || slot.teacherName });
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <option value="">Select teacher account</option>
                        {teachers.map((teacher) => (
                          <option key={teacher._id} value={teacher._id}>
                            {teacher.name}
                          </option>
                        ))}
                      </select>
                      <input value={slot.teacherName} onChange={(e) => updateSlot(slot.key, { teacherName: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3" placeholder="Teacher name" />
                    </div>
                    <textarea value={slot.notes} onChange={(e) => updateSlot(slot.key, { notes: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2 xl:col-span-3" placeholder="Optional notes" rows={2} />
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => void submit(false)} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              <button type="button" onClick={() => void submit(true)} className="inline-flex items-center gap-2 rounded-full bg-[#1459d2] px-5 py-2 text-sm font-semibold text-white shadow-sm">
                <Send className="h-4 w-4" />
                Publish Timetable
              </button>
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/60 bg-white/65 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Published This Week</p>
                <h2 className="text-xl font-semibold text-slate-900">Timetable history</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {weeklyRows.map((row) => (
                <article key={row._id} className="rounded-[1.4rem] border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.classLabel}</p>
                      <p className="text-xs text-slate-500">{formatDate(row.date)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {row.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {row.slots.map((slot, index) => (
                      <div key={`${row._id}_${index}`} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="font-medium">{slot.startTime}{slot.endTime ? ` - ${slot.endTime}` : " onwards"} | {slot.subject}</p>
                        <p className="text-xs text-slate-500">{slot.teacherName || "No teacher"} • {slot.type}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                      <input
                        type="date"
                        value={duplicateDates[row._id] || ""}
                        onChange={(e) => setDuplicateDates((current) => ({ ...current, [row._id]: e.target.value }))}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                      <button type="button" onClick={() => void duplicateRow(row, false)} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                        <Copy className="h-4 w-4" />
                        Duplicate Draft
                      </button>
                      <button type="button" onClick={() => void duplicateRow(row, true)} className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <Copy className="h-4 w-4" />
                        Duplicate + Publish
                      </button>
                      <button type="button" onClick={() => void exportPdf(row)} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                        <FileDown className="h-4 w-4" />
                        Export PDF
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => hydrateForm(row)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Edit
                      </button>
                      <button type="button" onClick={() => void removeTimetableRow(row._id)} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {weeklyRows.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  No timetable created this week.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
