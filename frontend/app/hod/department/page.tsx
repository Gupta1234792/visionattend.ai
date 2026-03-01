"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Department = { _id: string; name: string; code: string; hod?: { name?: string; email?: string } };

export default function HodDepartmentPage() {
  const [message, setMessage] = useState("Loading department...");
  const [department, setDepartment] = useState<Department | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const res = await api.get("/departments");
          const item = (res.data?.departments || [])[0] || null;
          setDepartment(item);
          setMessage(item ? "Department loaded." : "Department not assigned yet.");
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load department.");
        }
      };
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="My Department">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Department Profile</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Department Name</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{department?.name || "Not Assigned"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Department Code</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{department?.code || "-"}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Department assignment is controlled by admin.
          </p>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
