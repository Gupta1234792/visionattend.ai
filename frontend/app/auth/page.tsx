"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/src/context/auth-context";
import { UserRole } from "@/src/services/auth";

type Mode = "login" | "register";

const roles: UserRole[] = [
  "admin",
  "hod",
  "teacher",
  "coordinator",
  "student",
  "parent",
];

const registerRoles: UserRole[] = ["admin"];

export default function AuthPage() {
  const router = useRouter();
  const { login, register, loading } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState(
    "Secure access to Vision Attendance system."
  );

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
    bootstrapKey: "",
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
    <div className="min-h-screen bg-white flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">

      <div className="w-full max-w-6xl bg-white  shadow-[0_25px_80px_rgba(0,0,0,0.07)] overflow-hidden grid grid-cols-1 lg:grid-cols-2">

        {/* RIGHT IMAGE (Top on Mobile) */}
        <div className="relative h-64 sm:h-80 lg:h-auto">
          <Image
            src="/aayushkedidi.avif"
            alt="Vision Attendance"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent lg:hidden" />
        </div>

        {/* LEFT FORM SECTION */}
        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">

          {/* Header */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight">
              Vision Attendance
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              AI-powered biometric & role-based academic access.
            </p>
          </div>

          {/* Toggle */}
          <div className="mt-8 relative flex bg-gray-100 rounded-full p-1 w-full max-w-xs">
            <div
              className={`absolute top-1 bottom-1 w-1/2 bg-black rounded-full transition-all duration-300 ${
                mode === "register" ? "left-1/2" : "left-1"
              }`}
            />
            <button
              onClick={() => setMode("login")}
              className={`relative z-10 w-1/2 text-sm py-2 font-medium transition ${
                mode === "login" ? "text-white" : "text-gray-600"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("register")}
              className={`relative z-10 w-1/2 text-sm py-2 font-medium transition ${
                mode === "register" ? "text-white" : "text-gray-600"
              }`}
            >
              Register
            </button>
          </div>

          {/* FORM */}
          {mode === "login" ? (
            <form onSubmit={onLogin} className="mt-8 space-y-5">

              <InputField
                type="email"
                placeholder="Email Address"
                value={loginForm.email}
                onChange={(val) =>
                  setLoginForm((p) => ({ ...p, email: val }))
                }
              />

              <InputField
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(val) =>
                  setLoginForm((p) => ({ ...p, password: val }))
                }
              />

              <select
                value={loginForm.role}
                onChange={(e) =>
                  setLoginForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                disabled={loading}
                className="w-full bg-black text-white rounded-full py-4 text-sm font-semibold tracking-wide hover:opacity-90 transition"
                type="submit"
              >
                {loading ? "Authenticating..." : "Access Dashboard"}
              </button>
            </form>
          ) : (
            <form onSubmit={onRegister} className="mt-8 space-y-5">

              <InputField
                placeholder="Full Name"
                value={registerForm.name}
                onChange={(val) =>
                  setRegisterForm((p) => ({ ...p, name: val }))
                }
              />

              <InputField
                type="email"
                placeholder="Email Address"
                value={registerForm.email}
                onChange={(val) =>
                  setRegisterForm((p) => ({ ...p, email: val }))
                }
              />

              <InputField
                type="password"
                placeholder="Password"
                value={registerForm.password}
                onChange={(val) =>
                  setRegisterForm((p) => ({ ...p, password: val }))
                }
              />

              <InputField
                type="password"
                placeholder="Admin Bootstrap Key"
                value={registerForm.bootstrapKey}
                onChange={(val) =>
                  setRegisterForm((p) => ({ ...p, bootstrapKey: val }))
                }
              />

              <select
                value={registerForm.role}
                onChange={(e) =>
                  setRegisterForm((p) => ({
                    ...p,
                    role: e.target.value as UserRole,
                  }))
                }
                className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition"
              >
                {registerRoles.map((role) => (
                  <option key={role} value={role}>
                    {role.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                disabled={loading}
                className="w-full bg-black text-white rounded-full py-4 text-sm font-semibold tracking-wide hover:opacity-90 transition"
                type="submit"
              >
                {loading ? "Processing..." : "Create Admin Account"}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}

/* Reusable Input Component */
function InputField({
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      className="w-full bg-white rounded-xl px-5 py-4 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition"
    />
  );
}