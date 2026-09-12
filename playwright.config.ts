import { defineConfig } from "@playwright/test";

// Firefox and WebKit only have to cover the flows the MVP spec names for them:
// sign-in, Workout Session recording, and progress viewing. Everything else stays on
// Chromium, which runs the complete flow set. Tag a test with @cross-browser to run it
// on all three engines.
const crossBrowser = /@cross-browser/;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  // These specs drive a real `next dev` server, which compiles each route on first hit.
  timeout: 60_000,
  reporter: "line",
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // `channel` is Chromium-only; it must not leak into the Firefox or WebKit projects.
      use: { browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" },
    },
    {
      name: "firefox",
      grep: crossBrowser,
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      grep: crossBrowser,
      use: { browserName: "webkit" },
    },
  ],
});
