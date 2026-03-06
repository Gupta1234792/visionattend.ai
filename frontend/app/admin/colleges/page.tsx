"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { AddressParts, composeAddress, emptyAddressParts } from "@/src/utils/address";
import { detectPreciseLocation, formatGeolocationError } from "@/src/utils/location";

type College = { _id: string; name: string; code: string; address: string };

const departmentPresets = [
  { name: "Computer Science and Engineering", code: "CSE" },
  { name: "Information Technology", code: "IT" },
  { name: "Bachelor of Science in IT", code: "BSCIT" },
  { name: "Artificial Intelligence and Data Science", code: "AIDS" },
  { name: "Artificial Intelligence and Machine Learning", code: "AIML" },
  { name: "Electronics and Communication Engineering", code: "ECE" },
];

const extractLatLngFromGoogleMapsLink = (rawLink: string) => {
  const link = decodeURIComponent(rawLink || "").trim();
  if (!link) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[/?]|$)/
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }

  return null;
};

type ReverseGeocodeResult = {
  address?: {
    building?: string;
    amenity?: string;
    attraction?: string;
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    village?: string;
    hamlet?: string;
    city?: string;
    town?: string;
    county?: string;
    state_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

const reverseGeocode = async (latitude: number, longitude: number) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en"
    }
  });

  if (!res.ok) {
    throw new Error("Reverse geocode request failed");
  }

  const data = (await res.json()) as ReverseGeocodeResult;
  const addr = data?.address || {};
  return {
    building: addr.building || addr.amenity || addr.attraction || "",
    road: addr.road || addr.pedestrian || "",
    area: addr.neighbourhood || addr.suburb || addr.quarter || addr.village || addr.hamlet || "",
    city: addr.city || addr.town || addr.county || "",
    state: addr.state_district || addr.state || "",
    pincode: addr.postcode || "",
    country: addr.country || ""
  };
};

