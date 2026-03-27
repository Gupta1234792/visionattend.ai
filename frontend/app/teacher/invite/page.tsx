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
  isActive: boolean;
  createdAt: string;
};

const years: YearValue[] = ["FY", "SY", "TY", "FINAL"];
const divisions = ["A", "B", "C"];

export default function TeacherInvitePage() {
  const { user } = useAuth();

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [year, setYear] = useState<YearValue>("FY");
  const [division, setDivision] = useState("A");

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [rollNo, setRollNo] = useState("");

  const [invites, setInvites] = useState<InviteRow[]>([]);

  const parseError = (err: any) =>
    err?.response?.data?.message || "Something went wrong";

  /* ---------------- LOAD ---------------- */

  const loadInvites = async () => {
    try {
      const res = await api.get("/student-invite");
      setInvites(res.data?.invites || []);
    } catch {
      setMessage("Failed to load invites");
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  /* ---------------- CREATE ---------------- */

  const createInvite = async () => {
    if (!studentEmail || !rollNo) {
      setMessage("Email and Roll No are required ❗");
      return;
    }

    if (!user?.department) {
      setMessage("Department missing ❗");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/student-invite", {
        departmentId: user.department,
        year,
        division,
        studentName,
        studentEmail,
        rollNo,
      });

      setMessage(res.data?.message || "Student created ✅");

      // reset form
      setStudentName("");
      setStudentEmail("");
      setRollNo("");

      await loadInvites();
    } catch (err) {
      setMessage(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- ACTIONS ---------------- */

  const disableInvite = async (id: string) => {
    try {
      await api.patch(`/student-invite/${id}/disable`);
      setMessage("Invite disabled");
      loadInvites();
    } catch (err) {
      setMessage(parseError(err));
    }
  };

  const regenerateInvite = async (id: string) => {
    try {
      await api.post(`/student-invite/${id}/regenerate`);
      setMessage("Invite regenerated");
      loadInvites();
    } catch (err) {
      setMessage(parseError(err));
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <ProtectedRoute allow={["teacher", "coordinator"]}>
      <DashboardLayout title="Invite Students">

        <div className="grid gap-4 xl:grid-cols-2">

          {/* CREATE */}
          <section className="bg-white p-4 rounded-xl border">
            <h2 className="font-semibold">Create Invite</h2>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <select value={year} onChange={(e) => setYear(e.target.value as YearValue)}>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>

              <select value={division} onChange={(e) => setDivision(e.target.value)}>
                {divisions.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div className="mt-3 space-y-2">
              <input
                placeholder="Name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />

              <input
                placeholder="Email *"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
              />

              <input
                placeholder="Roll No *"
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
              />
            </div>

            <button
              onClick={createInvite}
              disabled={loading}
              className="mt-3 bg-blue-600 text-white px-4 py-2 rounded"
            >
              {loading ? "Creating..." : "Generate Invite"}
            </button>
          </section>

          {/* HISTORY */}
          <section className="bg-white p-4 rounded-xl border">
            <h2 className="font-semibold">Invite History</h2>

            <div className="mt-3 space-y-2 max-h-[400px] overflow-auto">
              {invites.map((i) => (
                <div key={i._id} className="border p-2 rounded">

                  <p>{i.year}-{i.division}</p>
                  <p className="text-xs">{i.studentEmail}</p>

                  <p className="text-xs">
                    {new Date(i.createdAt).toLocaleString()}
                  </p>

                  <div className="flex gap-2 mt-2">
                    <button onClick={() => regenerateInvite(i._id)}>
                      Regenerate
                    </button>
                    <button onClick={() => disableInvite(i._id)}>
                      Disable
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </section>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="mt-4 p-3 bg-gray-100 rounded">
            {message}
          </div>
        )}

      </DashboardLayout>
    </ProtectedRoute>
  );
}