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
  const { user, token, loading } = useAuth();
  const devBypassEnabled = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
  const devFaceBypassed =
    typeof window !== "undefined" &&
    devBypassEnabled &&
    (sessionStorage.getItem("va_dev_face_verified") === "true" ||
      localStorage.getItem("va_dev_face_verified") === "true");

  useEffect(() => {
    if (loading) return;
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
      !devFaceBypassed &&
      pathname !== "/student/face-register" &&
      pathname !== "/student/register";

    if (studentFacePending) {
      router.replace("/student/face-register");
    }
  }, [allow, token, user, loading, router, pathname, devFaceBypassed]);

  const studentFacePending =
    user?.role === "student" &&
    !user.faceRegistered &&
    !devFaceBypassed &&
    pathname !== "/student/face-register" &&
    pathname !== "/student/register";

  if (loading || !token || !user || !allow.includes(user.role) || studentFacePending) {
    return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  }

  return <>{children}</>;
}
