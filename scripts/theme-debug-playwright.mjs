#!/usr/bin/env node
/**
 * Theme race debugger — Playwright capture bundle for IAM CMS themes.
 *
 * Captures:
 *   - Console lines matching theme_debug / [iam theme_debug]
 *   - Network: responses for /api/themes/active, /api/themes/apply, /api/themes (list)
 *   - Periodic snapshots of documentElement attrs + selected CSS vars
 *   - HAR (Playwright urlFilter: only URLs containing "/api/"), trace.zip, video.webm, PNG screenshots
 *   - IAM_COLLAB WebSocket frames mentioning "theme" (canvas room is separate; browser room may still appear)
 *
 * Security:
 *   - NEVER commit IAM_SESSION_ID or HAR/trace (they contain secrets).
 *   - If you pasted a live session anywhere public, rotate it (logout / invalidate).
 *
 * Usage:
 *   IAM_SESSION_ID='<uuid>' node scripts/theme-debug-playwright.mjs
 *   IAM_SESSION_COOKIE='session=<uuid>' HEADED=1 node scripts/theme-debug-playwright.mjs
 *   IAM_BASE_URL=https://inneranimalmedia.com IAM_SESSION_ID=... node scripts/theme-debug-playwright.mjs --upload-r2
 *
 * Env:
 *   IAM_BASE_URL        default https://inneranimalmedia.com
 *   IAM_SESSION_ID      session cookie value (cookie name is always `session`)
 *   IAM_SESSION_COOKIE  optional full "session=..." if name ever differs
 *   HEADED=1            non-headless chromium
 *   IAM_WORKSPACE_ID    optional; echoed into meta if you know active workspace
 */

import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('Missing playwright. Run: npm i -D playwright @playwright/test');
    process.exit(1);
  }
}

function parseArgs(argv) {
  const flags = new Set();
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
  }
  return {
    uploadR2: flags.has('upload-r2'),
    skipThemeClick: flags.has('skip-click'),
  };
}

