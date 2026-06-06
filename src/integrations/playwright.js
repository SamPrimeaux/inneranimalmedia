import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { assertBrowserTrustedOrigin } from '../core/agentsam-ops-ledger.js';
import { handlePlaywrightQueueJob } from '../queue/playwright-queue-job.js';
import { runBrowserBuiltinTool, closeBrowserRunSession, resolveBrowserRunScopeId, resolveBrowserToolUrl } from './browser-cdp.js';
import {
    refreshAgentLiveBrowserLiveUrl,
    signalHumanInputResume,
    ensureAgentLiveBrowserSession,
    getAgentLiveBrowserSession,
    closeAgentLiveBrowserSession,
} from './agent-live-browser-session.js';
import { cancelBrowserHumanInput } from './agent-live-browser-session.js';
import {
    assertAgentRunAccess,
    getBrowserLiveDoHealth,
    getBrowserLiveEventsViaDo,
    proxyBrowserLiveWebSocket,
    refreshAgentLiveBrowserUrlViaDo,
} from './browser-live-do-client.js';

function screenshotR2Bucket(env) {
  return env.ASSETS || env.R2 || null;
}

/** @param {string} targetUrl */
async function browserScreenshotCacheKey(targetUrl) {
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(targetUrl));
  const sha = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `screenshots/browser/${sha}.jpg`;
}
import {
    openBrowserRunLiveView,
    deleteBrowserRunSession as deleteCfBrowserRunSession,
} from './browser-run-session.js';

