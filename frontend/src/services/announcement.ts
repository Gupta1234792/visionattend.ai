import api from "./api";

export type Announcement = {
  _id: string;
  title: string;
  message: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
    role?: string;
  };
  college: string;
  department?: string | null;
  batchKey?: string | null;
  scopeType: "college" | "department" | "batch";
  targetRoles: string[];
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnnouncementRequest = {
  title: string;
  message: string;
  expiresAt?: string;
  targetRoles: string[];
  collegeId?: string;
  departmentId?: string;
  year?: string;
  division?: string;
  batchKey?: string;
};

export async function createAnnouncement(payload: CreateAnnouncementRequest): Promise<{ success: boolean; message: string; announcement?: Announcement }> {
  const { data } = await api.post("/announcements/create", payload);
  return data;
}

export async function getAnnouncements(): Promise<{ success: boolean; announcements: Announcement[] }> {
  const { data } = await api.get("/announcements/list");
  return data;
}