function parseSessionFromEnv() {
  const rawCookie = process.env.IAM_SESSION_COOKIE?.trim();
  const rawId = process.env.IAM_SESSION_ID?.trim();
  if (rawCookie) {
    const eq = rawCookie.indexOf('=');
    if (eq === -1) return { name: 'session', value: rawCookie };
    return {
      name: rawCookie.slice(0, eq).trim() || 'session',
      value: rawCookie.slice(eq + 1).trim(),
    };
  }
  if (rawId) return { name: 'session', value: rawId };
  return null;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function appendJsonl(file, obj) {
  appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
}

async function main() {
  const { chromium } = await loadPlaywright();
  const opts = parseArgs(process.argv.slice(2));
  const baseURL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
  const session = parseSessionFromEnv();
  if (!session?.value) {
    console.error(`
Missing session. Set one of:
  IAM_SESSION_ID=<value>          # cookie value only (recommended)
  IAM_SESSION_COOKIE=session=<v>   # full pair

Cookie name for IAM auth is: session
`);
    process.exit(1);
  }

  const runId = stamp();
  const outDir = join(repoRoot, 'artifacts', 'theme-debug', runId);
  mkdirSync(outDir, { recursive: true });
  const latestLink = join(repoRoot, 'artifacts', 'theme-debug', 'latest');
  try {
    writeFileSync(latestLink, outDir, 'utf8');
  } catch {
    /* ignore */
  }

  const meta = {
    runId,
    baseURL,
    workspaceId: process.env.IAM_WORKSPACE_ID || null,
    headed: process.env.HEADED === '1',
    skipThemeClick: opts.skipThemeClick,
    note: 'HAR/trace/video may contain secrets — do not commit',
  };
  writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
    args: ['--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    recordHar: { path: join(outDir, 'network.har'), urlFilter: '**/api/**' },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies([
    {
      name: session.name,
      value: session.value,
      url: baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL,
      httpOnly: true,
      secure: baseURL.startsWith('https'),
      sameSite: 'Lax',
    },
  ]);

  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();

  /** @type {{ url: string, status: number, body?: unknown, at: string }[]} */
  const themeApiBodies = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (!/\[iam theme_debug\]|theme_debug|ThemeSwitcher|themes\//i.test(text)) return;
    appendJsonl(join(outDir, 'console-theme.jsonl'), {
      at: new Date().toISOString(),
      type: msg.type(),
      text,
    });
  });

  page.on('websocket', (ws) => {
    const url = ws.url();
    const logCollab = url.includes('/api/collab/');
    const frameIn = (dir, payloadRaw) => {
      let payload = payloadRaw;
      if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
      if (typeof payload !== 'string') return;
      if (logCollab) {
        appendJsonl(join(outDir, 'ws-collab.jsonl'), {
          at: new Date().toISOString(),
          dir,
          wsUrl: url,
          payload: payload.slice(0, 12000),
        });
      }
      if (!payload.toLowerCase().includes('theme')) return;
      appendJsonl(join(outDir, 'ws-theme.jsonl'), {
        at: new Date().toISOString(),
        dir,
        wsUrl: url,
        payload: payload.slice(0, 8000),
      });
    };
    ws.on('framereceived', (event) => frameIn('in', event.payload));
    ws.on('framesent', (event) => frameIn('out', event.payload));
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (!/\/api\/themes/.test(url)) return;
    try {
      const ct = response.headers()['content-type'] || '';
      let body = null;
      if (ct.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }
      themeApiBodies.push({
        at: new Date().toISOString(),
        url,
        status: response.status(),
        body,
      });
      appendJsonl(join(outDir, 'theme-api-responses.jsonl'), themeApiBodies.at(-1));
    } catch (e) {
      appendJsonl(join(outDir, 'theme-api-responses.jsonl'), {
        at: new Date().toISOString(),
        url,
        status: response.status(),
        error: String(e?.message || e),
      });
    }
  });

  async function snapshot(label) {
    const data = await page.evaluate((snapLabel) => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const lsThemeKeys = Object.keys(localStorage).filter(
        (k) =>
          k.includes('theme') ||
          k.includes('inneranimalmedia_theme') ||
          k.includes('mcad_theme'),
      );
      const ls = {};
      for (const k of lsThemeKeys) {
        try {
          const v = localStorage.getItem(k);
          ls[k] = v != null && v.length > 2000 ? `${v.slice(0, 2000)}…` : v;
        } catch {
          ls[k] = '(read error)';
        }
      }
      return {
        label: snapLabel,
        at: new Date().toISOString(),
        href: window.location.href,
        dataTheme: root.getAttribute('data-theme'),
        dataCmsTheme: root.getAttribute('data-cms-theme'),
        dashboardThemeReady: root.getAttribute('data-dashboard-theme-ready'),
        darkClass: root.classList.contains('dark'),
        monaco: {
          theme: root.getAttribute('data-monaco-theme'),
          bg: root.getAttribute('data-monaco-bg'),
          themeDataLen: (root.getAttribute('data-monaco-theme-data') || '').length,
        },
        vars: {
          '--bg-app': cs.getPropertyValue('--bg-app').trim(),
          '--bg-canvas': cs.getPropertyValue('--bg-canvas').trim(),
          '--dashboard-panel': cs.getPropertyValue('--dashboard-panel').trim(),
          '--dashboard-canvas': cs.getPropertyValue('--dashboard-canvas').trim(),
          '--text-main': cs.getPropertyValue('--text-main').trim(),
        },
        localStorageTheme: ls,
      };
    }, label);
    appendJsonl(join(outDir, 'theme-snapshots.jsonl'), data);
    await page.screenshot({ path: join(outDir, `screenshot-${label}.png`), fullPage: false });
    return data;
  }

  try {
    const agentUrl = `${baseURL}/dashboard/agent?theme_debug=1`;
    console.log('[theme-debug] loading', agentUrl);
    await page.goto(agentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await snapshot('01-agent-loaded');

    const themesUrl = `${baseURL}/dashboard/settings/themes?theme_debug=1`;
    console.log('[theme-debug] loading', themesUrl);
    await page.goto(themesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await snapshot('02-settings-themes-loaded');

    if (!opts.skipThemeClick) {
      const themeButtons = page.locator('button:has(span.text-xs.font-medium)');
      const n = await themeButtons.count();
      console.log('[theme-debug] theme buttons found:', n);
      if (n >= 2) {
        await snapshot('03-before-switch');
        console.log('[theme-debug] clicking theme index 1 (second card)');
        await themeButtons.nth(1).click({ timeout: 15000 });
        await page.waitForTimeout(800);
        await snapshot('04-after-switch-800ms');
        await page.waitForTimeout(2500);
        await snapshot('05-after-switch-3300ms');
      } else if (n === 1) {
        console.warn('[theme-debug] only one theme — toggling same theme for API observe');
        await themeButtons.nth(0).click();
        await page.waitForTimeout(1500);
        await snapshot('04-single-theme-click');
      } else {
        console.warn('[theme-debug] no theme buttons — check auth / workspace provisioning');
      }
    }

    await page.goto(agentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await snapshot('06-return-agent');

    writeFileSync(join(outDir, 'theme-api-summary.json'), `${JSON.stringify(themeApiBodies, null, 2)}\n`, 'utf8');

    await context.tracing.stop({ path: join(outDir, 'trace.zip') });
    await context.close();
    await browser.close();

    const summaryMd = `# Theme debug run ${runId}

Artifacts (local): \`${outDir}\`

## Files
- meta.json — run metadata
- theme-snapshots.jsonl — DOM/CSS vars per step
- theme-api-responses.jsonl — JSON bodies from /api/themes*
- console-theme.jsonl — filtered console
- ws-collab.jsonl — **all** frames on /api/collab/* (captures \`theme_update\`)
- ws-theme.jsonl — frames containing substring "theme"
- network.har — API-only HAR (**secrets**)
- trace.zip — Playwright trace (**secrets**)
- *.webm — screen recording
- screenshot-*.png

## Interpretation
Compare snapshots **04** vs **05** for collab/API races; grep ws-theme.jsonl for \`theme_update\`.

Next: implement patch (transaction id + ignore stale collab).
`;
    writeFileSync(join(outDir, 'README.md'), summaryMd, 'utf8');

    console.log('\n[theme-debug] done. Output:', outDir);
    console.log('[theme-debug] Open trace: npx playwright show-trace', join(outDir, 'trace.zip'));

    if (opts.uploadR2) {
      const sh = join(repoRoot, 'scripts', 'upload-theme-debug-to-r2.sh');
      if (!existsSync(sh)) {
        console.warn('[theme-debug] upload script missing:', sh);
      } else {
        const { execFileSync } = await import('child_process');
        execFileSync('bash', [sh, outDir], { stdio: 'inherit', cwd: repoRoot });
      }
    }
  } catch (e) {
    console.error('[theme-debug] fatal:', e);
    try {
      await context.tracing.stop({ path: join(outDir, 'trace-error.zip') });
    } catch {
      /* ignore */
    }
    try {
      await context.close();
    } catch {
      /* ignore */
    }
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

main();
