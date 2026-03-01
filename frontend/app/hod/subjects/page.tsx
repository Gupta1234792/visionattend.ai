"use client";

import { FormEvent, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Teacher = { _id: string; name: string; email: string };
type Subject = {
  _id: string;
  name: string;
  code: string;
  teacher?: { name?: string; email?: string };
  department?: { name?: string; code?: string };
};

export default function HodSubjectsPage() {
  const [message, setMessage] = useState("Subject workflow ready.");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", teacherId: "" });

  const loadData = async () => {
    try {
      const [teacherRes, subjectRes] = await Promise.all([
        api.get("/teachers"),
        api.get("/subjects/mine"),
      ]);
      const teacherList = teacherRes.data?.teachers || [];
      const subjectList = subjectRes.data?.subjects || [];

      setTeachers(teacherList);
      setSubjects(subjectList);
      setSubjectForm((prev) => ({
        ...prev,
        teacherId: prev.teacherId || teacherList[0]?._id || "",
      }));
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to load subjects.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const onCreateSubject = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/subjects", subjectForm);
      setMessage("Subject created successfully.");
      setSubjectForm((prev) => ({ ...prev, name: "", code: "" }));
      void loadData();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to create subject.");
    }
  };

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="Create Subject">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={onCreateSubject} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Create Subject</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Subject Name" value={subjectForm.name} onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Subject Code" value={subjectForm.code} onChange={(e) => setSubjectForm((p) => ({ ...p, code: e.target.value }))} required />
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={subjectForm.teacherId} onChange={(e) => setSubjectForm((p) => ({ ...p, teacherId: e.target.value }))} required>
                {teachers.map((teacher) => (
                  <option key={teacher._id} value={teacher._id}>
                    {teacher.name} ({teacher.email})
                  </option>
                ))}
              </select>
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={teachers.length === 0}>
              Create Subject
            </button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Subjects Table</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Subject</th>
                    <th className="py-2">Code</th>
                    <th className="py-2">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject._id} className="border-b border-slate-100">
                      <td className="py-2">{subject.name}</td>
                      <td className="py-2">{subject.code}</td>
                      <td className="py-2">{subject.teacher?.name || "-"}</td>
                    </tr>
                  ))}
                  {subjects.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>No subject found.</td>
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