export default function AdminCollegesPage() {
  const [message, setMessage] = useState("Colleges ready.");
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeForm, setCollegeForm] = useState({
    name: "",
    code: "",
    latitude: 0,
    longitude: 0
  });
  const [googleMapsLink, setGoogleMapsLink] = useState("");
  const [locationDetected, setLocationDetected] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressParts>({ ...emptyAddressParts });

  const loadColleges = async () => {
    const res = await api.get("/colleges");
    setColleges(res.data.colleges || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadColleges();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const detectCurrentLocation = () => {
    const onResolved = async (latitude: number, longitude: number) => {
      setCollegeForm((prev) => ({ ...prev, latitude, longitude }));
      setLocationDetected(true);
      setGoogleMapsLink("");
      try {
        const guessedAddress = await reverseGeocode(latitude, longitude);
        setAddressForm((prev) => ({
          ...prev,
          building: guessedAddress.building || prev.building,
          road: guessedAddress.road || prev.road,
          area: guessedAddress.area || prev.area,
          city: guessedAddress.city || prev.city,
          state: guessedAddress.state || prev.state,
          pincode: guessedAddress.pincode || prev.pincode,
          country: guessedAddress.country || prev.country
        }));
        setMessage(`Location + address detected: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      } catch {
        setMessage(`Location detected (${latitude.toFixed(6)}, ${longitude.toFixed(6)}), but address auto-fill failed.`);
      }
    };

    if (!navigator.geolocation) {
      setMessage("Geolocation is not supported in this browser.");
      return;
    }

    void (async () => {
      try {
        setMessage("Detecting current location...");
        const best = await detectPreciseLocation();
        await onResolved(best.latitude, best.longitude);
        setMessage(
          `Location + address detected: ${best.latitude.toFixed(6)}, ${best.longitude.toFixed(6)} (${Math.round(best.accuracy)}m, ${best.source === "gps-watch" ? "watch fallback" : "gps sample"})`
        );
      } catch (error) {
        const details = formatGeolocationError(error);
        setMessage(`GPS location detect failed: ${details.friendly}`);
      }
    })();
  };

  const applyLocationFromMapLink = async () => {
    const parsed = extractLatLngFromGoogleMapsLink(googleMapsLink);
    if (!parsed) {
      setMessage("Map link se coordinates nahi mile. Full Google Maps link use karo jisme lat,lng ho.");
      return;
    }

    setCollegeForm((prev) => ({ ...prev, latitude: parsed.latitude, longitude: parsed.longitude }));
    setLocationDetected(true);

    try {
      const guessedAddress = await reverseGeocode(parsed.latitude, parsed.longitude);
      setAddressForm((prev) => ({
        ...prev,
        building: guessedAddress.building || prev.building,
        road: guessedAddress.road || prev.road,
        area: guessedAddress.area || prev.area,
        city: guessedAddress.city || prev.city,
        state: guessedAddress.state || prev.state,
        pincode: guessedAddress.pincode || prev.pincode,
        country: guessedAddress.country || prev.country
      }));
      setMessage(`Map link location applied: ${parsed.latitude.toFixed(6)}, ${parsed.longitude.toFixed(6)}`);
    } catch {
      setMessage(`Map link location applied (${parsed.latitude.toFixed(6)}, ${parsed.longitude.toFixed(6)}), but address auto-fill failed.`);
    }
  };

  const onCreateCollege = async (e: FormEvent) => {
    e.preventDefault();
    const fullAddress = composeAddress(addressForm) || "Address not provided";
    const mapLocation = googleMapsLink.trim() ? extractLatLngFromGoogleMapsLink(googleMapsLink) : null;
    const hasInvalidMapsLink = Boolean(googleMapsLink.trim() && !mapLocation);

    const latitude = mapLocation ? mapLocation.latitude : Number(collegeForm.latitude);
    const longitude = mapLocation ? mapLocation.longitude : Number(collegeForm.longitude);
    const hasValidLocation =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      !(latitude === 0 && longitude === 0);

    if (!hasValidLocation) {
      setMessage("Location is required. Click 'Detect My Location' or paste a valid Google Maps link.");
      return;
    }

    if (colleges.some((college) => college.code.trim().toUpperCase() === collegeForm.code.trim().toUpperCase())) {
      setMessage("College already exists with this code.");
      return;
    }

    try {
      const collegeRes = await api.post("/colleges", {
        ...collegeForm,
        address: fullAddress,
        latitude,
        longitude
      });
      const createdCollegeId = collegeRes?.data?.college?._id;
      if (createdCollegeId) {
        await Promise.all(
          departmentPresets.map((preset) =>
            api.post("/departments", {
              ...preset,
              collegeId: createdCollegeId,
            }).catch(() => null)
          )
        );
      }
      setCollegeForm({ name: "", code: "", latitude: 0, longitude: 0 });
      setGoogleMapsLink("");
      setLocationDetected(false);
      setAddressForm({ ...emptyAddressParts });
      if (hasInvalidMapsLink) {
        setMessage("College created. Google Maps link was invalid, so detected/manual coordinates were used.");
      } else {
        setMessage("College created with default departments.");
      }
      void loadColleges();
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to create college.");
    }
  };

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Colleges">
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <form onSubmit={onCreateCollege} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Create College</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="College Name" value={collegeForm.name} onChange={(e) => setCollegeForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="College Code" value={collegeForm.code} onChange={(e) => setCollegeForm((p) => ({ ...p, code: e.target.value }))} required />
              <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-semibold text-white"
                  type="button"
                  onClick={detectCurrentLocation}
                >
                  Detect My Location
                </button>
                <p className="text-xs text-slate-500">
                  {locationDetected || (collegeForm.latitude !== 0 || collegeForm.longitude !== 0)
                    ? `Detected: ${collegeForm.latitude.toFixed(6)}, ${collegeForm.longitude.toFixed(6)}`
                    : "Location not detected yet"}
                </p>
              </div>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="number"
                step="any"
                placeholder="Latitude"
                value={collegeForm.latitude || 0}
                onChange={(e) => setCollegeForm((p) => ({ ...p, latitude: Number(e.target.value || 0) }))}
              />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="number"
                step="any"
                placeholder="Longitude"
                value={collegeForm.longitude || 0}
                onChange={(e) => setCollegeForm((p) => ({ ...p, longitude: Number(e.target.value || 0) }))}
              />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Building / Campus Name (optional)" value={addressForm.building} onChange={(e) => setAddressForm((p) => ({ ...p, building: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Road / Street Name (optional)" value={addressForm.road} onChange={(e) => setAddressForm((p) => ({ ...p, road: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Area / Locality" value={addressForm.area} onChange={(e) => setAddressForm((p) => ({ ...p, area: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="City (optional)" value={addressForm.city} onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="State (optional)" value={addressForm.state} onChange={(e) => setAddressForm((p) => ({ ...p, state: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Pincode (optional)" value={addressForm.pincode} onChange={(e) => setAddressForm((p) => ({ ...p, pincode: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Country" value={addressForm.country} onChange={(e) => setAddressForm((p) => ({ ...p, country: e.target.value }))} />
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                placeholder="Google Maps Link (optional, overrides detected location)"
                value={googleMapsLink}
                onChange={(e) => setGoogleMapsLink(e.target.value)}
              />
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => void applyLocationFromMapLink()}
                  className="rounded-lg border border-[#135ed8] px-3 py-2 text-xs font-semibold text-[#135ed8]"
                >
                  Use This Map Link
                </button>
              </div>
              <p className="text-xs text-slate-500 md:col-span-2">
                Name + code + valid location are required. Address fields are optional.
              </p>
              <p className="text-xs text-slate-500 md:col-span-2">Preview: {composeAddress(addressForm) || "-"}</p>
            </div>
            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="submit">Create College</button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">College Table</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2">College</th>
                    <th className="py-2">Code</th>
                    <th className="py-2">Address</th>
                    <th className="py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map((college) => (
                    <tr key={college._id} className="border-b border-slate-100 align-top">
                      <td className="py-2">{college.name}</td>
                      <td className="py-2">{college.code}</td>
                      <td className="py-2 whitespace-normal break-words">{college.address}</td>
                      <td className="py-2">
                        <Link className="rounded border border-[#135ed8] px-2 py-1 text-xs font-semibold text-[#135ed8]" href={`/admin/colleges/${college._id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
