"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import api from "@/src/services/api";

type ChildRow = {
  _id: string;
  studentId?: { _id?: string; name?: string; rollNo?: string };
};

type DailyRow = {
  sessionId: string;
  date: string;
  subject: string;
  subjectCode: string;
  status: string;
  locationFlag: string;
  distanceMeters: number | null;
  gpsDistance: number | null;
  markedAt: string | null;
};

export default function ParentReportsPage() {
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Parent report page ready.");

  const loadChildren = async () => {
    try {
      const res = await api.get("/parents/my-children");
      const linked = res.data?.children || [];
      setChildren(linked);
      if (!selectedStudentId && linked[0]?.studentId?._id) {
        setSelectedStudentId(linked[0].studentId._id);
      }
    } catch {
      setChildren([]);
      setMessage("Unable to load linked children.");
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (studentId: string) => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await api.get(`/parents/daily-report?studentId=${studentId}`);
      setRows(res.data?.records || []);
      setMessage("Child daily attendance report loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setRows([]);
      setMessage(apiMessage || "Unable to load child report.");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    if (!selectedStudentId) {
      setMessage("Select a child first.");
      return;
    }

    try {
      const res = await api.get(`/parents/daily-report/csv?studentId=${selectedStudentId}`, {
        responseType: "blob"
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "parent_child_daily_report.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Child daily report exported.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to export child report.");
    }
  };

  useEffect(() => {
    void loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      void loadReport(selectedStudentId);
    }
  }, [selectedStudentId]);

  return (
    <ProtectedRoute allow={["parent"]}>
      <DashboardLayout title="Child Reports">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Parent Reports</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Daily attendance detail and export</h1>
              <p className="mt-2 text-sm text-slate-600">Review the selected child&apos;s daily attendance log and export it as CSV from a dedicated parent page.</p>
            </div>
            <div className="flex min-w-[280px] flex-wrap gap-2">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
              >
                <option value="">Choose linked student</option>
                {children.map((child) => (
                  <option key={child._id} value={child.studentId?._id || ""}>
                    {child.studentId?.name || "Unknown"} {child.studentId?.rollNo ? `(${child.studentId.rollNo})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void downloadCsv()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#1459d2] px-4 py-3 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
              <p className="mt-3 text-sm text-slate-600">Loading child report...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Date</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Flag</th>
                    <th className="py-2">College Distance</th>
                    <th className="py-2">Session Distance</th>
                    <th className="py-2">Marked At</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sessionId} className="border-b border-slate-100">
                      <td className="py-2">{row.date}</td>
                      <td className="py-2">{row.subjectCode || row.subject}</td>
                      <td className="py-2 capitalize">{row.status}</td>
                      <td className="py-2 uppercase">{row.locationFlag}</td>
                      <td className="py-2">{row.distanceMeters ?? "-"}</td>
                      <td className="py-2">{row.gpsDistance ?? "-"}</td>
                      <td className="py-2">{row.markedAt ? new Date(row.markedAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={7}>
                        No daily attendance records found for the selected child.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
