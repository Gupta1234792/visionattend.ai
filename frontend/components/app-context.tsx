"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  college?: string | null;
  department?: string | null;
  year?: string | null;
  division?: string | null;
};

type AppContextValue = {
  apiBaseUrl: string;
  setApiBaseUrl: (value: string) => void;
  opencvKey: string;
  setOpencvKey: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
  user: AuthUser | null;
  setUser: (value: AuthUser | null) => void;
  clearSession: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_API_BASE_URL = "http://localhost:5000/api";
const isBrowser = typeof window !== "undefined";

const readStorage = (key: string) => (isBrowser ? localStorage.getItem(key) : null);

const readUser = (): AuthUser | null => {
  const raw = readStorage("va_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => readStorage("va_api_base_url") || DEFAULT_API_BASE_URL
  );
  const [opencvKey, setOpencvKey] = useState(() => readStorage("va_opencv_key") || "");
  const [token, setToken] = useState(() => readStorage("va_token") || "");
  const [user, setUser] = useState<AuthUser | null>(() => readUser());

  useEffect(() => {
    localStorage.setItem("va_api_base_url", apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    localStorage.setItem("va_opencv_key", opencvKey);
  }, [opencvKey]);

  useEffect(() => {
    if (token) {
      localStorage.setItem("va_token", token);
    } else {
      localStorage.removeItem("va_token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("va_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("va_user");
    }
  }, [user]);

  const clearSession = () => {
    setToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      apiBaseUrl,
      setApiBaseUrl,
      opencvKey,
      setOpencvKey,
      token,
      setToken,
      user,
      setUser,
      clearSession,
    }),
    [apiBaseUrl, opencvKey, token, user]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return ctx;
}

export type { AuthUser };
