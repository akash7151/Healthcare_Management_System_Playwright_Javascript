// @ts-check
import { defineConfig, devices } from "@playwright/test";
import "./scripts/playwright-windows-paths.js";

/**
 * Staging target for the JavaScript smoke suite.
 * Override STAGING_BASE_URL when the public host changes.
 * The API is reached through the same origin, so cookies stay first-party.
 */
const baseURL = (process.env.STAGING_BASE_URL || "https://rounds-cruise-stan-tricks.trycloudflare.com").replace(
  /\/$/,
  "",
);

export default defineConfig({
  testDir: "./automation/test",
  testMatch: "**/staging-smoke.spec.js",
  globalSetup: "./automation/global-setup.js",
  outputDir: "./automation/reports/test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 120000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "automation/reports/html", open: "never" }],
    ["junit", { outputFile: "automation/reports/junit/results.xml" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
