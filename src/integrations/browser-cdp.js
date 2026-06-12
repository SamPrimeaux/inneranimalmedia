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
import {
  ensureAgentLiveBrowserSession,
  closeAgentLiveBrowserSession,
  requestBrowserHumanInput,
  liveSessionPayload,
  getAgentLiveBrowserSession,
} from './agent-live-browser-session.js';
import { browserLiveDoRequired, patchAgentLiveBrowserSessionViaDo } from './browser-live-do-client.js';
import {
  listBrowserRunTargets,
  pickBrowserRunPageTarget,
  refreshBrowserRunLiveView,
} from './browser-run-session.js';

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

/** @param {string} actual @param {string} expected */
export function urlMatchesExpected(actual, expected) {
  const a = String(actual || '').trim();
  const e = String(expected || '').trim();
  if (!e) return true;
  if (!a) return false;
  if (normalizeUrlCompare(a) === normalizeUrlCompare(e)) return true;
  try {
    const au = new URL(a);
    const eu = new URL(e);
    if (au.origin === eu.origin) {
      const ap = au.pathname.replace(/\/$/, '') || '/';
      const ep = eu.pathname.replace(/\/$/, '') || '/';
      if (ap === ep) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @param {import('@cloudflare/playwright').Page} page
 * @param {number} [maxChars]
 */
async function readVerifiedPageSample(page, maxChars = 2000) {
  const title = await page.title().catch(() => '');
  const page_text = await extractPageText(page, maxChars);
  const h1 = await page
    .evaluate(() => document.querySelector('h1')?.innerText?.trim() || '')
    .catch(() => '');
  return { title, page_text, h1, url: page.url() || '' };
}

/**
 * Prove Browser Run Live View target URL matches CDP page.url() (not just Playwright state).
 * @param {any} env
 * @param {string} sessionId
 * @param {import('@cloudflare/playwright').Page} page
 * @param {string|null|undefined} storedTargetId
 */
async function syncLiveViewWithCdpPage(env, sessionId, page, storedTargetId = null) {
  const cdpUrl = page.url() || '';
  const listed = await listBrowserRunTargets(env, sessionId);
  if (!listed.ok) {
    return {
      ok: false,
      verified: false,
      live_view_verified: false,
      url: cdpUrl,
      error: listed.error || 'Could not list Browser Run targets',
    };
  }
  const targets = listed.targets || [];
  const wantId = storedTargetId != null ? String(storedTargetId).trim() : '';
  let target = wantId ? targets.find((t) => t && String(t.id) === wantId) : null;
  if (target && cdpUrl && !urlMatchesExpected(String(target.url || ''), cdpUrl)) {
    target =
      targets.find(
        (t) =>
          t &&
          String(t.type || '').toLowerCase() === 'page' &&
          urlMatchesExpected(String(t.url || ''), cdpUrl),
      ) || pickBrowserRunPageTarget(targets);
  }
  if (!target) target = pickBrowserRunPageTarget(targets);
  const targetUrl = target?.url != null ? String(target.url) : '';
  const liveViewVerified = !cdpUrl || !targetUrl || urlMatchesExpected(targetUrl, cdpUrl);
  const refreshed = await refreshBrowserRunLiveView(env, {
    sessionId,
    targetId: target?.id != null ? String(target.id) : null,
  });
  if (!refreshed.ok) {
    return {
      ok: false,
      verified: false,
      live_view_verified: false,
      url: cdpUrl,
      target_url: targetUrl || null,
      error: refreshed.error || 'Live View refresh failed',
    };
  }
  const refreshedUrl = refreshed.url != null ? String(refreshed.url) : targetUrl;
  const fullyVerified =
    liveViewVerified &&
    (!cdpUrl || !refreshedUrl || urlMatchesExpected(refreshedUrl, cdpUrl));
  return {
    ok: fullyVerified,
    verified: fullyVerified,
    live_view_verified: fullyVerified,
    url: cdpUrl,
    target_url: refreshedUrl || targetUrl || null,
    title: refreshed.title ?? null,
    target_id: refreshed.targetId ?? (target?.id != null ? String(target.id) : null),
    live_view_url: refreshed.devtoolsFrontendUrl ?? null,
    devtools_frontend_url: refreshed.devtoolsFrontendUrl ?? null,
  };
}

/**
 * Verify page URL + Live View target, then commit to AgentBrowserLive DO.
 * @param {any} env
 * @param {string} scopeId
 * @param {import('@cloudflare/playwright').Page} page
 * @param {string} toolName
 * @param {string|null} requestedUrl
 */
async function commitAgentLiveBrowserPageState(env, scopeId, page, toolName, requestedUrl = null) {
  if (!scopeId || !browserLiveDoRequired(env)) return null;
  const stored = await getAgentLiveBrowserSession(env, scopeId);
  const sid = stored?.sessionId ?? null;
  const url = page.url() || '';
  const title = await page.title().catch(() => '');
  let urlVerified = requestedUrl ? urlMatchesExpected(url, requestedUrl) : true;
  let liveSync = null;
  if (sid) {
    liveSync = await syncLiveViewWithCdpPage(env, sid, page, stored?.targetId ?? null);
    if (!liveSync.live_view_verified) urlVerified = false;
  }
  if (!urlVerified) {
    const errMsg =
      liveSync?.live_view_verified === false
        ? `Live View was not verified (CDP ${url}, Browser Run target ${liveSync?.target_url || 'unknown'})`
        : requestedUrl
          ? `Navigation was requested but not verified (expected ${requestedUrl}, got ${url})`
          : 'Page verification failed';
    await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
      tool_name: toolName,
      action_phase: 'done',
      url,
      title,
      requested_url: requestedUrl,
      verified: false,
      url_verified: false,
      ok: false,
    }).catch(() => null);
    return {
      url,
      title,
      verified: false,
      url_verified: false,
      live_view_verified: liveSync?.live_view_verified === true,
      browser_url_committed: null,
      error: errMsg,
      verification_failed: true,
      smoke_debug: {
        agent_run_id: scopeId,
        session_id: sid,
        final_url: url,
        requested_url: requestedUrl,
        url_verified: false,
        live_view_verified: liveSync?.live_view_verified === true,
        browser_run_target_url: liveSync?.target_url ?? null,
        same_session_reused: true,
        live_view_mode: stored?.liveViewMode ?? 'tab',
        screenshots_taken: 0,
      },
    };
  }
  const patchOut = await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
    tool_name: toolName,
    action_phase: 'done',
    url,
    title,
    requested_url: requestedUrl,
    verified: true,
    url_verified: true,
    ok: true,
    target_id: liveSync?.target_id ?? stored?.targetId ?? null,
    devtools_frontend_url: liveSync?.live_view_url ?? null,
  }).catch(() => null);
  const live = patchOut?.live_session ?? stored;
  return {
    url,
    title,
    verified: true,
    url_verified: true,
    live_view_verified: true,
    session_id: live?.session_id ?? sid ?? null,
    target_id: live?.target_id ?? liveSync?.target_id ?? stored?.targetId ?? null,
    live_session: live,
    browser_url_committed: patchOut?.browser_url_committed ?? {
      url,
      title,
      verified: true,
      session_id: live?.session_id ?? sid ?? null,
      agent_run_id: scopeId,
      live_view_url: live?.devtools_frontend_url ?? liveSync?.live_view_url ?? null,
    },
    smoke_debug: {
      agent_run_id: scopeId,
      session_id: live?.session_id ?? sid ?? null,
      target_id: live?.target_id ?? liveSync?.target_id ?? stored?.targetId ?? null,
      final_url: url,
      requested_url: requestedUrl,
      same_session_reused: true,
      live_view_mode: live?.live_view_mode ?? 'tab',
      url_verified: true,
      live_view_verified: true,
      browser_run_target_url: liveSync?.target_url ?? null,
      screenshots_taken: 0,
    },
  };
}

