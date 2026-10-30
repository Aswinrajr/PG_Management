import { defineConfig } from '@playwright/test';

// Set PW_CHANNEL=msedge to drive an installed browser instead of Playwright's Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  outputDir: process.env.PW_OUTPUT ?? 'test-results',
  use: { baseURL: 'http://localhost:5173', ...(channel && { channel }) },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 360, height: 740 }, hasTouch: true } },
  ],
});
