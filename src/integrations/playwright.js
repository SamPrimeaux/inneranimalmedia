/**
 * Integration Layer: Browser Rendering / Playwright
 *
 * Capabilities:
 *  - Screenshots, scraping, element inspection via Cloudflare Browser Rendering (env.MYBROWSER)
 *  - Job tracking in D1 playwright_jobs table
 *  - Real-time broadcast to UI via Durable Objects WebSocket (env.BROWSER_RELAY)
 *
 * HTTP surface:
 *  POST /api/browser/screenshot       → takeScreenshot()
 *  POST /api/browser/scrape           → scrapePage()
 *  POST /api/browser/inspect          → inspectElement()
 *  POST /api/playwright/screenshot    → alias → takeScreenshot()
 *  POST /api/playwright/inspect       → alias → inspectElement()
 *  GET  /api/playwright/jobs          → list jobs
 *  GET  /api/playwright/jobs/:id      → single job
 *  POST /api/playwright/jobs          → queue a job record
 *
 * Durable Object: BrowserRelayDO
 *  - Holds open WebSocket connections from BrowserView UI panes
 *  - Agent Sam / MCP tools call broadcastBrowserEvent() to push live navigation,
 *    screenshots, and inspect results into the active UI pane(s)
 *
 * Requires:
 *  env.MYBROWSER   — Cloudflare Browser Rendering binding
 *  env.DB          — D1 database with playwright_jobs table
 *  env.BROWSER_RELAY — Durable Object namespace binding
 *  env.DOCS_BUCKET / env.DASHBOARD / env.R2 — R2 bucket for screenshot storage
 *  env.IAM_ORIGIN  — public origin for generating screenshot URLs
 */

import puppeteer from '@cloudflare/puppeteer';
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';

// ─── Durable Object: BrowserRelayDO ──────────────────────────────────────────
//
// Deployed separately in wrangler.toml as a Durable Object class.
// Each "room" (keyed by session or tenant) holds WebSocket connections
// from BrowserView panes. Agent Sam broadcasts events into the room.
//
// wrangler.toml entry needed:
//   [[durable_objects.bindings]]
//   name = "BROWSER_RELAY"
//   class_name = "BrowserRelayDO"
//
// Export this class from your worker entry so Cloudflare can instantiate it.

export class BrowserRelayDO {
  constructor(state, env) {
    this.state   = state;
    this.env     = env;
    this.sockets = new Set(); // active WebSocket connections
  }

  async fetch(request) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    // ── WebSocket upgrade (BrowserView UI connects here) ──────────────────
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server);
      this.sockets.add(server);

      server.addEventListener('close', () => this.sockets.delete(server));
      server.addEventListener('error', () => this.sockets.delete(server));

      return new Response(null, { status: 101, webSocket: client });
    }

    // ── POST /broadcast — internal: Agent Sam / MCP tools push events here ─
    if (method === 'POST' && url.pathname === '/broadcast') {
      let payload = {};
      try { payload = await request.json(); } catch (_) {}
      this._broadcast(payload);
      return jsonResponse({ ok: true, recipients: this.sockets.size });
    }

    return jsonResponse({ error: 'BrowserRelayDO: unknown route' }, 404);
  }

  // Called by Cloudflare runtime for Durable Object WebSocket hibernation
  async webSocketMessage(ws, msg) {
    // Clients may send { type: 'ping' } to keep connection alive
    try {
      const data = JSON.parse(msg);
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (_) {}
  }

  async webSocketClose(ws) {
    this.sockets.delete(ws);
  }

  _broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this.sockets) {
      try { ws.send(msg); } catch (_) { this.sockets.delete(ws); }
    }
  }
}

// ─── Broadcast Helper ─────────────────────────────────────────────────────────
//
// Call this from anywhere (MCP tools, agent.js, agentsam.js) to push a live
// browser event into all connected BrowserView panes for a given session/tenant.
//
// event types the UI listens for:
//   'navigate'    → { url }                  — BrowserView loads URL in active pane
//   'screenshot'  → { screenshot_url }       — overlays screenshot result
//   'inspect'     → { html, selector }       — populates inspector panel
//   'scrape'      → { title, text, links }   — populates content panel
//   'job_update'  → { job_id, status, ... }  — live job status badge

