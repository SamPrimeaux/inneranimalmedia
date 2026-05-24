/**
 * In-worker browser tools via Cloudflare Browser Rendering (MYBROWSER + @cloudflare/playwright).
 * Run-scoped sessions: acquire once per agent_run_id / workflow_run_id, connect per tool call.
 */
import { putAgentBrowserScreenshotToR2 } from '../core/r2.js';
import {
  resolveBrowserRunScopeId,
  getStoredBrowserSession,
  saveBrowserSession,
  closeBrowserRunSession,
} from './browser-session.js';

const SCREENSHOT_TOOLS = new Set([
  'cdt_take_screenshot',
  'playwright_screenshot',
  'browser_screenshot',
]);

const GOTO_WAIT = 'domcontentloaded';
const GOTO_TIMEOUT_MS = 45_000;

/** Tools that must not reuse an existing page URL (always load target). */
const FORCE_GOTO_TOOLS = new Set(['browser_navigate', 'cdt_navigate_page']);

/**
 * @param {Record<string, unknown>} params
 */
export function resolveBrowserToolUrl(params) {
  const raw =
    params.url ??
    params.origin ??
    params.href ??
    params.target_url ??
    params.page_url;
  const u = raw != null ? String(raw).trim() : '';
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return `https:${u}`;
  return `https://${u.replace(/^\/+/, '')}`;
}

function normalizeUrlCompare(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.href.replace(/\/$/, '');
  } catch {
    return String(u || '').trim().replace(/\/$/, '');
  }
}

/**
 * @param {unknown} tree
 * @param {boolean} interestingOnly
 */
function filterA11ySnapshot(tree, interestingOnly) {
  if (!interestingOnly || !tree || typeof tree !== 'object') return tree;
  /** @param {any} node */
  function walk(node) {
    if (!node || typeof node !== 'object') return null;
    const children = Array.isArray(node.children)
      ? node.children.map(walk).filter(Boolean)
      : [];
    const name = node.name != null ? String(node.name).trim() : '';
    const role = node.role != null ? String(node.role).trim() : '';
    const hasInterest = Boolean(name || role === 'link' || role === 'button' || role === 'textbox');
    if (!hasInterest && children.length === 0) return null;
    return { ...node, children };
  }
  return walk(tree);
}

/**
 * @param {import('@cloudflare/playwright').Page} page
 * @param {string} url
 */
async function gotoPage(page, url) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: GOTO_WAIT, timeout: GOTO_TIMEOUT_MS });
}

/**
 * @param {import('@cloudflare/playwright').Page} page
 * @param {string} [targetUrl]
 * @param {{ force?: boolean }} [opts]
 */
async function ensurePageUrl(page, targetUrl, opts = {}) {
  if (!targetUrl) return;
  const current = page.url() || '';
  const force = opts.force === true;
  if (
    !force &&
    current &&
    current !== 'about:blank' &&
    normalizeUrlCompare(current) === normalizeUrlCompare(targetUrl)
  ) {
    return;
  }
  await gotoPage(page, targetUrl);
}

/**
 * @param {import('@cloudflare/playwright').Page} page
 * @param {number} [maxChars]
 */
async function extractPageText(page, maxChars = 120_000) {
  const text = await page.evaluate(() => {
    const body = document.body;
    if (!body) return '';
    return (body.innerText || body.textContent || '').trim();
  });
  const max = Math.max(1000, maxChars);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

/**
 * @param {any} env
 * @param {import('@cloudflare/playwright').Page} page
 * @param {{ fullPage?: boolean }} [opts]
 */
async function captureViewportScreenshot(env, page, opts = {}) {
  const buf = await page.screenshot({
    type: 'png',
    fullPage: Boolean(opts.fullPage),
  });
  return putAgentBrowserScreenshotToR2(env, buf, 'image/png');
}

/**
 * @param {import('@cloudflare/playwright').Browser} browser
 */
async function getActivePage(browser) {
  const contexts = browser.contexts?.() ?? [];
  for (const ctx of contexts) {
    const pages = ctx.pages?.() ?? [];
    if (pages.length) return pages[0];
  }
  return browser.newPage();
}

/**
 * @param {import('@cloudflare/playwright').Page} page
 */
function attachPageTelemetry(page, consoleMessages, networkRequests, networkByUrl) {
  page.on('console', (msg) => {
    try {
      consoleMessages.push({ type: String(msg.type()), text: String(msg.text()) });
    } catch {
      /* non-fatal */
    }
  });

  page.on('request', (req) => {
    try {
      const entry = {
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
      };
      networkByUrl.set(req.url(), entry);
      networkRequests.push(entry);
    } catch {
      /* non-fatal */
    }
  });

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const key = req.url();
      const entry = networkByUrl.get(key) || {
        url: key,
        method: req.method(),
        resourceType: req.resourceType(),
      };
      entry.status = res.status();
      entry.response = {
        status: res.status(),
        statusText: res.statusText(),
        headers: await res.allHeaders().catch(() => ({})),
      };
      networkByUrl.set(key, entry);
    } catch {
      /* non-fatal */
    }
  });
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {(ctx: {
 *   page: import('@cloudflare/playwright').Page,
 *   url: string,
 *   consoleMessages: Array<{ type: string, text: string }>,
 *   networkRequests: Array<Record<string, unknown>>,
 *   browserSession?: Record<string, unknown>|null,
 * }) => Promise<unknown>} fn
 * @param {{ toolName?: string, persistSession?: boolean }} [opts]
 */
