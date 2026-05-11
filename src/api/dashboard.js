import { jsonResponse } from '../core/responses.js';
import { getAuthUser, authUserIsSuperadmin, fetchAuthUserTenantId } from '../core/auth.js';
import {
    resolveTerminalWorkspaceId,
    WORKSPACE_CONTEXT_MISSING,
    resolveTenantIdForWorkspace,
} from '../core/bootstrap.js';
import { getIntegrationToken } from '../integrations/tokens.js';
import { getWorkspaceTheme, normalizeThemeSlug } from '../core/themes.js';
import { getDefaultTerminalConnection } from '../core/terminal.js';
import { handleTerminalApi } from './terminal.js';
import { executeScopedAgentTerminalRun } from '../core/agent-terminal-run.js';

// Integrations
import { chatWithAnthropic } from '../integrations/anthropic.js';
import { chatWithToolsOpenAI } from '../integrations/openai.js';
import { chatWithToolsGemini } from '../integrations/gemini.js';
import { chatWithToolsVertex } from '../integrations/vertex.js';
import { handleCanvasApi } from '../integrations/canvas.js';
import { handleHyperdriveRoutes } from '../integrations/hyperdrive.js';
import { handleBrowserRequest, handlePlaywrightJobApi } from '../integrations/playwright.js';
import { handleGitHubApi, resolveGitHubToken } from '../integrations/github.js';
import { handleAgentArtifactsApi } from './agent-artifacts.js';

/**
 * Main dispatcher for Dashboard-related API routes (/api/agent/*, /api/terminal/*).
 */