export async function broadcastBrowserEvent(env, roomId, event) {
  if (!env.BROWSER_RELAY) return; // graceful no-op if binding not configured

  const id   = env.BROWSER_RELAY.idFromName(roomId || 'default');
  const stub = env.BROWSER_RELAY.get(id);

  await stub.fetch('https://do-internal/broadcast', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(event),
  }).catch(() => {}); // never let broadcast failure break the caller
}

// ─── Job Management ───────────────────────────────────────────────────────────

async function createJob(env, opts) {
  if (!env.DB) return 'job_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const id = 'job_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  await env.DB.prepare(
    `INSERT INTO playwright_jobs
     (id, job_type, url, status, workspace_id, tenant_id, agent_session_id,
      script_name, priority, input_params_json, output_type, triggered_by,
      requires_confirmation, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    id,
    opts.job_type           || 'screenshot',
    opts.url                || '',
    opts.workspace_id       || null,
    opts.tenant_id          || tenantIdFromEnv(env) || null,
    opts.agent_session_id   || null,
    opts.script_name        || null,
    opts.priority           || 50,
    JSON.stringify(opts.input_params || {}),
    opts.output_type        || 'text',
    opts.triggered_by       || 'api',
    opts.requires_confirmation ? 1 : 0,
  ).run().catch(() => {});

  return id;
}

async function updateJob(env, id, updates) {
  if (!env.DB || !id) return;

  const sets   = [];
  const values = [];

  if (updates.status       !== undefined) { sets.push('status = ?');                 values.push(updates.status); }
  if (updates.result_url   !== undefined) { sets.push('result_url = ?');             values.push(updates.result_url); }
  if (updates.result_json  !== undefined) { sets.push('result_json = ?');            values.push(JSON.stringify(updates.result_json)); }
  if (updates.error_text   !== undefined) { sets.push('error_text = ?');             values.push(updates.error_text); }
  if (updates.log_text     !== undefined) { sets.push('log_text = ?');               values.push(updates.log_text); }
  if (updates.duration_ms  !== undefined) { sets.push('duration_ms = ?');            values.push(updates.duration_ms); }
  if (updates.completed_at !== undefined) { sets.push("completed_at = datetime('now')"); }

  if (!sets.length) return;
  values.push(id);

  await env.DB.prepare(
    `UPDATE playwright_jobs SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...values).run().catch(() => {});
}

// ─── Browser Operations ───────────────────────────────────────────────────────

/**
 * takeScreenshot
 * Navigates to `url`, captures a PNG, stores in R2.
 * Broadcasts { type: 'screenshot', screenshot_url, job_id } to BrowserRelayDO.
 *
 * @param {object} env
 * @param {{ url, fullPage?, width?, height?, workspace_id?, agent_session_id?,
 *            triggered_by?, room_id? }} opts
 * @returns {{ screenshot_url: string, job_id: string }}
 */
export async function takeScreenshot(env, opts) {
  const {
    url,
    fullPage        = false,
    width           = 1280,
    height          = 800,
    workspace_id,
    agent_session_id,
    room_id,
  } = opts;

  if (!env.MYBROWSER) throw new Error('Browser Rendering binding (env.MYBROWSER) not configured');
  if (!url)           throw new Error('url is required');

  const jobId     = await createJob(env, {
    job_type: 'screenshot', url, workspace_id, agent_session_id,
    output_type: 'image', triggered_by: opts.triggered_by || 'api',
  });
  const startedAt = Date.now();
  let   browser;

  try {
    await updateJob(env, jobId, { status: 'running' });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'running', job_type: 'screenshot', url });

    browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const screenshot = await page.screenshot({ fullPage, type: 'png' });
    await browser.close();
    browser = null;

    const bucket = env.DOCS_BUCKET || env.DASHBOARD || env.R2;
    const key    = `screenshots/playwright/${Date.now()}-${jobId}.png`;
    let   screenshotUrl = '';

    if (bucket) {
      await bucket.put(key, screenshot, { httpMetadata: { contentType: 'image/png' } });
      screenshotUrl = `${(env.IAM_ORIGIN || '').replace(/\/$/, '')}/${key}`;
    }

    const durationMs = Date.now() - startedAt;
    await updateJob(env, jobId, {
      status: 'completed', result_url: screenshotUrl,
      result_json: { screenshot_url: screenshotUrl, width, height, fullPage },
      duration_ms: durationMs, completed_at: true,
    });

    // ── Broadcast to BrowserView UI ──
    await broadcastBrowserEvent(env, room_id, {
      type: 'screenshot', screenshot_url: screenshotUrl, job_id: jobId, url,
    });

    return { screenshot_url: screenshotUrl, job_id: jobId };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await updateJob(env, jobId, { status: 'failed', error_text: e.message, completed_at: true });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'failed', error: e.message });
    throw e;
  }
}

