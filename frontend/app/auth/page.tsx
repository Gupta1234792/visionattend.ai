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
      setLoginForm((prev) => ({
        ...prev,
        email: registerForm.email,
        role: registerForm.role,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#fff] flex items-center justify-center p-10">

      {/* MAIN CARD */}
      <div className="w-[1150px] h-[650px] bg-[#f3f3f3] rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.25)] flex overflow-hidden">

        {/* LEFT SIDE — 50% */}
        <div className="w-1/2 h-full px-20 py-16 flex flex-col justify-center">

          <h1 className="text-[64px] font-extrabold text-[#111] leading-none tracking-tight">
            Welcome
          </h1>

          <p className="text-sm text-gray-500 mt-3">
            We are glad to see you back with us
          </p>

          {/* Toggle */}
          <div className="mt-8 relative flex bg-gray-200 rounded-full p-1 w-[240px]">
            <div
              className={`absolute top-1 bottom-1 w-1/2 bg-black rounded-full transition-all duration-300 ${
                mode === "register" ? "left-1/2" : "left-1"
              }`}
            />
            <button
              onClick={() => setMode("login")}
              className={`relative z-10 w-1/2 text-sm py-2 font-medium ${
                mode === "login" ? "text-white" : "text-gray-600"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("register")}
              className={`relative z-10 w-1/2 text-sm py-2 font-medium ${
                mode === "register" ? "text-white" : "text-gray-600"
              }`}
            >
              Register
            </button>
          </div>

          {/* FORM */}
          {mode === "login" ? (
            <form onSubmit={onLogin} className="mt-8 space-y-5">

              <input
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((p) => ({ ...p, email: e.target.value }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
                required
              />

              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm((p) => ({ ...p, password: e.target.value }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
                required
              />

              <select
                value={loginForm.role}
                onChange={(e) =>
                  setLoginForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <button
                disabled={loading}
                className="w-full bg-black text-white rounded-full py-4 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                type="submit"
              >
                {loading ? "Processing..." : "NEXT"}
              </button>
            </form>
          ) : (
            <form onSubmit={onRegister} className="mt-8 space-y-5">

              <input
                placeholder="Name"
                value={registerForm.name}
                onChange={(e) =>
                  setRegisterForm((p) => ({ ...p, name: e.target.value }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
                required
              />

              <input
                type="email"
                placeholder="Email"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm((p) => ({ ...p, email: e.target.value }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
                required
              />

              <input
                type="password"
                placeholder="Password"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm((p) => ({ ...p, password: e.target.value }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
                required
              />

              <select
                value={registerForm.role}
                onChange={(e) =>
                  setRegisterForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-black transition"
              >
                {registerRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <button
                disabled={loading}
                className="w-full bg-black text-white rounded-full py-4 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                type="submit"
              >
                {loading ? "Processing..." : "Register"}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-gray-500">{message}</p>
        </div>

        {/* RIGHT SIDE — 50% FULL IMAGE */}
        {/* RIGHT SIDE — 50% FULL IMAGE NO BG NO ROUND */}
<div className="w-1/2 h-full">

  <img
    src="/student-image1.png"
    alt="Student"
    className="w-full h-full object-cover"
  />

</div>

      </div>
    </div>
  );
}