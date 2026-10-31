// @ts-check
import { defineConfig, devices } from '@playwright/test';
import './scripts/playwright-windows-paths.js';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const localTarget = /localhost|127\.0\.0\.1/.test(baseURL);
const specFileArg = process.argv.some((arg) =>
  /(?:^|[\\/])[^\\/]+\.(?:spec|setup)\.js(?::\d+)?(?::\d+)?$/i.test(arg)
);
const headed = process.env.HEADED === '1' || process.argv.includes('--headed') || (!process.env.CI && specFileArg);
const visibleBrowser = headed
  ? { headless: false, channel: 'chrome', launchOptions: { slowMo: 400 } }
  : {};

export default defineConfig({
  testDir: './automation/test',
  testMatch: '**/*.spec.js',
  globalSetup: './automation/global-setup.js',
  outputDir: './automation/reports/test-results',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI || headed ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'automation/reports/html', open: 'never' }],
    ...(process.env.CI ? [['junit', { outputFile: 'automation/reports/junit/results.xml' }]] : []),
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.js',
      use: { ...devices['Desktop Chrome'], ...visibleBrowser },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: ['**/auth.setup.js', '**/staging-smoke.spec.js'],
      use: { ...devices['Desktop Chrome'], ...visibleBrowser },
    },
    {
      name: 'smoke',
      testMatch: '**/staging-smoke.spec.js',
      use: { ...devices['Desktop Chrome'], ...visibleBrowser },
    },

    /*
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  webServer: localTarget ? [
    {
      command: 'npm run dev',
      cwd: './backend',
      url: 'http://localhost:4000/api/health',
      env: { LOGIN_ATTEMPT_LIMIT: '100' },
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'npm run dev',
      cwd: './frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ] : undefined,
});

