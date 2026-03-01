"use client";

import { FormEvent, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Teacher = { _id: string; name: string; email: string };

export default function HodTeachersPage() {
  const [message, setMessage] = useState("Teacher workflow ready.");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", password: "" });

  const loadTeachers = async () => {
    try {
      const res = await api.get("/teachers");
      setTeachers(res.data?.teachers || []);
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to fetch teachers.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTeachers();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const onCreateTeacher = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/teachers", teacherForm);
      setMessage("Teacher assigned successfully.");
      setTeacherForm({ name: "", email: "", password: "" });
      void loadTeachers();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to assign teacher.");
    }
  };

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="Assign Teacher">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={onCreateTeacher} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Create Teacher</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Teacher Name" value={teacherForm.name} onChange={(e) => setTeacherForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="Teacher Email" value={teacherForm.email} onChange={(e) => setTeacherForm((p) => ({ ...p, email: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={teacherForm.password} onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))} required />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Assign Teacher</button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Teachers Table</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher._id} className="border-b border-slate-100">
                      <td className="py-2">{teacher.name}</td>
                      <td className="py-2">{teacher.email}</td>
                    </tr>
                  ))}
                  {teachers.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={2}>No teacher found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
