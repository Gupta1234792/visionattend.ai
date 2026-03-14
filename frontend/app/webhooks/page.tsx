"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";
import {
  createWebhook,
  deleteWebhook,
  getWebhookDeliveries,
  getWebhooks,
  retryWebhookDelivery,
  sendWebhookTest,
  updateWebhook,
  type WebhookDelivery,
  type WebhookEndpoint,
} from "@/src/services/webhooks";

const supportedEvents = [
  "attendance.session.started",
  "attendance.session.closed",
  "attendance.marked",
  "student.face.registered",
  "lecture.scheduled",
  "lecture.live.started",
  "lecture.live.ended",
  "holiday.created",
  "announcement.created",
  "system.webhook.test",
];

const deliveryClass: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  pending: "bg-amber-50 text-amber-700",
};

export default function WebhooksPage() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [message, setMessage] = useState("Loading webhooks...");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [selectedCollegeId, setSelectedCollegeId] = useState("");
  const [colleges, setColleges] = useState<
    Array<{ _id: string; name: string; code?: string }>
  >([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [editingId, setEditingId] = useState("");
  const [lastSavedSecret, setLastSavedSecret] = useState("");
  const [form, setForm] = useState({
    url: "",
    secret: "",
    description: "",
    events: ["*"] as string[],
    isActive: true,
  });

  const collegeId = useMemo(() => {
    if (user?.role === "admin") return selectedCollegeId;
    return String(user?.college || "");
  }, [selectedCollegeId, user?.college, user?.role]);

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  const copyToClipboard = async (value: string, successText: string) => {
    if (!value.trim()) {
      pushToast("Nothing to copy.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      pushToast(successText, "success");
    } catch {
      pushToast("Copy failed.", "error");
    }
  };

  const generateSecret = () => {
    const bytes = new Uint8Array(24);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach((_, index) => {
        bytes[index] = Math.floor(Math.random() * 256);
      });
    }
    const value = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    setForm((current) => ({ ...current, secret: value }));
    pushToast("Webhook secret generated.", "success");
  };

  const resetForm = () => {
    setEditingId("");
    setForm({
      url: "",
      secret: "",
      description: "",
      events: ["*"],
      isActive: true,
    });
  };

  const toggleEvent = (eventName: string) => {
    setForm((current) => {
      if (eventName === "*") {
        return { ...current, events: ["*"] };
      }

      const withoutWildcard = current.events.filter((item) => item !== "*");
      const hasEvent = withoutWildcard.includes(eventName);
      const nextEvents = hasEvent
        ? withoutWildcard.filter((item) => item !== eventName)
        : [...withoutWildcard, eventName];

      return {
        ...current,
        events: nextEvents.length ? nextEvents : ["*"],
      };
    });
  };

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

  const loadWebhooksData = async () => {
    if (!collegeId) {
      setWebhooks([]);
      setDeliveries([]);
      setMessage(
        user?.role === "admin"
          ? "Select a college to manage webhooks."
          : "College context is missing for this account.",
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [endpointRes, deliveryRes] = await Promise.all([
        getWebhooks(collegeId),
        getWebhookDeliveries({ collegeId }),
      ]);
      setWebhooks(endpointRes.webhooks || []);
      setDeliveries(deliveryRes.deliveries || []);
      setMessage("Webhooks loaded.");
    } catch {
      setWebhooks([]);
      setDeliveries([]);
      setMessage("Failed to load webhooks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadColleges();
  }, [user?.role]);

  useEffect(() => {
    void loadWebhooksData();
  }, [collegeId]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!collegeId) {
      pushToast("Select a college before saving a webhook.", "error");
      return;
    }
    if (!form.url.trim() || (!editingId && !form.secret.trim())) {
      pushToast("Webhook URL and secret are required.", "error");
      return;
    }

    setSaving(true);
    const savedSecret = form.secret.trim();
    try {
      if (editingId) {
        await updateWebhook(editingId, {
          collegeId,
          url: form.url.trim(),
          description: form.description.trim(),
          events: form.events,
          isActive: form.isActive,
          ...(form.secret.trim() ? { secret: form.secret.trim() } : {}),
        });
        pushToast("Webhook updated.", "success");
      } else {
        await createWebhook({
          collegeId,
          url: form.url.trim(),
          secret: form.secret.trim(),
          description: form.description.trim(),
          events: form.events,
        });
        pushToast("Webhook created.", "success");
      }
      if (savedSecret) {
        setLastSavedSecret(savedSecret);
      }
      resetForm();
      await loadWebhooksData();
    } catch {
      pushToast("Failed to save webhook.", "error");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (webhook: WebhookEndpoint) => {
    setEditingId(webhook._id);
    setForm({
      url: webhook.url || "",
      secret: "",
      description: webhook.description || "",
      events:
        webhook.events && webhook.events.length ? webhook.events : ["*"],
      isActive: webhook.isActive,
    });
  };

  const onDelete = async (webhookId: string) => {
    try {
      await deleteWebhook(webhookId, collegeId || undefined);
      if (editingId === webhookId) {
        resetForm();
      }
      pushToast("Webhook deleted.", "success");
      await loadWebhooksData();
    } catch {
      pushToast("Failed to delete webhook.", "error");
    }
  };

  const onToggleActive = async (webhook: WebhookEndpoint) => {
    try {
      await updateWebhook(webhook._id, {
        collegeId,
        isActive: !webhook.isActive,
      });
      pushToast(
        webhook.isActive ? "Webhook disabled." : "Webhook enabled.",
        "success",
      );
      await loadWebhooksData();
    } catch {
      pushToast("Failed to update webhook status.", "error");
    }
  };

  const onTest = async (webhookId: string) => {
    setTestingId(webhookId);
    try {
      await sendWebhookTest(webhookId, collegeId || undefined);
      pushToast("Test webhook sent.", "success");
      await loadWebhooksData();
    } catch {
      pushToast("Failed to send test webhook.", "error");
    } finally {
      setTestingId("");
    }
  };

  const onRetry = async (deliveryId: string) => {
    try {
      await retryWebhookDelivery(deliveryId, collegeId || undefined);
      pushToast("Webhook delivery retried.", "success");
      await loadWebhooksData();
    } catch {
      pushToast("Retry failed.", "error");
    }
  };

  return (
    <ProtectedRoute allow={["admin", "hod"]}>
      <DashboardLayout title="Webhooks">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) =>
            setToasts((prev) => prev.filter((item) => item.id !== id))
          }
        />

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingId ? "Edit Webhook" : "Create Webhook"}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Push signed event payloads to your external system.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/webhooks/docs"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  Event Docs
                </Link>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
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
                placeholder="https://your-app.com/webhooks/visionattend"
                value={form.url}
                onChange={(e) =>
                  setForm((current) => ({ ...current, url: e.target.value }))
                }
              />
              <div className="rounded-2xl border border-slate-200 bg-white p-2">
                <input
                  className="w-full rounded-xl border-0 px-2 py-2 text-sm outline-none"
                  placeholder={
                    editingId
                      ? "Enter a new secret to rotate it"
                      : "Webhook secret"
                  }
                  value={form.secret}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      secret: e.target.value,
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2 border-t border-slate-200 px-2 pt-2">
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Generate Secret
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyToClipboard(form.secret, "Webhook secret copied.")
                    }
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Copy Secret
                  </button>
                </div>
              </div>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    description: e.target.value,
                  }))
                }
              />

              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Events
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleEvent("*")}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      form.events.includes("*")
                        ? "border-[#1d63dc] bg-[#e3edff] text-[#1d63dc]"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    All Events
                  </button>
                  {supportedEvents.map((eventName) => (
                    <button
                      key={eventName}
                      type="button"
                      onClick={() => toggleEvent(eventName)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        !form.events.includes("*") && form.events.includes(eventName)
                          ? "border-[#1d63dc] bg-[#e3edff] text-[#1d63dc]"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {eventName}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      isActive: e.target.checked,
                    }))
                  }
                />
                Keep this webhook active after saving
              </label>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-[#1459d2] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Webhook"
                    : "Create Webhook"}
              </button>
            </form>

            {lastSavedSecret ? (
              <div className="mt-5 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-emerald-900">
                      Saved secret
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {lastSavedSecret}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyToClipboard(
                          lastSavedSecret,
                          "Saved secret copied.",
                        )
                      }
                      className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => setLastSavedSecret("")}
                      className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-[1.4rem] border border-slate-200 bg-[#fbfcfe] p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">Signature headers</p>
                <Link
                  href="/webhooks/docs"
                  className="text-xs font-semibold text-[#1459d2]"
                >
                  View payload docs
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                <code className="block rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
                  X-VisionAttend-Event
                </code>
                <code className="block rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
                  X-VisionAttend-Delivery
                </code>
                <code className="block rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
                  X-VisionAttend-Timestamp
                </code>
                <code className="block rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
                  X-VisionAttend-Signature
                </code>
              </div>
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Configured Webhooks
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Manage endpoints, test them, and rotate status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadWebhooksData()}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <p className="text-sm text-slate-500">Loading webhooks...</p>
                ) : webhooks.length ? (
                  webhooks.map((webhook) => (
                    <article
                      key={webhook._id}
                      className="rounded-[1.5rem] border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {webhook.description || webhook.url}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {webhook.url}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            webhook.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {webhook.isActive ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(webhook.events || []).map((eventName) => (
                          <span
                            key={`${webhook._id}_${eventName}`}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                          >
                            {eventName}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <p>Status: {webhook.lastStatus || "idle"}</p>
                        <p>
                          Last Delivery:{" "}
                          {webhook.lastDeliveryAt
                            ? new Date(webhook.lastDeliveryAt).toLocaleString()
                            : "Never"}
                        </p>
                        <p className="truncate">
                          Last Error: {webhook.lastError || "-"}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(webhook)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onToggleActive(webhook)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          {webhook.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onTest(webhook._id)}
                          disabled={testingId === webhook._id}
                          className="rounded-full bg-[#1459d2] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {testingId === webhook._id ? "Testing..." : "Send Test"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(webhook._id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No webhook endpoints created yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Delivery Log
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Track webhook attempts and retry failed deliveries.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadWebhooksData()}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {deliveries.length ? (
                  deliveries.map((delivery) => (
                    <article
                      key={delivery._id}
                      className="rounded-[1.4rem] border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {delivery.event}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {delivery.endpoint?.description ||
                              delivery.endpoint?.url ||
                              "Webhook endpoint"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            deliveryClass[delivery.status] ||
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {delivery.status}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                        <p>Attempts: {delivery.attemptCount || 0}</p>
                        <p>Status Code: {delivery.responseStatus || "-"}</p>
                        <p>
                          Last Attempt:{" "}
                          {delivery.lastAttemptAt
                            ? new Date(delivery.lastAttemptAt).toLocaleString()
                            : "-"}
                        </p>
                        <p>
                          Delivered:{" "}
                          {delivery.deliveredAt
                            ? new Date(delivery.deliveredAt).toLocaleString()
                            : "No"}
                        </p>
                      </div>

                      {delivery.errorMessage ? (
                        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                          {delivery.errorMessage}
                        </p>
                      ) : null}

                      {delivery.status === "failed" ? (
                        <button
                          type="button"
                          onClick={() => void onRetry(delivery._id)}
                          className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                        >
                          Retry Delivery
                        </button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No webhook deliveries yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">
          {message}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
