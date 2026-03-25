"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { publicApi } from "@/src/services/api";

type InviteData = {
  year?: string;
  division?: string;
  studentName?: string;
  studentEmail?: string;
  rollNo?: string;
  hasDirectActivation?: boolean;
};

const parseApiError = (error: any, fallback: string) => {
  return error?.response?.data?.message || fallback;
};

function StudentRegisterPageContent() {
  const params = useSearchParams();
  const tokenFromUrl = params.get("token") || "";

  const [token, setToken] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [message, setMessage] = useState("Invite code verify karo.");
  const [inviteMeta, setInviteMeta] = useState<InviteData | null>(null);

  const [studentForm, setStudentForm] = useState({
    name: "",
    email: "",
    password: "",
    rollNo: "",
    parentEmail: "",
  });

  const router = useRouter();

  // ✅ Validate token
  const validateToken = useCallback(async (nextToken: string) => {
    try {
      const { data } = await publicApi.get(`/students/validate-invite/${nextToken}`);
      setIsValid(Boolean(data?.success));
      setInviteMeta(data?.data || null);
      setMessage(data?.success ? "Invite valid hai." : "Invalid invite.");
    } catch (err) {
      setIsValid(false);
      setInviteMeta(null);
      setMessage(parseApiError(err, "Invite invalid."));
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) validateToken(tokenFromUrl);
  }, [tokenFromUrl, validateToken]);

  // ✅ Verify code
  const onResolveCode = async () => {
    if (!inviteCode.trim()) {
      setMessage("Enter invite code first.");
      return;
    }

    try {
      const { data } = await publicApi.get(
        `/students/resolve-invite-code/${inviteCode.trim().toUpperCase()}`
      );

      const nextToken = data?.token;
      setToken(nextToken);
      await validateToken(nextToken);

      setIsCodeVerified(true);
      setMessage("Invite code verified.");
    } catch (err) {
      setIsCodeVerified(false);
      setMessage(parseApiError(err, "Invalid invite code."));
    }
  };

  // ✅ REGISTER (FINAL FIX)
  const onRegister = async (e: FormEvent) => {
    e.preventDefault();

    const activeToken = token || tokenFromUrl;

    if (!activeToken) {
      setMessage("Token missing.");
      return;
    }

    if (!studentForm.name || !studentForm.email || !studentForm.rollNo) {
      setMessage("Fill all required fields.");
      return;
    }

    try {
      const payload = {
        token: activeToken,
        inviteCode: inviteCode.trim().toUpperCase() || "", // ❗ always string
        name: studentForm.name.trim(),
        email: studentForm.email.trim(),
        rollNo: studentForm.rollNo.trim(),
        parentEmail: studentForm.parentEmail.trim() || "", // ❗ no undefined
        password: studentForm.password || "Temp@123", // ❗ backend safe
      };

      console.log("FINAL PAYLOAD:", payload);

      const { data } = await publicApi.post("/students/register", payload);

      setMessage(data?.message || "Registration successful");

      if (data?.token) {
        localStorage.setItem("token", data.token);
      }

      router.push("/student/face-register");

    } catch (err: any) {
      console.error("REGISTER ERROR:", err?.response?.data || err);
      setMessage(parseApiError(err, "Registration failed"));
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#eef4ff] p-4">
      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow">

        <h2 className="text-lg font-semibold">Student Registration</h2>

        {/* Invite Code */}
        <div className="flex gap-2 mt-4">
          <input
            className="flex-1 border px-3 py-2 rounded"
            placeholder="Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button onClick={onResolveCode} className="px-3 py-2 border rounded">
            Verify
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-500">{message}</p>

        {/* FORM */}
        <form onSubmit={onRegister} className="mt-4 space-y-2">

          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="Name"
            value={studentForm.name}
            onChange={(e) =>
              setStudentForm((p) => ({ ...p, name: e.target.value }))
            }
          />

          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="Email"
            value={studentForm.email}
            onChange={(e) =>
              setStudentForm((p) => ({ ...p, email: e.target.value }))
            }
          />

          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="Roll No"
            value={studentForm.rollNo}
            onChange={(e) =>
              setStudentForm((p) => ({ ...p, rollNo: e.target.value }))
            }
          />

          <input
            className="w-full border px-3 py-2 rounded"
            placeholder="Parent Email"
            value={studentForm.parentEmail}
            onChange={(e) =>
              setStudentForm((p) => ({ ...p, parentEmail: e.target.value }))
            }
          />

          <input
            type="password"
            className="w-full border px-3 py-2 rounded"
            placeholder="Password"
            value={studentForm.password}
            onChange={(e) =>
              setStudentForm((p) => ({ ...p, password: e.target.value }))
            }
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded mt-2"
          >
            Register
          </button>
        </form>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StudentRegisterPageContent />
    </Suspense>
  );
}