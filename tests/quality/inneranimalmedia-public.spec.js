import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const routes = [
  ['Home', 'https://inneranimalmedia.com/'],
  ['Work', 'https://inneranimalmedia.com/work'],
  ['About', 'https://inneranimalmedia.com/about'],
  ['Services', 'https://inneranimalmedia.com/services'],
  ['Contact', 'https://inneranimalmedia.com/contact'],
  ['Pricing', 'https://inneranimalmedia.com/pricing'],
  ['Games', 'https://inneranimalmedia.com/games'],
  ['Privacy', 'https://inneranimalmedia.com/privacy'],
  ['Terms', 'https://inneranimalmedia.com/terms'],
  ['Signup', 'https://inneranimalmedia.com/auth/signup'],
];

const ignoredRequestHosts = [
  'google-analytics.com',
  'googletagmanager.com',
];

const warningConsolePatterns = [
  /THREE\.WebGLRenderer: Error creating WebGL context/i,
];

test.describe('InnerAnimalMedia public quality pass', () => {
  for (const [name, url] of routes) {
    test(`${name} page quality check`, async ({ page }, testInfo) => {
      const consoleErrors = [];
      const consoleWarnings = [];
      const failedRequests = [];
      const ignoredRequests = [];
      const pageErrors = [];

      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
          if (warningConsolePatterns.some(rx => rx.test(text))) consoleWarnings.push(text);
          else consoleErrors.push(text);
        }
      });

      page.on('pageerror', err => pageErrors.push(String(err.message || err)));

      page.on('requestfailed', req => {
        const failed = `${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'unknown'}`;
        if (ignoredRequestHosts.some(host => req.url().includes(host))) ignoredRequests.push(failed);
        else failedRequests.push(failed);
      });

      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      await expect.soft(response, `${name} should return a response`).toBeTruthy();
      await expect.soft(response.status(), `${name} HTTP status`).toBeLessThan(400);
      await expect.soft(page.locator('body'), `${name} body visible`).toBeVisible();

      const title = await page.title();
      await expect.soft(title.length, `${name} should have a title`).toBeGreaterThan(3);

      const bodyText = await page.locator('body').innerText().catch(() => '');
      await expect.soft(bodyText.trim().length, `${name} should have visible text`).toBeGreaterThan(25);

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const localScreenshot = `reports/.staging/inneranimalmedia/screenshots/${slug}.png`;
      fs.mkdirSync('reports/.staging/inneranimalmedia/screenshots', { recursive: true });
      fs.mkdirSync('reports/.staging/inneranimalmedia/evidence', { recursive: true });
      await page.screenshot({ path: localScreenshot, fullPage: true });

      const r2ScreenshotPath = `reports/screenshots/${slug}.png`;

      const evidence = {
        name,
        url,
        status: response?.status() || null,
        title,
        localScreenshot,
        screenshotPath: r2ScreenshotPath,
        r2_bucket: 'inneranimalmedia',
        r2_key: r2ScreenshotPath,
        consoleErrors,
        consoleWarnings,
        failedRequests,
        ignoredRequests,
        pageErrors,
      };

      fs.mkdirSync('captures/inneranimalmedia/evidence', { recursive: true });
      const evidenceJson = JSON.stringify(evidence, null, 2);
      fs.writeFileSync(`reports/.staging/inneranimalmedia/evidence/${slug}.json`, evidenceJson);
      fs.writeFileSync(`captures/inneranimalmedia/evidence/${slug}.json`, evidenceJson);

      await testInfo.attach(`${name} evidence`, {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
      });

      expect(consoleErrors, `${name} real console errors`).toEqual([]);
      expect(pageErrors, `${name} page runtime errors`).toEqual([]);
      expect(failedRequests, `${name} real failed requests`).toEqual([]);
    });
  }
});
