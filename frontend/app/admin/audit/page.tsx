"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type AuditItem = {
  _id: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: { name?: string; email?: string; role?: string };
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export default function AdminAuditPage() {
  const [message, setMessage] = useState("Loading audit timeline...");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [actionFilter, setActionFilter] = useState("all");

  const loadAudit = async () => {
    try {
      const query = actionFilter === "all" ? "" : `&action=${encodeURIComponent(actionFilter)}`;
      const res = await api.get(`/admin/audit-trail?limit=100${query}`);
      setItems(res.data?.items || []);
      setMessage("Audit timeline loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to load audit trail.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void loadAudit(), 0);
    return () => clearTimeout(timer);
  }, [actionFilter]);

  const runArchiveJob = async () => {
    try {
      await api.post("/admin/archive/run");
      setMessage("Archive + retention job executed.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to run archive job.");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod"]}>
      <DashboardLayout title="Audit Trail">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Who Created/Edited What</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadAudit()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">Refresh</button>
              <button type="button" onClick={() => void runArchiveJob()} className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white">Run Archive Job</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["all", "REQUEST_PASSWORD_RESET", "RESET_PASSWORD", "REGISTER", "LOGIN"].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setActionFilter(action)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  actionFilter === action ? "bg-[#135ed8] text-white" : "border border-slate-300 text-slate-600"
                }`}
              >
                {action === "all" ? "All Actions" : action.replaceAll("_", " ")}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">Time</th>
                  <th className="py-2">Actor</th>
                  <th className="py-2">Module</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Entity</th>
                  <th className="py-2">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-slate-100">
                    <td className="py-2">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="py-2">{item.actorId?.name || "System"} ({item.actorId?.role || "-"})</td>
                    <td className="py-2 uppercase">{item.module}</td>
                    <td className="py-2">{item.action}</td>
                    <td className="py-2">{item.entityType} ({item.entityId})</td>
                    <td className="py-2 text-xs text-slate-600">
                      {item.metadata?.email ? <div>Email: {String(item.metadata.email)}</div> : null}
                      {typeof item.metadata?.emailSent === "boolean" ? (
                        <div className={item.metadata.emailSent ? "text-green-700" : "text-amber-700"}>
                          Mail: {item.metadata.emailSent ? "delivered" : "failed"}
                        </div>
                      ) : null}
                      {!item.metadata || Object.keys(item.metadata).length === 0 ? "-" : null}
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr><td className="py-3 text-slate-500" colSpan={6}>No audit rows found.</td></tr>
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
