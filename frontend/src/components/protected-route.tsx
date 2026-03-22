"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserRole } from "@/src/services/auth";
import { useAuth } from "@/src/context/auth-context";
import api from "@/src/services/api";

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
  const [readyKey, setReadyKey] = useState("");
  const accessKey = `${token}:${user?.id || ""}:${pathname}:${allow.join(",")}:${devFaceBypassed ? "1" : "0"}`;

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      if (loading) return;

      if (!token || !user) {
        router.replace("/auth");
        return;
      }

      if (!allow.includes(user.role)) {
        router.replace(`/${user.role}`);
        return;
      }

      if (user.role !== "student" || devFaceBypassed) {
        if (!cancelled) setReadyKey(accessKey);
        return;
      }

      let faceRegistered = Boolean(user.faceRegistered);
      try {
        const res = await api.get("/students/me");
        faceRegistered = Boolean(res.data?.student?.faceRegisteredAt);
        const rawUser = localStorage.getItem("va_user");
        if (rawUser) {
          const parsed = JSON.parse(rawUser) as typeof user;
          parsed.faceRegistered = faceRegistered;
          localStorage.setItem("va_user", JSON.stringify(parsed));
        }
      } catch {
        faceRegistered = Boolean(user.faceRegistered);
      }

      const allowedWithoutFace =
        pathname === "/student/face-register" ||
        pathname === "/student/register";

      if (!faceRegistered && !allowedWithoutFace) {
        router.replace("/student/face-register");
        return;
      }

      if (faceRegistered && pathname === "/student/face-register") {
        router.replace("/student/dashboard");
        return;
      }

      if (!cancelled) setReadyKey(accessKey);
    };

    void guard();

    return () => {
      cancelled = true;
    };
  }, [accessKey, allow, devFaceBypassed, loading, pathname, router, token, user]);

  if (loading || !token || !user || !allow.includes(user.role) || readyKey !== accessKey) {
    return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  }

  return <>{children}</>;
}
