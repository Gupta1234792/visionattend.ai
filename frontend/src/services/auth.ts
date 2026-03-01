import api, { publicApi } from "@/src/services/api";

export type UserRole = "admin" | "hod" | "teacher" | "coordinator" | "student" | "parent";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  college?: string | null;
  department?: string | null;
  year?: string | null;
  division?: string | null;
  faceRegistered?: boolean;
};

export type AuthResponse = {
  success: boolean;
  token?: string;
  user?: AuthUser;
  message?: string;
};

export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  const { data } = await publicApi.post<AuthResponse>("/auth/login", payload);
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  bootstrapKey?: string;
}): Promise<AuthResponse> {
  const { data } = await publicApi.post<AuthResponse>("/auth/register", payload);
  return data;
}

export async function getStudentProfile() {
  const { data } = await api.get("/students/me");
  return data;
}
