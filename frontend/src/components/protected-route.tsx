"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserRole } from "@/src/services/auth";
import { useAuth } from "@/src/context/auth-context";

export function ProtectedRoute({
  allow,
  children,
}: {
  allow: UserRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuth();

  useEffect(() => {
    if (!token || !user) {
      router.replace("/auth");
      return;
    }
    if (!allow.includes(user.role)) {
      router.replace(`/${user.role}`);
      return;
    }

    const studentFacePending =
      user.role === "student" &&
      !user.faceRegistered &&
      pathname !== "/student/face-register" &&
      pathname !== "/student/register";

    if (studentFacePending) {
      router.replace("/student/face-register");
    }
  }, [allow, token, user, router, pathname]);

  const studentFacePending =
    user?.role === "student" &&
    !user.faceRegistered &&
    pathname !== "/student/face-register" &&
    pathname !== "/student/register";

  if (!token || !user || !allow.includes(user.role) || studentFacePending) {
    return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  }

  return <>{children}</>;
}
