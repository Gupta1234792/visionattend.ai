"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/auth-context";
import { UserRole } from "@/src/services/auth";

type Mode = "login" | "register";

const roles: UserRole[] = ["admin", "hod", "teacher", "coordinator", "student", "parent"];
const registerRoles: UserRole[] = ["admin", "hod"];

export default function AuthPage() {
  const router = useRouter();
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState("Login with your role account.");

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
    role: "admin" as UserRole,
  });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "admin" as UserRole,
  });

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    const res = await login(loginForm);
    setMessage(res.message);
    if (!res.ok) return;

    if (loginForm.role === "student") {
      const stored = localStorage.getItem("va_user");
      const user = stored ? JSON.parse(stored) : null;
      if (user && !user.faceRegistered) {
        router.push("/student/face-register");
        return;
      }
    }

    router.push(`/${loginForm.role}`);
  };

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    const res = await register(registerForm);
    setMessage(res.message);
    if (res.ok) {
      setMode("login");
      setLoginForm((prev) => ({ ...prev, email: registerForm.email, role: registerForm.role }));
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1666dc] to-[#0f4cb4] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h1 className="text-xl font-semibold text-slate-900">Welcome to VisionAttend</h1>
        <p className="mt-1 text-sm text-slate-600">Role-based ERP authentication</p>

        <div className="mt-4 grid grid-cols-2 rounded-lg border border-slate-200 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded px-3 py-2 font-medium ${mode === "login" ? "bg-[#135ed8] text-white" : "text-slate-700"}`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded px-3 py-2 font-medium ${mode === "register" ? "bg-[#135ed8] text-white" : "text-slate-700"}`}
          >
            Register
          </button>
        </div>

        {mode === "login" ? (
          <form className="mt-4 space-y-3" onSubmit={onLogin}>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Email" type="email" value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} required />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Password" type="password" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} required />
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={loginForm.role} onChange={(e) => setLoginForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button disabled={loading} className="w-full rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={onRegister}>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Name" value={registerForm.name} onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Email" type="email" value={registerForm.email} onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))} required />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Password" type="password" value={registerForm.password} onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))} required />
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={registerForm.role} onChange={(e) => setRegisterForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
              {registerRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500">Student accounts are created only via classroom invite link/code.</p>
            <button disabled={loading} className="w-full rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit">
              {loading ? "Registering..." : "Register"}
            </button>
          </form>
        )}

        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-center text-xs text-slate-700">{message}</p>
      </div>
    </section>
  );
}
