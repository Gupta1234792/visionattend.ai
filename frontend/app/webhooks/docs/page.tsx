"use client";

import Link from "next/link";
import { ProtectedRoute } from "@/src/components/protected-route";
import { DashboardLayout } from "@/src/layouts/dashboard-layout";

const webhookDocs = [
  {
    event: "attendance.session.started",
    description: "Sent when a teacher opens the daily attendance window for a batch.",
    payload: {
      event: "attendance.session.started",
      collegeId: "67f0college001",
      sessionId: "67f0session001",
      classKey: "IT_TY_A_2026-03-12",
      batchKey: "IT_TY_A",
      subjectId: "67f0subject001",
      subjectName: "Android",
      teacherId: "67f0teacher001",
      teacherName: "Prof. Patil",
      startedAt: "2026-03-12T09:00:00.000Z",
      closesAt: "2026-03-12T09:10:00.000Z",
    },
  },
  {
    event: "attendance.marked",
    description: "Sent when a student attendance record is stored for the day.",
    payload: {
      event: "attendance.marked",
      collegeId: "67f0college001",
      sessionId: "67f0session001",
      attendanceId: "67f0attendance001",
      studentId: "67f0student001",
      studentName: "Aarav Patil",
      classKey: "IT_TY_A_2026-03-12",
      batchKey: "IT_TY_A",
      status: "present",
      locationFlag: "green",
      verificationMode: "face-blink",
      markedAt: "2026-03-12T09:03:21.000Z",
    },
  },
  {
    event: "student.face.registered",
    description: "Sent after a student completes live face registration successfully.",
    payload: {
      event: "student.face.registered",
      collegeId: "67f0college001",
      studentId: "67f0student001",
      studentName: "Aarav Patil",
      batchKey: "IT_TY_A",
      registeredAt: "2026-03-12T08:42:00.000Z",
    },
  },
  {
    event: "lecture.scheduled",
    description: "Sent when a lecture is scheduled for a batch.",
    payload: {
      event: "lecture.scheduled",
      collegeId: "67f0college001",
      lectureId: "67f0lecture001",
      title: "Android Revision",
      batchKey: "IT_TY_A",
      scheduledAt: "2026-03-12T11:30:00.000Z",
      durationMinutes: 60,
      meetingRoomId: "android-revision-tyit",
    },
  },
  {
    event: "lecture.live.started",
    description: "Sent when the teacher starts a scheduled lecture live.",
    payload: {
      event: "lecture.live.started",
      collegeId: "67f0college001",
      lectureId: "67f0lecture001",
      batchKey: "IT_TY_A",
      roomId: "lecture_android-revision-tyit",
      startedAt: "2026-03-12T11:31:00.000Z",
    },
  },
  {
    event: "lecture.live.ended",
    description: "Sent when a live lecture is closed.",
    payload: {
      event: "lecture.live.ended",
      collegeId: "67f0college001",
      lectureId: "67f0lecture001",
      batchKey: "IT_TY_A",
      endedAt: "2026-03-12T12:24:00.000Z",
    },
  },
  {
    event: "holiday.created",
    description: "Sent when a holiday notice is published for a batch.",
    payload: {
      event: "holiday.created",
      collegeId: "67f0college001",
      holidayId: "67f0holiday001",
      batchKey: "IT_TY_A",
      reason: "Industrial Visit",
      fromDate: "2026-03-15T00:00:00.000Z",
      toDate: "2026-03-15T23:59:59.000Z",
    },
  },
  {
    event: "announcement.created",
    description: "Sent when an announcement is broadcast to selected roles.",
    payload: {
      event: "announcement.created",
      collegeId: "67f0college001",
      announcementId: "67f0announcement001",
      title: "Tomorrow reporting time changed",
      targetRoles: ["teacher", "student"],
      createdByRole: "hod",
      createdAt: "2026-03-12T07:30:00.000Z",
    },
  },
];

const signatureExample = `const crypto = require("crypto");

function isValidSignature(secret, rawBody, timestamp, signature) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );
}`;

export default function WebhookDocsPage() {
  return (
    <ProtectedRoute allow={["admin", "hod"]}>
      <DashboardLayout title="Webhook Docs">
        <div className="space-y-4">
          <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Webhook Event Docs
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Use these samples to integrate VisionAttend events into your own system.
                </p>
              </div>
              <Link
                href="/webhooks"
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Back to Webhooks
              </Link>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              {webhookDocs.map((item) => (
                <article
                  key={item.event}
                  className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Event
                      </p>
                      <h3 className="mt-2 text-base font-semibold text-slate-900">
                        {item.event}
                      </h3>
                    </div>
                    <span className="rounded-full bg-[#e3edff] px-3 py-1 text-xs font-semibold text-[#1d63dc]">
                      JSON POST
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {item.description}
                  </p>
                  <pre className="mt-4 overflow-x-auto rounded-[1.4rem] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                    <code>{JSON.stringify(item.payload, null, 2)}</code>
                  </pre>
                </article>
              ))}
            </div>

            <div className="space-y-4">
              <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <h3 className="text-base font-semibold text-slate-900">
                  Signature Headers
                </h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <code>X-VisionAttend-Event</code>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <code>X-VisionAttend-Delivery</code>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <code>X-VisionAttend-Timestamp</code>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <code>X-VisionAttend-Signature</code>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <h3 className="text-base font-semibold text-slate-900">
                  Verify Signature
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Rebuild the HMAC using <code>timestamp.rawBody</code> and compare it with the signature header.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-[1.4rem] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  <code>{signatureExample}</code>
                </pre>
              </section>

              <section className="rounded-[1.8rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <h3 className="text-base font-semibold text-slate-900">
                  Notes
                </h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
                  <li>Payloads are sent as JSON with signed headers.</li>
                  <li>Each delivery gets a unique delivery id.</li>
                  <li>Failed deliveries can be retried from the Webhooks page.</li>
                  <li>Admin can scope webhooks by college.</li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