export async function withBrowserPage(env, params, fn, opts = {}) {
  if (!env.MYBROWSER) {
    return {
      error: 'MYBROWSER binding not configured',
      hint: 'Enable Browser Rendering on the Worker (wrangler [browser] binding)',
    };
  }

  const targetUrl = resolveBrowserToolUrl(params);
  const toolName = String(opts.toolName || '').trim();
  const scopeId = resolveBrowserRunScopeId(params);
  const persistSession =
    opts.persistSession !== false && Boolean(scopeId) && sessionKv(env);

  const consoleMessages = [];
  const networkRequests = [];
  const networkByUrl = new Map();

  const pw = await import('@cloudflare/playwright');
  const canReuse = persistSession && typeof pw.acquire === 'function' && typeof pw.connect === 'function';

  let browser = null;
  let sessionId = null;
  let sessionReused = false;
  let sessionMeta = null;

  try {
    if (canReuse) {
      sessionMeta = await getStoredBrowserSession(env, scopeId);
      if (sessionMeta?.sessionId) {
        try {
          browser = await pw.connect(env.MYBROWSER, String(sessionMeta.sessionId));
          sessionId = String(sessionMeta.sessionId);
          sessionReused = true;
        } catch (e) {
          console.warn('[browser-cdp] connect to stored session failed', String(e?.message || e));
          sessionMeta = null;
        }
      }
      if (!browser) {
        const acquired = await pw.acquire(env.MYBROWSER, { keep_alive: 120_000 });
        sessionId = String(acquired.sessionId);
        browser = await pw.connect(env.MYBROWSER, sessionId);
        sessionReused = false;
      }
    } else {
      browser = await pw.launch(env.MYBROWSER);
      sessionId = browser.sessionId?.() ?? null;
    }

    const page = await getActivePage(browser);
    attachPageTelemetry(page, consoleMessages, networkRequests, networkByUrl);

    const forceGoto =
      FORCE_GOTO_TOOLS.has(toolName) || params.force_goto === true || params.forceGoto === true;
    if (targetUrl) {
      await ensurePageUrl(page, targetUrl, { force: forceGoto });
    }

    const effectiveUrl = page.url() || targetUrl || '';
    const browserSession =
      scopeId && sessionId
        ? {
            scope_id: scopeId,
            session_id: sessionId,
            reused: sessionReused,
          }
        : null;

    const result = await fn({
      page,
      url: effectiveUrl,
      consoleMessages,
      networkRequests,
      browserSession,
    });

    if (canReuse && scopeId && sessionId) {
      await saveBrowserSession(env, scopeId, {
        sessionId,
        user_id: params.user_id ?? params.session?.user_id ?? null,
        workspace_id: params.workspace_id ?? params.session?.workspace_id ?? null,
        current_url: page.url() || targetUrl || null,
        last_tool: toolName || null,
      });
    }

    if (result && typeof result === 'object' && browserSession) {
      return { ...result, browser_session: browserSession };
    }
    return result;
  } catch (e) {
    const msg = e?.message != null ? String(e.message) : String(e);
    return { error: msg, ok: false };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* disconnect (reuse) or close (ephemeral) */
      }
    }
  }
}

function sessionKv(env) {
  return env?.SESSION_CACHE || env?.KV || null;
}

