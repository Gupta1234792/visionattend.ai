"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";

type ChildRow = {
  _id: string;
  relation?: string;
  studentId?: {
    _id?: string;
    name?: string;
    rollNo?: string;
  };
};

type SummaryPayload = {
  student?: {
    id: string;
    name: string;
    rollNo?: string;
    year?: string;
    division?: string;
    batchId?: string;
  };
  summary?: {
    todayTimetable?: {
      _id: string;
      classLabel: string;
      date: string;
      slots: Array<{
        _id?: string;
        startTime: string;
        endTime?: string;
        subject: string;
        teacherName?: string;
        type: string;
        notes?: string;
      }>;
    } | null;
    weeklyTimetables?: Array<{
      _id: string;
      date: string;
      classLabel: string;
      slots: Array<{
        _id?: string;
        startTime: string;
        endTime?: string;
        subject: string;
        teacherName?: string;
        type: string;
      }>;
    }>;
    upcomingLectures?: Array<{
      _id: string;
      title: string;
      scheduledAt: string;
      durationMinutes: number;
      purpose?: string;
      teacherId?: { name?: string };
      subjectId?: { name?: string };
      status?: string;
    }>;
    holidays?: Array<{
      _id: string;
      reason: string;
      fromDate: string;
      toDate: string;
    }>;
  };
};

const emptySummary: SummaryPayload = {
  summary: {
    todayTimetable: null,
    weeklyTimetables: [],
    upcomingLectures: [],
    holidays: []
  }
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatTimeRange = (startTime?: string, endTime?: string) =>
  `${startTime || "-"}` + (endTime ? ` - ${endTime}` : " onwards");

export default function ParentSchedulePage() {
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Parent schedule page ready.");

  const loadChildren = async () => {
    try {
      const res = await api.get("/parents/my-children");
      const rows = res.data?.children || [];
      setChildren(rows);
      if (!selectedStudentId && rows[0]?.studentId?._id) {
        setSelectedStudentId(rows[0].studentId._id);
      }
      setMessage(rows.length ? "Children loaded." : "No linked students found.");
    } catch {
      setMessage("Unable to load linked children.");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (studentId: string) => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await api.get(`/parents/summary?studentId=${studentId}`);
      setSummary({ ...emptySummary, ...(res.data || {}) });
      setMessage("Child schedule and classroom summary loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSummary(emptySummary);
      setMessage(apiMessage || "Unable to load child summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      void loadSummary(selectedStudentId);
    }
  }, [selectedStudentId]);

  return (
    <ProtectedRoute allow={["parent"]}>
      <DashboardLayout title="Child Schedule">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Parent Schedule</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Timetable, lectures, and holiday plan</h1>
              <p className="mt-2 text-sm text-slate-600">Use a separate page to review today&apos;s class plan and upcoming academic schedule for the selected child.</p>
            </div>
            <div className="min-w-[260px]">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select Child</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
              >
                <option value="">Choose linked student</option>
                {children.map((child) => (
                  <option key={child._id} value={child.studentId?._id || ""}>
                    {child.studentId?.name || "Unknown"} {child.studentId?.rollNo ? `(${child.studentId.rollNo})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="mt-4 rounded-[1.8rem] border border-white/60 bg-white/60 p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-600">Loading schedule...</p>
          </section>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today</p>
                  <h2 className="text-xl font-semibold text-slate-900">Published timetable</h2>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {summary.summary?.todayTimetable?.slots?.length ? (
                  summary.summary.todayTimetable.slots.map((slot) => (
                    <article key={slot._id || `${slot.startTime}-${slot.subject}`} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{slot.subject}</p>
                          <p className="mt-1 text-xs text-slate-500">{slot.teacherName || "No teacher assigned"}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{slot.type}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                        <Clock3 className="h-4 w-4 text-slate-400" />
                        <span>{formatTimeRange(slot.startTime, slot.endTime)}</span>
                      </div>
                      {slot.notes ? <p className="mt-2 text-sm text-slate-600">{slot.notes}</p> : null}
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    No published timetable found for today.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <h2 className="text-xl font-semibold text-slate-900">Upcoming lectures</h2>
                <div className="mt-4 space-y-3">
                  {summary.summary?.upcomingLectures?.length ? (
                    summary.summary.upcomingLectures.map((lecture) => (
                      <article key={lecture._id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                        <p className="text-sm font-semibold text-slate-900">{lecture.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{lecture.subjectId?.name || "Subject"} • {lecture.teacherId?.name || "Teacher"}</p>
                        <p className="mt-2 text-sm text-slate-700">{formatDateTime(lecture.scheduledAt)} • {lecture.durationMinutes} mins</p>
                        {lecture.purpose ? <p className="mt-2 text-sm text-slate-600">{lecture.purpose}</p> : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                      No upcoming lectures scheduled.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <h2 className="text-xl font-semibold text-slate-900">Holiday notices</h2>
                <div className="mt-4 space-y-3">
                  {summary.summary?.holidays?.length ? (
                    summary.summary.holidays.map((holiday) => (
                      <article key={holiday._id} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                        <p className="text-sm font-semibold text-slate-900">{holiday.reason}</p>
                        <p className="mt-2 text-sm text-slate-700">{formatDate(holiday.fromDate)} - {formatDate(holiday.toDate)}</p>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                      No upcoming holidays announced.
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        )}

        <section className="mt-4 rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-slate-900">Weekly snapshot</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {summary.summary?.weeklyTimetables?.length ? (
              summary.summary.weeklyTimetables.map((row) => (
                <article key={row._id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.classLabel}</p>
                      <p className="text-xs text-slate-500">{formatDate(row.date)}</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{row.slots.length} slots</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {row.slots.slice(0, 4).map((slot) => (
                      <div key={slot._id || `${row._id}-${slot.startTime}-${slot.subject}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="font-medium">{formatTimeRange(slot.startTime, slot.endTime)} | {slot.subject}</p>
                        <p className="text-xs text-slate-500">{slot.teacherName || "No teacher"} • {slot.type}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 lg:col-span-2">
                No weekly timetable published yet.
              </div>
            )}
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
