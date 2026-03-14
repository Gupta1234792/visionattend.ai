"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Mail,
  PanelsTopLeft,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";

const menuByRole: Record<string, Array<{ href: string; label: string }>> = {
  admin: [
    { href: "/admin", label: "Admin Dashboard" },
    { href: "/admin/workflow", label: "Workflow" },
    { href: "/admin/colleges", label: "Colleges" },
    { href: "/admin/hods", label: "HODs" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/audit", label: "Audit Trail" },
    { href: "/webhooks", label: "Webhooks" },
    { href: "/announcements", label: "Announcements" },
    { href: "/chat", label: "Chat" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  hod: [
    { href: "/hod", label: "HOD Dashboard" },
    { href: "/hod/workflow", label: "Workflow" },
    { href: "/hod/department", label: "My Department" },
    { href: "/hod/teachers", label: "Assign Teacher" },
    { href: "/hod/coordinators", label: "Assign Coordinator" },
    { href: "/hod/subjects", label: "Create Subject" },
    { href: "/webhooks", label: "Webhooks" },
    { href: "/announcements", label: "Announcements" },
    { href: "/chat", label: "Chat" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  teacher: [
    { href: "/teacher", label: "Teacher Dashboard" },
    { href: "/teacher/workflow", label: "Workflow" },
    { href: "/timetables", label: "My Timetable" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
    { href: "/teacher/reports", label: "Reports" },
    { href: "/announcements", label: "Announcements" },
    { href: "/chat", label: "Chat" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  student: [
    { href: "/student", label: "Student Dashboard" },
    { href: "/student/workflow", label: "Workflow" },
    { href: "/student/dashboard", label: "Analytics" },
    { href: "/timetables", label: "Today Timetable" },
    { href: "/student/scan", label: "Scan Face" },
    { href: "/student/history", label: "Attendance History" },
    { href: "/student/classroom", label: "Virtual Classroom" },
    { href: "/notifications", label: "Notifications" },
  ],
  coordinator: [
    { href: "/coordinator", label: "Timetable & Holidays" },
    { href: "/coordinator/workflow", label: "Workflow" },
    { href: "/coordinator/timetable", label: "Smart Timetable" },
    { href: "/coordinator/timetable/templates", label: "Weekly Templates" },
    { href: "/timetables", label: "Published Timetables" },
    { href: "/announcements", label: "Announcements" },
    { href: "/chat", label: "Chat" },
    { href: "/teacher", label: "Classroom Dashboard" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  parent: [
    { href: "/parent", label: "Parent Dashboard" },
    { href: "/parent/schedule", label: "Schedule" },
    { href: "/parent/reports", label: "Reports" },
  ],
};

export function DashboardLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const menu = menuByRole[user?.role || ""] || [];
  const [unreadCount, setUnreadCount] = useState(0);

  const primaryMenu = menu.slice(0, 1);
  const moduleMenu = menu.slice(1);
  const greetingName = user?.name ? user.name.split(" ")[0] : "User";
  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((chunk) => chunk[0])
        .join("")
        .toUpperCase()
    : "VA";

  useEffect(() => {
    let mounted = true;

    const loadUnread = async () => {
      if (!user) return;
      try {
        const res = await api.get("/notifications/my?isRead=false&limit=10");
        if (!mounted) return;
        setUnreadCount(Number(res.data?.unread || 0));
      } catch {
        if (mounted) setUnreadCount(0);
      }
    };

    void loadUnread();
    const interval = window.setInterval(() => void loadUnread(), 30000);
    const onFocus = () => void loadUnread();
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef4ff,transparent_40%),radial-gradient(circle_at_bottom_right,#dde9ff,transparent_45%),#eaedf8] p-3 md:p-4">
      <div className="mx-auto grid min-h-[calc(100vh-1rem)] max-w-[1700px] gap-4 rounded-[2rem] border border-white/50 bg-white/40 p-3 shadow-[0_20px_70px_rgba(25,45,100,0.12)] backdrop-blur-xl lg:grid-cols-[270px_1fr]">
        <aside className="hidden flex-col rounded-[1.75rem] border border-white/50 bg-gradient-to-b from-white/60 to-[#e8efff]/70 p-4 shadow-inner lg:flex">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-[30px] font-semibold text-slate-800">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#2f6dd7] text-white">
              <PanelsTopLeft className="h-4 w-4" />
            </span>
            <span className="text-2xl font-semibold tracking-tight">VisionAttend</span>
          </Link>

          <div className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Signed In</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{user?.name}</p>
            <p className="text-xs uppercase text-slate-500">{user?.role}</p>
          </div>

          <nav className="mt-5 flex-1 space-y-3">
            <div>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overview</p>
              <div className="space-y-1">
                {primaryMenu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                        active
                          ? "bg-[#dfe9ff] font-semibold text-[#2358bb] shadow-sm"
                          : "text-slate-600 hover:bg-white/70"
                      }`}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Modules</p>
              <div className="space-y-1">
                {moduleMenu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const isNotification = item.href === "/notifications";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                        active
                          ? "bg-[#dfe9ff] font-semibold text-[#2358bb] shadow-sm"
                          : "text-slate-600 hover:bg-white/70"
                      }`}
                    >
                      {isNotification ? (
                        <span className="relative inline-flex">
                          <Bell className="h-4 w-4" />
                          {unreadCount > 0 ? (
                            <span className="absolute -right-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current/70" />
                      )}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          <button
            type="button"
            onClick={logout}
            className="mt-4 inline-flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </aside>

        <div className="min-w-0 rounded-[1.75rem] border border-white/50 bg-gradient-to-b from-white/60 to-[#edf3ff]/70 p-3">
          <div className="mb-3 rounded-2xl border border-white/70 bg-white/70 p-3 lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">VisionAttend</p>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>

            <p className="mt-1 text-xs uppercase text-slate-500">
              {user?.name} • {user?.role}
            </p>

            {menu.length ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {menu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                        active
                          ? "border-[#2f6dd7] bg-[#dfe9ff] text-[#2358bb]"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <header className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 w-full flex-1 sm:min-w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-full border border-slate-200 bg-white/90 pl-10 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#8fb4ff]"
                  placeholder="Search for modules, classes, attendance..."
                />
              </label>

              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => router.push("/notifications")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600"
              >
                <Mail className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => router.push("/notifications")}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2f6dd7] to-[#6ca5ff] text-sm font-bold text-white">
                {initials}
              </span>
            </div>
          </header>

          <div className="mt-4 rounded-[1.5rem] border border-white/70 bg-white/70 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {user?.role} Workspace
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  Hello {greetingName}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{title}</p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full bg-[#1f3768] px-3 py-2 text-white shadow-lg sm:px-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#4f86e6]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold sm:text-lg">
                  {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>

            <main>{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
