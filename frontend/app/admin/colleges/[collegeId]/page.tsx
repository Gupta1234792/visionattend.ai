"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { addressLines, parseAddressString } from "@/src/utils/address";

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
  const searchParams = useSearchParams();
  const collegeId = params?.collegeId;
  const [message, setMessage] = useState("Loading college profile...");
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [bannerUrl, setBannerUrl] = useState("");

  const loadProfile = async () => {
    if (!collegeId) return;
    try {
      const res = await api.get(`/colleges/${collegeId}`);
      const c = res.data?.college;
      setProfile(c || null);
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

  useEffect(() => {
    if (searchParams.get("updated") === "1") {
      setMessage("College profile updated successfully.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!collegeId || typeof window === "undefined") return;
    const stored = localStorage.getItem(`va_college_banner_${collegeId}`) || "";
    setBannerUrl(stored);
  }, [collegeId]);

  const websiteHref = useMemo(() => {
    if (!profile?.website) return "";
    if (profile.website.startsWith("http://") || profile.website.startsWith("https://")) {
      return profile.website;
    }
    return `https://${profile.website}`;
  }, [profile?.website]);

  const parsedAddressLines = useMemo(() => addressLines(parseAddressString(profile?.address)), [profile?.address]);
  const mapHref = useMemo(() => {
    const lat = profile?.location?.latitude;
    const lng = profile?.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return "";
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }, [profile?.location?.latitude, profile?.location?.longitude]);
  const initials = useMemo(() => {
    const name = profile?.name || "";
    const chunks = name.trim().split(" ").filter(Boolean);
    return (chunks[0]?.[0] || "C") + (chunks[1]?.[0] || "");
  }, [profile?.name]);

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="College Profile">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative h-48 bg-gradient-to-r from-[#0a66c2] via-[#1d74d1] to-[#83b4e8]">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="College banner" className="h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
            <div className="absolute left-5 top-5 rounded-full border border-white/35 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              College Profile
            </div>
            <div className="absolute bottom-4 left-5 text-white">
              <h2 className="text-2xl font-bold">{profile?.name || "College"}</h2>
              <p className="text-sm text-white/90">{profile?.code || "-"}</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-2xl font-bold text-slate-500 shadow-sm">
                  {profile?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.logoUrl} alt={profile.name} className="h-full w-full object-cover" />
                  ) : initials}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Official Address</p>
                  <p className="mt-1 text-sm text-slate-700">{profile?.address || "-"}</p>
                </div>
              </div>
              <Link
                href={`/admin/colleges/${collegeId}/edit`}
                className="inline-flex items-center justify-center rounded-xl bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#084f97]"
              >
                Edit Profile & Banner
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">About</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {profile?.description || "No description added yet."}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Code</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{profile?.code || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Latitude</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{profile?.location?.latitude ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Longitude</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{profile?.location?.longitude ?? "-"}</p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Contact</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Address:</span> {profile?.address || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Website:</span>{" "}
                  {websiteHref ? (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#0a66c2] hover:underline"
                    >
                      {profile?.website}
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Map:</span>{" "}
                  {mapHref ? (
                    <a href={mapHref} target="_blank" rel="noreferrer" className="font-medium text-[#0a66c2] hover:underline">
                      Open Location
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Location</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {parsedAddressLines.length > 0 ? (
                  parsedAddressLines.map((line, index) => (
                    <p key={`${line}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2">Address not available.</p>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
