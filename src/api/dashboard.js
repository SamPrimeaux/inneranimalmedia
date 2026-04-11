import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { getWorkspaceTheme } from '../core/themes.js';

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
 * Main dispatcher for Dashboard-related API routes (/api/agent/*, /api/terminal/*, /api/chat, etc.).
 */
export async function handleDashboardApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

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
                env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens, supports_tools, supports_web_search, supports_vision, size_class FROM ai_models WHERE is_active=1 AND show_in_picker=1 ORDER BY CASE provider WHEN 'anthropic' THEN 1 WHEN 'google' THEN 2 WHEN 'openai' THEN 3 WHEN 'workers_ai' THEN 4 ELSE 5 END, input_rate_per_mtok ASC"),
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

    // ── /api/agent/terminal/socket-url ───────────────────────────────────────
    if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

        const httpsUrl = (env.TERMINAL_WS_URL || '').trim();
        const secret = (env.TERMINAL_SECRET || '').trim();
        if (!httpsUrl || !secret) return jsonResponse({ error: 'Terminal not configured' }, 503);

        let wssUrl = httpsUrl;
        if (httpsUrl.startsWith('https://')) wssUrl = 'wss://' + httpsUrl.slice(8);
        else if (httpsUrl.startsWith('http://')) wssUrl = 'ws://' + httpsUrl.slice(7);
        else if (!httpsUrl.startsWith('wss://') && !httpsUrl.startsWith('ws://')) wssUrl = 'wss://' + httpsUrl.replace(/^\/+/, '');

        const sep = wssUrl.includes('?') ? '&' : '?';
        let themeSlug = '';

        if (env.DB) {
            const workspaceId = url.searchParams.get('workspace_id') || url.searchParams.get('tenant_id');
            themeSlug = await getWorkspaceTheme(env, workspaceId);
        }

        const socketUrl = themeSlug
            ? `${wssUrl}${sep}token=${encodeURIComponent(secret)}&theme_slug=${encodeURIComponent(themeSlug)}`
            : `${wssUrl}${sep}token=${encodeURIComponent(secret)}`;

        return jsonResponse({ url: socketUrl });
    }

    // ── /api/agent/terminal/config-status ────────────────────────────────────
    if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

        const httpsUrl = (env.TERMINAL_WS_URL || '').trim();
        const secret = (env.TERMINAL_SECRET || '').trim();
        return jsonResponse({
            terminal_configured: !!(httpsUrl && secret),
            direct_wss_available: !!(httpsUrl && secret),
        });
    }

    // ── /api/terminal/session/resume ─────────────────────────────────────────
    if (pathLower === '/api/terminal/session/resume' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

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

    // ── /api/chat (Multi-Model AI Engine) ────────────────────────────────────
    if (pathLower === '/api/chat') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

        try {
            const body = await request.json();
            const provider = body.provider || 'anthropic';
            const params = {
                modelKey: body.model,
                systemPrompt: body.system || 'You are Agent Sam.',
                messages: body.messages || [],
                tools: body.tools || [],
                agentId: body.agent_id,
                conversationId: body.conversation_id,
            };

            if (provider === 'openai') return chatWithToolsOpenAI(env, request, params);
            if (provider === 'google' || provider === 'gemini') return chatWithToolsGemini(env, request, params);
            if (provider === 'vertex') return chatWithToolsVertex(env, request, params);

            // Default: Anthropic
            return chatWithAnthropic({
                messages: params.messages,
                tools: params.tools,
                env,
                options: { model: params.modelKey, systemPrompt: params.systemPrompt },
            });
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

    return jsonResponse({ error: 'Dashboard route not found' }, 404);
}
