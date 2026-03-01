import { test, expect } from "@playwright/test";

const apiBase = process.env.E2E_API_BASE || "http://localhost:5000/api";

test.describe("API smoke", () => {
  test("backend health endpoints respond", async ({ request }) => {
    const health = await request.get("http://localhost:5000/health");
    expect(health.ok()).toBeTruthy();

    const opencvHealth = await request.get("http://localhost:5000/health/opencv");
    expect([200, 503]).toContain(opencvHealth.status());
  });

  test("invalid login returns auth failure", async ({ request }) => {
    const res = await request.post(`${apiBase}/auth/login`, {
      data: {
        email: "nonexistent@example.com",
        password: "invalid-password"
      }
    });
    expect([400, 401]).toContain(res.status());
  });

  test("protected endpoint requires token", async ({ request }) => {
    const res = await request.get(`${apiBase}/admin/users`);
    expect([401, 403]).toContain(res.status());
  });

  test("invite lifecycle works when teacher token is provided", async ({ request }) => {
    const teacherToken = process.env.E2E_TEACHER_TOKEN || "";
    const departmentId = process.env.E2E_DEPARTMENT_ID || "";

    test.skip(!teacherToken || !departmentId, "Set E2E_TEACHER_TOKEN and E2E_DEPARTMENT_ID for invite lifecycle test");

    const createRes = await request.post(`${apiBase}/student-invite`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        departmentId,
        year: process.env.E2E_YEAR || "FY",
        division: process.env.E2E_DIVISION || "A"
      }
    });
    expect([200, 201]).toContain(createRes.status());
    const created = await createRes.json();
    const inviteId = String(created?.invite?._id || "");
    expect(inviteId.length > 0).toBeTruthy();

    const regenRes = await request.post(`${apiBase}/student-invite/${inviteId}/regenerate`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    expect(regenRes.ok()).toBeTruthy();

    const disableRes = await request.patch(`${apiBase}/student-invite/${inviteId}/disable`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    expect(disableRes.ok()).toBeTruthy();
  });
});
