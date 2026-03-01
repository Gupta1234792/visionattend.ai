"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";

type YearValue = "FY" | "SY" | "TY" | "FINAL";
type InviteRow = {
  _id: string;
  inviteCode?: string;
  token: string;
  year: YearValue;
  division: string;
  department?: { name?: string; code?: string };
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
};

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function TeacherInvitePage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("Invite management ready.");
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [inviteResult, setInviteResult] = useState<{ inviteLink: string; inviteCode: string } | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const parseApiError = (error: unknown, fallback: string) => {
    const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    return maybeMessage || fallback;
  };

  const loadInvites = async () => {
    try {
      const res = await api.get("/student-invite");
      setInvites(res.data?.invites || []);
    } catch (error) {
      setMessage(parseApiError(error, "Failed to load invite history."));
      setInvites([]);
    }
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadInvites();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const createInvite = async () => {
    if (!user?.department) {
      setMessage("Department mapping missing.");
      return;
    }
    try {
      const res = await api.post("/student-invite", {
        departmentId: user.department,
        year,
        division
      });

      setInviteResult({
        inviteLink: res.data?.inviteLink || "",
        inviteCode: res.data?.inviteCode || res.data?.invite?.inviteCode || ""
      });
      setMessage("Invite generated/reused successfully.");
      void loadInvites();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to generate invite."));
    }
  };

  const disableInvite = async (inviteId: string) => {
    try {
      await api.patch(`/student-invite/${inviteId}/disable`);
      setMessage("Invite disabled.");
      void loadInvites();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to disable invite."));
    }
  };

  const regenerateInvite = async (inviteId: string) => {
    try {
      const res = await api.post(`/student-invite/${inviteId}/regenerate`);
      setInviteResult({
        inviteLink: res.data?.inviteLink || "",
        inviteCode: res.data?.inviteCode || ""
      });
      setMessage("Invite regenerated successfully.");
      void loadInvites();
    } catch (error) {
      setMessage(parseApiError(error, "Failed to regenerate invite."));
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <ProtectedRoute allow={["teacher", "coordinator"]}>
      <DashboardLayout title="Invite Students">
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Create Invite</h2>
            <p className="mt-2 text-sm text-slate-600">Reusable long-term link + code for one classroom batch.</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <button className="mt-3 rounded-lg bg-[#135ed8] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={createInvite}>
              Generate Invite
            </button>

            {inviteResult ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">Invite Code: {inviteResult.inviteCode || "N/A"}</p>
                <p className="mt-1 break-all text-slate-700">{inviteResult.inviteLink}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(inviteResult.inviteCode || "", "Code")}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    Copy Code
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(inviteResult.inviteLink || "", "Link")}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Invite History</h2>
            <p className="mt-2 text-sm text-slate-600">Revoke/regenerate/copy old invites without changing flow.</p>
            <div className="mt-3 max-h-[460px] space-y-2 overflow-auto">
              {invites.map((invite) => (
                <article key={invite._id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-semibold text-slate-800">
                    {invite.department?.code || "-"} {invite.year}-{invite.division}
                  </p>
                  <p className="text-xs text-slate-500">Code: {invite.inviteCode || "-"}</p>
                  <p className="text-xs text-slate-500">Expires: {new Date(invite.expiresAt).toLocaleString()}</p>
                  <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${invite.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                    {invite.isActive ? "Active" : "Disabled"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copyText(invite.inviteCode || "", "Code")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Copy Code</button>
                    <button type="button" onClick={() => void copyText(`${window.location.origin}/student/register?token=${invite.token}`, "Link")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Copy Link</button>
                    <button type="button" onClick={() => void regenerateInvite(invite._id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Regenerate</button>
                    {invite.isActive ? (
                      <button type="button" onClick={() => void disableInvite(invite._id)} className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700">Disable</button>
                    ) : null}
                  </div>
                </article>
              ))}
              {invites.length === 0 ? <p className="text-sm text-slate-500">No invites created yet.</p> : null}
            </div>
          </section>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