/**
 * @param {any} env
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 */
export async function runBrowserBuiltinTool(env, toolName, params) {
  const tool = String(toolName || '').trim();
  const withOpts = { toolName: tool, persistSession: params.persist_session !== false };

  if (SCREENSHOT_TOOLS.has(tool)) {
    return withBrowserPage(
      env,
      params,
      async ({ page }) => {
        const fullPage = params.fullPage !== false;
        const out = await captureViewportScreenshot(env, page, { fullPage: Boolean(fullPage) });
        return {
          ok: true,
          url: page.url(),
          screenshot_url: out.screenshot_url,
          result_url: out.screenshot_url,
          job_id: out.job_id,
        };
      },
      withOpts,
    );
  }

  switch (tool) {
    case 'browser_close_session':
    case 'browser_session_close': {
      const scopeId = resolveBrowserRunScopeId(params);
      if (!scopeId) return { error: 'agent_run_id or workflow_run_id required' };
      return closeBrowserRunSession(env, scopeId);
    }

    case 'browser_navigate':
    case 'cdt_navigate_page':
      return withBrowserPage(
        env,
        params,
        async ({ page, url }) => {
          const finalUrl = page.url() || url;
          const title = await page.title().catch(() => '');
          const out = await captureViewportScreenshot(env, page, { fullPage: false });
          const page_text = await extractPageText(page);
          return {
            ok: true,
            url: finalUrl,
            title,
            screenshot_url: out.screenshot_url,
            result_url: out.screenshot_url,
            page_text,
            text: page_text,
            job_id: out.job_id,
          };
        },
        withOpts,
      );

    case 'browser_content':
      return withBrowserPage(
        env,
        params,
        async ({ page, url }) => {
          let html = await page.content();
          const max = Number(params.max_chars) > 0 ? Number(params.max_chars) : 400_000;
          if (html.length > max) {
            html = `${html.slice(0, max)}\n<!-- truncated -->`;
          }
          const page_text = await extractPageText(page);
          return {
            ok: true,
            url: page.url() || url,
            html,
            page_text,
            text: page_text,
          };
        },
        withOpts,
      );

    case 'cdt_take_snapshot': {
      const interestingOnly = params.interestingOnly !== false;
      return withBrowserPage(
        env,
        params,
        async ({ page }) => {
          let snapshot = null;
          try {
            snapshot = await page.accessibility.snapshot();
          } catch {
            snapshot = await page.evaluate(() => ({
              role: 'document',
              name: document.title,
              children: [{ role: 'generic', name: document.body?.innerText?.slice(0, 2000) || '' }],
            }));
          }
          return {
            ok: true,
            snapshot: filterA11ySnapshot(snapshot, interestingOnly),
          };
        },
        withOpts,
      );
    }

    case 'cdt_list_console_messages': {
      const limit = Math.min(500, Math.max(1, Number(params.limit) || 100));
      return withBrowserPage(env, params, async ({ consoleMessages }) => ({
        ok: true,
        messages: consoleMessages.slice(-limit),
      }), withOpts);
    }

    case 'cdt_get_console_message': {
      const idx = Number(params.index);
      return withBrowserPage(env, params, async ({ consoleMessages }) => {
        const i = Number.isFinite(idx) ? idx : 0;
        const msg = consoleMessages[i];
        if (!msg) return { ok: false, error: 'console message not found', index: i };
        return { ok: true, message: msg, index: i };
      }, withOpts);
    }

    case 'cdt_list_network_requests': {
      const limit = Math.min(500, Math.max(1, Number(params.limit) || 100));
      return withBrowserPage(env, params, async ({ networkRequests }) => ({
        ok: true,
        requests: networkRequests.slice(-limit),
      }), withOpts);
    }

    case 'cdt_get_network_request': {
      const target = String(params.url || params.request_url || '').trim();
      return withBrowserPage(env, params, async ({ networkRequests }) => {
        const hit = networkRequests.find((r) => String(r.url) === target);
        if (!hit) return { ok: false, error: 'network request not found', url: target };
        return { ok: true, request: hit };
      }, withOpts);
    }

    case 'cdt_list_pages':
      return withBrowserPage(env, params, async ({ page, url }) => ({
        ok: true,
        pages: [{ url: page.url() || url, title: await page.title().catch(() => '') }],
      }), withOpts);

    case 'cdt_wait_for': {
      const selector = params.selector != null ? String(params.selector).trim() : '';
      const text = params.text != null ? String(params.text).trim() : '';
      const timeout = Math.min(120_000, Math.max(1000, Number(params.timeout) || 30_000));
      return withBrowserPage(env, params, async ({ page }) => {
        if (selector) {
          await page.waitForSelector(selector, { timeout });
        } else if (text) {
          await page.getByText(text, { exact: false }).first().waitFor({ timeout });
        } else {
          await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
        }
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_click': {
      const selector = String(params.selector || '').trim();
      if (!selector) return { error: 'selector required' };
      return withBrowserPage(env, params, async ({ page }) => {
        await page.click(selector, { timeout: 15_000 });
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_fill': {
      const selector = String(params.selector || '').trim();
      const value = params.value != null ? String(params.value) : '';
      if (!selector) return { error: 'selector required' };
      return withBrowserPage(env, params, async ({ page }) => {
        await page.fill(selector, value, { timeout: 15_000 });
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_fill_form': {
      const fields = params.fields;
      if (!fields || typeof fields !== 'object') return { error: 'fields object required' };
      return withBrowserPage(env, params, async ({ page }) => {
        for (const [sel, val] of Object.entries(fields)) {
          await page.fill(String(sel), val != null ? String(val) : '', { timeout: 15_000 });
        }
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_hover': {
      const selector = String(params.selector || '').trim();
      if (!selector) return { error: 'selector required' };
      return withBrowserPage(env, params, async ({ page }) => {
        await page.hover(selector, { timeout: 15_000 });
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_press_key': {
      const key = String(params.key || params.text || 'Enter').trim();
      return withBrowserPage(env, params, async ({ page }) => {
        await page.keyboard.press(key);
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_evaluate_script': {
      const script = String(params.script || params.expression || '').trim();
      if (!script) return { error: 'script required' };
      return withBrowserPage(env, params, async ({ page }) => {
        const result = await page.evaluate((s) => {
          // eslint-disable-next-line no-eval
          return eval(s);
        }, script);
        return { ok: true, result, url: page.url() };
      }, withOpts);
    }

    case 'cdt_upload_file': {
      const selector = String(params.selector || '').trim();
      const fileUrl = String(params.file_url || params.target_file_url || '').trim();
      if (!selector || !fileUrl) return { error: 'selector and file_url required' };
      return withBrowserPage(env, params, async ({ page }) => {
        const res = await fetch(fileUrl);
        if (!res.ok) return { error: `fetch file failed: ${res.status}` };
        const buf = await res.arrayBuffer();
        const name = fileUrl.split('/').pop() || 'upload.bin';
        await page.locator(selector).setInputFiles({
          name,
          mimeType: res.headers.get('content-type') || 'application/octet-stream',
          buffer: new Uint8Array(buf),
        });
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'cdt_resize_page':
    case 'cdt_emulate': {
      const width = Number(params.width) || 1280;
      const height = Number(params.height) || 800;
      return withBrowserPage(env, params, async ({ page }) => {
        await page.setViewportSize({ width, height });
        return { ok: true, width, height, url: page.url() };
      }, withOpts);
    }

    case 'cdt_new_page':
    case 'cdt_select_page':
    case 'cdt_close_page':
      return withBrowserPage(env, params, async ({ page, url, browserSession }) => ({
        ok: true,
        note: 'Single page per run-scoped session; use browser_close_session to end',
        url: page.url() || url,
        browser_session: browserSession,
      }), withOpts);

    case 'cdt_handle_dialog': {
      const accept = params.accept !== false;
      return withBrowserPage(env, params, async ({ page }) => {
        page.once('dialog', async (dialog) => {
          if (accept) await dialog.accept(params.promptText != null ? String(params.promptText) : undefined);
          else await dialog.dismiss();
        });
        return { ok: true, url: page.url(), accept };
      }, withOpts);
    }

    case 'cdt_drag': {
      const from = params.from || params.start;
      const to = params.to || params.end;
      if (!from || !to) return { error: 'from and to required (x,y objects or selectors)' };
      return withBrowserPage(env, params, async ({ page }) => {
        if (typeof from === 'string' && typeof to === 'string') {
          await page.dragAndDrop(from, to, { timeout: 15_000 });
        } else {
          await page.mouse.move(Number(from.x) || 0, Number(from.y) || 0);
          await page.mouse.down();
          await page.mouse.move(Number(to.x) || 0, Number(to.y) || 0);
          await page.mouse.up();
        }
        return { ok: true, url: page.url() };
      }, withOpts);
    }

    case 'a11y_audit_webpage':
      return withBrowserPage(env, params, async ({ page, url }) => {
        const audit = await page.evaluate(() => {
          const issues = [];
          if (!document.title?.trim()) issues.push({ id: 'missing-title', impact: 'moderate' });
          const imgs = [...document.querySelectorAll('img')];
          const missingAlt = imgs.filter((i) => !i.getAttribute('alt')?.trim()).length;
          if (missingAlt) issues.push({ id: 'img-alt', impact: 'serious', count: missingAlt });
          const h1 = document.querySelectorAll('h1').length;
          if (h1 !== 1) issues.push({ id: 'h1-count', impact: 'moderate', count: h1 });
          return { issues, documentTitle: document.title || '' };
        });
        return { ok: true, url: page.url() || url, audit, engine: 'playwright-heuristic' };
      }, withOpts);

    case 'cdt_performance_start_trace':
    case 'cdt_performance_stop_trace':
    case 'cdt_performance_analyze_insight':
      return {
        ok: false,
        error: 'Performance trace tools are not supported on the MYBROWSER worker path',
        hint: 'Use cdt_take_snapshot and cdt_list_network_requests for page diagnostics',
      };

    default:
      if (tool.startsWith('cdt_') || tool.startsWith('browser_')) {
        return {
          error: `Unsupported browser tool: ${tool}`,
          hint: 'Register handler in src/integrations/browser-cdp.js',
        };
      }
      return { error: `Not a browser tool: ${tool}` };
  }
}

export { closeBrowserRunSession, resolveBrowserRunScopeId } from './browser-session.js';
