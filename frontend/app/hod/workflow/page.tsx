"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";

export default function HodWorkflowPage() {
  const [counts, setCounts] = useState({ teachers: 0, subjects: 0, departments: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [teacherRes, subjectRes, departmentRes] = await Promise.all([
          api.get("/teachers"),
          api.get("/subjects/mine"),
          api.get("/departments")
        ]);
        setCounts({
          teachers: (teacherRes.data?.teachers || []).length,
          subjects: (subjectRes.data?.subjects || []).length,
          departments: (departmentRes.data?.departments || []).length
        });
      } catch {
        setCounts({ teachers: 0, subjects: 0, departments: 0 });
      }
    };
    void load();
  }, []);

  const steps = [
    { title: "Review Department", href: "/hod/department", detail: "Confirm department mapping and administrative setup." },
    { title: "Create Teachers", href: "/hod/teachers", detail: "Add teaching staff who will later receive subject assignments." },
    { title: "Assign Coordinators", href: "/hod/coordinators", detail: "Map classroom coordinators for year/division operations." },
    { title: "Create Subjects", href: "/hod/subjects", detail: "Create subjects and assign them to teachers." },
    { title: "Export Oversight", href: "/reports/export-center", detail: "Review and export attendance information for your department." },
  ];

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="HOD Workflow">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">HOD Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Department operations sequence</h1>
          <p className="mt-2 text-sm text-slate-600">A separate page showing the real department build order from staffing to subject mapping.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Teachers</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.teachers}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Subjects</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.subjects}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Departments</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.departments}</p></article>
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
