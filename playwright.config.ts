import { defineConfig, devices } from "@playwright/test";

// H8: E2E tests run in mock mode against the already-running dev server
// (reuseExistingServer picks it up if one is already up on this port; CI would
// start a fresh one). Every test gets its own browser context by default,
// which gets its own ws_id cookie on first request, so tests never share a
// workspace even though they share one server and one database.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.ts/ },
    // Chromium with a mobile viewport rather than devices["iPhone 13"]: that
    // preset defaults to WebKit, whose binary isn't installed here, and the
    // "Done when" line only asks for the 375x812 viewport, not a specific
    // rendering engine.
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
      testMatch: /phone\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
