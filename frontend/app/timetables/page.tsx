"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock3, GraduationCap } from "lucide-react";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import { getClassTimetable, getTeacherTimetable, getWeeklyTimetable, Timetable } from "@/src/services/timetable";

export default function TimetablesPage() {
  const { user } = useAuth();
  const [todayTimetable, setTodayTimetable] = useState<Timetable | null>(null);
  const [teacherLectures, setTeacherLectures] = useState<Array<{ timetableId: string; classLabel: string; date: string; slot: Timetable["slots"][number] }>>([]);
  const [weeklyRows, setWeeklyRows] = useState<Timetable[]>([]);
  const [message, setMessage] = useState("Loading timetable...");

  const batchKey = useMemo(() => {
    if (!user?.department || !user?.year || !user?.division) return "";
    return `${user.department}_${user.year}_${user.division}`;
  }, [user?.department, user?.division, user?.year]);

  useEffect(() => {
    const load = async () => {
      try {
        if (user?.role === "teacher") {
          const teacherRes = await getTeacherTimetable("me");
          setTeacherLectures(teacherRes.lectures || []);
          setMessage("Teacher timetable loaded.");
          return;
        }

        if (batchKey) {
          const [todayRes, weeklyRes] = await Promise.all([
            getClassTimetable(batchKey),
            getWeeklyTimetable(batchKey),
          ]);
          setTodayTimetable(todayRes.timetable || null);
          setWeeklyRows(weeklyRes.timetables || []);
          setMessage("Class timetable loaded.");
        }
      } catch (error) {
        const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setMessage(apiMessage || "Failed to load timetable.");
      }
    };

    void load();
  }, [batchKey, user?.role]);

  return (
    <ProtectedRoute allow={["student", "teacher", "coordinator", "admin", "hod", "parent"]}>
      <DashboardLayout title="Timetable">
        {user?.role === "teacher" ? (
          <section className="rounded-[1.9rem] border border-white/60 bg-white/65 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1459d2] text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Teacher View</p>
                <h1 className="text-2xl font-semibold text-slate-900">Your Lectures Today</h1>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {teacherLectures.map((row) => (
                <article key={`${row.timetableId}_${row.slot._id || row.slot.startTime}`} className="rounded-[1.5rem] border border-slate-200 bg-white/85 p-4">
                  <p className="text-sm font-semibold text-slate-900">{row.slot.subject}</p>
                  <p className="mt-1 text-sm text-slate-600">Class: {row.classLabel}</p>
                  <p className="mt-2 text-xs text-slate-500">{row.slot.startTime}{row.slot.endTime ? ` - ${row.slot.endTime}` : " onwards"} • {row.slot.type}</p>
                </article>
              ))}

              {teacherLectures.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  No lecture assigned for today.
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            <section className="rounded-[1.9rem] border border-white/60 bg-white/65 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1459d2] text-white">
                  <Calendar className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today&apos;s Schedule</p>
                  <h1 className="text-2xl font-semibold text-slate-900">{todayTimetable?.classLabel || "Class Timetable"}</h1>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {(todayTimetable?.slots || []).map((slot, index) => (
                  <article key={`${slot._id || index}`} className="rounded-[1.5rem] border border-slate-200 bg-white/85 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">{slot.subject}</p>
                        <p className="mt-1 text-sm text-slate-600">{slot.teacherName || "No teacher assigned"}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">
                        {slot.type}
                      </span>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
                      <Clock3 className="h-4 w-4" />
                      {slot.startTime}{slot.endTime ? ` - ${slot.endTime}` : " onwards"}
                    </p>
                    {slot.notes ? <p className="mt-2 text-sm text-slate-600">{slot.notes}</p> : null}
                  </article>
                ))}

                {!todayTimetable ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    No published timetable found for today.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.9rem] border border-white/60 bg-white/65 p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Week View</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Published week schedule</h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {weeklyRows.map((row) => (
                  <article key={row._id} className="rounded-[1.5rem] border border-slate-200 bg-white/85 p-4">
                    <p className="text-sm font-semibold text-slate-900">{row.date}</p>
                    <div className="mt-3 space-y-2">
                      {row.slots.map((slot, index) => (
                        <div key={`${row._id}_${index}`} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <p className="font-medium">{slot.startTime}{slot.endTime ? ` - ${slot.endTime}` : " onwards"} | {slot.subject}</p>
                          <p className="text-xs text-slate-500">{slot.teacherName || "No teacher"} • {slot.type}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
