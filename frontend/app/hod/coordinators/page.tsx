"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Department = { _id: string; name: string; code: string };
type YearValue = "FY" | "SY" | "TY" | "FINAL";
type CoordinatorPreview = { name: string; email: string; year: string; division: string };

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function HodCoordinatorsPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("Coordinator workflow ready.");
  const [department, setDepartment] = useState<Department | null>(null);
  const [recent, setRecent] = useState<CoordinatorPreview[]>([]);
  const [coordinatorForm, setCoordinatorForm] = useState({
    name: "",
    email: "",
    password: "",
    year: "FY" as YearValue,
    division: "A",
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const loadDepartment = async () => {
        try {
          const res = await api.get("/departments");
          const item = (res.data?.departments || [])[0] || null;
          setDepartment(item);
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load department.");
        }
      };
      void loadDepartment();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const onCreateCoordinator = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/coordinators", {
        ...coordinatorForm,
        departmentId: department?._id || user?.department || "",
      });
      setMessage("Class coordinator assigned successfully.");
      setRecent((prev) => [
        { name: coordinatorForm.name, email: coordinatorForm.email, year: coordinatorForm.year, division: coordinatorForm.division },
        ...prev,
      ].slice(0, 10));
      setCoordinatorForm({ name: "", email: "", password: "", year: "FY", division: "A" });
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to assign coordinator.");
    }
  };

  return (
    <ProtectedRoute allow={["hod"]}>
      <DashboardLayout title="Assign Coordinator">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={onCreateCoordinator} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Assign Class Coordinator</h2>
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
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={!department?._id && !user?.department}>
              Assign Coordinator
            </button>
            <p className="mt-2 text-xs text-slate-500">Department: {department?.name || "Not Assigned"}</p>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Created (Session)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((item, idx) => (
                    <tr key={`${item.email}-${idx}`} className="border-b border-slate-100">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2">{item.email}</td>
                      <td className="py-2">{item.year}-{item.division}</td>
                    </tr>
                  ))}
                  {recent.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={3}>No coordinator created in this session yet.</td>
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
