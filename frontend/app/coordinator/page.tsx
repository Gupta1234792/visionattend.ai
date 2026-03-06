"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";

type YearValue = "FY" | "SY" | "TY" | "FINAL";
type Subject = { _id: string; name: string; code: string };
type LectureRow = {
  _id: string;
  title: string;
  purpose?: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string;
  status?: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED";
  subjectId?: { name?: string; code?: string };
};
type HolidayRow = {
  _id: string;
  reason: string;
  fromDate: string;
  toDate: string;
};

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function CoordinatorPage() {
  const { user } = useAuth();
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [message, setMessage] = useState("Coordinator timetable workspace ready.");

  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; inviteCode: string } | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);

  const [lectureForm, setLectureForm] = useState({
    title: "",
    subjectId: "",
    scheduledAtLocal: "",
    durationMinutes: 60,
    purpose: ""
  });

  const [holidayForm, setHolidayForm] = useState({
    fromDate: "",
    toDate: "",
    reason: ""
  });

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const batchKey = useMemo(() => {
    if (!user?.department) return "";
    return `${user.department}_${year}_${division}`;
  }, [user?.department, year, division]);
  const totalScheduled = lectures.filter((row) => String(row.status || "").toUpperCase() === "SCHEDULED").length;
  const totalLive = lectures.filter((row) => String(row.status || "").toUpperCase() === "LIVE").length;

  const loadSubjects = async () => {
    try {
      const res = await api.get("/subjects/mine");
      const list = res.data?.subjects || [];
      setSubjects(list);
      if (!lectureForm.subjectId && list[0]) {
        setLectureForm((prev) => ({ ...prev, subjectId: list[0]._id }));
      }
    } catch {
      setSubjects([]);
    }
  };

  const loadLectures = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/lectures/batch/${batchKey}`);
      setLectures(res.data?.lectures || []);
    } catch {
      setLectures([]);
    }
  };

  const loadHolidays = async () => {
    if (!batchKey) return;
    try {
      const res = await api.get(`/holidays/batch/${batchKey}`);
      setHolidays(res.data?.holidays || []);
    } catch {
      setHolidays([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadLectures();
      void loadHolidays();
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey]);

  const createInvite = async () => {
    if (!user?.department) {
      setMessage("Department mapping missing for coordinator.");
      return;
    }

    try {
      const res = await api.post("/student-invite", {
        departmentId: user.department,
        year,
        division,
      });

      setInviteResult({
        inviteLink: res.data?.inviteLink || "",
        inviteCode: res.data?.inviteCode || res.data?.invite?.inviteCode || "",
      });
      setMessage("Student invite generated. Share link and code.");
    } catch (error) {
      setMessage(parseApiError(error, "Failed to generate invite."));
    }
  };

  const scheduleLecture = async () => {
    if (!batchKey) {
      setMessage("Batch key missing.");
      return;
    }
    if (!lectureForm.title || !lectureForm.subjectId || !lectureForm.scheduledAtLocal || !lectureForm.durationMinutes) {
      setMessage("Fill title, subject, date-time and duration.");
      return;
    }

    try {
      const scheduledAt = new Date(lectureForm.scheduledAtLocal).toISOString();
      await api.post("/lectures", {
        title: lectureForm.title.trim(),
        subjectId: lectureForm.subjectId,
        batchId: batchKey,
        scheduledAt,
        durationMinutes: Number(lectureForm.durationMinutes),
        purpose: lectureForm.purpose.trim()
      });
      setMessage("Lecture scheduled successfully.");
      setLectureForm((prev) => ({ ...prev, title: "", scheduledAtLocal: "", durationMinutes: 60, purpose: "" }));
      void loadLectures();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to schedule lecture."));
    }
  };

  const announceHoliday = async () => {
    if (!batchKey) {
      setMessage("Batch key missing.");
      return;
    }
    if (!holidayForm.fromDate || !holidayForm.toDate || !holidayForm.reason.trim()) {
      setMessage("Fill holiday from-date, to-date and reason.");
      return;
    }

    try {
      const res = await api.post("/holidays", {
        batchId: batchKey,
        fromDate: new Date(holidayForm.fromDate).toISOString(),
        toDate: new Date(holidayForm.toDate).toISOString(),
        reason: holidayForm.reason.trim()
      });
      const canceled = Number(res.data?.canceledLectures || 0);
      setMessage(`Holiday announced. ${canceled} scheduled lecture(s) canceled and students notified.`);
      setHolidayForm({ fromDate: "", toDate: "", reason: "" });
      void loadHolidays();
      void loadLectures();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to announce holiday."));
    }
  };

  return (
    <ProtectedRoute allow={["coordinator", "teacher"]}>
      <DashboardLayout title={user?.role === "teacher" ? "Teacher Timetable Control" : "Coordinator Timetable Control"}>
        <section className="mb-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Subjects</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{subjects.length}</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Scheduled</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{totalScheduled}</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Live Lectures</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{totalLive}</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Holiday Rows</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{holidays.length}</p>
            </article>
          </div>
        </section>

        <section className="mb-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <h2 className="text-base font-semibold text-slate-900">Classroom Batch Selector</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 max-w-md">
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
              {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <p className="mt-2 text-xs text-slate-500">Batch Key: {batchKey || "-"}</p>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Student Invite</h2>
            <p className="mt-2 text-sm text-slate-600">Share both invite link and invite code with students.</p>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={createInvite}>
              Generate Invite
            </button>
            {inviteResult ? (
              <div className="mt-3 rounded-xl border border-white/80 bg-white/85 p-3 text-sm">
                <p className="font-medium text-slate-800">Invite Code: {inviteResult.inviteCode || "N/A"}</p>
                <p className="mt-1 break-all text-slate-700">{inviteResult.inviteLink}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Holiday Announcement</h2>
            <p className="mt-2 text-sm text-slate-600">Set holiday range and reason. Students will get notification automatically.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={holidayForm.fromDate}
                onChange={(e) => setHolidayForm((prev) => ({ ...prev, fromDate: e.target.value }))}
              />
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={holidayForm.toDate}
                onChange={(e) => setHolidayForm((prev) => ({ ...prev, toDate: e.target.value }))}
              />
              <input
                className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Holiday reason"
                value={holidayForm.reason}
                onChange={(e) => setHolidayForm((prev) => ({ ...prev, reason: e.target.value }))}
              />
            </div>
            <button className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700" type="button" onClick={announceHoliday}>
              Announce Holiday
            </button>
          </section>
        </div>

        <section className="mt-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <h2 className="text-base font-semibold">Daily Timetable Setup</h2>
          <p className="mt-2 text-sm text-slate-600">Create scheduled lecture rows for this virtual classroom.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Lecture title"
              value={lectureForm.title}
              onChange={(e) => setLectureForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={lectureForm.subjectId}
              onChange={(e) => setLectureForm((prev) => ({ ...prev, subjectId: e.target.value }))}
            >
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>
              ))}
            </select>
            <input
              type="datetime-local"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={lectureForm.scheduledAtLocal}
              onChange={(e) => setLectureForm((prev) => ({ ...prev, scheduledAtLocal: e.target.value }))}
            />
            <input
              type="number"
              min={15}
              max={180}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={lectureForm.durationMinutes}
              onChange={(e) => setLectureForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value || 60) }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Purpose (optional)"
              value={lectureForm.purpose}
              onChange={(e) => setLectureForm((prev) => ({ ...prev, purpose: e.target.value }))}
            />
          </div>
          <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={scheduleLecture}>
            Add to Timetable
          </button>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h3 className="text-base font-semibold">Timetable Rows</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Title</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Date/Time</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Purpose</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lectures.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2">{row.title}</td>
                      <td className="py-2">{row.subjectId?.name || "-"}</td>
                      <td className="py-2">{new Date(row.scheduledAt).toLocaleString()}</td>
                      <td className="py-2">{row.durationMinutes} min</td>
                      <td className="py-2">{row.purpose || "-"}</td>
                      <td className="py-2">{row.status || "-"}</td>
                    </tr>
                  ))}
                  {lectures.length === 0 ? (
                    <tr><td className="py-3 text-slate-500" colSpan={6}>No timetable rows yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h3 className="text-base font-semibold">Holiday Rows</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">From</th>
                    <th className="py-2">To</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2">{new Date(row.fromDate).toLocaleDateString()}</td>
                      <td className="py-2">{new Date(row.toDate).toLocaleDateString()}</td>
                      <td className="py-2">{row.reason}</td>
                    </tr>
                  ))}
                  {holidays.length === 0 ? (
                    <tr><td className="py-3 text-slate-500" colSpan={3}>No holidays announced.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
