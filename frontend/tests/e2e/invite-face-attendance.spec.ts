import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const apiBase = process.env.E2E_API_BASE || "http://localhost:5000/api";

const toDataUrl = (filePath: string) => {
  const absolutePath = path.resolve(filePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  const base64 = fs.readFileSync(absolutePath).toString("base64");
  return `data:${mime};base64,${base64}`;
};

test.describe("Invite to face attendance flow", () => {
  test("teacher invite to student registration to attendance scan", async ({ request }) => {
    const teacherToken = process.env.E2E_TEACHER_TOKEN || "";
    const departmentId = process.env.E2E_DEPARTMENT_ID || "";
    const subjectId = process.env.E2E_SUBJECT_ID || "";
    const year = process.env.E2E_YEAR || "FY";
    const division = process.env.E2E_DIVISION || "A";
    const latitude = Number(process.env.E2E_LATITUDE || "19.076");
    const longitude = Number(process.env.E2E_LONGITUDE || "72.8777");
    const framePaths = String(process.env.E2E_FACE_FRAME_PATHS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    test.skip(
      !teacherToken || !departmentId || !subjectId || framePaths.length < 6,
      "Set E2E_TEACHER_TOKEN, E2E_DEPARTMENT_ID, E2E_SUBJECT_ID, and at least 6 comma-separated E2E_FACE_FRAME_PATHS values",
    );

    const frames = framePaths.map((item) => toDataUrl(item));
    const uniqueKey = Date.now();
    const email = `e2e.student.${uniqueKey}@visionattend.test`;
    const rollNo = `E2E-${uniqueKey}`;
    const password = `Vision@${uniqueKey}`;

    const createInviteRes = await request.post(`${apiBase}/student-invite`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        departmentId,
        year,
        division,
        studentName: "E2E Student",
        studentEmail: email,
        rollNo,
        password,
      },
    });
    expect([200, 201]).toContain(createInviteRes.status());
    const invitePayload = await createInviteRes.json();
    const inviteToken =
      String(invitePayload?.invite?.token || "").trim() ||
      String(invitePayload?.inviteLink || "").split("token=")[1] ||
      "";
    expect(inviteToken.length).toBeGreaterThan(10);

    const validateInviteRes = await request.get(
      `${apiBase}/students/validate-invite/${inviteToken}`,
    );
    expect(validateInviteRes.ok()).toBeTruthy();

    const registerRes = await request.post(`${apiBase}/students/register`, {
      data: {
        token: inviteToken,
        name: "E2E Student",
        email,
        rollNo,
        password,
      },
    });
    expect(registerRes.status()).toBe(201);
    const registerPayload = await registerRes.json();
    const studentToken = String(registerPayload?.token || "");
    expect(studentToken.length).toBeGreaterThan(10);

    const faceRegisterRes = await request.post(`${apiBase}/students/face-register`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        image: frames[0],
        frames: frames.slice(0, 3),
        blinkFrames: frames.slice(0, 6),
      },
    });
    expect([200, 201]).toContain(faceRegisterRes.status());

    const startAttendanceRes = await request.post(`${apiBase}/attendance/start`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        subjectId,
        year,
        division,
        latitude,
        longitude,
      },
    });
    expect([201, 409]).toContain(startAttendanceRes.status());

    const activeClassRes = await request.get(`${apiBase}/attendance/active-class`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(activeClassRes.ok()).toBeTruthy();
    const activeClassPayload = await activeClassRes.json();
    const sessionId = String(activeClassPayload?.session?._id || "");
    expect(sessionId.length).toBeGreaterThan(10);

    const scanRes = await request.post(`${apiBase}/attendance/scan-face-class`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        sessionId,
        latitude,
        longitude,
        frames,
      },
    });
    expect([201, 409]).toContain(scanRes.status());

    const studentDashboardRes = await request.get(`${apiBase}/students/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentDashboardRes.ok()).toBeTruthy();
    const studentProfile = await studentDashboardRes.json();
    expect(Boolean(studentProfile?.student?.faceRegisteredAt)).toBeTruthy();
  });
});
