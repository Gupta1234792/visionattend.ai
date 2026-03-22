"use client";

import { useEffect, useState, useRef } from "react";
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
  prediction: any;
  lowAttendanceAlert: any;
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

  // 🔥 IMPORTANT: store last data to prevent re-render storm
  const payloadRef = useRef<AnalyticsPayload>(emptyPayload);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const res = await api.get("/student/analytics");
        const newData = { ...emptyPayload, ...(res.data || {}) };

        if (!isMounted) return;

        // 🧠 ONLY update if data actually changed
        if (JSON.stringify(payloadRef.current) !== JSON.stringify(newData)) {
          payloadRef.current = newData;
          setPayload(newData);
        }

        setMessage("Analytics loaded.");
      } catch (error) {
        const apiMessage = (error as any)?.response?.data?.message;
        setMessage(apiMessage || "Failed to load student analytics.");
      } finally {
        if (isMounted) setLoading(false); // only first load matters
      }
    };

    load();

    // 🔁 OPTIONAL polling (safe)
    const interval = setInterval(load, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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
          
          {/* HEADER */}
          <section className="rounded-[1.9rem] border border-white/60 bg-white/80 p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Attendance Insights</h1>
                <p className="text-sm text-gray-600">Track and improve your performance</p>
              </div>

              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-white border rounded-full shadow-sm"
              >
                <Download size={16} />
                Export
              </button>
            </div>
          </section>

          {/* LOADING */}
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 className="animate-spin mx-auto" />
              <p className="mt-2 text-sm">{message}</p>
            </div>
          ) : (
            <>
              <StudentAnalyticsCards {...payload} />
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

          {/* MESSAGE */}
          <div className="p-3 text-sm text-gray-600">{message}</div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}