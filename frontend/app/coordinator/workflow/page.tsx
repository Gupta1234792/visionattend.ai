"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";

export default function CoordinatorWorkflowPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ lectures: 0, holidays: 0, templates: 0 });

  const batchKey = useMemo(() => {
    if (!user?.department || !user?.year || !user?.division) return "";
    return `${user.department}_${user.year}_${user.division}`;
  }, [user?.department, user?.year, user?.division]);

  useEffect(() => {
    const load = async () => {
      if (!batchKey) return;
      try {
        const [lectureRes, holidayRes, templateRes] = await Promise.all([
          api.get(`/lectures/batch/${batchKey}`),
          api.get(`/holidays/batch/${batchKey}`),
          api.get(`/timetable/templates?batchKey=${batchKey}`)
        ]);
        setCounts({
          lectures: (lectureRes.data?.lectures || []).length,
          holidays: (holidayRes.data?.holidays || []).length,
          templates: (templateRes.data?.templates || []).length
        });
      } catch {
        setCounts({ lectures: 0, holidays: 0, templates: 0 });
      }
    };
    void load();
  }, [batchKey]);

  const steps = [
    { title: "Generate Invites", href: "/teacher/invite", detail: "Create invite links and codes for student onboarding." },
    { title: "Manage Batch Ops", href: "/coordinator", detail: "Control holidays and one-off lecture schedules for the class." },
    { title: "Build Daily Timetable", href: "/coordinator/timetable", detail: "Create and publish flexible daily timetables." },
    { title: "Create Weekly Templates", href: "/coordinator/timetable/templates", detail: "Define recurring weekday patterns and apply them to date ranges." },
    { title: "Review Published View", href: "/timetables", detail: "Check what students and teachers will actually see." },
  ];

  return (
    <ProtectedRoute allow={["coordinator"]}>
      <DashboardLayout title="Coordinator Workflow">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Coordinator Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Batch planning sequence</h1>
          <p className="mt-2 text-sm text-slate-600">A dedicated page for class operations so invites, holidays, timetable planning, and recurring templates live in a clear order.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Scheduled Lectures</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.lectures}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Holiday Notices</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.holidays}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Weekly Templates</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.templates}</p></article>
          </div>
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
