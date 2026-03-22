"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/src/context/auth-context";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { createTimetable, TimetableSlotInput } from "@/src/services/timetable";

type PlannerSlot = TimetableSlotInput & { key: string };

const createSlot = (): PlannerSlot => ({
  key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  startTime: "",
  endTime: "",
  subject: "",
  teacherName: "",
  type: "theory",
  notes: ""
});

const todayKey = () => new Date().toISOString().split("T")[0];

export default function CoordinatorTimetablePage() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayKey());
  const [classLabel, setClassLabel] = useState(`${user?.year || "TY"}-${user?.division || "A"}`);
  const [slots, setSlots] = useState<PlannerSlot[]>([createSlot()]);
  const [message, setMessage] = useState("Create today’s lecture schedule for your class.");
  const [saving, setSaving] = useState(false);

  const year = String(user?.year || "TY");
  const division = String(user?.division || "A");
  const activeSlotCount = useMemo(
    () => slots.filter((slot) => slot.startTime && slot.subject).length,
    [slots]
  );

  const updateSlot = (key: string, patch: Partial<PlannerSlot>) => {
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)));
  };

  const removeSlot = (key: string) => {
    setSlots((current) => (current.length === 1 ? current : current.filter((slot) => slot.key !== key)));
  };

  const submit = async () => {
    if (!user?.department) {
      setMessage("Coordinator department mapping is missing.");
      return;
    }

    const normalized = slots
      .filter((slot) => slot.startTime && slot.subject)
      .map((slot, index) => ({
        startTime: slot.startTime,
        endTime: slot.endTime || "",
        subject: slot.subject.trim(),
        teacherName: slot.teacherName?.trim() || "",
        type: slot.type,
        notes: slot.notes?.trim() || "",
        order: index
      }));

    if (!normalized.length) {
      setMessage("Add at least one lecture slot before publishing.");
      return;
    }

    try {
      setSaving(true);
      await createTimetable({
        classLabel: classLabel.trim() || `${year}-${division}`,
        year,
        division,
        date,
        slots: normalized,
        isPublished: true
      });
      setMessage("Daily lecture schedule published successfully.");
      setSlots([createSlot()]);
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to publish daily schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allow={["coordinator", "admin"]}>
      <DashboardLayout title="Daily Lecture Planner">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[1.8rem] border border-white/60 bg-white/75 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Daily Lecture System</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Publish today’s class schedule</h1>
            <p className="mt-2 text-sm text-slate-600">Students and teachers will see the live daily plan from this published schedule.</p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              />
              <input
                value={classLabel}
                onChange={(e) => setClassLabel(e.target.value)}
                placeholder="Class label"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div className="mt-5 space-y-3">
              {slots.map((slot, index) => (
                <article key={slot.key} className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Slot {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.key)}
                      className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input type="time" value={slot.startTime} onChange={(e) => updateSlot(slot.key, { startTime: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                    <input type="time" value={slot.endTime} onChange={(e) => updateSlot(slot.key, { endTime: e.target.value })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                    <select value={slot.type} onChange={(e) => updateSlot(slot.key, { type: e.target.value as PlannerSlot["type"] })} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      <option value="theory">Lecture</option>
                      <option value="practical">Practical</option>
                      <option value="break">Break</option>
                      <option value="event">Event</option>
                    </select>
                    <input value={slot.teacherName} onChange={(e) => updateSlot(slot.key, { teacherName: e.target.value })} placeholder="Teacher name" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                  </div>

                  <div className="mt-3 grid gap-3">
                    <input value={slot.subject} onChange={(e) => updateSlot(slot.key, { subject: e.target.value })} placeholder="Subject or session name" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                    <input value={slot.notes} onChange={(e) => updateSlot(slot.key, { notes: e.target.value })} placeholder="Optional note" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSlots((current) => [...current, createSlot()])} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                <Plus className="h-4 w-4" />
                Add Slot
              </button>
              <button type="button" onClick={() => void submit()} disabled={saving} className="rounded-full bg-[#1459d2] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? "Publishing..." : "Publish Daily Schedule"}
              </button>
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/60 bg-white/75 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Preview</p>
            <div className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {classLabel.trim() || `${year}-${division}`}
              </h2>
              <p className="mt-3 text-sm font-medium text-slate-500">
                Date: {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB")}
              </p>

              <div className="mt-6 space-y-3">
                {slots.filter((slot) => slot.startTime || slot.subject).length ? (
                  slots
                    .filter((slot) => slot.startTime || slot.subject)
                    .map((slot) => {
                      const timeLabel = slot.startTime
                        ? `${slot.startTime}${slot.endTime ? ` - ${slot.endTime}` : " onwards"}`
                        : "--:--";
                      const subjectLabel = slot.subject?.trim() || "Pending subject";

                      return (
                        <div key={slot.key} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                          <p className="text-[15px] font-medium text-slate-800">
                            <span className="font-semibold">{timeLabel}</span>
                            <span className="mx-2 text-slate-400">-</span>
                            <span>{subjectLabel}</span>
                          </p>
                          {slot.teacherName || slot.notes ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {[slot.teacherName?.trim(), slot.notes?.trim()].filter(Boolean).join(" • ")}
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-slate-500">Your published lecture list will appear here.</p>
                )}
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Total lectures: <span className="font-semibold text-slate-900">{activeSlotCount}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
