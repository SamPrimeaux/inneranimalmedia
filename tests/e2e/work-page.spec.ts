import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const WORK_PATH = '/work';
const WORK_URL = 'https://inneranimalmedia.com/work';

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
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return { consoleErrors, failedRequests, badResponses };
}

test.describe('Work page — inneranimalmedia.com/work', () => {
  test('loads with IAM branding, hero, and case-study sections', async ({ page }, testInfo) => {
    const errors = await collectPageErrors(page);

    const response = await page.goto(WORK_URL, {
      waitUntil: 'domcontentloaded',
    });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    await expect(page).toHaveTitle(/Inner Animal|InnerAnimal|IAM|Proof over promises/i);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /selected work with a point of view/i
    );

    await expect(page.getByRole('link', { name: /start a build/i }).first()).toBeVisible();

    const caseStudyHeadings = [
      /premium launch with a clear narrative/i,
      /brand refresh that brought the system into focus/i,
      /experience designed for attention and retention/i,
      /content system built for scale/i,
    ];

    for (const pattern of caseStudyHeadings) {
      await expect(page.getByRole('heading', { name: pattern }).first()).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: /every project starts with the same question/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /the value is in the lift/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /built to stand in a crowded field/i })).toBeVisible();

    await expect(page.locator('header, nav').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(200);

    const workspace = process.env.IAM_WORKSPACE_SLUG || 'inneranimalmedia';
    const screenshotDir = `captures/${workspace}/screenshots`;
    const evidenceDir = `captures/${workspace}/evidence`;
    fs.mkdirSync(screenshotDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });

    const screenshotPath = `${screenshotDir}/work.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const evidence = {
      name: 'Work',
      url: WORK_URL,
      path: WORK_PATH,
      status: response?.status() ?? null,
      title: await page.title(),
      screenshotPath,
      consoleErrors: errors.consoleErrors,
      failedRequests: errors.failedRequests,
      badResponses: errors.badResponses.filter((e) => !e.includes('favicon.ico')),
    };

    fs.writeFileSync(`${evidenceDir}/work.json`, JSON.stringify(evidence, null, 2));

    await testInfo.attach('work-page evidence', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });

    expect(errors.failedRequests, 'No failed network requests on /work').toEqual([]);
    expect(evidence.badResponses, 'No 4xx/5xx responses on /work').toEqual([]);
    expect(errors.consoleErrors, 'No console errors on /work').toEqual([]);
  });
});
