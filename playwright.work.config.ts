import { defineConfig, devices } from '@playwright/test';

const workspace = process.env.IAM_WORKSPACE_SLUG || 'inneranimalmedia';

/** Focused quality pass for public /work — branded report via reports/template/render.py */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'work-page.spec.ts',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: `captures/${workspace}/results.json` }],
    ['html', { outputFolder: `captures/${workspace}/raw-playwright-report`, open: 'never' }],
  ],
  use: {
    baseURL: 'https://inneranimalmedia.com',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  outputDir: `captures/${workspace}/results`,
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
