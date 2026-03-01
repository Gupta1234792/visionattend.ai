"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";

type YearValue = "FY" | "SY" | "TY" | "FINAL";

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function CoordinatorPage() {
  const { user } = useAuth();
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [message, setMessage] = useState("Coordinator workflow ready.");
  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; inviteCode: string } | null>(null);
  const [classroomTeachers, setClassroomTeachers] = useState<Array<{ _id: string; name: string; email: string }>>([]);

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const makeBatchKey = () => {
    if (!user?.department) return "";
    return `${user.department}_${year}_${division}`;
  };

  const loadClassroom = async () => {
    const batchKey = makeBatchKey();
    if (!batchKey) return;

    try {
      const res = await api.get(`/classroom/${batchKey}`);
      setClassroomTeachers(res.data.teachers || []);
    } catch {
      setClassroomTeachers([]);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadClassroom();
    }, 0);
    return () => clearTimeout(timer);
  }, [year, division]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const interval = setInterval(() => {
      void loadClassroom();
    }, 25000);
    return () => clearInterval(interval);
  }, [year, division]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const createInvite = async () => {
    if (!user?.department) {
      setMessage("Department mapping missing for coordinator.");
      return;
    }

    try {
      const res = await api.post("/student-invite", {
        departmentId: user.department,
        year,
        division,
      });

      setInviteResult({
        inviteLink: res.data?.inviteLink || "",
        inviteCode: res.data?.inviteCode || res.data?.invite?.inviteCode || "",
      });
      setMessage("Student invite generated. Share link or code.");
    } catch (error) {
      setMessage(parseApiError(error, "Failed to generate invite."));
    }
  };

  return (
    <ProtectedRoute allow={["coordinator"]}>
      <DashboardLayout title="Coordinator Dashboard">
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Batch Control Center</h2>
          <p className="mt-1 text-sm text-slate-600">Manage invites and monitor assigned classroom teachers in separate modules.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Department</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{user?.department || "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Batch</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{year}-{division}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Teachers</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{classroomTeachers.length}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Student Invite</h2>
            <p className="mt-2 text-sm text-slate-600">Generate classroom invite for students using link and invite code.</p>
            <p className="mt-1 text-xs text-emerald-700">Invite link/code remains reusable for multiple students and long-term sharing.</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={createInvite}>
              Generate Invite
            </button>

            {inviteResult ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">Invite Code: {inviteResult.inviteCode || "N/A"}</p>
                <p className="mt-1 break-all text-slate-700">{inviteResult.inviteLink}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Virtual Classroom Teachers</h2>
            <p className="mt-2 text-sm text-slate-600">Assigned teachers for {year}-{division}.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {classroomTeachers.slice(0, 5).map((teacher) => (
                <li key={teacher._id} className="rounded-lg border border-slate-200 px-3 py-2">
                  {teacher.name} ({teacher.email})
                </li>
              ))}
              {classroomTeachers.length === 0 ? (
                <li className="text-slate-500">No teachers found for this classroom.</li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
