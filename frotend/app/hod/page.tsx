"use client";

import { FormEvent, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";

type Teacher = { _id: string; name: string; email: string };
type Department = { _id: string; name: string; code: string };

type YearValue = "FY" | "SY" | "TY" | "FINAL";

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function HodPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("HOD workflow ready.");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [department, setDepartment] = useState<Department | null>(null);

  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", password: "" });
  const [coordinatorForm, setCoordinatorForm] = useState({
    name: "",
    email: "",
    password: "",
    year: "FY" as YearValue,
    division: "A",
  });
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", teacherId: "" });

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const loadTeachers = async () => {
    try {
      const res = await api.get("/teachers");
      const list = res.data.teachers || [];
      setTeachers(list);
      if (!subjectForm.teacherId && list[0]) {
        setSubjectForm((prev) => ({ ...prev, teacherId: list[0]._id }));
      }
    } catch (error) {
      setMessage(parseApiError(error, "Failed to fetch teachers"));
    }
  };

  const loadDepartment = async () => {
    try {
      const res = await api.get("/departments");
      const list = res.data.departments || [];
      if (list[0]) {
        setDepartment(list[0]);
      } else if (user?.department) {
        setDepartment({ _id: user.department, name: "Assigned Department", code: "N/A" });
      }
    } catch (error) {
      setMessage(parseApiError(error, "Failed to fetch department"));
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTeachers();
      void loadDepartment();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const onSubmit = async (
    e: FormEvent,
    path: string,
    body: Record<string, unknown>,
    success: string,
    onDone?: () => void
  ) => {
    e.preventDefault();
    try {
      await api.post(path, body);
      setMessage(success);
      onDone?.();
    } catch (error) {
      setMessage(parseApiError(error, `Failed: ${success}`));
    }
  };

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="HOD Dashboard">
        <div className="grid gap-4 xl:grid-cols-2">
          <section id="department" className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">My Department</h2>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p><span className="font-medium">Name:</span> {department?.name || "Not assigned yet"}</p>
              <p className="mt-1"><span className="font-medium">Code:</span> {department?.code || "N/A"}</p>
              <p className="mt-2 text-xs text-slate-500">Department is auto-assigned by Admin when HOD is created.</p>
            </div>
          </section>

          <form id="teacher" onSubmit={(e) => onSubmit(e, "/teachers", teacherForm, "Teacher assigned", () => { setTeacherForm({ name: "", email: "", password: "" }); loadTeachers(); })} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Assign Teacher</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Teacher Name" value={teacherForm.name} onChange={(e) => setTeacherForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="Teacher Email" value={teacherForm.email} onChange={(e) => setTeacherForm((p) => ({ ...p, email: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={teacherForm.password} onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))} required />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Assign</button>
          </form>

          <form
            id="coordinator"
            onSubmit={(e) =>
              onSubmit(
                e,
                "/coordinators",
                { ...coordinatorForm, departmentId: department?._id || user?.department || "" },
                "Class coordinator assigned",
                () => setCoordinatorForm({ name: "", email: "", password: "", year: "FY", division: "A" })
              )
            }
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h2 className="text-base font-semibold">Assign Class Coordinator</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Coordinator Name" value={coordinatorForm.name} onChange={(e) => setCoordinatorForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="Coordinator Email" value={coordinatorForm.email} onChange={(e) => setCoordinatorForm((p) => ({ ...p, email: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={coordinatorForm.password} onChange={(e) => setCoordinatorForm((p) => ({ ...p, password: e.target.value }))} required />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={coordinatorForm.year} onChange={(e) => setCoordinatorForm((p) => ({ ...p, year: e.target.value as YearValue }))}>
                  {years.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={coordinatorForm.division} onChange={(e) => setCoordinatorForm((p) => ({ ...p, division: e.target.value }))}>
                  {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </div>
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={!department?._id && !user?.department}>Assign</button>
          </form>

          <form id="subject" onSubmit={(e) => onSubmit(e, "/subjects", subjectForm, "Subject created", () => setSubjectForm((p) => ({ ...p, name: "", code: "" })))} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Create Subject</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Subject Name" value={subjectForm.name} onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Subject Code" value={subjectForm.code} onChange={(e) => setSubjectForm((p) => ({ ...p, code: e.target.value }))} required />
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={subjectForm.teacherId} onChange={(e) => setSubjectForm((p) => ({ ...p, teacherId: e.target.value }))}>
                {teachers.map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.name}</option>)}
              </select>
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Create Subject</button>
          </form>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
