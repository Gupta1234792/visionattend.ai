"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";

type Anomaly = {
  type: string;
  severity: "high" | "medium" | "low";
  student?: { name: string; rollNo: string };
  subject?: { name: string; code: string };
  description: string;
  details: any;
};

type Batch = { department: string; year: string; division: string };

export default function AnomaliesPage() {
  const { user } = useAuth();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    batchId: "",
    startDate: "",
    endDate: "",
    studentId: "",
    subjectId: ""
  });

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const pushToast = (text: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  };

  const loadBatches = async () => {
    if (!user?.department) return;
    try {
      const res = await api.get(`/classroom/${user.department}`);
      const batchInfo = res.data?.batchInfo;
      if (batchInfo) {
        setBatches([{
          department: batchInfo.departmentId || user.department,
          year: batchInfo.year || user.year || "FY",
          division: batchInfo.division || user.division || "A"
        }]);
      }
    } catch (error) {
      pushToast(parseApiError(error, "Failed to load batches"), "error");
    }
  };

  const detectAnomalies = async () => {
    if (!filters.batchId) {
      pushToast("Please select a batch", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get("/anomalies/detect", { params: filters });
      setAnomalies(res.data.anomalies || []);
      pushToast(`Found ${res.data.anomalies.length} anomalies`, "info");
    } catch (error) {
      pushToast(parseApiError(error, "Failed to detect anomalies"), "error");
    } finally {
      setLoading(false);
    }
  };

  const getTrends = async () => {
    if (!filters.batchId) {
      pushToast("Please select a batch", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get("/anomalies/trends", { params: filters });
      setTrends(res.data.trends || []);
      pushToast(`Analyzed ${res.data.summary.analyzedDays} days`, "info");
    } catch (error) {
      pushToast(parseApiError(error, "Failed to get trends"), "error");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!filters.batchId) {
      pushToast("Please select a batch", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get("/anomalies/report", { params: { ...filters, format: "json" } });
      pushToast("Report generated successfully", "success");
      console.log("Report:", res.data.report);
    } catch (error) {
      pushToast(parseApiError(error, "Failed to generate report"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const getBatchId = (batch: Batch) => `${batch.department}_${batch.year}_${batch.division}`;
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-100 text-red-700";
      case "medium": return "bg-amber-100 text-amber-700";
      case "low": return "bg-slate-100 text-slate-600";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "teacher", "coordinator"]}>
      <DashboardLayout title="AI Attendance Anomaly Detection">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        />
        
        <div className="grid gap-6">
          {/* Filters */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Filters</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <select
                value={filters.batchId}
                onChange={(e) => setFilters(prev => ({ ...prev, batchId: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select Batch</option>
                {batches.map((batch) => (
                  <option key={getBatchId(batch)} value={getBatchId(batch)}>
                    {batch.department} - {batch.year} - {batch.division}
                  </option>
                ))}
              </select>
              
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={detectAnomalies}
                disabled={loading}
                className="rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Detect Anomalies
              </button>
              <button
                onClick={getTrends}
                disabled={loading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Get Trends
              </button>
              <button
                onClick={generateReport}
                disabled={loading}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Generate Report
              </button>
            </div>
          </section>

          {/* Anomalies List */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Detected Anomalies</h2>
            <p className="mt-2 text-sm text-slate-600">AI-powered analysis of attendance patterns</p>
            
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">Type</th>
                    <th className="py-2">Severity</th>
                    <th className="py-2">Student/Subject</th>
                    <th className="py-2">Description</th>
                    <th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((anomaly, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getSeverityColor(anomaly.severity)}`}>
                          {anomaly.type}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getSeverityColor(anomaly.severity)}`}>
                          {anomaly.severity}
                        </span>
                      </td>
                      <td className="py-2">
                        {anomaly.student ? (
                          <div>
                            <div>{anomaly.student.name}</div>
                            <div className="text-xs text-slate-500">{anomaly.student.rollNo}</div>
                          </div>
                        ) : anomaly.subject ? (
                          <div>
                            <div>{anomaly.subject.name}</div>
                            <div className="text-xs text-slate-500">{anomaly.subject.code}</div>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2">{anomaly.description}</td>
                      <td className="py-2">
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                            View Details
                          </summary>
                          <pre className="mt-2 text-xs bg-slate-50 p-2 rounded text-slate-600">
                            {JSON.stringify(anomaly.details, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                  {anomalies.length === 0 && (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>No anomalies detected</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Trends Analysis */}
          <section className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
            <h2 className="text-base font-semibold">Trends Analysis</h2>
            <p className="mt-2 text-sm text-slate-600">Pattern changes over time</p>
            
            <div className="mt-4 space-y-4">
              {trends.map((trend, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{trend.description}</h3>
                      <p className="text-sm text-slate-600">{trend.date || trend.week}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getSeverityColor("medium")}`}>
                      {trend.type}
                    </span>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                      View Trend Details
                    </summary>
                    <pre className="mt-2 text-xs bg-slate-50 p-2 rounded text-slate-600">
                      {JSON.stringify(trend.details, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
              {trends.length === 0 && (
                <p className="text-slate-500">No trends available</p>
              )}
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}