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

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [filter]);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await load();
    } catch {
      setMessage("Failed to mark notification.");
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      await load();
    } catch {
      setMessage("Failed to mark all as read.");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "teacher", "coordinator", "student", "parent"]}>
      <DashboardLayout title="Notification Center">
        <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
              <p className="mt-1 text-sm text-slate-600">
                WhatsApp-style unread feed for lecture, holiday, and system updates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-semibold text-white"
            >
              Mark All Read
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["all", "unread", "read"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                  filter === value
                    ? "border-[#128c7e] bg-[#dff7ea] text-[#128c7e]"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {items.map((item) => (
              <article
                key={item._id}
                className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${
                  item.isRead
                    ? "border-slate-200 bg-white"
                    : "border-[#b7ebd0] bg-[#ecfff4]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      {item.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.isRead
                          ? "bg-slate-100 text-slate-600"
                          : "bg-[#25d366]/15 text-[#128c7e]"
                      }`}
                    >
                      {item.isRead ? "Read" : "Unread"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">
                      {item.status || "delivered"}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {item.message}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {!item.isRead ? (
                    <button
                      type="button"
                      onClick={() => void markRead(item._id)}
                      className="rounded-full border border-[#128c7e] bg-white px-3 py-1.5 text-xs font-semibold text-[#128c7e]"
                    >
                      Mark Read
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                No notifications found for this filter.
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-3 text-sm text-slate-600">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
