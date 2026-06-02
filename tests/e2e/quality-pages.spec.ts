import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'https://inneranimalmedia.com';
const workspace = process.env.IAM_WORKSPACE_SLUG || 'inneranimalmedia';
const stagingDir = `reports/.staging/${workspace}`;

async function collectPageErrors(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`
    );
  });

  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  return { consoleErrors, failedRequests, badResponses };
}

type PageErrors = {
  consoleErrors: string[];
  failedRequests: string[];
  badResponses: string[];
};

async function finishPageEvidence(
  page: Page,
  opts: {
    slug: string;
    name: string;
    url: string;
    path: string;
    responseStatus: number | null;
    errors: PageErrors;
  },
  testInfo: { attach: (name: string, body: { body: string; contentType: string }) => Promise<void> }
) {
  const screenshotDir = `${stagingDir}/screenshots`;
  const evidenceDir = `${stagingDir}/evidence`;
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(`captures/${workspace}/evidence`, { recursive: true });

  const localScreenshot = `${screenshotDir}/${opts.slug}.png`;
  await page.screenshot({ path: localScreenshot, fullPage: true });

  const runPrefix =
    process.env.QUALITY_REPORT_R2_PREFIX ||
    `reports/quality-report/${process.env.REPORT_DATE || 'pending'}/${process.env.REPORT_TIME || 'pending'}`;
  const r2ScreenshotPath = `${runPrefix}/screenshots/${opts.slug}.png`;

  const evidence = {
    name: opts.name,
    url: opts.url,
    path: opts.path,
    status: opts.responseStatus,
    title: await page.title(),
    localScreenshot,
    screenshotPath: r2ScreenshotPath,
    r2_bucket: 'inneranimalmedia',
    r2_key: r2ScreenshotPath,
    consoleErrors: opts.errors.consoleErrors,
    failedRequests: opts.errors.failedRequests,
    badResponses: opts.errors.badResponses.filter((e) => !e.includes('favicon.ico')),
  };

  const evidenceJson = JSON.stringify(evidence, null, 2);
  fs.writeFileSync(`${evidenceDir}/${opts.slug}.json`, evidenceJson);
  fs.writeFileSync(`captures/${workspace}/evidence/${opts.slug}.json`, evidenceJson);

  await testInfo.attach(`${opts.slug} page evidence`, {
    body: evidenceJson,
    contentType: 'application/json',
  });
}

test.describe('IAM public quality — work + contact', () => {
  test('Work page loads with portfolio sections', async ({ page }, testInfo) => {
    const errors = await collectPageErrors(page);
    const response = await page.goto(`${BASE}/work`, { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    await expect(page).toHaveTitle(/Inner Animal|InnerAnimal|IAM|Proof over promises/i);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /selected work with a point of view/i
    );
    await expect(page.getByRole('link', { name: /start a build/i }).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /premium launch with a clear narrative/i }).first()
    ).toBeVisible();
    await expect(page.locator('header, nav').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();

    await finishPageEvidence(
      page,
      {
        slug: 'work',
        name: 'Work',
        url: `${BASE}/work`,
        path: '/work',
        responseStatus: response?.status() ?? null,
        errors,
      },
      testInfo
    );

    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });

  test('Contact page loads with form and contact channels', async ({ page }, testInfo) => {
    const errors = await collectPageErrors(page);
    const response = await page.goto(`${BASE}/contact`, { waitUntil: 'domcontentloaded' });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    await expect(page).toHaveTitle(/Inner Animal|InnerAnimal|IAM|Contact|Build Something/i);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /let's build something together/i
    );
    await expect(page.getByRole('link', { name: /hey@inneranimalmedia\.com/i }).first()).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
    await expect(page.locator('header, nav').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();

    await finishPageEvidence(
      page,
      {
        slug: 'contact',
        name: 'Contact',
        url: `${BASE}/contact`,
        path: '/contact',
        responseStatus: response?.status() ?? null,
        errors,
      },
      testInfo
    );

    expect(errors.failedRequests).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
