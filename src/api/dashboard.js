import { jsonResponse } from '../core/responses.js';
import { getAuthUser, authUserIsSuperadmin } from '../core/auth.js';
import { getIntegrationToken } from '../integrations/tokens.js';
import { getWorkspaceTheme, normalizeThemeSlug } from '../core/themes.js';
import { runTerminalCommand, getDefaultTerminalConnection } from '../core/terminal.js';

// Integrations
import { chatWithAnthropic } from '../integrations/anthropic.js';
import { chatWithToolsOpenAI } from '../integrations/openai.js';
import { chatWithToolsGemini } from '../integrations/gemini.js';
import { chatWithToolsVertex } from '../integrations/vertex.js';
import { handleCanvasApi } from '../integrations/canvas.js';
import { handleHyperdriveApi } from '../integrations/hyperdrive.js';
import { handleBrowserRequest, handlePlaywrightJobApi } from '../integrations/playwright.js';
import { handleGitHubApi } from '../integrations/github.js';

/**
 * Main dispatcher for Dashboard-related API routes (/api/agent/*, /api/terminal/*).
 */
export async function handleDashboardApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();
    const isWebSocketUpgrade = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';

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
                env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens, supports_tools, supports_web_search, supports_vision, size_class, picker_group FROM ai_models WHERE COALESCE(is_active,0)=1 AND COALESCE(show_in_picker,0)=1 AND COALESCE(picker_eligible,1)=1 ORDER BY sort_order ASC, display_name ASC"),
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
                const conn = await getDefaultTerminalConnection(env.DB);
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
        const workspaceId = (url.searchParams.get('workspace_id') || authUser.tenant_id || 'default').trim();
        const sessionName = `terminal:v2:${authUser.id}:${workspaceId}:${executionMode}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/ws';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        doUrl.searchParams.set('user_id', String(authUser.id || 'anonymous'));
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
        const workspaceId = (url.searchParams.get('workspace_id') || authUser.tenant_id || 'default').trim();
        const sessionName = `terminal:${authUser.id}:${workspaceId}:${executionMode}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/status';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        doUrl.searchParams.set('user_id', String(authUser.id || 'anonymous'));
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
        const workspaceId = (
            body?.workspace_id ||
            url.searchParams.get('workspace_id') ||
            authUser.tenant_id ||
            'default'
        ).toString().trim();
        const sessionName = `terminal:${authUser.id}:${workspaceId}:${executionMode}`;
        const doId = env.AGENT_SESSION.idFromName(sessionName);
        const stub = env.AGENT_SESSION.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = '/terminal/exec';
        doUrl.searchParams.set('execution_mode', executionMode);
        doUrl.searchParams.set('workspace_id', workspaceId);
        doUrl.searchParams.set('user_id', String(authUser.id || 'anonymous'));
        return stub.fetch(new Request(doUrl.toString(), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(body || {}),
        }));
    }

    // ACTIVE PATH: compatibility command runner; internally routes to control plane first.
    // ── /api/agent/terminal/run (consistent session-auth model) ──────────────
    if (pathLower === '/api/agent/terminal/run' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!authUserIsSuperadmin(authUser)) {
            return jsonResponse({ terminal_enabled: false, error: 'Forbidden' }, 403);
        }
        try {
            const body = await request.json().catch(() => ({}));
            const command = typeof body?.command === 'string' ? body.command.trim() : '';
            const session_id = body?.session_id ?? null;
            if (!command) return jsonResponse({ error: 'No command' }, 400);
            const { output, command: runCommand } = await runTerminalCommand(env, request, command, session_id, ctx);
            const execId = crypto.randomUUID();
            try {
                await env.DB?.prepare(
                    `INSERT INTO agent_command_executions
                     (id, tenant_id, workspace_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
                     VALUES (?, ?, ?, ?, 'terminal_run', ?, ?, 'completed', unixepoch(), unixepoch())`
                ).bind(
                    execId,
                    authUser.tenant_id || 'system',
                    (url.searchParams.get('workspace_id') || 'ws_inneranimalmedia'),
                    session_id || null,
                    runCommand,
                    output,
                ).run();
            } catch (_) {}
            return jsonResponse({ output, command: runCommand, execution_id: execId });
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
                    "UPDATE agent_command_executions SET status = ?, completed_at = ?, output_text = COALESCE(?, output_text), exit_code = COALESCE(?, exit_code) WHERE id = ?"
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
            const provider = body.provider || 'openai';
            const params = {
                modelKey: body.model,
                systemPrompt: body.system || 'You are Agent Sam.',
                messages: body.messages || [],
                tools: body.tools || [],
                agentId: body.agent_id,
                conversationId: body.conversation_id
            };

            if (provider === 'openai') return chatWithToolsOpenAI(env, request, params);
            if (provider === 'google' || provider === 'gemini') return chatWithToolsGemini(env, request, params);
            if (provider === 'vertex') return chatWithToolsVertex(env, request, params);
            
            // Default to Anthropic
            return chatWithAnthropic({ messages: params.messages, tools: params.tools, env, options: { model: params.modelKey, systemPrompt: params.systemPrompt } });
        } catch (e) {
            return jsonResponse({ error: 'Chat failed', detail: e.message }, 500);
        }
    }

    // ── /api/draw/* (Canvas Engine) ──────────────────────────────────────────
    if (pathLower.startsWith('/api/draw')) {
        return handleCanvasApi(request, env);
    }

    // ── /api/hyperdrive (Postgres Proxy) ─────────────────────────────────────
    if (pathLower === '/api/hyperdrive') {
        return handleHyperdriveApi(request, env);
    }

    // ── /api/browser (Playwright Rendering) ──────────────────────────────────
    if (pathLower.startsWith('/api/browser')) {
        return handleBrowserRequest(request, url, env);
    }

    // ── /api/playwright (Browser Jobs) ───────────────────────────────────────
    if (pathLower.startsWith('/api/playwright')) {
        return handlePlaywrightJobApi(request, env);
    }

    // ── /api/agent/github (GitHub Bridge) ────────────────────────────────────
    if (pathLower.startsWith('/api/agent/github')) {
        return handleGitHubApi(request, env);
    }

    return jsonResponse({ error: 'Dashboard route not found or not yet modularized' }, 404);
}
