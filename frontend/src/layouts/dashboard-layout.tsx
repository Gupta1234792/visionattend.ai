"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/auth-context";
import { Bell, LayoutDashboard, LogOut, PanelsTopLeft } from "lucide-react";

const menuByRole: Record<string, Array<{ href: string; label: string }>> = {
  admin: [
    { href: "/admin", label: "Admin Dashboard" },
    { href: "/admin/colleges", label: "Colleges" },
    { href: "/admin/hods", label: "HODs" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/audit", label: "Audit Trail" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  hod: [
    { href: "/hod", label: "HOD Dashboard" },
    { href: "/hod/department", label: "My Department" },
    { href: "/hod/teachers", label: "Assign Teacher" },
    { href: "/hod/coordinators", label: "Assign Coordinator" },
    { href: "/hod/subjects", label: "Create Subject" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  teacher: [
    { href: "/teacher", label: "Teacher Dashboard" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
    { href: "/teacher/reports", label: "Reports" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  student: [
    { href: "/student", label: "Student Dashboard" },
    { href: "/student/scan", label: "Scan Face" },
    { href: "/student/history", label: "Attendance History" },
    { href: "/student/classroom", label: "Virtual Classroom" },
    { href: "/notifications", label: "Notifications" },
  ],
  coordinator: [
    { href: "/coordinator", label: "Coordinator Dashboard" },
    { href: "/teacher", label: "Classroom Dashboard" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
    { href: "/reports/export-center", label: "Export Center" },
    { href: "/notifications", label: "Notifications" },
  ],
  parent: [
    { href: "/parent", label: "Parent Dashboard" },
    { href: "/parent", label: "My Children" },
    { href: "/parent", label: "PTM" },
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
  const { user, logout } = useAuth();
  const menu = menuByRole[user?.role || ""] || [];
  const primaryMenu = menu.slice(0, 1);
  const moduleMenu = menu.slice(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1220] via-[#14233f] to-[#0d1a31] p-2 md:p-3">
      <div className="mx-auto grid min-h-[calc(100vh-1rem)] max-w-[1650px] overflow-hidden rounded-3xl border border-white/10 bg-white/80 shadow-2xl backdrop-blur-sm lg:grid-cols-[290px_1fr]">
        <aside className="border-r border-slate-900/10 bg-gradient-to-b from-[#0f2547] via-[#12325f] to-[#0b1d38] p-5 text-white">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-base font-bold text-white">
            <PanelsTopLeft className="h-4 w-4" />
            VisionAttend
          </Link>
          <p className="mt-2 text-xs text-white/70">AI Smart Attendance ERP</p>

          <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/70">Signed In</p>
            <p className="mt-1 text-sm font-semibold text-white">{user?.name}</p>
            <p className="text-xs uppercase text-white/70">{user?.role}</p>
          </div>

          <nav className="mt-6 space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Overview</p>
              <div className="space-y-1">
                {primaryMenu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                        active ? "bg-white text-[#12325f] shadow-sm" : "text-white/85 hover:bg-white/10"
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
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Modules</p>
              <div className="space-y-1">
                {moduleMenu.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const isNotification = item.href === "/notifications";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                        active ? "bg-white text-[#12325f] shadow-sm" : "text-white/85 hover:bg-white/10"
                      }`}
                    >
                      {isNotification ? <Bell className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-current/70" />}
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
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </aside>

        <div className="flex min-w-0 flex-col bg-gradient-to-b from-[#f8fbff] to-[#edf4ff]">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 px-6 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{user?.role} Workspace</p>
                <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1 text-xs font-medium text-slate-700">
                {user?.name}
              </span>
            </div>
          </header>

          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
