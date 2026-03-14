"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";

type UsersPayload = {
  hods?: Array<{ _id: string }>;
  teachers?: Array<{ _id: string }>;
  students?: Array<{ _id: string }>;
};

export default function AdminWorkflowPage() {
  const [stats, setStats] = useState({ colleges: 0, hods: 0, teachers: 0, students: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [collegeRes, usersRes] = await Promise.all([api.get("/colleges"), api.get("/admin/users")]);
        const users: UsersPayload = usersRes.data || {};
        setStats({
          colleges: (collegeRes.data?.colleges || []).length,
          hods: users.hods?.length || 0,
          teachers: users.teachers?.length || 0,
          students: users.students?.length || 0
        });
      } catch {
        setStats({ colleges: 0, hods: 0, teachers: 0, students: 0 });
      }
    };
    void load();
  }, []);

  const steps = [
    { title: "Create Colleges", href: "/admin/colleges", detail: "Add campus units and base locations for institution setup." },
    { title: "Assign HODs", href: "/admin/hods", detail: "Map department heads so department-level operations can begin." },
    { title: "Review Users", href: "/admin/users", detail: "Verify HOD, teacher, student, and parent onboarding status." },
    { title: "Monitor Analytics", href: "/admin/analytics", detail: "Track institutional attendance trends and risk signals." },
    { title: "Audit Activity", href: "/admin/audit", detail: "Review action history for traceability and operations checks." },
  ];

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Admin Workflow">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Admin Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Institution setup checklist</h1>
          <p className="mt-2 text-sm text-slate-600">A separate responsive workflow page for the admin role so setup steps are visible in one sequence.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Colleges</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.colleges}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">HODs</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.hods}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Teachers</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.teachers}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Students</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.students}</p></article>
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
