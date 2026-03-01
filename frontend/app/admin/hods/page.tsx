"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type College = { _id: string; name: string; code: string };
type Department = { _id: string; name: string; code: string; college: string };
type HOD = { _id: string; name: string; email: string; department?: { name?: string; code?: string } };

const departmentPresets = [
  { name: "Computer Science and Engineering", code: "CSE" },
  { name: "Information Technology", code: "IT" },
  { name: "Bachelor of Science in IT", code: "BSCIT" },
  { name: "Artificial Intelligence and Data Science", code: "AIDS" },
  { name: "Artificial Intelligence and Machine Learning", code: "AIML" },
  { name: "Electronics and Communication Engineering", code: "ECE" },
];

export default function AdminHodsPage() {
  const [message, setMessage] = useState("HOD workflow ready.");
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hods, setHods] = useState<HOD[]>([]);

  const [hodForm, setHodForm] = useState({
    name: "",
    email: "",
    password: "",
    collegeId: "",
    departmentId: "",
  });

  const loadData = async () => {
    const [collegeRes, departmentRes, usersRes] = await Promise.all([
      api.get("/colleges"),
      api.get("/departments"),
      api.get("/admin/users"),
    ]);
    setColleges(collegeRes.data.colleges || []);
    setDepartments(departmentRes.data.departments || []);
    setHods(usersRes.data.hods || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const departmentsForCollege = useMemo(
    () => departments.filter((department) => String(department.college) === String(hodForm.collegeId)),
    [departments, hodForm.collegeId]
  );

  const onAddDefaultDepartments = async () => {
    if (!hodForm.collegeId) {
      setMessage("Select college first.");
      return;
    }

    try {
      const existingCodes = new Set(
        departmentsForCollege.map((department) => department.code.toUpperCase())
      );
      const missingPresets = departmentPresets.filter((preset) => !existingCodes.has(preset.code.toUpperCase()));

      if (missingPresets.length === 0) {
        setMessage("Departments already available for this college.");
        return;
      }

      await Promise.all(
        missingPresets.map((preset) =>
          api.post("/departments", {
            ...preset,
            collegeId: hodForm.collegeId,
          }).catch(() => null)
        )
      );

      setMessage("Default departments added.");
      void loadData();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to add default departments.");
    }
  };

  const onAssignHod = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/hods", hodForm);
      setMessage("HOD assigned successfully.");
      setHodForm({ name: "", email: "", password: "", collegeId: "", departmentId: "" });
      void loadData();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to assign HOD.");
    }
  };

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Assign HOD">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={onAssignHod} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Create HOD</h2>
            <div className="mt-3 space-y-2">
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={hodForm.collegeId} onChange={(e) => setHodForm((p) => ({ ...p, collegeId: e.target.value, departmentId: "" }))} required>
                <option value="">Select College</option>
                {colleges.map((college) => (
                  <option key={college._id} value={college._id}>{college.name}</option>
                ))}
              </select>

              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={hodForm.departmentId} onChange={(e) => setHodForm((p) => ({ ...p, departmentId: e.target.value }))} required>
                <option value="">Select Department</option>
                {departmentsForCollege.map((department) => (
                  <option key={department._id} value={department._id}>{department.name}</option>
                ))}
              </select>

              {hodForm.collegeId && departmentsForCollege.length === 0 ? (
                <button type="button" onClick={onAddDefaultDepartments} className="w-full rounded-lg border border-[#135ed8] px-3 py-2 text-sm font-semibold text-[#135ed8]">
                  Add Default Departments
                </button>
              ) : null}

              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="HOD Name" value={hodForm.name} onChange={(e) => setHodForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="HOD Email" value={hodForm.email} onChange={(e) => setHodForm((p) => ({ ...p, email: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={hodForm.password} onChange={(e) => setHodForm((p) => ({ ...p, password: e.target.value }))} required />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Assign HOD</button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">HOD Table</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {hods.map((hod) => (
                    <tr key={hod._id} className="border-b border-slate-100">
                      <td className="py-2">{hod.name}</td>
                      <td className="py-2">{hod.email}</td>
                      <td className="py-2">{hod.department?.code || hod.department?.name || "-"}</td>
                    </tr>
                  ))}
                  {hods.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>No HOD found.</td>
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
