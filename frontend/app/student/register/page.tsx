"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { publicApi } from "@/src/services/api";

type InviteData = {
  year?: string;
  division?: string;
  studentName?: string;
  studentEmail?: string;
  rollNo?: string;
  isActivated?: boolean;
};

type StatusTone = "info" | "success" | "error";

const parseApiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

function StudentRegisterContent() {
  const params = useSearchParams();
  const tokenFromUrl = params.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [inviteCode, setInviteCode] = useState("");
  const [isValidInvite, setIsValidInvite] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("Open your invite link or enter invite code.");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [inviteMeta, setInviteMeta] = useState<InviteData | null>(null);
  const [studentForm, setStudentForm] = useState({
    name: "",
    email: "",
    password: "",
    parentEmail: ""
  });

  const validateToken = useCallback(async (nextToken: string) => {
    if (!nextToken) {
      setIsValidInvite(false);
      setInviteMeta(null);
      setStatusTone("error");
      setMessage("Invite token missing.");
      return false;
    }

    try {
      setIsVerifying(true);
      const { data } = await publicApi.get(`/students/validate-invite/${nextToken}`);
      const invite = data?.data || null;
      setToken(nextToken);
      setInviteMeta(invite);
      setIsValidInvite(Boolean(data?.success));
      setStudentForm((current) => ({
        ...current,
        name: current.name || invite?.studentName || "",
        email: current.email || invite?.studentEmail || ""
      }));
      setStatusTone("success");
      setMessage(data?.message || "Invite validated.");
      return Boolean(data?.success);
    } catch (error) {
      setIsValidInvite(false);
      setInviteMeta(null);
      setStatusTone("error");
      setMessage(parseApiError(error, "Invite validation failed"));
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) {
      void validateToken(tokenFromUrl);
    }
  }, [tokenFromUrl, validateToken]);

  const handleResolveCode = async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();
    if (!normalizedCode) {
      setStatusTone("error");
      setMessage("Enter invite code first.");
      return;
    }

    try {
      setIsVerifying(true);
      const { data } = await publicApi.get(`/students/resolve-invite-code/${normalizedCode}`);
      const resolvedToken = String(data?.token || "");
      const valid = await validateToken(resolvedToken);
      if (valid) {
        setStatusTone("success");
        setMessage("Invite code verified.");
      }
    } catch (error) {
      setStatusTone("error");
      setMessage(parseApiError(error, "Invalid invite code"));
    } finally {
      setIsVerifying(false);
    }
  };

  const canSubmit = useMemo(
    () =>
      Boolean(
        token &&
          isValidInvite &&
          studentForm.name.trim() &&
          studentForm.email.trim() &&
          studentForm.password.trim()
      ),
    [isValidInvite, studentForm.email, studentForm.name, studentForm.password, token]
  );

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      setStatusTone("error");
      setMessage("Complete all required fields.");
      return;
    }

    if (!studentForm.email.trim().includes("@")) {
      setStatusTone("error");
      setMessage("Enter a valid email address.");
      return;
    }

    if (studentForm.password.trim().length < 6) {
      setStatusTone("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusTone("info");
      setMessage("Creating your account...");
      const payload = {
        token,
        inviteCode: inviteCode.trim().toUpperCase(),
        name: studentForm.name.trim(),
        email: studentForm.email.trim().toLowerCase(),
        password: studentForm.password.trim(),
        rollNo: inviteMeta?.rollNo || "",
        parentEmail: studentForm.parentEmail.trim()
      };

      const { data } = await publicApi.post("/students/register", payload);
      const authToken = String(data?.token || "");
      const user = data?.user;

      if (!authToken || !user) {
        setStatusTone("error");
        setMessage("Registration completed but login session could not be started.");
        return;
      }

      localStorage.setItem("va_token", authToken);
      localStorage.setItem("token", authToken);
      localStorage.setItem("va_user", JSON.stringify(user));
      setStatusTone("success");
      setMessage(data?.message || "Registration successful");
      window.location.href = "/student/face-register";
    } catch (error) {
      setStatusTone("error");
      setMessage(parseApiError(error, "Failed to register student"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#eef4ff] px-4 py-8">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/70 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Student Invite</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Activate your VisionAttend account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Validate your invite, complete your details, then continue to face registration.
        </p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Invite Access</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              className="min-h-[48px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              placeholder="Invite Code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void handleResolveCode()}
              disabled={isVerifying}
              className="min-h-[48px] rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {isVerifying ? "Verifying..." : "Verify Code"}
            </button>
          </div>
        </div>

        {inviteMeta ? (
          <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Class</p>
              <p className="mt-1 font-semibold text-slate-900">
                {inviteMeta.year || "-"} - {inviteMeta.division || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Roll No</p>
              <p className="mt-1 font-semibold text-slate-900">{inviteMeta.rollNo || "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Invited Email</p>
              <p className="mt-1 font-semibold text-slate-900">{inviteMeta.studentEmail || "-"}</p>
            </div>
          </div>
        ) : null}

        <form onSubmit={onRegister} className="mt-5 space-y-3">
          <input
            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
            placeholder="Full Name"
            value={studentForm.name}
            onChange={(e) => setStudentForm((current) => ({ ...current, name: e.target.value }))}
          />
          <input
            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none"
            placeholder="Email"
            value={studentForm.email}
            readOnly={Boolean(inviteMeta?.studentEmail)}
            onChange={(e) => setStudentForm((current) => ({ ...current, email: e.target.value }))}
          />
          <input
            type="password"
            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
            placeholder="Set Password"
            value={studentForm.password}
            onChange={(e) => setStudentForm((current) => ({ ...current, password: e.target.value }))}
          />
          <input
            type="email"
            className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
            placeholder="Parent Email (optional)"
            value={studentForm.parentEmail}
            onChange={(e) => setStudentForm((current) => ({ ...current, parentEmail: e.target.value }))}
          />

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="min-h-[50px] w-full rounded-2xl bg-[#135ed8] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(19,94,216,0.22)] disabled:opacity-60"
          >
            {isSubmitting ? "Creating account..." : "Register & Continue"}
          </button>
        </form>

        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm transition-all duration-200 ${
            statusTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : statusTone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {message}
        </div>
      </div>
    </section>
  );
}

export default function StudentRegisterPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading...</div>}>
      <StudentRegisterContent />
    </Suspense>
  );
}
