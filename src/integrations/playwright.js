/**
 * Integration Layer: Browser Rendering / Playwright
 * Screenshots, scraping, and render jobs via Cloudflare Browser Rendering (env.MYBROWSER).
 * Job tracking in D1 playwright_jobs table.
 *
 * Requires: @cloudflare/puppeteer npm package + Browser Rendering binding (env.MYBROWSER)
 */
import puppeteer from '@cloudflare/puppeteer';
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';

// ─── Job Management ───────────────────────────────────────────────────────────

async function createJob(env, opts) {
  if (!env.DB) return crypto.randomUUID();

  const id = 'job_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await env.DB.prepare(
    `INSERT INTO playwright_jobs
     (id, job_type, url, status, workspace_id, tenant_id, agent_session_id,
      script_name, priority, input_params_json, output_type, triggered_by,
      requires_confirmation, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    id,
    opts.job_type || 'screenshot',
    opts.url || '',
    opts.workspace_id || null,
    opts.tenant_id || tenantIdFromEnv(env) || null,
    opts.agent_session_id || null,
    opts.script_name || null,
    opts.priority || 50,
    JSON.stringify(opts.input_params || {}),
    opts.output_type || 'text',
    opts.triggered_by || 'api',
    opts.requires_confirmation ? 1 : 0,
  ).run().catch(() => {});

  return id;
}

async function updateJob(env, id, updates) {
  if (!env.DB || !id) return;
  const sets   = [];
  const values = [];

  if (updates.status !== undefined)      { sets.push('status = ?');       values.push(updates.status); }
  if (updates.result_url !== undefined)   { sets.push('result_url = ?');   values.push(updates.result_url); }
  if (updates.result_json !== undefined)  { sets.push('result_json = ?');  values.push(JSON.stringify(updates.result_json)); }
  if (updates.error_text !== undefined)   { sets.push('error_text = ?');   values.push(updates.error_text); }
  if (updates.log_text !== undefined)     { sets.push('log_text = ?');     values.push(updates.log_text); }
  if (updates.duration_ms !== undefined)  { sets.push('duration_ms = ?');  values.push(updates.duration_ms); }
  if (updates.completed_at !== undefined) { sets.push('completed_at = datetime(\'now\')'); }

  if (!sets.length) return;
  values.push(id);

  await env.DB.prepare(
    `UPDATE playwright_jobs SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...values).run().catch(() => {});
}

// ─── Browser Operations ───────────────────────────────────────────────────────

/**
 * Take a screenshot of a URL and store in R2.
 * Returns { screenshot_url, job_id }.
 */
export async function takeScreenshot(env, opts) {
  const { url, fullPage = false, width = 1280, height = 800, workspace_id, agent_session_id } = opts;

  if (!env.MYBROWSER) throw new Error('Browser Rendering binding (env.MYBROWSER) not configured');
  if (!url)           throw new Error('url required');

  const jobId = await createJob(env, {
    job_type: 'screenshot',
    url,
    workspace_id,
    agent_session_id,
    output_type: 'image',
    triggered_by: opts.triggered_by || 'api',
  });

  const startedAt = Date.now();
  let browser;

  try {
    await updateJob(env, jobId, { status: 'running' });

    browser = await puppeteer.launch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const screenshot = await page.screenshot({ fullPage, type: 'png' });
    await browser.close();
    browser = null;

    // Store in R2
    const bucket = env.DOCS_BUCKET || env.DASHBOARD || env.R2;
    const ts     = Date.now();
    const key    = `screenshots/playwright/${ts}-${jobId}.png`;
    let screenshotUrl = '';

    if (bucket) {
      await bucket.put(key, screenshot, { httpMetadata: { contentType: 'image/png' } });
      screenshotUrl = `${(env.IAM_ORIGIN || '').replace(/\/$/, '')}/${key}`;
    }

    const durationMs = Date.now() - startedAt;
    await updateJob(env, jobId, {
      status:      'completed',
      result_url:  screenshotUrl,
      result_json: { screenshot_url: screenshotUrl, width, height, fullPage },
      duration_ms: durationMs,
      completed_at: true,
    });

    return { screenshot_url: screenshotUrl, job_id: jobId };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await updateJob(env, jobId, {
      status:     'failed',
      error_text: e.message,
      completed_at: true,
    });
    throw e;
  }
}

/**
 * Scrape page content (text + title + links).
 * Returns { title, text, links, job_id }.
 */
export async function scrapePage(env, opts) {
  const { url, workspace_id, agent_session_id } = opts;

  if (!env.MYBROWSER) throw new Error('Browser Rendering binding not configured');
  if (!url)           throw new Error('url required');

  const jobId     = await createJob(env, { job_type: 'scrape', url, workspace_id, agent_session_id, output_type: 'text' });
  const startedAt = Date.now();
  let   browser;

  try {
    await updateJob(env, jobId, { status: 'running' });

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
      status:      'completed',
      result_json: result,
      duration_ms: durationMs,
      completed_at: true,
    });

    return { ...result, job_id: jobId };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await updateJob(env, jobId, { status: 'failed', error_text: e.message, completed_at: true });
    throw e;
  }
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * Handle single browser requests (/api/browser/*).
 */
export async function handleBrowserRequest(request, url, env) {
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (path === '/api/browser/screenshot') {
    try {
      const result = await takeScreenshot(env, { ...body, triggered_by: 'api' });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (path === '/api/browser/scrape') {
    try {
      const result = await scrapePage(env, body);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Browser route not found', path }, 404);
}

/**
 * Handle playwright job management (/api/playwright/*).
 */
export async function handlePlaywrightJobApi(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  // ── GET /api/playwright/jobs ──────────────────────────────────────────────
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

  // ── GET /api/playwright/jobs/:id ──────────────────────────────────────────
  const jobMatch = path.match(/^\/api\/playwright\/jobs\/([^/]+)$/);
  if (jobMatch && method === 'GET') {
    const id = jobMatch[1];
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM playwright_jobs WHERE id = ? LIMIT 1`
      ).bind(id).first();
      if (!row) return jsonResponse({ error: 'Job not found' }, 404);
      return jsonResponse(row);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/playwright/jobs ─────────────────────────────────────────────
  if (path === '/api/playwright/jobs' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { job_type, url: jobUrl, input_params, output_type, priority, requires_confirmation } = body;
    if (!job_type || !jobUrl) return jsonResponse({ error: 'job_type and url required' }, 400);

    const id = await createJob(env, {
      job_type,
      url: jobUrl,
      input_params,
      output_type,
      priority,
      requires_confirmation,
      triggered_by: 'user',
    });

    return jsonResponse({ job_id: id, status: 'pending' });
  }

  return jsonResponse({ error: 'Playwright route not found', path }, 404);
}
