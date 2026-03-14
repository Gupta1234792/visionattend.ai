"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Clock3, Loader2, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";
import { StudentAnalyticsCards } from "@/src/components/StudentAnalyticsCards";
import { AttendanceHeatmap } from "@/src/components/AttendanceHeatmap";
import { MonthlyCharts } from "@/src/components/MonthlyCharts";
import { SubjectTable } from "@/src/components/SubjectTable";
import { AttendancePrediction } from "@/src/components/AttendancePrediction";

type ChildRow = {
  _id: string;
  relation?: string;
  studentId?: {
    _id?: string;
    name?: string;
    rollNo?: string;
    year?: string;
    division?: string;
  };
};

type AnalyticsPayload = {
  student?: {
    id: string;
    name: string;
    rollNo?: string;
    year?: string;
    division?: string;
    batchId?: string;
  };
  overallAttendance: number;
  totalLectures: number;
  present: number;
  absent: number;
  totalClassesAttended: number;
  totalClassesMissed: number;
  streak: number;
  classesToday: number;
  monthlyAttendance: Array<{ month: string; percentage: number }>;
  subjectStats: Array<{
    subject: string;
    subjectCode?: string;
    present: number;
    absent: number;
    attendancePercentage: number;
  }>;
  weeklyDistribution: Array<{ day: string; percentage: number }>;
  attendanceBreakdown: Array<{ name: string; value: number }>;
  heatmapData: Array<{
    date: string;
    count: number;
    status: "present" | "absent" | "late" | "no-class";
    subject: string;
    tooltip: string;
  }>;
  prediction: {
    primaryMessage: string;
    riskMessage: string;
    ifAttendNext5: number;
    ifMissNext2: number;
    classesNeededFor75: number;
    threshold: number;
  } | null;
  lowAttendanceAlert: {
    active: boolean;
    threshold: number;
    classesNeeded: number;
    message: string;
  } | null;
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
        type: "theory" | "practical" | "event" | "break";
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
        type: "theory" | "practical" | "event" | "break";
        notes?: string;
      }>;
    }>;
    upcomingLectures?: Array<{
      _id: string;
      title: string;
      scheduledAt: string;
      durationMinutes: number;
      status: string;
      purpose?: string;
      teacherId?: { name?: string };
      subjectId?: { name?: string; code?: string };
    }>;
    holidays?: Array<{
      _id: string;
      reason: string;
      fromDate: string;
      toDate: string;
    }>;
  };
};