/**
 * scrapePage
 * Navigates to `url`, extracts title, text body, and links.
 * Broadcasts { type: 'scrape', ... } to BrowserRelayDO.
 *
 * @param {object} env
 * @param {{ url, workspace_id?, agent_session_id?, room_id? }} opts
 * @returns {{ title, text, links, job_id }}
 */
export async function scrapePage(env, opts) {
  const { url, workspace_id, agent_session_id, room_id } = opts;

  if (!env.MYBROWSER) throw new Error('Browser Rendering binding not configured');
  if (!url)           throw new Error('url is required');

  const jobId     = await createJob(env, {
    job_type: 'scrape', url, workspace_id, agent_session_id, output_type: 'text',
  });
  const startedAt = Date.now();
  let   browser;

  try {
    await updateJob(env, jobId, { status: 'running' });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'running', job_type: 'scrape', url });

    browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const result = await page.evaluate(() => ({
      title: document.title,
      text:  document.body?.innerText?.slice(0, 50000) || '',
      links: Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ href: a.href, text: a.innerText?.trim().slice(0, 200) }))
        .filter(l => l.href.startsWith('http'))
        .slice(0, 100),
    }));

    await browser.close();
    browser = null;

    const durationMs = Date.now() - startedAt;
    await updateJob(env, jobId, {
      status: 'completed', result_json: result, duration_ms: durationMs, completed_at: true,
    });

    // ── Broadcast to BrowserView UI ──
    await broadcastBrowserEvent(env, room_id, { type: 'scrape', ...result, job_id: jobId, url });

    return { ...result, job_id: jobId };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await updateJob(env, jobId, { status: 'failed', error_text: e.message, completed_at: true });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'failed', error: e.message });
    throw e;
  }
}

/**
 * inspectElement
 * Navigates to `url`, queries `selector`, returns outerHTML of matched element.
 * Broadcasts { type: 'inspect', html, selector } to BrowserRelayDO.
 *
 * @param {object} env
 * @param {{ url, selector?, workspace_id?, agent_session_id?, room_id? }} opts
 * @returns {{ html: string, selector: string, job_id: string }}
 */
export async function inspectElement(env, opts) {
  const {
    url,
    selector        = 'body',
    workspace_id,
    agent_session_id,
    room_id,
  } = opts;

  if (!env.MYBROWSER) throw new Error('Browser Rendering binding not configured');
  if (!url)           throw new Error('url is required');

  const jobId     = await createJob(env, {
    job_type: 'inspect', url, workspace_id, agent_session_id,
    input_params: { selector }, output_type: 'text',
  });
  const startedAt = Date.now();
  let   browser;

  try {
    await updateJob(env, jobId, { status: 'running' });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'running', job_type: 'inspect', url, selector });

    browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Return outerHTML of selector, fall back to a structured error if not found
    const html = await page.$eval(selector, el => el.outerHTML).catch(() => null);
    if (!html) throw new Error(`Selector not found: ${selector}`);

    // Also capture bounding box for potential UI highlighting
    const boundingBox = await page.$eval(selector, el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }).catch(() => null);

    await browser.close();
    browser = null;

    const durationMs = Date.now() - startedAt;
    await updateJob(env, jobId, {
      status: 'completed',
      result_json: { html, selector, boundingBox },
      duration_ms: durationMs,
      completed_at: true,
    });

    // ── Broadcast to BrowserView UI ──
    await broadcastBrowserEvent(env, room_id, {
      type: 'inspect', html, selector, boundingBox, job_id: jobId, url,
    });

    return { html, selector, boundingBox, job_id: jobId };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await updateJob(env, jobId, { status: 'failed', error_text: e.message, completed_at: true });
    await broadcastBrowserEvent(env, room_id, { type: 'job_update', job_id: jobId, status: 'failed', error: e.message });
    throw e;
  }
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * handleBrowserRequest
 * Routes /api/browser/* — direct, synchronous browser operations.
 * Used by BrowserView UI panes.
 */
