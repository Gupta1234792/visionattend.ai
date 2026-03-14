"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ToastItem, ToastStack } from "@/src/components/toast-stack";
import { useAuth } from "@/src/context/auth-context";
import { forgotPassword, resetPassword, UserRole } from "@/src/services/auth";

type Mode = "login" | "register" | "forgot" | "reset";

type MailStatus = {
  kind: "credentials" | "reset";
  state: "sent" | "failed" | "accepted";
  email: string;
} | null;

const roles: UserRole[] = [
  "admin",
  "hod",
  "teacher",
  "coordinator",
  "student",
  "parent",
];

const FORGOT_COOLDOWN_SECONDS = 60;

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, loading, user, token, logout } = useAuth();

  const resetTokenFromQuery = searchParams.get("token") || "";
  const modeFromQuery = searchParams.get("mode");
  const queryMode: Mode | null =
    modeFromQuery === "reset" && resetTokenFromQuery
      ? "reset"
      : modeFromQuery === "forgot"
        ? "forgot"
        : modeFromQuery === "register"
          ? "register"
          : modeFromQuery === "login"
            ? "login"
            : null;

  const [mode, setMode] = useState<Mode>(queryMode || "login");
  const activeMode: Mode = queryMode || mode;
  const [message, setMessage] = useState(
    (queryMode || "login") === "forgot"
      ? "Enter your email to receive reset link."
      : "Secure access to Vision Attendance system.",
  );
  const [mailStatus, setMailStatus] = useState<MailStatus>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
    role: "admin" as UserRole,
  });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "parent" as UserRole,
    bootstrapKey: "",
  });

  const [forgotEmail, setForgotEmail] = useState("");

  const [resetForm, setResetForm] = useState({
    token: resetTokenFromQuery,
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (!cooldownSeconds) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const mailStatusTone = useMemo(() => {
    if (!mailStatus) return "";
    if (mailStatus.state === "sent")
      return "border-green-200 bg-green-50 text-green-800";
    if (mailStatus.state === "failed")
      return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-slate-200 bg-slate-50 text-slate-700";
  }, [mailStatus]);

  const pushToast = (text: string, type: ToastItem["type"]) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, text, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  };

  const openMode = (nextMode: Mode) => {
    setMailStatus(null);
    setMessage(
      nextMode === "forgot"
        ? "Enter your email to receive reset link."
        : "Secure access to Vision Attendance system.",
    );
    setMode(nextMode);
  };

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setMailStatus(null);

    // Validate role selection matches user's actual role
    const res = await login(loginForm);
    setMessage(res.message);

    if (!res.ok) {
      pushToast(res.message, "error");
      return;
    }

    // Check if selected role matches user's actual role
    if (res.role && loginForm.role !== res.role) {
      const errorMsg = "Invalid role selected. Please login with correct role.";
      setMessage(errorMsg);
      pushToast(errorMsg, "error");
      return;
    }

    pushToast("Login successful.", "success");
    const devBypassEnabled = process.env.NEXT_PUBLIC_DEV_BYPASS === "true";
    const devFaceBypassed =
      typeof window !== "undefined" &&
      devBypassEnabled &&
      (sessionStorage.getItem("va_dev_face_verified") === "true" ||
        localStorage.getItem("va_dev_face_verified") === "true");

    if (res.role === "student" && !res.user?.faceRegistered && !devFaceBypassed) {
      router.push("/student/face-register");
      return;
    }

    router.push(`/${res.role || loginForm.role}`);
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setMailStatus(null);
    const res = await register(registerForm);
    setMessage(res.message);

    if (!res.ok) {
      pushToast(res.message, "error");
      return;
    }

    setMailStatus({
      kind: "credentials",
      state: res.emailSent ? "sent" : "failed",
      email: registerForm.email,
    });
    pushToast(
      res.emailSent
        ? "Account created. Credentials email sent."
        : "Account created, but credentials email failed.",
      res.emailSent ? "success" : "info",
    );
    setMode("login");
  }

  async function onForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (cooldownSeconds > 0) {
      const msg = `Wait ${cooldownSeconds}s before sending another reset link.`;
      setMessage(msg);
      pushToast(msg, "info");
      return;
    }

    setForgotLoading(true);
    setMailStatus(null);
    try {
      const res = await forgotPassword({ email: forgotEmail });
      setMessage(res.message || "Reset link sent.");
      setCooldownSeconds(FORGOT_COOLDOWN_SECONDS);
      setMailStatus({
        kind: "reset",
        state:
          res.emailSent === true
            ? "sent"
            : res.emailSent === false
              ? "failed"
              : "accepted",
        email: forgotEmail,
      });
      pushToast(
        res.emailSent === false
          ? "Reset request accepted, but email delivery failed."
          : "Reset request submitted.",
        res.emailSent === false ? "info" : "success",
      );
    } catch (error) {
      const apiMessage =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Failed to send reset link.";
      setMessage(apiMessage);
      if (apiMessage.toLowerCase().includes("too many auth attempts")) {
        setCooldownSeconds(Math.max(cooldownSeconds, FORGOT_COOLDOWN_SECONDS));
      }
      pushToast(apiMessage, "error");
    } finally {
      setForgotLoading(false);
    }
  }

  async function onResetPassword(e: FormEvent) {
    e.preventDefault();

    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setMessage("Passwords do not match.");
      pushToast("Passwords do not match.", "error");
      return;
    }

    setResetLoading(true);
    try {
      const res = await resetPassword({
        token: resetForm.token,
        newPassword: resetForm.newPassword,
      });

      setMessage(res.message || "Password updated.");
      if (res.success) {
        pushToast(
          "Password reset successful. Login with new password.",
          "success",
        );
        router.replace("/auth?mode=login");
        setMode("login");
      }
    } catch (error) {
      const apiMessage =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Failed to reset password.";
      setMessage(apiMessage);
      pushToast(apiMessage, "error");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <ToastStack
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />

      <div className="grid w-full max-w-6xl shadow-2xl lg:grid-cols-2">
        <div className="relative h-72 lg:h-auto">
          <Image
            src="/aayushkedidi.avif"
            alt="Vision Attendance"
            fill
            priority
            className="object-cover"
          />
        </div>

        <div className="flex flex-col justify-center p-10">
          <h1 className="text-4xl font-bold">Vision Attendance</h1>
          <p className="mt-2 text-gray-500">
            AI-powered biometric academic system
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => openMode("login")}
              className={`rounded-full px-4 py-2 text-sm ${
                activeMode === "login" ? "bg-black text-white" : "bg-gray-100"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => openMode("register")}
              className={`rounded-full px-4 py-2 text-sm ${
                activeMode === "register"
                  ? "bg-black text-white"
                  : "bg-gray-100"
              }`}
            >
              Register
            </button>

            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className={`rounded-full px-4 py-2 text-sm ${
                activeMode === "forgot" ? "bg-black text-white" : "bg-gray-100"
              }`}
            >
              Forgot
            </button>
          </div>

          {mailStatus ? (
            <div
              className={`mt-6 rounded-2xl border p-3 text-sm ${mailStatusTone}`}
            >
              <p className="font-semibold">
                {mailStatus.kind === "credentials"
                  ? "Credentials email"
                  : "Reset email"}{" "}
                status
              </p>
              <p className="mt-1">
                {mailStatus.state === "sent"
                  ? `Delivered to ${mailStatus.email}.`
                  : mailStatus.state === "failed"
                    ? `Could not deliver to ${mailStatus.email}.`
                    : `Request accepted for ${mailStatus.email}. If the account exists, mail should arrive shortly.`}
              </p>
            </div>
          ) : null}

          {token && user && activeMode !== "forgot" && activeMode !== "reset" ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Already signed in as {user.name} ({user.role})
              </p>
              <p className="mt-1">
                New login will replace the current session.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/${user.role}`)}
                  className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  Go to Dashboard
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Logout First
                </button>
              </div>
            </div>
          ) : null}

          {activeMode === "login" && (
            <form onSubmit={onLogin} className="mt-8 space-y-4">
              <InputField
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(v) => setLoginForm((p) => ({ ...p, email: v }))}
              />

              <InputField
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(v) => setLoginForm((p) => ({ ...p, password: v }))}
              />

              <select
                value={loginForm.role}
                onChange={(e) =>
                  setLoginForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full rounded-xl border p-3"
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Logging in..." : "Login"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/forgot-password")}
                className="text-sm text-blue-600 underline"
              >
                Forgot Password?
              </button>
            </form>
          )}

          {activeMode === "register" && (
            <form onSubmit={onRegister} className="mt-8 space-y-4">
              <select
                value={registerForm.role}
                onChange={(e) =>
                  setRegisterForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full rounded-xl border p-3"
              >
                <option value="parent">parent</option>
                <option value="admin">admin</option>
              </select>

              <InputField
                placeholder="Full Name"
                value={registerForm.name}
                onChange={(v) => setRegisterForm((p) => ({ ...p, name: v }))}
              />

              <InputField
                type="email"
                placeholder="Email"
                value={registerForm.email}
                onChange={(v) => setRegisterForm((p) => ({ ...p, email: v }))}
              />

              <InputField
                type="password"
                placeholder="Password"
                value={registerForm.password}
                onChange={(v) =>
                  setRegisterForm((p) => ({ ...p, password: v }))
                }
              />

              {registerForm.role === "admin" ? (
                <InputField
                  placeholder="Admin Bootstrap Key"
                  value={registerForm.bootstrapKey}
                  onChange={(v) =>
                    setRegisterForm((p) => ({ ...p, bootstrapKey: v }))
                  }
                />
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  Parent signup works only if this email is already added as a student&apos;s parent email.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading
                  ? "Creating account..."
                  : registerForm.role === "admin"
                    ? "Create Admin"
                    : "Create Parent Account"}
              </button>
            </form>
          )}

          {activeMode === "forgot" && (
            <form onSubmit={onForgotPassword} className="mt-8 space-y-4">
              <InputField
                type="email"
                placeholder="Registered Email"
                value={forgotEmail}
                onChange={setForgotEmail}
              />

              <button
                type="submit"
                disabled={forgotLoading || cooldownSeconds > 0}
                className="w-full rounded-full bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {forgotLoading
                  ? "Sending reset link..."
                  : cooldownSeconds > 0
                    ? `Resend in ${cooldownSeconds}s`
                    : "Send Reset Link"}
              </button>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">
                  Reset request status
                </p>
                <p className="mt-1">
                  Cooldown:{" "}
                  {cooldownSeconds > 0
                    ? `${cooldownSeconds}s remaining before resend.`
                    : "Ready to send."}
                </p>
                <p className="mt-1">
                  Rate limit feedback will appear here if too many reset
                  requests are sent.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.replace("/auth?mode=login")}
                className="text-sm underline"
              >
                Back to Login
              </button>
            </form>
          )}

          {activeMode === "reset" && (
            <form onSubmit={onResetPassword} className="mt-8 space-y-4">
              <InputField
                type="password"
                placeholder="New Password"
                value={resetForm.newPassword}
                onChange={(v) =>
                  setResetForm((p) => ({ ...p, newPassword: v }))
                }
              />

              <InputField
                type="password"
                placeholder="Confirm Password"
                value={resetForm.confirmPassword}
                onChange={(v) =>
                  setResetForm((p) => ({ ...p, confirmPassword: v }))
                }
              />

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full rounded-full bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {resetLoading ? "Resetting password..." : "Reset Password"}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}

function InputField({
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      className="w-full rounded-xl border p-3"
    />
  );
}
