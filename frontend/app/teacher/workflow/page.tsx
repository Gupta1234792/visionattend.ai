"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";

type Guardrails = {
  hasAssignedSubjects: boolean;
  assignedSubjectsCount: number;
  canStartAttendance: boolean;
  canScheduleLecture: boolean;
};

export default function TeacherWorkflowPage() {
  const [stats, setStats] = useState({ subjects: 0, lectures: 0, reportGroups: 0 });
  const [guardrails, setGuardrails] = useState<Guardrails | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [subjectRes, lectureRes, guardrailRes, reportRes] = await Promise.all([
          api.get("/subjects/mine"),
          api.get("/lectures/my"),
          api.get("/teachers/me/guardrails"),
          api.get("/reports/teacher")
        ]);
        setStats({
          subjects: (subjectRes.data?.subjects || []).length,
          lectures: (lectureRes.data?.lectures || []).length,
          reportGroups: (reportRes.data?.report || []).length
        });
        setGuardrails(guardrailRes.data?.guardrails || null);
      } catch {
        setStats({ subjects: 0, lectures: 0, reportGroups: 0 });
        setGuardrails(null);
      }
    };
    void load();
  }, []);

  const steps = [
    { title: "Check Timetable", href: "/timetables", detail: "Review your assigned timetable slots for the day." },
    { title: "Invite Students", href: "/teacher/invite", detail: "Generate or share onboarding access for the class when needed." },
    { title: "Start Attendance", href: "/teacher/attendance", detail: "Open the 10-minute face and geolocation attendance window." },
    { title: "Run Classroom Flow", href: "/teacher", detail: "Schedule lectures, manage live class, and send announcements." },
    { title: "Review Reports", href: "/teacher/reports", detail: "Export subject reports and inspect attendance quality." },
  ];

  return (
    <ProtectedRoute allow={["teacher"]}>
      <DashboardLayout title="Teacher Workflow">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Teacher Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Daily teaching operations</h1>
          <p className="mt-2 text-sm text-slate-600">A separate responsive page that puts timetable, attendance, lecture scheduling, and reporting in one guided sequence.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Assigned Subjects</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.subjects}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Scheduled Lectures</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.lectures}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Report Groups</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.reportGroups}</p></article>
          </div>

          {guardrails ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className={`rounded-2xl border p-4 ${guardrails.hasAssignedSubjects ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Subject Mapping</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{guardrails.hasAssignedSubjects ? "Ready" : "Missing"}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${guardrails.canStartAttendance ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Attendance Control</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{guardrails.canStartAttendance ? "Available" : "Blocked"}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${guardrails.canScheduleLecture ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Lecture Scheduling</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{guardrails.canScheduleLecture ? "Available" : "Blocked"}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {steps.map((step, index) => (
            <Link key={step.href} href={step.href} className="rounded-[1.6rem] border border-white/60 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {index + 1}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
            </Link>
          ))}
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
