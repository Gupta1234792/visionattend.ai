"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type TrendRow = {
  subjectName?: string;
  subjectCode?: string;
  teacherName?: string;
  attendanceRate?: number;
  total?: number;
  divisionKey?: string;
};

type RiskRow = {
  studentId: string;
  attendanceRate: number;
  year?: string;
  division?: string;
};
type CoordinatorMetric = {
  coordinatorId: string;
  name: string;
  year?: string;
  division?: string;
  attendanceRate?: number;
  absenceVariancePercent?: number;
};

export default function AdminAnalyticsPage() {
  const [message, setMessage] = useState("Loading analytics...");
  const [metrics, setMetrics] = useState<{ overallAttendanceRate?: number; totalMarks?: number; presentMarks?: number; remoteMarks?: number; absentMarks?: number }>({});
  const [subjectTrends, setSubjectTrends] = useState<TrendRow[]>([]);
  const [teacherTrends, setTeacherTrends] = useState<TrendRow[]>([]);
  const [divisionTrends, setDivisionTrends] = useState<TrendRow[]>([]);
  const [atRisk, setAtRisk] = useState<RiskRow[]>([]);
  const [coordinatorMetrics, setCoordinatorMetrics] = useState<CoordinatorMetric[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const res = await api.get("/admin/analytics/attendance?days=30");
          setMetrics(res.data?.metrics || {});
          setSubjectTrends(res.data?.trends?.subjects || []);
          setTeacherTrends(res.data?.trends?.teachers || []);
          setDivisionTrends(res.data?.trends?.divisions || []);
          setAtRisk(res.data?.alerts?.atRiskStudents || []);
          setCoordinatorMetrics(res.data?.coordinatorMetrics || []);
          setMessage("Attendance analytics loaded.");
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load analytics.");
        }
      };
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ProtectedRoute allow={["admin", "hod"]}>
      <DashboardLayout title="Attendance Analytics">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Overall</p><p className="text-xl font-bold">{metrics.overallAttendanceRate ?? 0}%</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Total Marks</p><p className="text-xl font-bold">{metrics.totalMarks ?? 0}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Present</p><p className="text-xl font-bold">{metrics.presentMarks ?? 0}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Remote</p><p className="text-xl font-bold">{metrics.remoteMarks ?? 0}</p></div>
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Absent</p><p className="text-xl font-bold">{metrics.absentMarks ?? 0}</p></div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Subject Trends</h2>
            <div className="mt-3 max-h-64 overflow-auto text-sm">
              {subjectTrends.slice(0, 20).map((row, index) => (
                <div key={`${row.subjectCode}-${index}`} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <p>{row.subjectName} ({row.subjectCode})</p>
                  <p className="font-semibold">{row.attendanceRate ?? 0}%</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Teacher Trends</h2>
            <div className="mt-3 max-h-64 overflow-auto text-sm">
              {teacherTrends.slice(0, 20).map((row, index) => (
                <div key={`${row.teacherName}-${index}`} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <p>{row.teacherName}</p>
                  <p className="font-semibold">{row.attendanceRate ?? 0}%</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Division Variance</h2>
            <div className="mt-3 max-h-64 overflow-auto text-sm">
              {divisionTrends.slice(0, 20).map((row, index) => (
                <div key={`${row.divisionKey}-${index}`} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <p>{row.divisionKey}</p>
                  <p className="font-semibold">{row.attendanceRate ?? 0}%</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-base font-semibold text-amber-900">At-Risk Students</h2>
            <div className="mt-3 max-h-64 overflow-auto text-sm">
              {atRisk.slice(0, 30).map((row) => (
                <div key={row.studentId} className="flex items-center justify-between border-b border-amber-100 py-2">
                  <p>{row.year}-{row.division}</p>
                  <p className="font-semibold text-amber-800">{row.attendanceRate}%</p>
                </div>
              ))}
              {atRisk.length === 0 ? <p className="text-slate-500">No at-risk students in selected range.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">Coordinator Engagement Metrics</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Coordinator</th>
                    <th className="py-2">Class</th>
                    <th className="py-2">Attendance Rate</th>
                    <th className="py-2">Absence Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinatorMetrics.map((row) => (
                    <tr key={row.coordinatorId} className="border-b border-slate-100">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2">{row.year}-{row.division}</td>
                      <td className="py-2">{row.attendanceRate ?? 0}%</td>
                      <td className="py-2">{row.absenceVariancePercent ?? 0}%</td>
                    </tr>
                  ))}
                  {coordinatorMetrics.length === 0 ? (
                    <tr><td className="py-3 text-slate-500" colSpan={4}>No coordinator metrics yet.</td></tr>
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
