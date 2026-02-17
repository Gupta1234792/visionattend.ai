"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/components/app-context";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/auth", label: "Auth" },
  { href: "/academics", label: "Academics" },
  { href: "/attendance", label: "Attendance" },
  { href: "/lectures", label: "Lectures" },
  { href: "/engagement", label: "Engagement" },
];

const roleNavMap: Record<string, string[]> = {
  admin: ["/", "/auth", "/academics", "/engagement"],
  hod: ["/", "/auth", "/academics", "/engagement"],
  teacher: ["/", "/auth", "/academics", "/attendance", "/lectures", "/engagement"],
  coordinator: ["/", "/auth", "/academics", "/lectures", "/engagement"],
  student: ["/", "/auth", "/attendance", "/lectures", "/engagement"],
  parent: ["/", "/auth", "/lectures", "/engagement"],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { token, user, clearSession } = useAppContext();
  const allowedPaths = user?.role ? roleNavMap[user.role] || ["/", "/auth"] : ["/", "/auth"];
  const visibleNav = navItems.filter((item) => allowedPaths.includes(item.href));
  const isAuthPage = path === "/auth" || path === "/student/register";

  if (isAuthPage) {
    return <main>{children}</main>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl p-4">
          <h1 className="text-xl font-semibold text-brand">VisionAttend</h1>
          <p className="text-sm text-slate-600">Attendance, lectures, PTM, reports, and role-based workflows.</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-brand-soft px-3 py-1">
              {user ? `${user.name} (${user.role})` : "Guest"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Session: {token ? "Logged in" : "Not logged in"}
            </span>
            <button
              onClick={clearSession}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium"
              type="button"
            >
              Logout
            </button>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            {visibleNav.map((item) => {
              const active = path === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? "bg-brand text-white" : "border border-line bg-white text-slate-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
