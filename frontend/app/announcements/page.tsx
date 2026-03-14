"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useAuth } from "@/src/context/auth-context";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import api from "@/src/services/api";
import {
  createAnnouncement,
  getAnnouncements,
  type Announcement,
} from "@/src/services/announcement";

const roleOptionsBySender: Record<string, string[]> = {
  admin: ["hod", "coordinator", "teacher", "student", "parent"],
  hod: ["teacher", "coordinator", "student"],
  coordinator: ["teacher", "student"],
  teacher: ["student"],
};

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [colleges, setColleges] = useState<Array<{ _id: string; name: string; code?: string }>>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState("");
  const [message, setMessage] = useState("Loading announcements...");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [form, setForm] = useState({
    title: "",
    message: "",
    expiresAt: "",
    targetRoles: [] as string[],
  });

  const canCreate = ["admin", "hod", "coordinator", "teacher"].includes(
    user?.role || "",
  );
  const allowedRoles = useMemo(
    () => roleOptionsBySender[user?.role || ""] || [],
    [user?.role],
  );

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, text, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  };

  const loadAnnouncements = async () => {
    try {
      const res =
        user?.role === "admin"
          ? await api.get("/announcements/list", {
              params: selectedCollegeId ? { collegeId: selectedCollegeId } : {},
            }).then((response) => response.data)
          : await getAnnouncements();
      setAnnouncements(res.announcements || []);
      setMessage("Announcements loaded.");
    } catch {
      setAnnouncements([]);
      setMessage("Failed to load announcements.");
    }
  };

  useEffect(() => {
    const loadColleges = async () => {
      if (user?.role !== "admin") return;
      try {
        const res = await api.get("/colleges");
        const rows = res.data?.colleges || [];
        setColleges(rows);
        if (!selectedCollegeId && rows[0]?._id) {
          setSelectedCollegeId(rows[0]._id);
        }
      } catch {
        setColleges([]);
      }
    };
    void loadColleges();
  }, [selectedCollegeId, user?.role]);

  useEffect(() => {
    void loadAnnouncements();
  }, [selectedCollegeId, user?.role]);

  const toggleRole = (role: string) => {
    setForm((current) => ({
      ...current,
      targetRoles: current.targetRoles.includes(role)
        ? current.targetRoles.filter((item) => item !== role)
        : [...current.targetRoles, role],
    }));
  };

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim() || !form.targetRoles.length) {
      pushToast("Title, message, and at least one target role are required.", "error");
      return;
    }

    try {
      const res = await createAnnouncement({
        title: form.title.trim(),
        message: form.message.trim(),
        expiresAt: form.expiresAt || undefined,
        targetRoles: form.targetRoles,
        collegeId: user?.role === "admin" ? selectedCollegeId || undefined : undefined,
      });

      if (!res.success) {
        pushToast(res.message || "Failed to create announcement.", "error");
        return;
      }

      setForm({
        title: "",
        message: "",
        expiresAt: "",
        targetRoles: [],
      });
      pushToast("Announcement sent successfully.", "success");
      await loadAnnouncements();
    } catch {
      pushToast("Failed to create announcement.", "error");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod", "coordinator", "teacher", "student", "parent"]}>
      <DashboardLayout title="Announcements">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) =>
            setToasts((current) => current.filter((toast) => toast.id !== id))
          }
        />

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          {canCreate ? (
            <form
              onSubmit={onCreate}
              className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                Send Announcement
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Select recipient roles and push the same message to the relevant users.
              </p>

              <div className="mt-4 space-y-3">
                {user?.role === "admin" ? (
                  <select
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    value={selectedCollegeId}
                    onChange={(e) => setSelectedCollegeId(e.target.value)}
                  >
                    <option value="">Select college</option>
                    {colleges.map((college) => (
                      <option key={college._id} value={college._id}>
                        {college.name} {college.code ? `(${college.code})` : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  placeholder="Announcement title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, title: e.target.value }))
                  }
                />
                <textarea
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  placeholder="Type announcement message"
                  value={form.message}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, message: e.target.value }))
                  }
                />
                <input
                  type="datetime-local"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, expiresAt: e.target.value }))
                  }
                />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Target Roles
                </p>
                <div className="flex flex-wrap gap-2">
                  {allowedRoles.map((role) => {
                    const active = form.targetRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                          active
                            ? "border-[#1d63dc] bg-[#e3edff] text-[#1d63dc]"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="mt-5 w-full rounded-full bg-[#1459d2] px-4 py-3 text-sm font-semibold text-white"
              >
                Send Announcement
              </button>
            </form>
          ) : (
            <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h2 className="text-lg font-semibold text-slate-900">
                Announcement Feed
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                You can view announcements targeted to your role here.
              </p>
            </section>
          )}

          <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Announcement Feed
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Role-targeted announcements visible to your current account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAnnouncements()}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {announcements.map((announcement) => (
                <article
                  key={announcement._id}
                  className="rounded-[1.4rem] border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {announcement.title}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {announcement.scopeType}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {announcement.targetRoles.join(", ")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {announcement.message}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {announcement.createdBy?.name || "Staff"} •{" "}
                    {new Date(announcement.createdAt).toLocaleString()}
                  </p>
                </article>
              ))}
              {announcements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  No announcements available for your role yet.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-3 text-sm text-slate-600">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
