"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { AddressParts, composeAddress, emptyAddressParts, parseAddressString } from "@/src/utils/address";

type CollegeForm = {
  name: string;
  code: string;
  address: string;
  description: string;
  website: string;
  logoUrl: string;
  bannerUrl: string;
  latitude: number;
  longitude: number;
};

export default function AdminCollegeEditPage() {
  const params = useParams<{ collegeId: string }>();
  const router = useRouter();
  const collegeId = params?.collegeId;
  const [message, setMessage] = useState("Loading profile for editing...");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CollegeForm>({
    name: "",
    code: "",
    address: "",
    description: "",
    website: "",
    logoUrl: "",
    bannerUrl: "",
    latitude: 0,
    longitude: 0,
  });
  const [addressForm, setAddressForm] = useState<AddressParts>({ ...emptyAddressParts });
  const [bannerPreview, setBannerPreview] = useState("");
  const storedBanner =
    typeof window !== "undefined" && collegeId
      ? localStorage.getItem(`va_college_banner_${collegeId}`) || ""
      : "";
  const effectiveBanner = bannerPreview || form.bannerUrl || storedBanner;

  useEffect(() => {
    const loadProfile = async () => {
      if (!collegeId) return;
      try {
        const res = await api.get(`/colleges/${collegeId}`);
        const c = res.data?.college;
        setForm({
          name: c?.name || "",
          code: c?.code || "",
          address: c?.address || "",
          description: c?.description || "",
          website: c?.website || "",
          logoUrl: c?.logoUrl || "",
          bannerUrl: "",
          latitude: Number(c?.location?.latitude || 0),
          longitude: Number(c?.location?.longitude || 0),
        });
        setAddressForm(parseAddressString(c?.address));
        setMessage("Edit values loaded.");
      } catch (error) {
        const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setMessage(apiMessage || "Failed to load college profile.");
      }
    };

    void loadProfile();
  }, [collegeId]);

  const handleBannerFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please upload a valid image file for banner.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, bannerUrl: value }));
      setBannerPreview(value);
      setMessage("Banner preview updated. Save changes to apply.");
    };
    reader.readAsDataURL(file);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!collegeId || saving) return;
    const fullAddress = composeAddress(addressForm);
    if (!addressForm.building || !addressForm.road || !addressForm.city || !addressForm.state || !addressForm.pincode) {
      setMessage("Please fill complete address: building, road, city, state, pincode.");
      return;
    }
    setSaving(true);
    setMessage("Saving changes...");
    try {
      const finalBanner = (effectiveBanner || "").trim();
      await api.patch(`/colleges/${collegeId}`, { ...form, bannerUrl: finalBanner, address: fullAddress });
      if (typeof window !== "undefined" && collegeId) {
        if (finalBanner) {
          localStorage.setItem(`va_college_banner_${collegeId}`, finalBanner);
        } else {
          localStorage.removeItem(`va_college_banner_${collegeId}`);
        }
      }
      router.push(`/admin/colleges/${collegeId}?updated=1`);
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage(apiMessage || "Failed to update college profile.");
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allow={["admin"]}>
      <DashboardLayout title="Edit College Profile">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Update Profile Details</h2>
            <Link
              href={`/admin/colleges/${collegeId}`}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to profile
            </Link>
          </div>

          <form onSubmit={onSave} className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile Banner</p>
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {effectiveBanner ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effectiveBanner} alt="College banner preview" className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-gradient-to-r from-[#0a66c2] via-[#1d74d1] to-[#83b4e8] text-sm font-semibold text-white">
                    Banner preview will appear here
                  </div>
                )}
              </div>
            </div>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Code"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Building / Campus Name"
              value={addressForm.building}
              onChange={(e) => setAddressForm((p) => ({ ...p, building: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Road / Street Name"
              value={addressForm.road}
              onChange={(e) => setAddressForm((p) => ({ ...p, road: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Area / Locality"
              value={addressForm.area}
              onChange={(e) => setAddressForm((p) => ({ ...p, area: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="City"
              value={addressForm.city}
              onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="State"
              value={addressForm.state}
              onChange={(e) => setAddressForm((p) => ({ ...p, state: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Pincode"
              value={addressForm.pincode}
              onChange={(e) => setAddressForm((p) => ({ ...p, pincode: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Country"
              value={addressForm.country}
              onChange={(e) => setAddressForm((p) => ({ ...p, country: e.target.value }))}
            />
            <textarea
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Description"
              rows={4}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Website"
              value={form.website}
              onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Logo URL"
              value={form.logoUrl}
              onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Banner Image URL (optional)"
              value={effectiveBanner}
              onChange={(e) => {
                const value = e.target.value;
                setForm((p) => ({ ...p, bannerUrl: value }));
                setBannerPreview(value);
              }}
            />
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Or Upload Banner Image</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#135ed8] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                type="file"
                accept="image/*"
                onChange={handleBannerFileUpload}
              />
              <p className="mt-1 text-xs text-slate-500">Banner image is stored on frontend profile view for now (no backend change).</p>
            </div>
            <p className="text-xs text-slate-500 md:col-span-2">Preview: {composeAddress(addressForm) || "-"}</p>

            <div className="md:col-span-2">
              <button
                className="rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#084f97] disabled:cursor-not-allowed disabled:opacity-70"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </section>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
