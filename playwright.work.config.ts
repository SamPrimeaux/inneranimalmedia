import { defineConfig, devices } from '@playwright/test';

const workspace = process.env.IAM_WORKSPACE_SLUG || 'inneranimalmedia';

/** Public /work + /contact quality pass — branded report via reports/template/render.py */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'quality-pages.spec.ts',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: `captures/${workspace}/results.json` }]],
  use: {
    baseURL: 'https://inneranimalmedia.com',
    trace: 'on-first-retry',
    screenshot: 'off',
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
