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
};

export default function AdminAuditPage() {
  const [message, setMessage] = useState("Loading audit timeline...");
  const [items, setItems] = useState<AuditItem[]>([]);

  const loadAudit = async () => {
    try {
      const res = await api.get("/admin/audit-trail?limit=100");
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
  }, []);

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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Who Created/Edited What</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadAudit()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">Refresh</button>
              <button type="button" onClick={() => void runArchiveJob()} className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white">Run Archive Job</button>
            </div>
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
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr><td className="py-3 text-slate-500" colSpan={5}>No audit rows found.</td></tr>
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
