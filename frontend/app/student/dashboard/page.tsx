"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { StudentAnalyticsCards } from "@/src/components/StudentAnalyticsCards";
import { AttendanceHeatmap } from "@/src/components/AttendanceHeatmap";
import { MonthlyCharts } from "@/src/components/MonthlyCharts";
import { SubjectTable } from "@/src/components/SubjectTable";
import { AttendancePrediction } from "@/src/components/AttendancePrediction";

type AnalyticsPayload = {
  overallAttendance: number;
  totalLectures: number;
  present: number;
  absent: number;
  totalClassesAttended: number;
  totalClassesMissed: number;
  streak: number;
  classesToday: number;
  monthlyAttendance: Array<{ month: string; percentage: number; present: number; absent: number; total: number }>;
  subjectStats: Array<{
    subject: string;
    subjectCode?: string;
    present: number;
    absent: number;
    remote: number;
    total: number;
    attendancePercentage: number;
  }>;
  weeklyDistribution: Array<{ day: string; percentage: number; present: number; absent: number; total: number }>;
  attendanceBreakdown: Array<{ name: string; value: number }>;
  heatmapData: Array<{
    date: string;
    count: number;
    status: "present" | "absent" | "late" | "no-class";
    subject: string;
    tooltip: string;
  }>;
  prediction: {
    primaryMessage: string;
    riskMessage: string;
    ifAttendNext5: number;
    ifMissNext2: number;
    classesNeededFor75: number;
    threshold: number;
  } | null;
  lowAttendanceAlert: {
    active: boolean;
    threshold: number;
    classesNeeded: number;
    message: string;
  } | null;
};

const emptyPayload: AnalyticsPayload = {
  overallAttendance: 0,
  totalLectures: 0,
  present: 0,
  absent: 0,
  totalClassesAttended: 0,
  totalClassesMissed: 0,
  streak: 0,
  classesToday: 0,
  monthlyAttendance: [],
  subjectStats: [],
  weeklyDistribution: [],
  attendanceBreakdown: [],
  heatmapData: [],
  prediction: null,
  lowAttendanceAlert: null,
};

export default function StudentAnalyticsDashboardPage() {
  const [payload, setPayload] = useState<AnalyticsPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading analytics...");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/student/analytics");
        setPayload({ ...emptyPayload, ...(res.data || {}) });
        setMessage("Analytics loaded.");
      } catch (error) {
        const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setMessage(apiMessage || "Failed to load student analytics.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const exportCsv = async () => {
    try {
      const res = await api.get("/reports/student/daily/csv", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "student_analytics_report.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setMessage("Failed to export attendance report.");
    }
  };

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Analytics Dashboard">
        <div className="space-y-4">
          <section className="rounded-[1.9rem] border border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.82),rgba(240,246,255,0.72))] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.1)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Student Intelligence</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Attendance insights that actually help you plan</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Track your streak, identify weak subjects, and understand how the next few classes change your attendance.
                </p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </div>
          </section>

          {loading ? (
            <section className="rounded-[1.8rem] border border-white/60 bg-white/60 p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
              <p className="mt-3 text-sm text-slate-600">{message}</p>
            </section>
          ) : (
            <>
              <StudentAnalyticsCards
                overallAttendance={payload.overallAttendance}
                totalClassesAttended={payload.totalClassesAttended}
                totalClassesMissed={payload.totalClassesMissed}
                totalLectures={payload.totalLectures}
                streak={payload.streak}
                classesToday={payload.classesToday}
              />

              <AttendancePrediction prediction={payload.prediction} lowAttendanceAlert={payload.lowAttendanceAlert} />
              <AttendanceHeatmap data={payload.heatmapData} />
              <MonthlyCharts
                monthlyAttendance={payload.monthlyAttendance}
                subjectStats={payload.subjectStats}
                weeklyDistribution={payload.weeklyDistribution}
                attendanceBreakdown={payload.attendanceBreakdown}
              />
              <SubjectTable rows={payload.subjectStats} />
            </>
          )}

          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
            {message}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
