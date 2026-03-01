"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type Subject = { _id: string; name: string; code: string };
type Summary = { totalRecords: number; present: number; remote: number; absent: number };
type ExportRow = {
  Date: string;
  BatchKey: string;
  Subject: string;
  SubjectCode: string;
  StudentName: string;
  RollNo: string;
  Status: string;
  Flag: string;
  MarkedAt: string;
};

const todayKey = new Date().toISOString().split("T")[0];
const beforeThirty = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export default function ExportCenterPage() {
  const [message, setMessage] = useState("Export center ready.");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalRecords: 0, present: 0, remote: 0, absent: 0 });
  const [filters, setFilters] = useState({
    dateFrom: beforeThirty,
    dateTo: todayKey,
    batchKey: "",
    subjectId: ""
  });

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const query = (format: "json" | "csv" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.batchKey.trim()) params.set("batchKey", filters.batchKey.trim());
    if (filters.subjectId) params.set("subjectId", filters.subjectId);
    return params.toString();
  };

  const loadSubjects = async () => {
    try {
      const res = await api.get("/subjects/mine");
      setSubjects(res.data?.subjects || []);
    } catch {
      setSubjects([]);
    }
  };

  const loadPreview = async () => {
    try {
      const res = await api.get(`/reports/export-center?${query("json")}`);
      setRows(res.data?.rows || []);
      setSummary(res.data?.summary || { totalRecords: 0, present: 0, remote: 0, absent: 0 });
      setMessage("Preview generated.");
    } catch (error) {
      setRows([]);
      setSummary({ totalRecords: 0, present: 0, remote: 0, absent: 0 });
      setMessage(parseApiError(error, "Failed to load export preview."));
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSubjects();
      void loadPreview();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const download = async (format: "csv" | "pdf") => {
    try {
      const res = await api.get(`/reports/export-center?${query(format)}`, {
        responseType: "blob"
      });
      const type = format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8;";
      const blob = new Blob([res.data], { type });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `attendance_export_center.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage(`${format.toUpperCase()} exported.`);
    } catch (error) {
      setMessage(parseApiError(error, `Failed to export ${format.toUpperCase()}.`));
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "teacher", "coordinator"]}>
      <DashboardLayout title="Export Center">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold">Date Range + Batch Export</h2>
          <p className="mt-1 text-sm text-slate-600">Export attendance by date range, batch, and subject.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Batch Key (optional)" value={filters.batchKey} onChange={(e) => setFilters((p) => ({ ...p, batchKey: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={filters.subjectId} onChange={(e) => setFilters((p) => ({ ...p, subjectId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All Subjects</option>
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadPreview()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Preview</button>
            <button type="button" onClick={() => void download("csv")} className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white">Export CSV</button>
            <button type="button" onClick={() => void download("pdf")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Export PDF</button>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold">{summary.totalRecords}</p></div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3"><p className="text-xs text-green-700">Present</p><p className="text-xl font-bold text-green-800">{summary.present}</p></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Remote</p><p className="text-xl font-bold text-amber-800">{summary.remote}</p></div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3"><p className="text-xs text-rose-700">Absent</p><p className="text-xl font-bold text-rose-800">{summary.absent}</p></div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Batch</th>
                  <th className="py-2">Subject</th>
                  <th className="py-2">Roll No</th>
                  <th className="py-2">Student</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Flag</th>
                  <th className="py-2">Marked At</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((row, index) => (
                  <tr key={`${row.RollNo}-${row.MarkedAt}-${index}`} className="border-b border-slate-100">
                    <td className="py-2">{row.Date}</td>
                    <td className="py-2">{row.BatchKey}</td>
                    <td className="py-2">{row.SubjectCode || row.Subject}</td>
                    <td className="py-2">{row.RollNo}</td>
                    <td className="py-2">{row.StudentName}</td>
                    <td className="py-2 capitalize">{row.Status}</td>
                    <td className="py-2 uppercase">{row.Flag || "-"}</td>
                    <td className="py-2">{row.MarkedAt ? new Date(row.MarkedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td className="py-3 text-slate-500" colSpan={8}>No records for selected filters.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
