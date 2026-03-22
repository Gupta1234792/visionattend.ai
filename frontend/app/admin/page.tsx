"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { useServiceHealth } from "@/src/hooks/use-service-health";
import { resolveSocketBaseUrl } from "@/src/services/network";

type College = { _id: string };
type UsersPayload = {
  hods?: Array<{ _id: string }>;
  teachers?: Array<{ _id: string }>;
  students?: Array<{ _id: string }>;
};

export default function AdminPage() {
  const [message, setMessage] = useState("Loading admin overview...");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    colleges: 0,
    hods: 0,
    teachers: 0,
    students: 0,
  });
  const [activities, setActivities] = useState<string[]>([]);
  const healthFetcher = useCallback(async (path: string) => {
    const res = await fetch(`${resolveSocketBaseUrl()}${path}`, {
      credentials: "include"
    });
    if (!res.ok) {
      throw new Error("Health check failed");
    }
    return res.json();
  }, []);
  const { health, loading: healthLoading } = useServiceHealth(healthFetcher);

  useEffect(() => {
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const [collegeRes, usersRes] = await Promise.all([
            api.get("/colleges"),
            api.get("/admin/users"),
          ]);

          const colleges: College[] = collegeRes.data?.colleges || [];
          const users: UsersPayload = usersRes.data || {};

          setCounts({
            colleges: colleges.length,
            hods: users.hods?.length || 0,
            teachers: users.teachers?.length || 0,
            students: users.students?.length || 0,
          });
          const actions: string[] = [];
          if (colleges.length === 0) actions.push("No college configured yet. Create first college.");
          if ((users.hods?.length || 0) === 0) actions.push("No HOD assigned. Create at least one HOD.");
          if ((users.students?.length || 0) === 0) actions.push("No students onboarded yet. Verify invite flow.");
          if ((users.teachers?.length || 0) < 4) actions.push("Teacher count low. Ask HODs to complete staffing.");
          setActivities(actions);
          setMessage("Use sidebar tabs for separate creation flows.");
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setMessage(apiMessage || "Failed to load admin overview.");
        } finally {
          setLoading(false);
        }
      };
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Admin Dashboard">
        <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <>
                <div className="h-28 animate-pulse rounded-2xl bg-white/80" />
                <div className="h-28 animate-pulse rounded-2xl bg-white/80" />
                <div className="h-28 animate-pulse rounded-2xl bg-white/80" />
                <div className="h-28 animate-pulse rounded-2xl bg-white/80" />
              </>
            ) : (
              <>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Colleges</p>
              <p className="mt-2 text-4xl font-semibold text-slate-900">{counts.colleges}</p>
              <p className="mt-1 text-xs text-slate-500">Active campus units</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">HODs</p>
              <p className="mt-2 text-4xl font-semibold text-slate-900">{counts.hods}</p>
              <p className="mt-1 text-xs text-slate-500">Department leaders</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teachers</p>
              <p className="mt-2 text-4xl font-semibold text-slate-900">{counts.teachers}</p>
              <p className="mt-1 text-xs text-slate-500">Teaching staff</p>
            </article>
            <article className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
              <p className="mt-2 text-4xl font-semibold text-slate-900">{counts.students}</p>
              <p className="mt-1 text-xs text-slate-500">Onboarded learners</p>
            </article>
              </>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">System Health</h2>
              <p className="mt-1 text-sm text-slate-600">Live backend, MongoDB, and OpenCV service status.</p>
            </div>
            {healthLoading ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Checking...</span>
            ) : (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${health.backend.ok && health.mongo.ok && health.opencv.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {health.backend.ok && health.mongo.ok && health.opencv.ok ? "All services healthy" : "Action required"}
              </span>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { label: "Backend", value: health.backend },
              { label: "MongoDB", value: health.mongo },
              { label: "OpenCV", value: health.opencv }
            ].map((item) => (
              <article key={item.label} className="rounded-2xl border border-white/80 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.value.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {item.value.ok ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-900">{item.value.message}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Admin Modules</h2>
          <p className="mt-1 text-sm text-slate-600">
            College and HOD creation are separated in dedicated tabs. Teacher and coordinator creation is handled by HOD.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/admin/colleges" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Colleges</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Open Colleges Tab</p>
            </Link>
            <Link href="/admin/hods" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">HODs</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Open HOD Tab</p>
            </Link>
            <Link href="/admin/users" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teachers</p>
              <p className="mt-2 text-base font-semibold text-slate-900">View Users</p>
            </Link>
            <Link href="/admin/users" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Students</p>
              <p className="mt-2 text-base font-semibold text-slate-900">View Users</p>
            </Link>
            <Link href="/admin/analytics" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Analytics</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Open Analytics</p>
            </Link>
            <Link href="/admin/audit" className="rounded-2xl border border-white/80 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Audit Trail</p>
              <p className="mt-2 text-base font-semibold text-slate-900">Open Audit</p>
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_12px_35px_rgba(35,70,140,0.08)] backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Pending Actions</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {loading ? (
              <>
                <li className="h-11 animate-pulse rounded-xl bg-white/80" />
                <li className="h-11 animate-pulse rounded-xl bg-white/80" />
              </>
            ) : activities.map((item) => (
              <li key={item} className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">{item}</li>
            ))}
            {!loading && activities.length === 0 ? <li className="text-slate-500">No urgent admin action pending.</li> : null}
          </ul>
        </section>

        <div className="mt-4 rounded-2xl border border-white/70 bg-white/75 p-3 text-sm text-slate-700 shadow-[0_8px_25px_rgba(35,70,140,0.06)]">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
