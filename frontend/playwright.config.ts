import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_API_ORIGIN || "http://localhost:5000"
  },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
});
