"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Department = { _id: string; name: string; code: string };

export default function HodPage() {
  const [message, setMessage] = useState("Loading HOD overview...");
  const [department, setDepartment] = useState<Department | null>(null);
  const [teacherCount, setTeacherCount] = useState(0);
  const [subjectCount, setSubjectCount] = useState(0);
  const [activities, setActivities] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const [departmentRes, teacherRes, subjectRes] = await Promise.all([
            api.get("/departments"),
            api.get("/teachers"),
            api.get("/subjects/mine"),
          ]);

          const departments = departmentRes.data?.departments || [];
          const teachers = teacherRes.data?.teachers || [];
          const subjects = subjectRes.data?.subjects || [];

          setDepartment(departments[0] || null);
          setTeacherCount(teachers.length);
          setSubjectCount(subjects.length);
          const actions: string[] = [];
          if (!departments[0]) actions.push("Department not mapped. Ask admin to map HOD department.");
          if (teachers.length === 0) actions.push("No teachers assigned. Create teachers first.");
          if (subjects.length === 0) actions.push("No subjects created yet. Assign subjects to teachers.");
          if (teachers.length > 0 && subjects.length < teachers.length) {
            actions.push("Some teachers may be unmapped to subjects.");
          }
          setActivities(actions);
          setMessage("Use sidebar tabs for separated workflows.");
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load HOD overview.");
        }
      };
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="HOD Dashboard">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Department Overview</h2>
          <p className="mt-1 text-sm text-slate-600">
            All HOD operations are separated into dedicated sidebar tabs.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/hod/department" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">My Department</p>
              <p className="mt-2 text-base font-bold text-slate-900">{department?.name || "Not Assigned"}</p>
              <p className="mt-1 text-sm text-slate-500">{department?.code || "-"}</p>
            </Link>
            <Link href="/hod/teachers" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teachers</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{teacherCount}</p>
              <p className="mt-1 text-sm text-[#135ed8]">Open Teachers Tab</p>
            </Link>
            <Link href="/hod/coordinators" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Coordinators</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">Manage</p>
              <p className="mt-1 text-sm text-[#135ed8]">Open Coordinators Tab</p>
            </Link>
            <Link href="/hod/subjects" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Subjects</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{subjectCount}</p>
              <p className="mt-1 text-sm text-[#135ed8]">Open Subjects Tab</p>
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Pending Actions</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {activities.map((item) => (
              <li key={item} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">{item}</li>
            ))}
            {activities.length === 0 ? <li className="text-slate-500">No urgent HOD action pending.</li> : null}
          </ul>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
