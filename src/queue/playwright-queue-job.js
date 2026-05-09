/**
 * Async Playwright screenshot/render jobs from queue (legacy worker.js parity).
 */
import { assertBrowserTrustedOrigin } from '../core/agentsam-ops-ledger.js';
const DOCS_SCREENSHOTS_PUBLIC_BASE = 'https://docs.inneranimalmedia.com';
const DASHBOARD_SCREENSHOTS_PUBLIC_BASE = 'https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev';

async function putAgentBrowserScreenshotToR2(env, buf, contentType) {
  const ct = contentType || 'image/png';
  if (env.DOCS_BUCKET) {
    const ts = Date.now();
    const id = crypto.randomUUID();
    const key = `screenshots/agent/${ts}-${id}.png`;
    await env.DOCS_BUCKET.put(key, buf, { httpMetadata: { contentType: ct } });
    return { screenshot_url: `${DOCS_SCREENSHOTS_PUBLIC_BASE}/${key}`, job_id: id };
  }
  if (env.DASHBOARD) {
    const ts = Date.now();
    const id = crypto.randomUUID();
    const key = `screenshots/agent/${ts}-${id}.png`;
    await env.DASHBOARD.put(key, buf, { httpMetadata: { contentType: ct } });
    return { screenshot_url: `${DASHBOARD_SCREENSHOTS_PUBLIC_BASE}/${key}`, job_id: id };
  }
  if (env.R2) {
    const ts = Date.now();
    const id = crypto.randomUUID();
    const key = `screenshots/agent/${ts}-${id}.png`;
    await env.R2.put(key, buf, { httpMetadata: { contentType: ct } });
    return { screenshot_url: `${DASHBOARD_SCREENSHOTS_PUBLIC_BASE}/${key}`, job_id: id };
  }
  throw new Error('No R2 bucket for screenshots');
}

/**
 * @param {any} env
 * @param {{ jobId?: string, job_type?: string, url?: string }} body
 */
export async function handlePlaywrightQueueJob(env, body) {
  const { jobId, job_type, url } = body;
  if (!jobId || !env.MYBROWSER || !env.DB || (!env.DASHBOARD && !env.DOCS_BUCKET)) return;

  if (job_type === 'render' && !env.DASHBOARD) {
    try {
      await env.DB.prepare("UPDATE playwright_jobs SET status='failed', error=? WHERE id=?")
        .bind('DASHBOARD bucket required for render jobs', jobId)
        .run();
    } catch (_) { /* non-fatal */ }
    return;
  }

  if (job_type !== 'screenshot' && job_type !== 'render') return;

  const targetUrl = String(url || '').trim() || 'https://example.com';
  let userId = null;
  let workspaceId = null;
  try {
    const row = await env.DB.prepare('SELECT user_id, workspace_id, url FROM playwright_jobs WHERE id = ?')
      .bind(jobId)
      .first();
    if (row?.user_id) userId = String(row.user_id);
    if (row?.workspace_id) workspaceId = String(row.workspace_id);
  } catch (_) {
    /* non-fatal */
  }
  if (userId) {
    try {
      await assertBrowserTrustedOrigin(env, {
        userId,
        workspaceId,
        origin: targetUrl,
      });
    } catch (err) {
      await env.DB.prepare("UPDATE playwright_jobs SET status='failed', error=? WHERE id=?")
        .bind(String(err?.message || err), jobId)
        .run();
      return;
    }
  }

  const { launch } = await import('@cloudflare/playwright');
  const browser = await launch(env.MYBROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    let resultUrl = null;
    if (job_type === 'screenshot') {
      const buf = await page.screenshot({ type: 'png', fullPage: true });
      const out = await putAgentBrowserScreenshotToR2(env, buf, 'image/png');
      resultUrl = out.screenshot_url;
    } else if (job_type === 'render') {
      const html = await page.content();
      const key = `renders/${jobId}.html`;
      await env.DASHBOARD.put(key, html, { httpMetadata: { contentType: 'text/html' } });
      resultUrl = `${DASHBOARD_SCREENSHOTS_PUBLIC_BASE}/${key}`;
    }
    await env.DB.prepare(
      "UPDATE playwright_jobs SET status='completed', result_url=?, completed_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(resultUrl, jobId)
      .run();
  } catch (err) {
    await env.DB.prepare("UPDATE playwright_jobs SET status='failed', error=? WHERE id=?")
      .bind(String(err?.message || err), jobId)
      .run();
  } finally {
    await browser.close();
  }
}
