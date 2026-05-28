/**
 * Live /dashboard/agent workbench smoke: real session cookie, real composer, real POST /api/agent/chat SSE.
 * Reads window.__IAM_AGENT_LAST_STREAM_DEBUG (see dashboard/components/ChatAssistant/streamDebug.ts).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.IAM_BASE_URL || 'https://inneranimalmedia.com';
const OUT_JSON =
  process.env.IAM_WORKBENCH_JSON || 'reports/ai-smoke/dashboard-agent-browser-workbench-latest.json';
const OUT_PNG =
  process.env.IAM_WORKBENCH_PNG || 'reports/ai-smoke/dashboard-agent-browser-workbench-failure.png';

function sessionValueFromEnv(): string {
  const raw = (process.env.IAM_SESSION || '').trim();
  if (!raw) return '';
  return raw.startsWith('session=') ? raw.slice('session='.length) : raw;
}

test.describe('Dashboard Agent browser workbench (live)', () => {
  test('composer hello + stream debug metadata', async ({ page, context }) => {
    const session = sessionValueFromEnv();
    test.skip(!session, 'Set IAM_SESSION to the raw dashboard session cookie value (no session= prefix required).');

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

    const res = await page.goto(`${BASE}/dashboard/agent`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    expect(res?.status(), 'dashboard/agent should load').toBeLessThan(500);

    await expect(page.getByPlaceholder('Message Agent Sam...')).toBeVisible({ timeout: 60000 });

    const composer = page.getByPlaceholder('Message Agent Sam...');
    await composer.fill('hello');
    await page.getByTitle('Send').click();

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const w = window as Window & { __IAM_AGENT_LAST_STREAM_DEBUG?: { done_received?: boolean } };
            return !!w.__IAM_AGENT_LAST_STREAM_DEBUG?.done_received;
          }),
        { timeout: 180_000 },
      )
      .toBe(true);

    await expect(page.getByTitle('Send')).toBeVisible({ timeout: 5000 });

    const dbg = await page.evaluate(() => {
      const w = window as Window & { __IAM_AGENT_LAST_STREAM_DEBUG?: Record<string, unknown> };
      return w.__IAM_AGENT_LAST_STREAM_DEBUG ?? null;
    });

    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u;
    const lastAssistant = (await page.locator('main').innerText().catch(() => '')).slice(-4000);

    const report = {
      ok: true,
      base_url: BASE,
      path: '/dashboard/agent',
      stream_debug: dbg,
      assistant_tail_sample: lastAssistant.slice(-800),
      checks: {} as Record<string, boolean>,
    };

    try {
      expect(dbg, 'window.__IAM_AGENT_LAST_STREAM_DEBUG should exist after chat').toBeTruthy();
      const ctx = (dbg as { context?: Record<string, unknown> }).context || {};
      report.checks.done_received = !!(dbg as { done_received?: boolean }).done_received;
      report.checks.minimal_lane =
        typeof ctx.prompt_lane === 'string' ? ctx.prompt_lane === 'minimal_ask' : false;
      report.checks.minimal_d1 = Number(ctx.minimal_prompt_d1_only) === 1;
      report.checks.chars_ok = typeof ctx.system_prompt_chars === 'number' ? Number(ctx.system_prompt_chars) < 1000 : false;
      report.checks.tools_zero = typeof ctx.tool_count === 'number' ? Number(ctx.tool_count) === 0 : false;
      report.checks.no_emoji = !emojiRe.test(lastAssistant);

      expect(report.checks.done_received, 'SSE done').toBe(true);
      if (ctx.prompt_lane) {
        expect(ctx.prompt_lane, 'prompt_lane').toBe('minimal_ask');
      }
      if (ctx.system_prompt_chars != null) {
        expect(Number(ctx.system_prompt_chars), 'system_prompt_chars').toBeLessThan(1000);
      }
      if (ctx.tool_count != null) {
        expect(Number(ctx.tool_count), 'tool_count').toBe(0);
      }
      expect(report.checks.no_emoji, 'assistant output should not include emoji').toBe(true);
    } catch (e) {
      report.ok = false;
      report.error = String(e);
      fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
      await page.screenshot({ path: OUT_PNG, fullPage: true }).catch(() => {});
      throw e;
    } finally {
      fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
      fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf-8');
    }
  });
});