const emptyPayload: AnalyticsPayload = {
  overallAttendance: 0,
  totalLectures: 0,
  present: 0,
  absent: 0,
  totalClassesAttended: 0,
  totalClassesMissed: 0,
  streak: 0,
  classesToday: 0,
  monthlyAttendance: [],
  subjectStats: [],
  weeklyDistribution: [],
  attendanceBreakdown: [],
  heatmapData: [],
  prediction: null,
  lowAttendanceAlert: null
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

export default function ParentPage() {
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsPayload>(emptyPayload);
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [message, setMessage] = useState("Parent dashboard ready.");

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
      setMessage("Unable to load children. Ask admin to link parent with student.");
    } finally {
      setLoading(false);
    }
  };

  const loadChildDashboard = async (studentId: string) => {
    if (!studentId) return;
    setAnalyticsLoading(true);
    try {
      const [analyticsRes, summaryRes] = await Promise.all([
        api.get(`/parents/analytics?studentId=${studentId}`),
        api.get(`/parents/summary?studentId=${studentId}`)
      ]);
      setAnalytics({ ...emptyPayload, ...(analyticsRes.data || {}) });
      setSummary({ ...emptySummary, ...(summaryRes.data || {}) });
      setMessage("Child attendance, timetable, lecture, and holiday summary loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Unable to load child summary.");
      setAnalytics(emptyPayload);
      setSummary(emptySummary);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadChildren();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      void loadChildDashboard(selectedStudentId);
    }
  }, [selectedStudentId]);

  const childName = analytics.student?.name || summary.student?.name || "-";
  const childClass = `${analytics.student?.year || summary.student?.year || "-"} / ${
    analytics.student?.division || summary.student?.division || "-"
  }`;

  return (
    <ProtectedRoute allow={["parent"]}>
      <DashboardLayout title="Parent Dashboard">
        <section className="mb-4 rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Family Overview</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Track attendance, schedule, and class updates for your child</h1>
              <p className="mt-2 text-sm text-slate-600">
                Parent view now includes linked children, attendance analytics, today&apos;s timetable, upcoming lectures, and class holidays.
              </p>
            </div>
            <div className="min-w-[260px]">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Select Child
              </label>
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

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-xs text-slate-500">Linked Students</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{children.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-xs text-slate-500">Selected Child</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{childName}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-xs text-slate-500">Class</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{childClass}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-xs text-slate-500">Batch Key</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{summary.student?.batchId || "-"}</p>
            </div>
          </div>
        </section>

        {loading || analyticsLoading ? (
          <section className="rounded-[1.8rem] border border-white/60 bg-white/60 p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
            <p className="mt-3 text-sm text-slate-600">Loading parent dashboard...</p>
          </section>
        ) : selectedStudentId ? (
          <div className="space-y-4">
            <StudentAnalyticsCards
              overallAttendance={analytics.overallAttendance}
              totalClassesAttended={analytics.totalClassesAttended}
              totalClassesMissed={analytics.totalClassesMissed}
              totalLectures={analytics.totalLectures}
              streak={analytics.streak}
              classesToday={analytics.classesToday}
            />

            <AttendancePrediction
              prediction={analytics.prediction}
              lowAttendanceAlert={analytics.lowAttendanceAlert}
            />

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today</p>
                    <h2 className="text-xl font-semibold text-slate-900">Child timetable</h2>
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
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                            {slot.type}
                          </span>
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

              <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1459d2] text-white">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Upcoming</p>
                    <h2 className="text-xl font-semibold text-slate-900">Lectures and holidays</h2>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Upcoming Lectures</p>
                    <div className="mt-3 space-y-3">
                      {summary.summary?.upcomingLectures?.length ? (
                        summary.summary.upcomingLectures.map((lecture) => (
                          <article key={lecture._id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">{lecture.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {lecture.subjectId?.name || "Subject"} • {lecture.teacherId?.name || "Teacher"}
                            </p>
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
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Holiday Notices</p>
                    <div className="mt-3 space-y-3">
                      {summary.summary?.holidays?.length ? (
                        summary.summary.holidays.map((holiday) => (
                          <article key={holiday._id} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                            <p className="text-sm font-semibold text-slate-900">{holiday.reason}</p>
                            <p className="mt-2 text-sm text-slate-700">
                              {formatDate(holiday.fromDate)} - {formatDate(holiday.toDate)}
                            </p>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                          No upcoming holidays announced.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">This Week</p>
                  <h2 className="text-xl font-semibold text-slate-900">Weekly timetable snapshot</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {summary.summary?.weeklyTimetables?.length ? (
                  summary.summary.weeklyTimetables.map((row) => (
                    <article key={row._id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.classLabel}</p>
                          <p className="text-xs text-slate-500">{formatDate(row.date)}</p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {row.slots.length} slots
                        </span>
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

            <AttendanceHeatmap data={analytics.heatmapData} />

            <MonthlyCharts
              monthlyAttendance={analytics.monthlyAttendance}
              subjectStats={analytics.subjectStats}
              weeklyDistribution={analytics.weeklyDistribution}
              attendanceBreakdown={analytics.attendanceBreakdown}
            />

            <SubjectTable rows={analytics.subjectStats} />
          </div>
        ) : (
          <section className="rounded-[1.8rem] border border-white/60 bg-white/60 p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <p className="text-sm text-slate-600">Link a student first, then select the child to see attendance, timetable, lectures, and holiday summary.</p>
          </section>
        )}

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">My Children</h2>
            <button
              type="button"
              onClick={() => void loadChildren()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Student</th>
                  <th className="py-2">Roll No</th>
                  <th className="py-2">Class</th>
                  <th className="py-2">Relation</th>
                </tr>
              </thead>
              <tbody>
                {children.map((row) => (
                  <tr key={row._id} className="border-b border-slate-100">
                    <td className="py-2">{row.studentId?.name || "-"}</td>
                    <td className="py-2">{row.studentId?.rollNo || "-"}</td>
                    <td className="py-2">
                      {(row.studentId?.year || "-")}/{(row.studentId?.division || "-")}
                    </td>
                    <td className="py-2">{row.relation || "GUARDIAN"}</td>
                  </tr>
                ))}
                {children.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={4}>
                      No linked students found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
