import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { assertBrowserTrustedOrigin } from '../core/agentsam-ops-ledger.js';
import { handlePlaywrightQueueJob } from '../queue/playwright-queue-job.js';

/**
 * Playwright Service Integration.
 * Handles browser rendering, screenshots, and job tracking via @cloudflare/playwright.
 */

/**
 * Handle Browser-related API requests (/api/browser/*).
 */
export async function handleBrowserRequest(request, url, env) {
    if (!env.MYBROWSER) {
        return jsonResponse({
            error: 'MYBROWSER binding not configured',
            hint: 'Add Browser rendering binding in Cloudflare dashboard and wrangler.toml'
        }, 503);
    }

    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    // ── GET /api/browser/screenshot ──────────────────────────────────────────
    if (pathLower === '/api/browser/screenshot' && method === 'GET') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return jsonResponse({ error: 'url required' }, 400);

        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        try {
            await assertBrowserTrustedOrigin(env, {
                userId: String(authUser.id),
                workspaceId: null,
                origin: targetUrl,
            });
        } catch (e) {
            return jsonResponse({ error: String(e?.message || e) }, 403);
        }

        try {
            const { launch } = await import('@cloudflare/playwright');
            const browser = await launch(env.MYBROWSER);
            const page = await browser.newPage();
            
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
            const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
            await browser.close();

            return new Response(buf, {
                headers: { 
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        } catch (e) {
            return jsonResponse({ error: 'Screenshot failed', detail: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'Browser route not found' }, 404);
}

/**
 * Handle Playwright Job tracking (/api/playwright/*).
 *
 * - GET /api/playwright — list jobs for current user (requires user_id column; see migration 281).
 * - POST /api/playwright/screenshot — create job row, run MYBROWSER queue handler inline, return result.
 */
export async function handlePlaywrightJobApi(request, env, url) {
    const pathname = (url instanceof URL ? url : new URL(request.url)).pathname.toLowerCase();
    const pathNorm = pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    // ── POST /api/playwright/screenshot ─────────────────────────────────────
    if (pathNorm === '/api/playwright/screenshot' && method === 'POST') {
        if (!env.MYBROWSER) {
            return jsonResponse(
                { error: 'MYBROWSER binding not configured', hint: 'Enable Browser Rendering on the Worker' },
                503,
            );
        }
        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const targetUrl = String(body.url || '').trim();
        if (!targetUrl) return jsonResponse({ error: 'url required' }, 400);

        try {
            await assertBrowserTrustedOrigin(env, {
                userId: String(authUser.id),
                workspaceId:
                    body.workspace_id != null && String(body.workspace_id).trim()
                        ? String(body.workspace_id).trim()
                        : null,
                origin: targetUrl,
            });
        } catch (e) {
            return jsonResponse({ error: String(e?.message || e) }, 403);
        }

        const jobId = crypto.randomUUID();
        const workspaceId =
            body.workspace_id != null && String(body.workspace_id).trim()
                ? String(body.workspace_id).trim()
                : null;

        try {
            await env.DB.prepare(
                `INSERT INTO playwright_jobs (id, job_type, url, status, metadata, user_id, workspace_id, created_at)
                 VALUES (?, 'screenshot', ?, 'pending', ?, ?, ?, datetime('now'))`,
            )
                .bind(
                    jobId,
                    targetUrl,
                    JSON.stringify({
                        source: 'dashboard_browser_tab',
                        ...(body.agent_run_id ? { agent_run_id: String(body.agent_run_id) } : {}),
                    }),
                    authUser.id,
                    workspaceId,
                )
                .run();
        } catch (e) {
            const msg = String(e?.message || e);
            if (msg.includes('user_id') || msg.includes('workspace_id')) {
                return jsonResponse(
                    {
                        error: 'playwright_jobs schema missing user_id',
                        detail: msg,
                        hint: 'Apply migrations/281_playwright_jobs_user_workspace.sql to D1 (remote)',
                    },
                    503,
                );
            }
            return jsonResponse({ error: 'Failed to create browser job', detail: msg }, 500);
        }

        await handlePlaywrightQueueJob(env, { jobId, job_type: 'screenshot', url: targetUrl });

        let row = null;
        try {
            row = await env.DB.prepare(
                `SELECT id, url, status, result_url, error, created_at, completed_at FROM playwright_jobs WHERE id = ? LIMIT 1`,
            )
                .bind(jobId)
                .first();
        } catch {
            row = null;
        }

        const st = row?.status ? String(row.status) : 'unknown';
        const resultUrl = row?.result_url != null ? String(row.result_url) : '';
        if (st === 'completed' && resultUrl) {
            return jsonResponse({
                id: jobId,
                status: 'completed',
                result_url: resultUrl,
                screenshot_url: resultUrl,
            });
        }
        if (st === 'failed') {
            return jsonResponse(
                { id: jobId, status: 'error', error: row?.error != null ? String(row.error) : 'screenshot failed' },
                500,
            );
        }
        return jsonResponse({ id: jobId, status: 'pending', result_url: null });
    }

    // ── GET /api/playwright (job list for BrowserView polling) ──────────────
    if (method === 'GET' && pathNorm === '/api/playwright') {
        try {
            const { results } = await env.DB.prepare(
                "SELECT id, url, status, result_url, created_at, completed_at, error FROM playwright_jobs WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 50",
            )
                .bind(authUser.id)
                .all();

            return jsonResponse({ jobs: results || [] });
        } catch (e) {
            return jsonResponse({ error: 'Failed to fetch browser jobs', detail: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'Playwright route not found' }, 404);
}