export async function handleDashboardApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();
    const isWebSocketUpgrade = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';

    const artifactsRes = await handleAgentArtifactsApi(request, url, env);
    if (artifactsRes) return artifactsRes;

    if (pathLower.startsWith('/api/terminal/') && pathLower !== '/api/terminal/session/resume') {
        const termRes = await handleTerminalApi(request, url, env, ctx);
        if (termRes.status !== 404) return termRes;
    }

    // ── /api/agent/git/status ────────────────────────────────────────────────
    if (pathLower === '/api/agent/git/status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

        const workerName = 'inneranimalmedia';
        try {
            const row = await env.DB.prepare(
                `SELECT d.git_hash, d.version, d.timestamp, g.repo_full_name, g.default_branch
                 FROM deployments d
                 LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ?
                 WHERE d.worker_name = ? AND d.status = 'success'
                 ORDER BY d.timestamp DESC
                 LIMIT 1`
            ).bind(workerName, workerName).first();

            return jsonResponse({
                branch: row?.default_branch || 'main',
                git_hash: row?.git_hash || null,
                worker_name: workerName,
                repo_full_name: row?.repo_full_name || null,
                dirty: false,
                sync_last_at: row?.timestamp || null,
            });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // ── GET /api/agent/git/branches ───────────────────────────────────────────
    // Lists branches for the repo linked to latest deployment (GitHub REST API).
    // Same logical repo as /api/agent/git/status; Workers cannot shell out to git.
    if (pathLower === '/api/agent/git/branches' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

        const workerName = 'inneranimalmedia';
        try {
            const row = await env.DB.prepare(
                `SELECT g.repo_full_name
                 FROM deployments d
                 LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ?
                 WHERE d.worker_name = ? AND d.status = 'success'
                 ORDER BY d.timestamp DESC
                 LIMIT 1`,
            )
                .bind(workerName, workerName)
                .first();
            const repoFull = row?.repo_full_name != null ? String(row.repo_full_name).trim() : '';
            if (!repoFull || !repoFull.includes('/')) {
                return jsonResponse({
                    branches: [],
                    repo_full_name: null,
                    error: 'no_repository',
                    hint: 'Link a GitHub repository on deployments / cicd settings.',
                });
            }
            const owner = repoFull.split('/')[0];
            let token;
            try {
                const gh = await resolveGitHubToken(env, authUser, owner);
                token = gh.token;
            } catch (e) {
                return jsonResponse({
                    branches: [],
                    repo_full_name: repoFull,
                    error: 'github_auth',
                    message: e?.message || String(e),
                });
            }

            const ghHeaders = {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'InnerAnimalMedia-Dashboard',
            };

            const all = [];
            for (let page = 1; page <= 5; page++) {
                const res = await fetch(
                    `https://api.github.com/repos/${repoFull}/branches?per_page=100&page=${page}`,
                    { headers: ghHeaders },
                );
                if (!res.ok) {
                    const errBody = await res.text().catch(() => '');
                    return jsonResponse(
                        {
                            branches: [],
                            repo_full_name: repoFull,
                            error: 'github_branches',
                            status: res.status,
                            detail: errBody.slice(0, 300),
                        },
                        res.status >= 400 && res.status < 500 ? res.status : 502,
                    );
                }
                const chunk = await res.json();
                if (!Array.isArray(chunk) || chunk.length === 0) break;
                all.push(...chunk);
                if (chunk.length < 100) break;
            }

            const maxDetail = 36;

            async function commitMeta(sha) {
                try {
                    const res = await fetch(`https://api.github.com/repos/${repoFull}/commits/${sha}`, {
                        headers: ghHeaders,
                    });
                    if (!res.ok) return { subject: '', date_iso: null };
                    const j = await res.json();
                    const msg = typeof j.commit?.message === 'string' ? j.commit.message.split('\n')[0].trim() : '';
                    const date_iso = j.commit?.committer?.date || j.commit?.author?.date || null;
                    return { subject: msg, date_iso };
                } catch {
                    return { subject: '', date_iso: null };
                }
            }

            function relativeFromIso(iso) {
                if (!iso) return '';
                const t = Date.parse(iso);
                if (Number.isNaN(t)) return '';
                const sec = Math.floor((Date.now() - t) / 1000);
                if (sec < 45) return 'just now';
                if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
                if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
                const d = Math.floor(sec / 86400);
                if (d < 60) return `${d} days ago`;
                return `${Math.floor(d / 30)} months ago`;
            }

            const detailRows = all.slice(0, maxDetail);
            const BATCH = 8;
            /** @type {{ subject: string; date_relative: string }[]} */
            const detailMeta = [];
            for (let i = 0; i < detailRows.length; i += BATCH) {
                const chunk = detailRows.slice(i, i + BATCH);
                const metas = await Promise.all(chunk.map((br) => commitMeta(br.commit?.sha || '')));
                for (let j = 0; j < chunk.length; j++) {
                    const m = metas[j];
                    detailMeta.push({
                        subject: m.subject,
                        date_relative: relativeFromIso(m.date_iso),
                    });
                }
            }

            const branchesOut = [];
            for (let i = 0; i < all.length; i++) {
                const b = all[i];
                const name = typeof b.name === 'string' ? b.name : '';
                const sha = b.commit?.sha || '';
                if (!name || !sha) continue;
                const dm = i < detailMeta.length ? detailMeta[i] : { subject: '', date_relative: '' };
                branchesOut.push({
                    ref: name,
                    sha,
                    subject: dm.subject,
                    date_relative: dm.date_relative,
                });
            }

            return jsonResponse({
                branches: branchesOut,
                repo_full_name: repoFull,
                source: 'github_api',
            });
        } catch (e) {
            return jsonResponse({ branches: [], error: e?.message || String(e) }, 500);
        }
    }

    // ── /api/agent/notifications ─────────────────────────────────────────────
    if (pathLower === '/api/agent/notifications' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

        const recipientId = String(authUser.id || '').trim();
        if (!recipientId) return jsonResponse({ notifications: [] });

        try {
            const { results } = await env.DB.prepare(
                `SELECT id, subject, message, status, created_at FROM notifications
                 WHERE recipient_id = ? AND read_at IS NULL
                 ORDER BY created_at DESC LIMIT 20`
            ).bind(recipientId).all();
            return jsonResponse({ notifications: results || [] });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // ── /api/agent/boot ──────────────────────────────────────────────────────
    if (pathLower === '/api/agent/boot' && method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
            const batch = await env.DB.batch([
                env.DB.prepare("SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name"),
                env.DB.prepare("SELECT id, service_name, service_type, endpoint_url, authentication_type, token_secret_name, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"),
                env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens, supports_tools, supports_web_search, supports_vision, size_class, picker_group FROM agentsam_ai WHERE status = 'active' AND COALESCE(show_in_picker,0)=1 AND COALESCE(picker_eligible,1)=1 AND model_key IS NOT NULL ORDER BY sort_order ASC, display_name ASC"),
                env.DB.prepare("SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20"),
            ]);
            
            return jsonResponse({
                agents: batch[0]?.results ?? [],
                mcp_services: batch[1]?.results ?? [],
                models: batch[2]?.results ?? [],
                sessions: batch[3]?.results ?? [],
                integrations: {}, // Hydrated on client
            });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // DEPRECATED PATH: kept for compatibility. ACTIVE PATH is /api/agent/terminal/ws.
    // ── /api/agent/terminal/socket-url ───────────────────────────────────────
    if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false });
        }

        const origin = new URL(request.url).origin;
        const wsOrigin = origin.replace('https://', 'wss://').replace('http://', 'ws://');
        return jsonResponse({ terminal_enabled: true, url: `${wsOrigin}/api/agent/terminal/ws` });
    }

    // ── /api/agent/terminal/config-status ────────────────────────────────────
    if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({
                terminal_enabled: false,
                terminal_configured: false,
                control_plane_available: false,
                direct_wss_available: false,
            });
        }

        const vpcPty = !!env.PTY_SERVICE;
        const httpsUrl = (env.TERMINAL_WS_URL || '').trim();
        const secret = (env.TERMINAL_SECRET || '').trim();
        let dbBridgeOk = false;
        if (env.DB) {
            try {
                const wsCtx =
                    authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
                        ? String(authUser.active_workspace_id).trim()
                        : null;
                const conn = await getDefaultTerminalConnection(env.DB, authUser.id, wsCtx);
                const wsPart = String(conn?.ws_url || '').trim();
                const secretName = String(conn?.auth_token_secret_name || '').trim();
                const tok = secretName && env[secretName] != null
                    ? String(env[secretName]).trim()
                    : '';
                dbBridgeOk = !!(wsPart && tok);
            } catch (_) {
                dbBridgeOk = false;
            }
        }
        return jsonResponse({
            terminal_enabled: true,
            terminal_configured: !!(vpcPty || (httpsUrl && secret) || dbBridgeOk),
            control_plane_available: !!env.AGENT_SESSION,
            direct_wss_available: false,
        });
    }

    // ACTIVE PATH: browser connects here for terminal websocket.
    // ── /api/agent/terminal/ws (authoritative control plane) ────────────────
    if (pathLower === '/api/agent/terminal/ws' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return new Response('Terminal disabled for this account', { status: 403 });
        }
        if (!isWebSocketUpgrade) {
            return new Response('Worker expected Upgrade: websocket', { status: 426 });
        }
        if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION binding missing' }, 503);

        const executionModeRaw = (url.searchParams.get('execution_mode') || 'pty').trim().toLowerCase();
        const executionMode = ['pty', 'ssh', 'mcp'].includes(executionModeRaw) ? executionModeRaw : 'pty';
        const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
        if (tw.error === 'Forbidden') return jsonResponse({ error: 'Forbidden' }, 403);
        if (tw.error || !tw.workspaceId) {
            return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
        }
        const workspaceId = tw.workspaceId;
        /** Optional second+ PTY (split pane); alphanumeric slug → distinct DO instance / upstream PTY. */
        const ptySlotRaw = (url.searchParams.get('pty_slot') || '').trim();
        const ptySlot =
            ptySlotRaw && /^[a-zA-Z0-9_-]{1,16}$/.test(ptySlotRaw) ? ptySlotRaw : '';
        const slotSuffix = ptySlot ? `:${ptySlot}` : '';
        const sessionName = `terminal:v2:${authUser.id}:${workspaceId}:${executionMode}${slotSuffix}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/ws';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        if (ptySlot) doUrl.searchParams.set('pty_slot', ptySlot);
        /** Forward shell preference for iam-pty (e.g. /bin/zsh vs /bin/bash). Validated in DO. */
        const shellQ = (url.searchParams.get('shell') || '').trim();
        if (shellQ) doUrl.searchParams.set('shell', shellQ);
        if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
            doUrl.searchParams.set('tenant_id', String(authUser.tenant_id).trim());
        } else {
            const rtid = await resolveTenantIdForWorkspace(env, workspaceId).catch(() => null);
            if (rtid) doUrl.searchParams.set('tenant_id', String(rtid).trim());
            else if (authUser.id) {
                const ftid = await fetchAuthUserTenantId(env, String(authUser.id)).catch(() => null);
                if (ftid) doUrl.searchParams.set('tenant_id', String(ftid).trim());
            }
        }
        if (authUser.person_uuid != null && String(authUser.person_uuid).trim() !== '') {
            doUrl.searchParams.set('person_uuid', String(authUser.person_uuid).trim());
        }
        doUrl.searchParams.set('user_id', String(authUser.id));
        return stub.fetch(new Request(doUrl.toString(), request));
    }

    // ACTIVE PATH: terminal status through DO control plane.
    // ── /api/agent/terminal/status ───────────────────────────────────────────
    if (pathLower === '/api/agent/terminal/status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false, error: 'Forbidden' }, 403);
        }
        if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION binding missing' }, 503);
        const executionModeRaw = (url.searchParams.get('execution_mode') || 'pty').trim().toLowerCase();
        const executionMode = ['pty', 'ssh', 'mcp'].includes(executionModeRaw) ? executionModeRaw : 'pty';
        const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
        if (tw.error === 'Forbidden') return jsonResponse({ error: 'Forbidden' }, 403);
        if (tw.error || !tw.workspaceId) {
            return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
        }
        const workspaceId = tw.workspaceId;
        const sessionName = `terminal:${authUser.id}:${workspaceId}:${executionMode}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/status';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
            doUrl.searchParams.set('tenant_id', String(authUser.tenant_id).trim());
        } else {
            const rtid = await resolveTenantIdForWorkspace(env, workspaceId).catch(() => null);
            if (rtid) doUrl.searchParams.set('tenant_id', String(rtid).trim());
            else if (authUser.id) {
                const ftid = await fetchAuthUserTenantId(env, String(authUser.id)).catch(() => null);
                if (ftid) doUrl.searchParams.set('tenant_id', String(ftid).trim());
            }
        }
        if (authUser.person_uuid != null && String(authUser.person_uuid).trim() !== '') {
            doUrl.searchParams.set('person_uuid', String(authUser.person_uuid).trim());
        }
        doUrl.searchParams.set('user_id', String(authUser.id));
        return stub.fetch(new Request(doUrl.toString(), { method: 'GET', headers: request.headers }));
    }

    // ACTIVE PATH: execution_mode-aware execution API behind Worker/DO control plane.
    // ── /api/agent/terminal/exec (authoritative mode execution) ─────────────
    if (pathLower === '/api/agent/terminal/exec' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false, error: 'Forbidden' }, 403);
        }
        if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION binding missing' }, 503);
        const body = await request.json().catch(() => ({}));
        const executionModeRaw = String(body?.execution_mode || url.searchParams.get('execution_mode') || 'pty')
            .trim().toLowerCase();
        const executionMode = ['pty', 'ssh', 'mcp'].includes(executionModeRaw) ? executionModeRaw : 'pty';
        const explicitWid = body?.workspace_id ?? url.searchParams.get('workspace_id');
        const tw = await resolveTerminalWorkspaceId(env, request, authUser, explicitWid);
        if (tw.error === 'Forbidden') return jsonResponse({ error: 'Forbidden' }, 403);
        if (tw.error || !tw.workspaceId) {
            return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
        }
        const workspaceId = tw.workspaceId;
        const sessionName = `terminal:${authUser.id}:${workspaceId}:${executionMode}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/exec';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
            doUrl.searchParams.set('tenant_id', String(authUser.tenant_id).trim());
        } else {
            const rtid = await resolveTenantIdForWorkspace(env, workspaceId).catch(() => null);
            if (rtid) doUrl.searchParams.set('tenant_id', String(rtid).trim());
            else if (authUser.id) {
                const ftid = await fetchAuthUserTenantId(env, String(authUser.id)).catch(() => null);
                if (ftid) doUrl.searchParams.set('tenant_id', String(ftid).trim());
            }
        }
        if (authUser.person_uuid != null && String(authUser.person_uuid).trim() !== '') {
            doUrl.searchParams.set('person_uuid', String(authUser.person_uuid).trim());
        }
        doUrl.searchParams.set('user_id', String(authUser.id));
        return stub.fetch(new Request(doUrl.toString(), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(body || {}),
        }));
    }

    // ACTIVE PATH: compatibility command runner; internally routes to control plane first.
    // ── /api/agent/terminal/run (consistent session-auth model) ──────────────
    if (pathLower === '/api/agent/terminal/run' && method === 'POST') {
        try {
            const body = await request.json().catch(() => ({}));
            const { response, error, status, execution_id } = await executeScopedAgentTerminalRun(
                request,
                env,
                ctx,
                url,
                body,
            );
            if (response) return jsonResponse({ ...response, execution_id: execution_id || response.execution_id });
            return jsonResponse({ terminal_enabled: false, error: error || 'terminal run failed' }, status || 500);
        } catch (e) {
            return jsonResponse({ error: e?.message || 'terminal run failed' }, 500);
        }
    }

    // ── /api/agent/terminal/complete ──────────────────────────────────────────
    if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false, error: 'Forbidden' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const executionId = body?.execution_id;
        const status = body?.status;
        const now = Math.floor(Date.now() / 1000);
        if (executionId && (status === 'completed' || status === 'failed')) {
            try {
                await env.DB?.prepare(
                    "UPDATE agentsam_command_run SET status = ?, completed_at = ?, output_text = COALESCE(?, output_text), exit_code = COALESCE(?, exit_code) WHERE id = ?"
                ).bind(status, now, body?.output_text ?? null, body?.exit_code ?? null, executionId).run();
            } catch (_) {}
        }
        return jsonResponse({ ok: true });
    }

    // ── /api/terminal/session/resume ─────────────────────────────────────────
    if (pathLower === '/api/terminal/session/resume' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false, resumable: false });
        }

        if (!env.DB) return jsonResponse({ resumable: false });
        try {
            const session = await env.DB.prepare(
                `SELECT id, tunnel_url, shell, cwd, cols, rows
                 FROM terminal_sessions
                 WHERE user_id = ? AND status = 'active' AND tunnel_url IS NOT NULL AND tunnel_url != ''
                 ORDER BY updated_at DESC LIMIT 1`
            ).bind(authUser.id).first();
            
            if (!session) return jsonResponse({ resumable: false });
            
            return jsonResponse({
                resumable: true,
                session_id: session.id,
                tunnel_url: session.tunnel_url,
                shell: session.shell,
                cwd: session.cwd,
                cols: session.cols,
                rows: session.rows,
            });
        } catch (e) {
            return jsonResponse({ resumable: false });
        }
    }

    // ── /api/chat (Multi-Model AI Engine) ───────────────────────────────────
    if (pathLower === '/api/chat') {
        try {
            const body = await request.json();
            const authUser = await getAuthUser(request, env);
            const chatUserId = authUser?.id != null ? String(authUser.id) : undefined;
            const provider = body.provider || 'openai';
            const params = {
                modelKey: body.model,
                systemPrompt: body.system || 'You are Agent Sam.',
                messages: body.messages || [],
                tools: body.tools || [],
                agentId: body.agent_id,
                conversationId: body.conversation_id,
                userId: chatUserId,
            };

            if (provider === 'openai') return chatWithToolsOpenAI(env, request, params);
            if (provider === 'google' || provider === 'gemini') return chatWithToolsGemini(env, request, params);
            if (provider === 'vertex') return chatWithToolsVertex(env, request, params);
            
            // Default to Anthropic
            return chatWithAnthropic({ messages: params.messages, tools: params.tools, env, userId: chatUserId, options: { model: params.modelKey, systemPrompt: params.systemPrompt } });
        } catch (e) {
            return jsonResponse({ error: 'Chat failed', detail: e.message }, 500);
        }
    }

    // ── /api/draw/* (Canvas Engine) ──────────────────────────────────────────
    if (pathLower.startsWith('/api/draw')) {
        return handleCanvasApi(request, env);
    }

    // ── /api/hyperdrive/* (Postgres via Hyperdrive — SQL CRUD + table browser) ─
    if (pathLower.startsWith('/api/hyperdrive')) {
        return handleHyperdriveRoutes(request, url, env);
    }

    // ── /api/browser (Playwright Rendering) ──────────────────────────────────
    if (pathLower.startsWith('/api/browser')) {
        return handleBrowserRequest(request, url, env);
    }

    // ── /api/playwright (Browser Jobs) ───────────────────────────────────────
    if (pathLower.startsWith('/api/playwright')) {
        return handlePlaywrightJobApi(request, env, url);
    }

    // ── /api/agent/github (GitHub Bridge) ────────────────────────────────────
    if (pathLower.startsWith('/api/agent/github')) {
        return handleGitHubApi(request, env);
    }

    return jsonResponse({ error: 'Dashboard route not found or not yet modularized' }, 404);
}
