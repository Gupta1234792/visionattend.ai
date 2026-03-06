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

const LOCATION_GREEN_METERS = 50;
const LOCATION_YELLOW_METERS = 150;

const getDistanceInMeters = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

export default function AdminCollegeProfilePage() {
  const params = useParams<{ collegeId: string }>();
  const searchParams = useSearchParams();
  const collegeId = params?.collegeId;
  const [message, setMessage] = useState("Loading college profile...");
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [bannerUrl, setBannerUrl] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [distanceFromCollege, setDistanceFromCollege] = useState<number | null>(null);

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

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not supported in this browser.");
      return;
    }

    setMessage("Detecting current location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy || 0);
        setCurrentLocation({ latitude, longitude, accuracy });

        const collegeLat = profile?.location?.latitude;
        const collegeLng = profile?.location?.longitude;
        if (typeof collegeLat === "number" && typeof collegeLng === "number") {
          const distance = getDistanceInMeters(latitude, longitude, collegeLat, collegeLng);
          setDistanceFromCollege(distance);
          setMessage(`Current location detected: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        } else {
          setDistanceFromCollege(null);
          setMessage("Current location detected, but college location is not configured.");
        }
      },
      () => {
        setMessage("Unable to detect location. Allow location permission and retry.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const locationFlag = useMemo(() => {
    if (typeof distanceFromCollege !== "number") return null;
    if (distanceFromCollege <= LOCATION_GREEN_METERS) return "green";
    if (distanceFromCollege <= LOCATION_YELLOW_METERS) return "yellow";
    return "red";
  }, [distanceFromCollege]);

  const locationFlagClass = useMemo(() => {
    if (locationFlag === "green") return "bg-green-100 text-green-700";
    if (locationFlag === "yellow") return "bg-yellow-100 text-yellow-700";
    if (locationFlag === "red") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-700";
  }, [locationFlag]);

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
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={detectCurrentLocation}
                    className="rounded-lg bg-[#0a66c2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084f97]"
                  >
                    Detect Current Location
                  </button>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${locationFlagClass}`}>
                    {locationFlag || "not checked"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Green: within {LOCATION_GREEN_METERS}m, Yellow: within {LOCATION_YELLOW_METERS}m, Red: farther than {LOCATION_YELLOW_METERS}m.
                </p>
                <p className="mt-2 text-xs text-slate-700">
                  Current: {currentLocation ? `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}` : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Accuracy: {currentLocation ? `${Math.round(currentLocation.accuracy)} m` : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Distance from college: {typeof distanceFromCollege === "number" ? `${Math.round(distanceFromCollege)} m` : "-"}
                </p>
              </div>
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
