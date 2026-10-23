import { defineConfig, devices } from '@playwright/test';

// Runs against the demo build (browser-only data) served with the production CSP.
// Prerequisite: `npm run build:demo` (the `test:e2e` script does it). Uses the locally installed Chrome.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: 3, // each worker is a full Chrome; more can exhaust memory on small machines
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4199',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'node scripts/serve-dist.mjs dist-demo 4199',
    url: 'http://localhost:4199',
    reuseExistingServer: !process.env.CI,
  },
});
