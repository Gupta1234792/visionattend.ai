"use client";

import { useEffect, useState } from "react";
import api from "@/src/services/api";
import { useAuth } from "@/src/context/auth-context";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";
import { ProtectedRoute } from "@/src/components/protected-route";

type YearValue = "FY" | "SY" | "TY" | "FINAL";
type InviteRow = {
  _id: string;
  studentEmail?: string;
  year: YearValue;
  division: string;
  department?: { name?: string; code?: string };
  createdAt: string;
};

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TeacherInvitePage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [year, setYear] = useState<YearValue>((user?.year as YearValue) || "FY");
  const [division, setDivision] = useState(user?.division || "A");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const parseError = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    "Something went wrong";

  const loadInvites = async () => {
    try {
      const res = await api.get("/student-invite");
      setInvites(res.data?.invites || []);
    } catch (error) {
      setMessage(parseError(error));
      setInvites([]);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const createInvite = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      setMessage("Invalid email");
      return;
    }

    if (!user?.department) {
      setMessage("Department missing");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/student-invite", {
        email: normalizedEmail,
        departmentId: user.department,
        year,
        division
      });

      setMessage(res.data?.message || "Student created and credentials sent to email");
      setEmail("");
      await loadInvites();
    } catch (error) {
      setMessage(parseError(error));
    } finally {
      setLoading(false);
    }
  };

  const resendCredentials = async (id: string) => {
    try {
      const res = await api.post(`/student-invite/${id}/regenerate`);
      setMessage(res.data?.message || "Credentials regenerated");
    } catch (error) {
      setMessage(parseError(error));
    }
  };

  return (
    <ProtectedRoute allow={["teacher", "coordinator"]}>
      <DashboardLayout title="Invite Students">
        <div className="grid gap-4 xl:grid-cols-[1fr_1.05fr]">
          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Student Invite
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Create student account by email
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              We create the student account, generate the password, and email credentials automatically.
            </p>

            <div className="mt-5 grid gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@email.com"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#8fb4ff]"
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value as YearValue)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                >
                  {years.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                >
                  {divisions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void createInvite()}
              disabled={loading}
              className="mt-5 rounded-full bg-[#135ed8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate Invite"}
            </button>

            {message ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {message}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Recent Students
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Credential delivery history
            </h2>

            <div className="mt-5 space-y-3">
              {invites.length ? (
                invites.map((invite) => (
                  <article
                    key={invite._id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {invite.studentEmail || "Unknown email"}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                      {invite.department?.code || "Dept"} | {invite.year}-{invite.division}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {new Date(invite.createdAt).toLocaleString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => void resendCredentials(invite._id)}
                      className="mt-3 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Resend Credentials
                    </button>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                  No student invites created yet.
                </div>
              )}
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

