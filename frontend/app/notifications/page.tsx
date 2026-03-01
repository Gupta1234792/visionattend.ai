"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  status?: "scheduled" | "delivered" | "failed";
  createdAt: string;
};

export default function NotificationCenterPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState("Loading notifications...");
  const [filter, setFilter] = useState<"all" | "read" | "unread">("all");

  const load = async () => {
    try {
      const params = filter === "all" ? "" : `?isRead=${filter === "read"}`;
      const res = await api.get(`/notifications/my${params}`);
      setItems(res.data?.notifications || []);
      setMessage("Notification center loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to load notifications.");
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [filter]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      void load();
    } catch {
      setMessage("Failed to mark notification.");
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      void load();
    } catch {
      setMessage("Failed to mark all as read.");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "teacher", "coordinator", "student", "parent"]}>
      <DashboardLayout title="Notification Center">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" className={`rounded-lg border px-3 py-1.5 text-xs ${filter === "all" ? "bg-slate-900 text-white" : "border-slate-300"}`} onClick={() => setFilter("all")}>All</button>
              <button type="button" className={`rounded-lg border px-3 py-1.5 text-xs ${filter === "unread" ? "bg-slate-900 text-white" : "border-slate-300"}`} onClick={() => setFilter("unread")}>Unread</button>
              <button type="button" className={`rounded-lg border px-3 py-1.5 text-xs ${filter === "read" ? "bg-slate-900 text-white" : "border-slate-300"}`} onClick={() => setFilter("read")}>Read</button>
            </div>
            <button type="button" onClick={() => void markAllRead()} className="rounded-lg bg-[#135ed8] px-3 py-1.5 text-xs font-semibold text-white">Mark All Read</button>
          </div>

          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <article key={item._id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{item.title}</p>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.isRead ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>{item.isRead ? "Read" : "Unread"}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 uppercase">{item.status || "delivered"}</span>
                  </div>
                </div>
                <p className="mt-1 text-slate-700">{item.message}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()} | {item.type}</p>
                  {!item.isRead ? (
                    <button type="button" onClick={() => void markRead(item._id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Mark Read</button>
                  ) : null}
                </div>
              </article>
            ))}
            {items.length === 0 ? <p className="text-sm text-slate-500">No notifications found.</p> : null}
          </div>
        </section>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
