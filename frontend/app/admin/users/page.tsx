"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type AdminUser = {
  _id: string;
  name: string;
  email: string;
  role: "hod" | "teacher" | "student";
  year?: string;
  division?: string;
  department?: { name?: string; code?: string };
};

export default function AdminUsersPage() {
  const [message, setMessage] = useState("Loading users...");
  const [hods, setHods] = useState<AdminUser[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [students, setStudents] = useState<AdminUser[]>([]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersRes = await api.get("/admin/users");
        setHods(usersRes.data.hods || []);
        setTeachers(usersRes.data.teachers || []);
        setStudents(usersRes.data.students || []);
        setMessage("Users loaded.");
      } catch (error) {
        const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setMessage(apiMessage || "Failed to load users.");
      }
    };

    void loadUsers();
  }, []);

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Users">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">All Users By Role</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">HODs ({hods.length})</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {hods.map((u) => <li key={u._id}>{u.name} - {u.department?.code || "-"}</li>)}
                {hods.length === 0 ? <li className="text-slate-500">No HOD found.</li> : null}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Teachers ({teachers.length})</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {teachers.map((u) => <li key={u._id}>{u.name} - {u.department?.code || "-"}</li>)}
                {teachers.length === 0 ? <li className="text-slate-500">No teacher found.</li> : null}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Students ({students.length})</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {students.slice(0, 20).map((u) => <li key={u._id}>{u.name} - {u.department?.code || "-"} {u.year || "-"}-{u.division || "-"}</li>)}
                {students.length > 20 ? <li className="text-slate-500">+ {students.length - 20} more</li> : null}
                {students.length === 0 ? <li className="text-slate-500">No student found.</li> : null}
              </ul>
            </div>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
