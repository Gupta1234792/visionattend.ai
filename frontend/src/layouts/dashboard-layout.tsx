"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PanelsTopLeft,
  RefreshCcw,
  Search,
  X,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);

  const primaryMenu = menu.slice(0, 1);
  const moduleMenu = menu.slice(1);
  const bottomNavItems = useMemo(() => menu.slice(0, 4), [menu]);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const x = event.touches[0]?.clientX ?? null;
      touchStartXRef.current = x;
      touchCurrentXRef.current = x;
    };

    const onTouchMove = (event: TouchEvent) => {
      touchCurrentXRef.current = event.touches[0]?.clientX ?? null;
    };

    const onTouchEnd = () => {
      const startX = touchStartXRef.current;
      const endX = touchCurrentXRef.current;
      if (startX == null || endX == null) return;
      const delta = endX - startX;

      if (!sidebarOpen && startX <= 28 && delta > 60) {
        setSidebarOpen(true);
      }

      if (sidebarOpen && delta < -60) {
        setSidebarOpen(false);
      }

      touchStartXRef.current = null;
      touchCurrentXRef.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [sidebarOpen]);

  const renderLinks = (items: Array<{ href: string; label: string }>, mobile = false) =>
    items.map((item) => {
      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
      const isNotification = item.href === "/notifications";

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setSidebarOpen(false)}
          className={`flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
            active
              ? "bg-[#dfe9ff] font-semibold text-[#2358bb] shadow-sm"
              : "text-slate-600 hover:bg-white/70"
          } ${mobile ? "justify-between" : ""}`}
        >
          <span className="inline-flex items-center gap-3">
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
          </span>
          {mobile ? <ChevronRight className="h-4 w-4 opacity-60" /> : null}
        </Link>
      );
    });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#eef4ff,transparent_40%),radial-gradient(circle_at_bottom_right,#dde9ff,transparent_45%),#eaedf8] px-3 py-3 pb-24 text-slate-900 transition-colors duration-200 sm:px-4 md:px-6 md:pb-6">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-white/50 bg-gradient-to-b from-white/95 to-[#e8efff]/95 p-4 shadow-[0_20px_70px_rgba(25,45,100,0.18)] transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-slate-800" onClick={() => setSidebarOpen(false)}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#2f6dd7] text-white">
              <PanelsTopLeft className="h-4 w-4" />
            </span>
            <span className="text-xl font-semibold tracking-tight">VisionAttend</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

          <div className="mt-4 rounded-2xl border border-white/60 bg-white/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Signed In</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{user?.name}</p>
          <p className="text-xs uppercase text-slate-500">{user?.role}</p>
        </div>

        <nav className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overview</p>
            <div className="space-y-1">{renderLinks(primaryMenu, true)}</div>
          </div>
          <div>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Modules</p>
            <div className="space-y-1">{renderLinks(moduleMenu, true)}</div>
          </div>
        </nav>

        <button
          type="button"
          onClick={logout}
          className="mt-4 inline-flex min-h-[44px] items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-medium text-slate-700"
        >
          <span className="inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Logout
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </aside>

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

          <nav className="mt-5 flex-1 space-y-4">
            <div>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overview</p>
              <div className="space-y-1">
                {primaryMenu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-3 text-sm transition ${
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
              <div className="space-y-1">{renderLinks(moduleMenu)}</div>
            </div>
          </nav>

          <button
            type="button"
            onClick={logout}
            className="mt-4 inline-flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </aside>

        <div className="min-w-0 rounded-[1.75rem] border border-white/50 bg-gradient-to-b from-white/60 to-[#edf3ff]/70 p-3">
          <header className="min-h-[72px] rounded-2xl border border-white/70 bg-white/70 px-3 py-3 shadow-sm sm:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700 transition active:scale-95"
                  aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
                  <p className="text-xs uppercase text-slate-500">{user?.role}</p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#2f6dd7] to-[#6ca5ff] text-sm font-bold text-white">
                  {initials}
                </span>
              </div>

              <label className="relative min-w-0 w-full flex-1 sm:min-w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-full border border-slate-200 bg-white/90 pl-10 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#8fb4ff]"
                  placeholder="Search for modules, classes, attendance..."
                />
              </label>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 active:scale-95"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/notifications")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 active:scale-95"
                >
                  <Mail className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/notifications")}
                  className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 active:scale-95"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </button>

                <span className="hidden h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#2f6dd7] to-[#6ca5ff] text-sm font-bold text-white lg:inline-flex">
                  {initials}
                </span>
              </div>
            </div>
          </header>

          <div className="mt-4 rounded-[1.5rem] border border-white/70 bg-white/70 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2f6dd7]">
                  {user?.role || "workspace"}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {title}
                </h1>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-600">
                <PanelsTopLeft className="h-4 w-4 text-[#2f6dd7]" />
                <span className="truncate">Workspace synced for {user?.role || "user"}</span>
              </div>
            </div>

            <div className="overflow-x-hidden">{children}</div>
          </div>
        </div>
      </div>

      {bottomNavItems.length ? (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/60 bg-white/92 px-2 py-2 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
            {bottomNavItems.map((item, index) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium transition active:scale-95 ${
                    active
                      ? "bg-[#dfe9ff] text-[#2358bb]"
                      : "text-slate-600"
                  }`}
                >
                  <span className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70">
                    {index === 0 ? (
                      <LayoutDashboard className="h-4 w-4" />
                    ) : index === 1 ? (
                      <PanelsTopLeft className="h-4 w-4" />
                    ) : index === 2 ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                  </span>
                  <span className="truncate">{item.label.split(" ")[0]}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
