"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { publicApi } from "@/src/services/api";

type InviteData = {
  year?: string;
  division?: string;
};

const parseApiError = (error: unknown, fallback: string) => {
  const maybeMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return maybeMessage || fallback;
};

function StudentRegisterPageContent() {
  const params = useSearchParams();
  const tokenFromUrl = params.get("token") || "";

  const [token, setToken] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState("Enter invite code or open invite link.");
  const [inviteMeta, setInviteMeta] = useState<InviteData | null>(null);

  const [studentForm, setStudentForm] = useState({
    name: "",
    email: "",
    password: "",
    rollNo: "",
    parentEmail: "",
  });

  const validateToken = useCallback(async (nextToken: string) => {
    if (!nextToken) {
      setIsValid(false);
      setInviteMeta(null);
      return;
    }

    try {
      const { data } = await publicApi.get(`/students/validate-invite/${nextToken}`);
      setIsValid(Boolean(data?.success));
      setInviteMeta(data?.data || null);
      setMessage(data?.success ? "Invite is valid. Complete student registration." : "Invite is invalid.");
    } catch (error) {
      setIsValid(false);
      setInviteMeta(null);
      setMessage(parseApiError(error, "Invite invalid or expired."));
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) {
      const timer = setTimeout(() => {
        void validateToken(tokenFromUrl);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [tokenFromUrl, validateToken]);

  const onResolveCode = async () => {
    if (!inviteCode.trim()) {
      setMessage("Enter invite code first.");
      return;
    }

    try {
      const { data } = await publicApi.get(`/students/resolve-invite-code/${inviteCode.trim().toUpperCase()}`);
      const nextToken = data?.token || "";
      setToken(nextToken);
      await validateToken(nextToken);
    } catch (error) {
      setMessage(parseApiError(error, "Invalid invite code."));
    }
  };

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    const activeToken = token || tokenFromUrl;
    if (!activeToken) {
      setMessage("Invite token missing. Use link or code first.");
      return;
    }

    try {
      const { data } = await publicApi.post("/students/register", {
        token: activeToken,
        ...studentForm,
      });
      setMessage(data?.message || "Student registration completed. Please login.");
      setStudentForm({ name: "", email: "", password: "", rollNo: "", parentEmail: "" });
    } catch (error) {
      setMessage(parseApiError(error, "Registration failed."));
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#eef4ff] p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Student Registration</h2>
        <p className="mt-1 text-sm text-slate-600">Join classroom using invite link or invite code.</p>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Enter Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="button" onClick={onResolveCode}>
            Verify
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</div>
        {inviteMeta ? (
          <p className="mt-2 text-xs text-slate-500">Class: {inviteMeta.year || "-"} / {inviteMeta.division || "-"}</p>
        ) : null}

        <form onSubmit={onRegister} className="mt-4 space-y-2">
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Full Name" value={studentForm.name} onChange={(e) => setStudentForm((p) => ({ ...p, name: e.target.value }))} required disabled={!isValid} />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="Email" value={studentForm.email} onChange={(e) => setStudentForm((p) => ({ ...p, email: e.target.value }))} required disabled={!isValid} />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Roll Number" value={studentForm.rollNo} onChange={(e) => setStudentForm((p) => ({ ...p, rollNo: e.target.value }))} required disabled={!isValid} />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="email" placeholder="Parent Email (optional)" value={studentForm.parentEmail} onChange={(e) => setStudentForm((p) => ({ ...p, parentEmail: e.target.value }))} disabled={!isValid} />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="password" placeholder="Password" value={studentForm.password} onChange={(e) => setStudentForm((p) => ({ ...p, password: e.target.value }))} required disabled={!isValid} />
          <button className="mt-2 w-full rounded-lg bg-[#135ed8] px-3 py-2 text-sm font-medium text-white disabled:opacity-60" type="submit" disabled={!isValid}>
            Register Student
          </button>
        </form>
      </div>
    </section>
  );
}

export default function StudentRegisterPage() {
  return (
    <Suspense fallback={<section className="flex min-h-screen items-center justify-center bg-[#eef4ff] p-4"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading registration...</div></section>}>
      <StudentRegisterPageContent />
    </Suspense>
  );
}
