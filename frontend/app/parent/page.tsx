"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";

type ChildRow = {
  _id: string;
  relation?: string;
  studentId?: {
    name?: string;
    rollNo?: string;
    year?: string;
    division?: string;
  };
};

export default function ParentPage() {
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [message, setMessage] = useState("Parent dashboard ready.");

  const loadChildren = async () => {
    try {
      const res = await api.get("/parents/my-children");
      setChildren(res.data?.children || []);
      setMessage("Children loaded.");
    } catch {
      setMessage("Unable to load children. Ask admin to link parent with student.");
    }
  };

  
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadChildren();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  

  return (
    <ProtectedRoute allow={["parent"]}>
      <DashboardLayout title="Parent Dashboard">
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Family Overview</h2>
          <p className="mt-1 text-sm text-slate-600">Track linked students, class details, and attendance communication from one place.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Linked Students</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{children.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Portal</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Parent View</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Status</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Active</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">My Children</h2>
            <button
              type="button"
              onClick={loadChildren}
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
