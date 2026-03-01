"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import api from "@/src/services/api";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { AddressParts, composeAddress, emptyAddressParts } from "@/src/utils/address";

type College = { _id: string; name: string; code: string; address: string };

const departmentPresets = [
  { name: "Computer Science and Engineering", code: "CSE" },
  { name: "Information Technology", code: "IT" },
  { name: "Bachelor of Science in IT", code: "BSCIT" },
  { name: "Artificial Intelligence and Data Science", code: "AIDS" },
  { name: "Artificial Intelligence and Machine Learning", code: "AIML" },
  { name: "Electronics and Communication Engineering", code: "ECE" },
];

export default function AdminCollegesPage() {
  const [message, setMessage] = useState("Colleges ready.");
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeForm, setCollegeForm] = useState({
    name: "",
    code: "",
    latitude: 18.5204,
    longitude: 73.8567,
  });
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

  const onCreateCollege = async (e: FormEvent) => {
    e.preventDefault();
    const fullAddress = composeAddress(addressForm);
    if (!addressForm.building || !addressForm.road || !addressForm.city || !addressForm.state || !addressForm.pincode) {
      setMessage("Please fill complete address: building, road, city, state, pincode.");
      return;
    }

    if (colleges.some((college) => college.code.trim().toUpperCase() === collegeForm.code.trim().toUpperCase())) {
      setMessage("College already exists with this code.");
      return;
    }

    try {
      const collegeRes = await api.post("/colleges", { ...collegeForm, address: fullAddress });
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
      setMessage("College created with default departments.");
      setCollegeForm({ name: "", code: "", latitude: 18.5204, longitude: 73.8567 });
      setAddressForm({ ...emptyAddressParts });
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
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Building / Campus Name" value={addressForm.building} onChange={(e) => setAddressForm((p) => ({ ...p, building: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Road / Street Name" value={addressForm.road} onChange={(e) => setAddressForm((p) => ({ ...p, road: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Area / Locality" value={addressForm.area} onChange={(e) => setAddressForm((p) => ({ ...p, area: e.target.value }))} />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="City" value={addressForm.city} onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="State" value={addressForm.state} onChange={(e) => setAddressForm((p) => ({ ...p, state: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Pincode" value={addressForm.pincode} onChange={(e) => setAddressForm((p) => ({ ...p, pincode: e.target.value }))} required />
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Country" value={addressForm.country} onChange={(e) => setAddressForm((p) => ({ ...p, country: e.target.value }))} />
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