/**
 * Shared screenshot job runner (POST /api/playwright/screenshot and agent builtin tools).
 * @param {any} env
 * @param {{ url: string, userId: string, workspaceId?: string|null, agentRunId?: string|null, source?: string }} opts
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runPlaywrightScreenshotJob(env, opts) {
    if (!env.MYBROWSER) {
        return {
            error: 'MYBROWSER binding not configured',
            hint: 'Enable Browser Rendering on the Worker',
        };
    }
    if (!env.DB) return { error: 'DB not configured' };

    const targetUrl = String(opts?.url || '').trim();
    const userId = String(opts?.userId || '').trim();
    if (!targetUrl) return { error: 'url required' };
    if (!userId) return { error: 'user_id required' };

    const workspaceId =
        opts.workspaceId != null && String(opts.workspaceId).trim()
            ? String(opts.workspaceId).trim()
            : null;
    const source = opts.source != null ? String(opts.source).trim() : 'agent_tool';
    const agentRunId =
        opts.agentRunId != null && String(opts.agentRunId).trim()
            ? String(opts.agentRunId).trim()
            : null;

    const jobId = crypto.randomUUID();

    try {
        await env.DB.prepare(
            `INSERT INTO playwright_jobs (id, job_type, url, status, metadata, user_id, workspace_id, created_at)
             VALUES (?, 'screenshot', ?, 'pending', ?, ?, ?, datetime('now'))`,
        )
            .bind(
                jobId,
                targetUrl,
                JSON.stringify({
                    source,
                    ...(agentRunId ? { agent_run_id: agentRunId } : {}),
                }),
                userId,
                workspaceId,
            )
            .run();
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('user_id') || msg.includes('workspace_id')) {
            return {
                error: 'playwright_jobs schema missing user_id',
                detail: msg,
                hint: 'Apply migrations/281_playwright_jobs_user_workspace.sql to D1 (remote)',
            };
        }
        return { error: 'Failed to create browser job', detail: msg };
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
        return {
            id: jobId,
            status: 'completed',
            result_url: resultUrl,
            screenshot_url: resultUrl,
            url: targetUrl,
        };
    }
    if (st === 'failed') {
        return {
            id: jobId,
            status: 'error',
            error: row?.error != null ? String(row.error) : 'screenshot failed',
        };
    }
    return { id: jobId, status: 'pending', result_url: null, screenshot_url: null, url: targetUrl };
}

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
    const pathNorm = pathLower.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    // ── GET /api/browser/live/ws?agent_run_id= — WebSocket live browser state ─
    if (pathNorm === '/api/browser/live/ws' && request.headers.get('Upgrade') === 'websocket') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return new Response('Unauthorized', { status: 401 });
        const agentRunId = url.searchParams.get('agent_run_id')?.trim() || '';
        if (!agentRunId) return new Response('agent_run_id required', { status: 400 });
        const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
        if (!access.ok) return new Response(access.error || 'Forbidden', { status: access.status || 403 });
        return proxyBrowserLiveWebSocket(env, agentRunId, request);
    }

    // ── GET /api/browser/live/:agentRunId/live-url — refresh via DO ───────────
    const liveUrlByRunMatch = pathNorm.match(/^\/api\/browser\/live\/([^/]+)\/live-url$/);
    if (liveUrlByRunMatch && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        const agentRunId = decodeURIComponent(liveUrlByRunMatch[1]);
        const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const out = await refreshAgentLiveBrowserUrlViaDo(env, agentRunId);
        if (!out.ok) return jsonResponse({ error: out.error || 'Failed to refresh live view URL' }, out.status || 502);
        return jsonResponse(out);
    }

    // ── GET /api/browser/live/:agentRunId/events — timeline outbox ───────────
    const liveEventsMatch = pathNorm.match(/^\/api\/browser\/live\/([^/]+)\/events$/);
    if (liveEventsMatch && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        const agentRunId = decodeURIComponent(liveEventsMatch[1]);
        const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const limit = url.searchParams.get('limit');
        const out = await getBrowserLiveEventsViaDo(env, agentRunId, limit ? Number(limit) : 50);
        return jsonResponse(out, out.ok ? 200 : out.status || 502);
    }

    // ── GET /api/browser/live/:agentRunId/health — DO health probe ───────────
    const liveHealthMatch = pathNorm.match(/^\/api\/browser\/live\/([^/]+)\/health$/);
    if (liveHealthMatch && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        const agentRunId = decodeURIComponent(liveHealthMatch[1]);
        const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const out = await getBrowserLiveDoHealth(env, agentRunId);
        return jsonResponse(out, out.status && out.status !== 200 ? out.status : 200);
    }

    // ── GET /api/browser/live/:agentRunId — full live session snapshot ─────────
    const liveSessionMatch = pathNorm.match(/^\/api\/browser\/live\/([^/]+)$/);
    if (liveSessionMatch && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        const agentRunId = decodeURIComponent(liveSessionMatch[1]);
        const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const session = await getAgentLiveBrowserSession(env, agentRunId);
        if (!session) return jsonResponse({ ok: false, error: 'no live session' }, 404);
        return jsonResponse({ ok: true, live_session: session, agent_run_id: agentRunId });
    }

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

        const forceRefresh = url.searchParams.get('refresh') === 'true';
        const bucket = screenshotR2Bucket(env);
        const objectKey = await browserScreenshotCacheKey(targetUrl);

        if (!forceRefresh && bucket) {
            try {
                const cached = await bucket.get(objectKey);
                if (cached?.body) {
                    return new Response(cached.body, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'public, max-age=86400',
                            'X-Cache': 'HIT',
                            'X-Storage': 'r2',
                            'X-R2-Key': objectKey,
                        },
                    });
                }
            } catch {
                /* miss — capture below */
            }
        }

        try {
            const { launch } = await import('@cloudflare/playwright');
            const browser = await launch(env.MYBROWSER);
            const page = await browser.newPage();
            await page.setViewportSize({ width: 1280, height: 800 });
            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
            } catch {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            }
            const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
            await browser.close();

            if (bucket && buf) {
                bucket
                    .put(objectKey, buf, { httpMetadata: { contentType: 'image/jpeg' } })
                    .catch(() => {});
            }

            return new Response(buf, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400',
                    'X-Cache': 'MISS',
                    'X-Storage': 'r2',
                    'X-R2-Key': objectKey,
                },
            });
        } catch (e) {
            return jsonResponse({ error: 'Screenshot failed', detail: e.message }, 500);
        }
    }

    // ── GET /api/browser/session/:sessionId/live-url — refresh devtoolsFrontendUrl ─
    const liveUrlMatch = pathNorm.match(/^\/api\/browser\/session\/([^/]+)\/live-url$/);
    if (liveUrlMatch && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

        const sessionId = decodeURIComponent(liveUrlMatch[1]);
        const scopeId =
            url.searchParams.get('agent_run_id')?.trim() ||
            url.searchParams.get('scope_id')?.trim() ||
            '';
        const targetId = url.searchParams.get('target_id')?.trim() || null;

        const out = await refreshAgentLiveBrowserLiveUrl(env, {
            sessionId,
            scopeId: scopeId || null,
            targetId,
        });
        if (!out.ok) {
            return jsonResponse({ error: out.error || 'Failed to refresh live view URL' }, 502);
        }
        return jsonResponse({
            ok: true,
            session_id: out.session_id,
            target_id: out.target_id,
            devtools_frontend_url: out.devtools_frontend_url,
            web_socket_debugger_url: out.web_socket_debugger_url,
            url: out.url,
            title: out.title,
            expires_at: out.expires_at,
        });
    }

    // ── POST /api/browser/session/human-resume — human clicked Continue (HITL) ─
    if (pathNorm === '/api/browser/session/human-resume' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const scopeId = resolveBrowserRunScopeId({
            ...body,
            agent_run_id: body.agent_run_id ?? body.scope_id,
        });
        if (!scopeId) return jsonResponse({ error: 'agent_run_id required' }, 400);
        const access = await assertAgentRunAccess(env, scopeId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const out = await signalHumanInputResume(env, scopeId);
        if (!out.ok) return jsonResponse(out, 400);
        return jsonResponse(out);
    }

    // ── POST /api/browser/session/human-cancel — user cancelled HITL ───────────
    if (pathNorm === '/api/browser/session/human-cancel' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const scopeId = resolveBrowserRunScopeId({
            ...body,
            agent_run_id: body.agent_run_id ?? body.scope_id,
        });
        if (!scopeId) return jsonResponse({ error: 'agent_run_id required' }, 400);
        const access = await assertAgentRunAccess(env, scopeId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        const out = await cancelBrowserHumanInput(env, scopeId);
        return jsonResponse(out, out.ok ? 200 : out.status || 400);
    }

    // ── POST /api/browser/session/close — end run-scoped MYBROWSER session (KV) ─
    if (pathNorm === '/api/browser/session/close' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);
        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const scopeId = resolveBrowserRunScopeId({
            ...body,
            agent_run_id: body.agent_run_id ?? body.scope_id,
        });
        if (!scopeId) return jsonResponse({ error: 'agent_run_id or workflow_run_id required' }, 400);
        const access = await assertAgentRunAccess(env, scopeId, String(authUser.id));
        if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
        if (env.BROWSER_SESSION) {
            const result = await closeAgentLiveBrowserSession(env, scopeId);
            return jsonResponse(result, result.ok ? 200 : result.status || 400);
        }
        const result = await closeBrowserRunSession(env, scopeId);
        return jsonResponse(result);
    }

    // ── POST /api/browser/session — Browser Run Live View (live.browser.run embed) ─
    if (pathNorm === '/api/browser/session' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const targetUrl = resolveBrowserToolUrl(body);
        if (!targetUrl) return jsonResponse({ error: 'url required' }, 400);

        const workspaceId =
            body.workspace_id != null
                ? String(body.workspace_id).trim()
                : request.headers.get('x-iam-workspace-id') || null;

        try {
            await assertBrowserTrustedOrigin(env, {
                userId: String(authUser.id),
                workspaceId,
                origin: targetUrl,
            });
        } catch (e) {
            return jsonResponse({ error: String(e?.message || e), blocked: true }, 403);
        }

        const keepAliveRaw = body.keep_alive_ms ?? body.keep_alive;
        const keepAliveMs =
            keepAliveRaw != null && Number.isFinite(Number(keepAliveRaw))
                ? Number(keepAliveRaw)
                : undefined;
        const reuseSessionId =
            body.session_id != null ? String(body.session_id).trim() : '';
        const agentRunId =
            body.agent_run_id != null
                ? String(body.agent_run_id).trim()
                : body.agentRunId != null
                  ? String(body.agentRunId).trim()
                  : '';

        if (agentRunId) {
            const access = await assertAgentRunAccess(env, agentRunId, String(authUser.id));
            if (!access.ok) return jsonResponse({ error: access.error }, access.status || 403);
            const ensured = await ensureAgentLiveBrowserSession(env, agentRunId, {
                url: targetUrl,
                keepAliveMs,
                userId: String(authUser.id),
                workspaceId,
            });
            if (!ensured.ok) {
                return jsonResponse({ error: ensured.error || 'Browser Run session failed' }, ensured.status || 502);
            }
            return jsonResponse({
                ok: true,
                agent_run_id: agentRunId,
                session_id: ensured.session_id ?? ensured.live_session?.session_id,
                devtools_frontend_url:
                    ensured.live_session?.devtools_frontend_url ?? ensured.browser_session?.devtools_frontend_url,
                web_socket_debugger_url:
                    ensured.live_session?.web_socket_debugger_url ?? ensured.browser_session?.web_socket_debugger_url,
                url: ensured.live_session?.url ?? targetUrl,
                title: ensured.live_session?.title ?? null,
                target_id: ensured.live_session?.target_id ?? ensured.browser_session?.target_id ?? null,
                live_session: ensured.live_session,
            });
        }

        const out = await openBrowserRunLiveView(env, {
            url: targetUrl,
            sessionId: reuseSessionId || null,
            keepAliveMs,
        });
        if (!out.ok) {
            const status = out.status === 401 || out.status === 403 ? out.status : 502;
            return jsonResponse({ error: out.error || 'Browser Run session failed' }, status);
        }

        return jsonResponse({
            ok: true,
            session_id: out.session_id,
            devtools_frontend_url: out.devtools_frontend_url,
            web_socket_debugger_url: out.web_socket_debugger_url ?? null,
            url: out.url,
            title: out.title ?? null,
            target_id: out.target_id ?? null,
            ...(agentRunId ? { agent_run_id: agentRunId } : {}),
        });
    }

    // ── DELETE /api/browser/session — release Browser Run CDP session ─────────
    if (pathNorm === '/api/browser/session' && method === 'DELETE') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const sessionId = String(
            body.session_id ?? body.sessionId ?? url.searchParams.get('session_id') ?? '',
        ).trim();
        if (!sessionId) return jsonResponse({ error: 'session_id required' }, 400);

        const out = await deleteCfBrowserRunSession(env, { sessionId });
        if (!out.ok) {
            return jsonResponse({ error: out.error || 'Failed to close Browser Run session' }, 502);
        }
        return jsonResponse({ ok: true, session_id: sessionId, status: out.status ?? 'closing' });
    }

    // ── POST /api/browser/invoke — session auth; MYBROWSER tools (no MCP hop) ─
    if (pathLower === '/api/browser/invoke' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const toolName = String(body.tool_name || body.tool || '').trim();
        const params =
            body.params && typeof body.params === 'object'
                ? { ...body.params }
                : body.arguments && typeof body.arguments === 'object'
                  ? { ...body.arguments }
                  : {};

        if (!toolName) return jsonResponse({ error: 'tool_name required' }, 400);

        const targetUrl =
            params.url ?? params.origin ?? params.href ?? params.target_url ?? params.page_url;
        if (targetUrl) {
            try {
                await assertBrowserTrustedOrigin(env, {
                    userId: String(authUser.id),
                    workspaceId:
                        params.workspace_id != null
                            ? String(params.workspace_id).trim()
                            : request.headers.get('x-iam-workspace-id') || null,
                    origin: targetUrl,
                });
            } catch (e) {
                return jsonResponse({ error: String(e?.message || e), blocked: true }, 403);
            }
        }

        params.user_id = params.user_id ?? String(authUser.id);
        const wsHeader = request.headers.get('x-iam-workspace-id');
        if (wsHeader && !params.workspace_id) params.workspace_id = wsHeader;

        const result = await runBrowserBuiltinTool(env, toolName, params);
        if (result?.error && !result?.ok) {
            const status = result.blocked ? 403 : result.hint?.includes('MYBROWSER') ? 503 : 500;
            return jsonResponse(result, status);
        }
        return jsonResponse(result);
    }

    return jsonResponse({ error: 'Browser route not found' }, 404);
}

