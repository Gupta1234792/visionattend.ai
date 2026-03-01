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

  const websiteHref = useMemo(() => {
    if (!profile?.website) return "";
    if (profile.website.startsWith("http://") || profile.website.startsWith("https://")) {
      return profile.website;
    }
    return `https://${profile.website}`;
  }, [profile?.website]);

  const parsedAddressLines = useMemo(() => addressLines(parseAddressString(profile?.address)), [profile?.address]);

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="College Profile">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-36 bg-gradient-to-r from-[#0a66c2] via-[#1d74d1] to-[#83b4e8]" />
          <div className="px-6 pb-6">
            <div className="-mt-14 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-sm">
                  {profile?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.logoUrl} alt={profile.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="pb-1">
                  <h2 className="text-2xl font-bold text-slate-900">{profile?.name || "College"}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">{profile?.code || "-"}</p>
                  <p className="mt-1 text-sm text-slate-500">{profile?.address || "-"}</p>
                </div>
              </div>
              <Link
                href={`/admin/colleges/${collegeId}/edit`}
                className="inline-flex items-center justify-center rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#084f97]"
              >
                Edit Profile
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
