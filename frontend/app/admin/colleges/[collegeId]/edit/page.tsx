"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
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
    latitude: 0,
    longitude: 0,
  });
  const [addressForm, setAddressForm] = useState<AddressParts>({ ...emptyAddressParts });

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
      await api.patch(`/colleges/${collegeId}`, { ...form, address: fullAddress });
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