/**
 * Handle Playwright Job tracking (/api/playwright/*).
 *
 * - GET /api/playwright — list jobs for current user (requires user_id column; see migration 281).
 * - GET /api/playwright/:id — single job status (user-scoped; one-shot retry from BrowserView).
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

        const workspaceId =
            body.workspace_id != null && String(body.workspace_id).trim()
                ? String(body.workspace_id).trim()
                : null;

        const out = await runPlaywrightScreenshotJob(env, {
            url: targetUrl,
            userId: String(authUser.id),
            workspaceId,
            agentRunId: body.agent_run_id ? String(body.agent_run_id) : null,
            source: 'dashboard_browser_tab',
        });
        if (out.error) {
            const status = String(out.hint || '').includes('schema') ? 503 : 500;
            return jsonResponse(out, status);
        }
        if (out.status === 'completed' && out.screenshot_url) {
            return jsonResponse({
                id: out.id,
                status: 'completed',
                result_url: out.result_url,
                screenshot_url: out.screenshot_url,
            });
        }
        if (out.status === 'error') {
            return jsonResponse(
                { id: out.id, status: 'error', error: out.error != null ? String(out.error) : 'screenshot failed' },
                500,
            );
        }
        return jsonResponse({ id: out.id, status: 'pending', result_url: null });
    }

    // ── GET /api/playwright/:id (single job — user-scoped, no list scan) ─────
    const jobIdMatch = pathNorm.match(/^\/api\/playwright\/([^/]+)$/);
    if (method === 'GET' && jobIdMatch) {
        const jobId = decodeURIComponent(jobIdMatch[1]);
        try {
            const row = await env.DB.prepare(
                `SELECT id, url, status, result_url, created_at, completed_at, error
                 FROM playwright_jobs WHERE id = ? AND user_id = ? LIMIT 1`,
            )
                .bind(jobId, authUser.id)
                .first();
            if (!row) return jsonResponse({ error: 'Job not found' }, 404);
            return jsonResponse(row);
        } catch (e) {
            return jsonResponse({ error: 'Failed to fetch browser job', detail: e.message }, 500);
        }
    }

    // ── GET /api/playwright (job list) ───────────────────────────────────────
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