export async function handleBrowserRequest(request, url, env) {
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  // room_id scopes the WebSocket broadcast to the right BrowserView session
  // BrowserView should send its session/tenant ID in the request body
  const room_id = body.room_id || authUser.tenant_id || 'default';

  if (path === '/api/browser/screenshot') {
    try {
      const result = await takeScreenshot(env, { ...body, room_id, triggered_by: 'ui' });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/browser/scrape') {
    try {
      const result = await scrapePage(env, { ...body, room_id });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/browser/inspect') {
    try {
      const result = await inspectElement(env, { ...body, room_id });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Browser route not found', path }, 404);
}

/**
 * handlePlaywrightJobApi
 * Routes /api/playwright/* — job management + aliases for UI/agent compatibility.
 *
 * Aliases (so BrowserView.tsx doesn't need path changes):
 *   POST /api/playwright/screenshot → takeScreenshot()
 *   POST /api/playwright/inspect    → inspectElement()
 *
 * Job management:
 *   GET  /api/playwright/jobs       → list
 *   GET  /api/playwright/jobs/:id   → single
 *   POST /api/playwright/jobs       → queue record
 *
 * WebSocket relay:
 *   GET  /api/playwright/relay      → upgrades to WS, joins BrowserRelayDO room
 */
export async function handlePlaywrightJobApi(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  // ── WebSocket relay — BrowserView connects here to receive live events ──
  if (path === '/api/playwright/relay') {
    if (!env.BROWSER_RELAY) return jsonResponse({ error: 'BROWSER_RELAY binding not configured' }, 503);

    const roomId = url.searchParams.get('room') || 'default';
    const id     = env.BROWSER_RELAY.idFromName(roomId);
    const stub   = env.BROWSER_RELAY.get(id);

    return stub.fetch(request); // DO handles the WS upgrade
  }

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const room_id = authUser.tenant_id || 'default';

  // ── POST /api/playwright/screenshot (alias for BrowserView.tsx) ────────
  if (path === '/api/playwright/screenshot' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    try {
      const result = await takeScreenshot(env, { ...body, room_id, triggered_by: 'ui' });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/playwright/inspect (alias for BrowserView.tsx) ──────────
  if (path === '/api/playwright/inspect' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    try {
      const result = await inspectElement(env, { ...body, room_id });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  // ── GET /api/playwright/jobs ────────────────────────────────────────────
  if (path === '/api/playwright/jobs' && method === 'GET') {
    const limit  = parseInt(url.searchParams.get('limit') || '20', 10);
    const status = url.searchParams.get('status') || null;
    try {
      const query = status
        ? env.DB.prepare(`SELECT id, job_type, url, status, result_url, error_text, duration_ms, created_at, completed_at FROM playwright_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?`).bind(status, limit)
        : env.DB.prepare(`SELECT id, job_type, url, status, result_url, error_text, duration_ms, created_at, completed_at FROM playwright_jobs ORDER BY created_at DESC LIMIT ?`).bind(limit);
      const { results } = await query.all();
      return jsonResponse({ jobs: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET /api/playwright/jobs/:id ────────────────────────────────────────
  const jobMatch = path.match(/^\/api\/playwright\/jobs\/([^/]+)$/);
  if (jobMatch && method === 'GET') {
    try {
      const row = await env.DB.prepare(`SELECT * FROM playwright_jobs WHERE id = ? LIMIT 1`)
        .bind(jobMatch[1]).first();
      if (!row) return jsonResponse({ error: 'Job not found' }, 404);
      return jsonResponse(row);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/playwright/jobs (queue a job record only, no execution) ───
  if (path === '/api/playwright/jobs' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const { job_type, url: jobUrl, input_params, output_type, priority, requires_confirmation } = body;
    if (!job_type || !jobUrl) return jsonResponse({ error: 'job_type and url required' }, 400);
    const id = await createJob(env, {
      job_type, url: jobUrl, input_params, output_type, priority,
      requires_confirmation, triggered_by: 'user',
    });
    return jsonResponse({ job_id: id, status: 'pending' });
  }

  return jsonResponse({ error: 'Playwright route not found', path }, 404);
}
