/**
 * Live /dashboard/meet RealtimeKit lobby smoke (requires IAM_SESSION cookie).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.IAM_BASE_URL || 'https://inneranimalmedia.com';
const OUT_PNG =
  process.env.IAM_MEET_PNG || 'reports/ai-smoke/dashboard-meet-rtk-lobby-latest.png';

function sessionValueFromEnv(): string {
  const raw = (process.env.IAM_SESSION || '').trim();
  if (!raw) return '';
  return raw.startsWith('session=') ? raw.slice('session='.length) : raw;
}

test.describe('Dashboard Meet RealtimeKit (live)', () => {
  test('lobby loads RTK shell without console errors', async ({ page, context }) => {
    const session = sessionValueFromEnv();
    test.skip(!session, 'Set IAM_SESSION to the raw dashboard session cookie value.');

    await context.addCookies([
      {
        name: 'session',
        value: session,
        domain: '.inneranimalmedia.com',
        path: '/',
        secure: true,
        sameSite: 'Lax',
      },
    ]);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const res = await page.goto(`${BASE}/dashboard/meet`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    expect(res?.status(), 'dashboard/meet should load').toBeLessThan(500);

    await expect(page.getByText('MEET · RTK')).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: /Schedule for later/i })).toBeVisible({
      timeout: 30000,
    });

    const cfg = await page.evaluate(async () => {
      const r = await fetch('/api/config/client', { credentials: 'include' });
      return r.ok ? r.json() : null;
    });
    expect(cfg?.meetEngine).toBe('realtimekit');

    const chunkOk = await page.evaluate(async () => {
      const r = await fetch('/static/dashboard/app/MeetRealtimeKitShell.js', { credentials: 'include' });
      return r.status;
    });
    expect(chunkOk).toBe(200);

    const outDir = path.dirname(OUT_PNG);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: OUT_PNG, fullPage: true });

    const fatal = consoleErrors.filter(
      (e) =>
        /ReferenceError|SyntaxError|Failed to fetch dynamically imported module/i.test(e) &&
        !/favicon|chrome-extension/i.test(e),
    );
    expect(fatal, `Console errors:\n${fatal.join('\n')}`).toEqual([]);
  });
});
