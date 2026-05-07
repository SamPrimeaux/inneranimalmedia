import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://inneranimalmedia.com';

const publicPages = [
  { name: 'Home', path: '/' },
  { name: 'Work', path: '/work' },
  { name: 'About', path: '/about' },
  { name: 'Services', path: '/services' },
  { name: 'Contact', path: '/contact' },
  { name: 'Pricing', path: '/pricing' },
  { name: 'Games', path: '/games' },
  { name: 'Privacy', path: '/privacy' },
  { name: 'Terms', path: '/terms' },
  { name: 'Signup', path: '/auth/signup' },
];

async function collectPageErrors(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`);
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();

    if (status >= 400) {
      badResponses.push(`${status} ${url}`);
    }
  });

  return { consoleErrors, failedRequests, badResponses };
}

async function expectNoBrokenImages(page: Page) {
  const brokenImages = await page.locator('img').evaluateAll((imgs) =>
    imgs
      .map((img) => {
        const el = img as HTMLImageElement;
        return {
          src: el.currentSrc || el.src,
          alt: el.alt || '',
          complete: el.complete,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
        };
      })
      .filter((img) => img.src && (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0))
  );

  expect(brokenImages, `Broken images found:\n${JSON.stringify(brokenImages, null, 2)}`).toEqual([]);
}

async function expectUsableLayout(page: Page) {
  await expect(page.locator('body')).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length, 'Page body should contain visible text').toBeGreaterThan(100);

  const header = page.locator('header, [data-testid="site-header"], nav').first();
  await expect(header, 'Header/nav should be visible').toBeVisible();

  const footer = page.locator('footer, [data-testid="site-footer"]').first();
  await expect(footer, 'Footer should be visible').toBeVisible();
}

test.describe('InnerAnimalMedia public website', () => {
  for (const pageInfo of publicPages) {
    test(`${pageInfo.name} page loads cleanly: ${pageInfo.path}`, async ({ page }) => {
      const errors = await collectPageErrors(page);

      const response = await page.goto(`${BASE_URL}${pageInfo.path}`, {
        waitUntil: 'domcontentloaded',
      });

      expect(response, `${pageInfo.path} should return a response`).not.toBeNull();
      expect(response!.status(), `${pageInfo.path} should not return 4xx/5xx`).toBeLessThan(400);

      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
        // Some analytics/third-party scripts may keep the network alive.
        // The page still gets validated below.
      });

      await expect(page).toHaveTitle(/Inner Animal|InnerAnimal|IAM/i);
      await expectUsableLayout(page);
      await expectNoBrokenImages(page);

      expect(errors.failedRequests, `Failed requests on ${pageInfo.path}`).toEqual([]);
      expect(
        errors.badResponses.filter((entry) => {
          // Ignore common non-critical browser/platform noise only if needed.
          return !entry.includes('favicon.ico');
        }),
        `Bad HTTP responses on ${pageInfo.path}`
      ).toEqual([]);

      expect(errors.consoleErrors, `Console errors on ${pageInfo.path}`).toEqual([]);
    });
  }
});

test.describe('Responsive smoke tests', () => {
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 1000 },
  ];

  for (const viewport of viewports) {
    test(`homepage renders on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const response = await page.goto(BASE_URL, {
        waitUntil: 'domcontentloaded',
      });

      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(400);

      await expectUsableLayout(page);

      const horizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });

      expect(horizontalOverflow, `Homepage has horizontal overflow on ${viewport.name}`).toBe(false);
    });
  }
});

test.describe('Signup page validation', () => {
  test('signup page has a usable account creation surface', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/auth/signup`, {
      waitUntil: 'domcontentloaded',
    });

    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    await expect(page.locator('body')).toBeVisible();

    const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Continue")').first();

    await expect(emailInput, 'Signup page should expose an email input').toBeVisible();
    await expect(passwordInput, 'Signup page should expose a password input').toBeVisible();
    await expect(submitButton, 'Signup page should expose a submit/create-account button').toBeVisible();
  });
});
