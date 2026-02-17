"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type College = { _id: string; name: string; code: string; address: string };
type Department = { _id: string; name: string; code: string; college: string };
const departmentPresets = [
  { name: "Computer Science and Engineering", code: "CSE" },
  { name: "Information Technology", code: "IT" },
  { name: "Bachelor of Science in IT", code: "BSCIT" },
  { name: "Artificial Intelligence and Data Science", code: "AIDS" },
  { name: "Artificial Intelligence and Machine Learning", code: "AIML" },
  { name: "Electronics and Communication Engineering", code: "ECE" },
];

export default function AdminPage() {
  const [message, setMessage] = useState("Admin workflow ready.");
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [collegeForm, setCollegeForm] = useState({
    name: "",
    code: "",
    address: "",
    latitude: 18.5204,
    longitude: 73.8567,
  });

  const [hodForm, setHodForm] = useState({
    name: "",
    email: "",
    password: "",
    collegeId: "",
    departmentId: "",
  });

  const loadData = async () => {
    const [collegeRes, departmentRes] = await Promise.all([api.get("/colleges"), api.get("/departments")]);
    setColleges(collegeRes.data.colleges || []);
    setDepartments(departmentRes.data.departments || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const run = async () => {
        const [collegeRes, departmentRes] = await Promise.all([api.get("/colleges"), api.get("/departments")]);
        setColleges(collegeRes.data.colleges || []);
        setDepartments(departmentRes.data.departments || []);
      };
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const departmentsForCollege = useMemo(
    () => departments.filter((department) => String(department.college) === String(hodForm.collegeId)),
    [departments, hodForm.collegeId]
  );

  const onCreateCollege = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const collegeRes = await api.post("/colleges", collegeForm);
      const createdCollegeId = collegeRes?.data?.college?._id;
      if (createdCollegeId) {
        await Promise.all(
          departmentPresets.map((preset) =>
            api.post("/departments", {
              ...preset,
              collegeId: createdCollegeId,
            }).catch(() => null)
          )
        );
      }
      setMessage("College created with default departments.");
      setCollegeForm({ name: "", code: "", address: "", latitude: 18.5204, longitude: 73.8567 });
      loadData();
    } catch {
      setMessage("Failed to create college.");
    }
  };

  const onAddDefaultDepartments = async () => {
    if (!hodForm.collegeId) {
      setMessage("Select college first.");
      return;
    }

    try {
      const existingCodes = new Set(
        departments
          .filter((department) => String(department.college) === String(hodForm.collegeId))
          .map((department) => department.code.toUpperCase())
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
      loadData();
    } catch {
      setMessage("Failed to add default departments.");
    }
  };

  const onAssignHod = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/hods", hodForm);
      setMessage("HOD assigned successfully.");
      setHodForm({ name: "", email: "", password: "", collegeId: "", departmentId: "" });
      loadData();
    } catch {
      setMessage("Failed to assign HOD.");
    }
  };

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Admin Dashboard">
        <div className="grid gap-4 xl:grid-cols-2">
          <form id="colleges" onSubmit={onCreateCollege} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Create College</h2>
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="College Name" value={collegeForm.name} onChange={(e) => setCollegeForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="College Code" value={collegeForm.code} onChange={(e) => setCollegeForm((p) => ({ ...p, code: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Location" value={collegeForm.address} onChange={(e) => setCollegeForm((p) => ({ ...p, address: e.target.value }))} required />
              <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Description" rows={3} />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Create</button>
          </form>

          <form id="hod" onSubmit={onAssignHod} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Assign HOD</h2>
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
                <button
                  type="button"
                  onClick={onAddDefaultDepartments}
                  className="w-full rounded-lg border border-[#135ed8] px-3 py-2 text-sm font-semibold text-[#135ed8]"
                >
                  Add Default Departments
                </button>
              ) : null}
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="HOD Name" value={hodForm.name} onChange={(e) => setHodForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="HOD Email" type="email" value={hodForm.email} onChange={(e) => setHodForm((p) => ({ ...p, email: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Password" type="password" value={hodForm.password} onChange={(e) => setHodForm((p) => ({ ...p, password: e.target.value }))} required />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Assign HOD</button>
          </form>

          <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">View Colleges</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">College</th>
                    <th className="py-2">Code</th>
                    <th className="py-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map((college) => (
                    <tr key={college._id} className="border-b border-slate-100">
                      <td className="py-2">{college.name}</td>
                      <td className="py-2">{college.code}</td>
                      <td className="py-2">{college.address}</td>
                    </tr>
                  ))}
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
