"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/auth-context";

const menuByRole: Record<string, Array<{ href: string; label: string }>> = {
  admin: [
    { href: "/admin", label: "Admin Dashboard" },
    { href: "/admin/colleges", label: "Colleges" },
    { href: "/admin/hods", label: "HODs" },
    { href: "/admin/users", label: "Users" },
  ],
  hod: [
    { href: "/hod", label: "HOD Dashboard" },
    { href: "/hod/department", label: "My Department" },
    { href: "/hod/teachers", label: "Assign Teacher" },
    { href: "/hod/coordinators", label: "Assign Coordinator" },
    { href: "/hod/subjects", label: "Create Subject" },
  ],
  teacher: [
    { href: "/teacher", label: "Teacher Dashboard" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
    { href: "/teacher/reports", label: "Reports" },
  ],
  student: [
    { href: "/student", label: "Student Dashboard" },
    { href: "/student/scan", label: "Scan Face" },
    { href: "/student/history", label: "Attendance History" },
    { href: "/student/classroom", label: "Virtual Classroom" },
  ],
  coordinator: [
    { href: "/coordinator", label: "Coordinator Dashboard" },
    { href: "/teacher", label: "Classroom Dashboard" },
    { href: "/teacher/invite", label: "Invite Students" },
    { href: "/teacher/attendance", label: "Start Attendance" },
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

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[250px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-4">
          <Link href="/" className="text-lg font-semibold text-[#135ed8]">
            VisionAttend
          </Link>
          <p className="mt-1 text-xs text-slate-500">AI Smart Attendance ERP</p>
          <nav className="mt-6 space-y-2">
            {menu.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm ${
                    active ? "bg-[#135ed8] text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div>
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {user?.name} ({user?.role})
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
              >
                Logout
              </button>
            </div>
          </header>

          <main className="p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
