"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type College = { _id: string };
type UsersPayload = {
  hods?: Array<{ _id: string }>;
  teachers?: Array<{ _id: string }>;
  students?: Array<{ _id: string }>;
};

export default function AdminPage() {
  const [message, setMessage] = useState("Loading admin overview...");
  const [counts, setCounts] = useState({
    colleges: 0,
    hods: 0,
    teachers: 0,
    students: 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const [collegeRes, usersRes] = await Promise.all([
            api.get("/colleges"),
            api.get("/admin/users"),
          ]);

          const colleges: College[] = collegeRes.data?.colleges || [];
          const users: UsersPayload = usersRes.data || {};

          setCounts({
            colleges: colleges.length,
            hods: users.hods?.length || 0,
            teachers: users.teachers?.length || 0,
            students: users.students?.length || 0,
          });
          setMessage("Use sidebar tabs for separate creation flows.");
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load admin overview.");
        }
      };
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Admin Dashboard">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Separate Tabs</h2>
          <p className="mt-1 text-sm text-slate-600">
            College and HOD creation are separated in dedicated tabs. Teacher and coordinator creation is handled by HOD.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/colleges" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Colleges</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{counts.colleges}</p>
              <p className="mt-1 text-sm text-[#135ed8]">Open Colleges Tab</p>
            </Link>
            <Link href="/admin/hods" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">HODs</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{counts.hods}</p>
              <p className="mt-1 text-sm text-[#135ed8]">Open HOD Tab</p>
            </Link>
            <Link href="/admin/users" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teachers</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{counts.teachers}</p>
              <p className="mt-1 text-sm text-[#135ed8]">View Users</p>
            </Link>
            <Link href="/admin/users" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
              <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{counts.students}</p>
              <p className="mt-1 text-sm text-[#135ed8]">View Users</p>
            </Link>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
