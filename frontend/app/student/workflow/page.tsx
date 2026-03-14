"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import api from "@/src/services/api";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";
import { useAuth } from "@/src/context/auth-context";

export default function StudentWorkflowPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ dailyRows: 0, lectures: 0, unreadNotifications: 0, activeSession: false });

  const batchKey = useMemo(() => {
    if (!user?.department || !user?.year || !user?.division) return "";
    return `${user.department}_${user.year}_${user.division}`;
  }, [user?.department, user?.year, user?.division]);

  useEffect(() => {
    const load = async () => {
      try {
        const tasks = [
          api.get("/reports/student/daily"),
          api.get("/notifications/my?isRead=false&limit=5"),
          api.get("/attendance/active-class")
        ];

        if (batchKey) {
          tasks.push(api.get(`/lectures/batch/${batchKey}`));
        }

        const [dailyRes, notificationRes, activeRes, lectureRes] = await Promise.all(tasks);
        setStats({
          dailyRows: (dailyRes.data?.records || []).length,
          unreadNotifications: Number(notificationRes.data?.unread || 0),
          activeSession: Boolean(activeRes.data?.session?._id),
          lectures: Array.isArray((lectureRes as { data?: { lectures?: unknown[] } })?.data?.lectures)
            ? (((lectureRes as { data?: { lectures?: unknown[] } })?.data?.lectures || []).length)
            : 0
        });
      } catch {
        setStats({ dailyRows: 0, lectures: 0, unreadNotifications: 0, activeSession: false });
      }
    };
    void load();
  }, [batchKey]);

  const steps = [
    { title: "Register Face", href: "/student/face-register", detail: "Complete live face registration before using attendance flows." },
    { title: "Check Timetable", href: "/timetables", detail: "See today’s and this week’s published class schedule." },
    { title: "Scan Attendance", href: "/student/scan", detail: "When a session is active, scan face and share geolocation." },
    { title: "Track Analytics", href: "/student/dashboard", detail: "Review heatmap, trends, prediction, and subject performance." },
    { title: "Review History", href: "/student/history", detail: "Open attendance history and classroom-level records." },
    { title: "Open Classroom", href: "/student/classroom", detail: "See teachers, coordinator, and batch details." },
  ];

  return (
    <ProtectedRoute allow={["student"]}>
      <DashboardLayout title="Student Workflow">
        <section className="rounded-[1.8rem] border border-white/60 bg-white/65 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Student Workflow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Daily student journey</h1>
          <p className="mt-2 text-sm text-slate-600">A dedicated page for the student flow from face registration and attendance scanning to timetable, history, and analytics.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Daily Attendance Rows</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.dailyRows}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Scheduled Lectures</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.lectures}</p></article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4"><p className="text-xs text-slate-500">Unread Notifications</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.unreadNotifications}</p></article>
            <article className={`rounded-2xl border p-4 ${stats.activeSession ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white/80"}`}><p className="text-xs text-slate-500">Active Session</p><p className="mt-2 text-3xl font-semibold text-slate-900">{stats.activeSession ? "Live" : "None"}</p></article>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {steps.map((step, index) => (
            <Link key={step.href} href={step.href} className="rounded-[1.6rem] border border-white/60 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {index + 1}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
            </Link>
          ))}
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
