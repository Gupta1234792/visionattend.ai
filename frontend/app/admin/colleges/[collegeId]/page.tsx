"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

type CollegeProfile = {
  _id: string;
  name: string;
  code: string;
  address: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  location?: { latitude?: number; longitude?: number };
};

export default function AdminCollegeProfilePage() {
  const params = useParams<{ collegeId: string }>();
  const collegeId = params?.collegeId;
  const [message, setMessage] = useState("Loading college profile...");
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    description: "",
    website: "",
    logoUrl: "",
    latitude: 0,
    longitude: 0
  });

  const loadProfile = async () => {
    if (!collegeId) return;
    try {
      const res = await api.get(`/colleges/${collegeId}`);
      const c = res.data?.college;
      setProfile(c || null);
      setForm({
        name: c?.name || "",
        code: c?.code || "",
        address: c?.address || "",
        description: c?.description || "",
        website: c?.website || "",
        logoUrl: c?.logoUrl || "",
        latitude: Number(c?.location?.latitude || 0),
        longitude: Number(c?.location?.longitude || 0)
      });
      setMessage("College profile loaded.");
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to load college profile.");
    }
  };

  useEffect(() => {
    void loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!collegeId) return;
    try {
      await api.patch(`/colleges/${collegeId}`, form);
      setMessage("College profile updated.");
      void loadProfile();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to update college profile.");
    }
  };

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="College Profile">
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              {profile?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <h2 className="mt-3 text-center text-base font-semibold text-slate-900">{profile?.name || "College"}</h2>
            <p className="mt-1 text-center text-sm text-slate-600">{profile?.code || "-"}</p>
            <p className="mt-2 text-xs text-slate-500">{profile?.address || "-"}</p>
            <p className="mt-2 text-xs text-slate-500">{profile?.description || "No description yet."}</p>
          </section>

          <form onSubmit={onSave} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold">Edit College Profile</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Website" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Logo URL" value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" step="0.000001" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm((p) => ({ ...p, latitude: Number(e.target.value) }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" step="0.000001" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm((p) => ({ ...p, longitude: Number(e.target.value) }))} />
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Save Changes</button>
          </form>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

