"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthUser, login as loginRequest, register as registerRequest, UserRole } from "@/src/services/auth";

type AuthContextType = {
  user: AuthUser | null;
  token: string;
  loading: boolean;
  login: (payload: { email: string; password: string; role: UserRole }) => Promise<{ ok: boolean; message: string; role?: UserRole }>;
  register: (payload: { name: string; email: string; password: string; role: UserRole; bootstrapKey?: string }) => Promise<{ ok: boolean; message: string; emailSent?: boolean }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const readUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("va_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

const readToken = () => (
  typeof window !== "undefined"
    ? localStorage.getItem("va_token") || localStorage.getItem("token") || ""
    : ""
);
const parseApiError = (error: unknown, fallback: string) => {
  const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (maybeMessage) return maybeMessage;
  const rawMessage = (error as { message?: string })?.message || "";
  if (rawMessage.toLowerCase().includes("network") || rawMessage.toLowerCase().includes("cors")) {
    return "Network/CORS issue. Check backend URL, FRONTEND_URL/FRONTEND_URLS and restart servers.";
  }
  return fallback;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(readUser());
    setToken(readToken());
    setLoading(false);
  }, []);

  const login = async (payload: { email: string; password: string; role: UserRole }) => {
    setLoading(true);
    try {
      const res = await loginRequest({ email: payload.email, password: payload.password });
      if (!res.success || !res.token || !res.user) {
        return { ok: false, message: res.message || "Login failed" };
      }

      localStorage.setItem("va_token", res.token);
      localStorage.setItem("token", res.token);
      localStorage.setItem("va_user", JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user);
      return { ok: true, message: "Login successful", role: res.user.role };
    } catch (error) {
      return { ok: false, message: parseApiError(error, "Unable to login. Please check credentials.") };
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: { name: string; email: string; password: string; role: UserRole; bootstrapKey?: string }) => {
    setLoading(true);
    try {
      const res = await registerRequest(payload);
      return {
        ok: Boolean(res.success),
        message: res.message || (res.success ? "Registration successful" : "Registration failed"),
        emailSent: res.emailSent,
      };
    } catch (error) {
      return { ok: false, message: parseApiError(error, "Unable to register") };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("va_token");
    localStorage.removeItem("token");
    localStorage.removeItem("va_user");
    setToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