/** @param {any} env @param {string} scopeId @param {import('@cloudflare/playwright').Page} page @param {string} toolName @param {string} direction */
async function emitBrowserScrollPatch(env, scopeId, page, toolName, direction) {
  if (!scopeId || !browserLiveDoRequired(env)) return;
  await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
    tool_name: toolName,
    action_phase: 'done',
    scroll_direction: direction,
    url: page.url() || null,
    verified: true,
    ok: true,
  }).catch(() => {});
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
function normalizeBrowserCaptureResult(out) {
  if (!out || typeof out !== 'object') return out;
  const screenshot_url =
    out.screenshot_url ||
    out.data_url ||
    (out.image_base64
      ? `data:${out.content_type || 'image/png'};base64,${out.image_base64}`
      : null);
  if (!screenshot_url) return out;
  return {
    ...out,
    screenshot_url,
    result_url: out.result_url || screenshot_url,
  };
}

async function captureViewportScreenshot(env, page, opts = {}) {
  const buf = await page.screenshot({
    type: 'png',
    fullPage: Boolean(opts.fullPage),
  });
  const out = await putAgentBrowserScreenshotToR2(env, buf, 'image/png');
  return normalizeBrowserCaptureResult(out);
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
  const useLiveDo = Boolean(scopeId && browserLiveDoRequired(env));
  const persistSession =
    !useLiveDo &&
    opts.persistSession !== false &&
    Boolean(scopeId) &&
    sessionKv(env);

  let liveSessionMeta = null;
  if (scopeId && (useLiveDo || persistSession)) {
    const ensured = await ensureAgentLiveBrowserSession(env, scopeId, {
      url: targetUrl || null,
      defer_http_navigate: Boolean(useLiveDo && targetUrl),
      userId: params.user_id ?? params.session?.user_id ?? null,
      workspaceId: params.workspace_id ?? params.session?.workspace_id ?? null,
      tool_name: toolName || undefined,
    });
    if (ensured.error && !ensured.ok) {
      return { error: ensured.error, ok: false };
    }
    liveSessionMeta = ensured.live_session ?? null;
    if (useLiveDo && toolName) {
      await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
        tool_name: toolName,
        action_phase: 'start',
        url: liveSessionMeta?.url ?? targetUrl ?? null,
      }).catch(() => {});
    }
  }

  const consoleMessages = [];
  const networkRequests = [];
  const networkByUrl = new Map();

  const pw = await import('@cloudflare/playwright');
  const canReuse =
    (useLiveDo || persistSession) &&
    typeof pw.acquire === 'function' &&
    typeof pw.connect === 'function';

  let browser = null;
  let sessionId = null;
  let sessionReused = false;
  let sessionMeta = null;

  try {
    if (canReuse) {
      if (!useLiveDo) {
        sessionMeta = await getStoredBrowserSession(env, scopeId);
      }
      const connectId =
        liveSessionMeta?.session_id != null
          ? String(liveSessionMeta.session_id)
          : sessionMeta?.sessionId
            ? String(sessionMeta.sessionId)
            : '';
      if (connectId) {
        try {
          browser = await pw.connect(env.MYBROWSER, connectId);
          sessionId = connectId;
          sessionReused = true;
        } catch (e) {
          console.warn('[browser-cdp] connect to stored session failed', String(e?.message || e));
          sessionMeta = null;
        }
      }
      if (!browser) {
        if (useLiveDo) {
          return {
            error: 'Agent live browser session could not connect to Browser Run',
            ok: false,
            live_session: liveSessionMeta,
          };
        }
        const acquired = await pw.acquire(env.MYBROWSER, { keep_alive: 600_000 });
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
    const storedLive = scopeId ? await getAgentLiveBrowserSession(env, scopeId) : null;
    const browserSession =
      scopeId && sessionId
        ? {
            scope_id: scopeId,
            session_id: sessionId,
            target_id: storedLive?.targetId ?? liveSessionMeta?.target_id ?? null,
            web_socket_debugger_url:
              storedLive?.webSocketDebuggerUrl ?? liveSessionMeta?.web_socket_debugger_url ?? null,
            devtools_frontend_url:
              storedLive?.devtoolsFrontendUrl ?? liveSessionMeta?.devtools_frontend_url ?? null,
            reused: sessionReused,
          }
        : null;

    let result = await fn({
      page,
      url: effectiveUrl,
      consoleMessages,
      networkRequests,
      browserSession,
      liveSession: storedLive ? liveSessionPayload(storedLive) : liveSessionMeta,
    });

    if (canReuse && scopeId && sessionId && !useLiveDo) {
      await saveBrowserSession(env, scopeId, {
        sessionId,
        user_id: params.user_id ?? params.session?.user_id ?? null,
        workspace_id: params.workspace_id ?? params.session?.workspace_id ?? null,
        current_url: page.url() || targetUrl || null,
        last_tool: toolName || null,
        ...(storedLive ? serializeLiveFields(storedLive) : {}),
      });
    }

    if (useLiveDo && scopeId && toolName) {
      if (toolName === 'browser_scroll') {
        /* scroll patches emitted inside browser_scroll handler */
      } else if (toolName === 'browser_verify_current_page' || toolName === 'browser_content') {
        const expected =
          result?.expected_url || result?.requested_url || targetUrl || null;
        if (result?.verified === true && result?.live_view_verified !== false) {
          const commit = await commitAgentLiveBrowserPageState(
            env,
            scopeId,
            page,
            toolName,
            expected,
          );
          if (commit) {
            result = { ...result, ...commit };
          }
        } else if (result && result.verified === false) {
          await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
            tool_name: toolName,
            action_phase: 'done',
            url: page.url(),
            requested_url: expected,
            verified: false,
            url_verified: false,
            ok: false,
          }).catch(() => null);
        }
      } else {
        const requested = targetUrl || result?.requested_url || result?.expected_url || null;
        const commit = await commitAgentLiveBrowserPageState(
          env,
          scopeId,
          page,
          toolName,
          requested,
        );
        if (commit) {
          const mergedOk =
            result &&
            typeof result === 'object' &&
            result.ok !== false &&
            commit.verified !== false;
          result =
            result && typeof result === 'object'
              ? {
                  ...result,
                  ...commit,
                  ok: mergedOk,
                  ...(commit.verified === false ? { verification_failed: true } : {}),
                }
              : { ok: commit.verified !== false, ...commit };
        }
      }
    }

    if (result && typeof result === 'object') {
      const out = { ...result };
      if (browserSession) out.browser_session = browserSession;
      if (storedLive || liveSessionMeta) {
        out.live_session = storedLive ? liveSessionPayload(storedLive) : liveSessionMeta;
      }
      return out;
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

/** @param {import('./agent-live-browser-session.js').AgentLiveBrowserSession} session */
function serializeLiveFields(session) {
  return {
    targetId: session.targetId,
    devtools_frontend_url: session.devtoolsFrontendUrl,
    devtoolsFrontendUrl: session.devtoolsFrontendUrl,
    web_socket_debugger_url: session.webSocketDebuggerUrl,
    webSocketDebuggerUrl: session.webSocketDebuggerUrl,
    live_view_mode: session.liveViewMode,
    status: session.status,
  };
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
      return closeAgentLiveBrowserSession(env, scopeId);
    }

    case 'browser_request_human_input': {
      const scopeId = resolveBrowserRunScopeId(params);
      if (!scopeId) return { error: 'agent_run_id required for human-in-the-loop' };
      return requestBrowserHumanInput(env, scopeId, {
        reason: String(params.reason || ''),
        url: resolveBrowserToolUrl(params) || null,
        resumeWhen: params.resumeWhen ?? params.resume_when,
        selector: params.selector,
        timeoutMs: params.timeoutMs ?? params.timeout_ms,
      });
    }

    case 'browser_navigate':
    case 'cdt_navigate_page':
      return withBrowserPage(
        env,
        params,
        async ({ page, url, liveSession }) => {
          const requestedUrl = url;
          const finalUrl = page.url() || url;
          const title = await page.title().catch(() => '');
          const page_text = await extractPageText(page);
          const verified =
            !requestedUrl || urlMatchesExpected(finalUrl, requestedUrl);
          const scopeId = resolveBrowserRunScopeId(params);
          const agentLive = Boolean(scopeId);
          const base = {
            ok: verified,
            url: finalUrl,
            requested_url: requestedUrl,
            verified,
            url_verified: verified,
            title,
            page_text,
            text: page_text,
            agent_live_session: agentLive,
            ...(liveSession ? { live_session: liveSession } : {}),
            ...(!verified
              ? {
                  error: `Navigation was requested but not verified (expected ${requestedUrl}, got ${finalUrl})`,
                  verification_failed: true,
                }
              : {}),
          };
          if (agentLive) return base;
          const out = await captureViewportScreenshot(env, page, { fullPage: false });
          return {
            ...base,
            screenshot_url: out.screenshot_url,
            result_url: out.screenshot_url,
            job_id: out.job_id,
          };
        },
        withOpts,
      );

    case 'browser_scroll':
      return withBrowserPage(
        env,
        params,
        async ({ page }) => {
          const scopeId = resolveBrowserRunScopeId(params);
          const amount = Math.max(100, Number(params.amount) || 700);
          const dir = String(params.direction || 'both').toLowerCase();
          const scrollDown = dir === 'both' || dir === 'down';
          const scrollUp = dir === 'both' || dir === 'up';
          if (scrollDown) {
            await page.evaluate((y) => window.scrollBy(0, y), amount);
            await emitBrowserScrollPatch(env, scopeId, page, 'browser_scroll', 'down');
          }
          if (scrollUp) {
            await page.waitForTimeout(250).catch(() => {});
            await page.evaluate((y) => window.scrollBy(0, -y), amount);
            await emitBrowserScrollPatch(env, scopeId, page, 'browser_scroll', 'up');
          }
          return {
            ok: true,
            url: page.url(),
            scroll_amount: amount,
            scrolled_down: scrollDown,
            scrolled_up: scrollUp,
            verified: true,
          };
        },
        withOpts,
      );

    case 'browser_verify_current_page':
      return withBrowserPage(
        env,
        params,
        async ({ page, liveSession, browserSession }) => {
          const expectedUrl =
            resolveBrowserToolUrl(params) ||
            String(params.expected_url || params.expectedUrl || '').trim();
          const sid =
            browserSession?.session_id ??
            liveSession?.session_id ??
            null;
          let liveSync = null;
          if (sid) {
            liveSync = await syncLiveViewWithCdpPage(
              env,
              String(sid),
              page,
              browserSession?.target_id ?? liveSession?.target_id ?? null,
            );
          }
          const sample = await readVerifiedPageSample(page);
          const urlVerified = urlMatchesExpected(sample.url, expectedUrl);
          const liveVerified = !sid || liveSync?.live_view_verified === true;
          const requireTitle = params.require_title === true || params.requireTitle === true;
          const requireText =
            params.require_text_sample === true || params.requireTextSample === true;
          const titleOk = !requireTitle || Boolean(sample.title?.trim());
          const textOk = !requireText || sample.page_text.trim().length >= 20;
          const verified = urlVerified && liveVerified && titleOk && textOk;
          const scopeId = resolveBrowserRunScopeId(params);
          const base = {
            ok: verified,
            verified,
            url_verified: urlVerified,
            live_view_verified: liveVerified,
            url: sample.url,
            expected_url: expectedUrl || null,
            title: sample.title,
            h1: sample.h1,
            page_text_sample: sample.page_text.slice(0, 800),
            page_text: sample.page_text.slice(0, 4000),
            text: sample.page_text.slice(0, 4000),
            session_id:
              browserSession?.session_id ??
              liveSession?.session_id ??
              null,
            target_id:
              browserSession?.target_id ?? liveSession?.target_id ?? null,
            agent_run_id: scopeId,
            agent_live_session: Boolean(scopeId),
            ...(liveSession ? { live_session: liveSession } : {}),
            ...(!verified
              ? {
                  error: !liveVerified
                    ? `Live View was not verified (CDP ${sample.url}, Browser Run target ${liveSync?.target_url || 'unknown'})`
                    : urlVerified
                      ? `Page verification failed for ${expectedUrl || sample.url}`
                      : `Navigation was requested but not verified (expected ${expectedUrl}, got ${sample.url})`,
                  verification_failed: true,
                }
              : {}),
          };
          return base;
        },
        withOpts,
      );

    case 'browser_content':
      return withBrowserPage(
        env,
        params,
        async ({ page, url, liveSession, browserSession }) => {
          const scopeId = resolveBrowserRunScopeId(params);
          const expectedUrl =
            resolveBrowserToolUrl(params) ||
            String(params.expected_url || params.expectedUrl || '').trim() ||
            url;
          const sid =
            browserSession?.session_id ??
            liveSession?.session_id ??
            null;
          let liveSync = null;
          if (sid) {
            liveSync = await syncLiveViewWithCdpPage(
              env,
              String(sid),
              page,
              browserSession?.target_id ?? liveSession?.target_id ?? null,
            );
          }
          const cdpUrl = page.url() || url;
          const urlOk = !expectedUrl || urlMatchesExpected(cdpUrl, expectedUrl);
          const liveOk = !sid || liveSync?.live_view_verified === true;
          const verified = urlOk && liveOk;
          let html = await page.content();
          const max = Number(params.max_chars) > 0 ? Number(params.max_chars) : 400_000;
          if (html.length > max) {
            html = `${html.slice(0, max)}\n<!-- truncated -->`;
          }
          const page_text = await extractPageText(page);
          return {
            ok: verified,
            verified,
            url_verified: urlOk,
            live_view_verified: liveOk,
            url: cdpUrl,
            expected_url: expectedUrl || null,
            html: verified ? html : html.slice(0, 500),
            page_text: verified ? page_text : page_text.slice(0, 500),
            text: verified ? page_text : page_text.slice(0, 500),
            agent_run_id: scopeId,
            session_id: sid,
            ...(!verified
              ? {
                  error: !liveOk
                    ? `Live View was not verified (CDP ${cdpUrl}, Browser Run target ${liveSync?.target_url || 'unknown'})`
                    : `Page content not verified for ${expectedUrl}`,
                  verification_failed: true,
                }
              : {}),
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
export {
  closeAgentLiveBrowserSession,
  getAgentLiveBrowserSession,
  refreshAgentLiveBrowserLiveUrl,
  signalHumanInputResume,
  liveSessionPayload,
} from './agent-live-browser-session.js';
