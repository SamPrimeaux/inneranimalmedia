/**
 * API Service: Workspace Operations
 * Handles ephemeral workspace states, file explorer root resolution, and workspace creation.
 * Deconstructed from legacy worker.js.
 */
import { jsonResponse } from '../core/auth.js';
import { pickAuthUserWorkspaceId } from '../core/platform-workspace-env.js';
import { listAccessibleWorkspaces } from '../core/workspace-access.js';
import { handleAgentsamWorkspacesApi } from './workspaces.js';


/**
 * Main dispatcher for Workspace-related API routes (/api/workspaces/*, /api/workspace/*).
 */
export async function handleWorkspaceApi(request, url, env, ctx, authUser) {
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    // ── GET /api/workspace/settings ─────────────────────────────────────────
    if (pathLower === '/api/workspace/settings' && method === 'GET') {
        const workspaceId = String(authUser.workspace_id || authUser.workspaceId || url.searchParams.get('workspace_id') || '').trim();
        const userId = String(authUser.id || '').trim();
        const tenantId = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '' ? String(authUser.tenant_id).trim() : null;
        const defaults = { workspace_id: workspaceId || null, theme: null, timezone: 'UTC', locale: 'en', settings_json: {} };
        if (!workspaceId) return jsonResponse(defaults);
        try {
            const row = await env.DB.prepare(
                `SELECT workspace_id, theme, timezone, locale, settings_json
                 FROM workspace_settings WHERE workspace_id = ? LIMIT 1`,
            ).bind(workspaceId).first();
            if (row) {
                let settingsObj = {};
                try { settingsObj = row.settings_json ? JSON.parse(row.settings_json) : {}; } catch { settingsObj = {}; }
                return jsonResponse({
                    workspace_id: row.workspace_id,
                    theme: row.theme ?? null,
                    timezone: row.timezone ?? 'UTC',
                    locale: row.locale ?? 'en',
                    settings_json: settingsObj,
                });
            }
        } catch (_) {
            // table may not exist; fall through to defaults
        }
        // Upsert defaults if possible
        try {
            await env.DB.prepare(
                `INSERT INTO workspace_settings (workspace_id, theme, timezone, locale, settings_json, updated_at)
                 VALUES (?, NULL, 'UTC', 'en', '{}', unixepoch())
                 ON CONFLICT(workspace_id) DO UPDATE SET updated_at = excluded.updated_at`,
            ).bind(workspaceId).run();
        } catch (_) {}
        return jsonResponse(defaults);
    }

    // ── GET /api/workspace/list ─────────────────────────────────────────────
    if (pathLower === '/api/workspace/list' && method === 'GET') {
        try {
            const results = await listAccessibleWorkspaces(env.DB, env, authUser, { limit: 200 });
            const rows = (results || []).map((w) => ({
                id: w.id,
                name: w.name ?? w.display_name ?? w.id,
                type: w.workspace_type ?? w.type ?? null,
                status: w.status ?? null,
                created_at: w.created_at ?? null,
                updated_at: w.updated_at ?? null,
            }));
            return jsonResponse({ workspaces: rows });
        } catch (_) {
            return jsonResponse({ workspaces: [] });
        }
    }

    const agentsamRes = await handleAgentsamWorkspacesApi(request, url, env, ctx, authUser);
    if (agentsamRes) return agentsamRes;

    // Local Explorer folder browsing is browser-only (IndexedDB handle + localStorage name).
    // It must never mint agentsam_workspace / agentsam_workspace_state rows — those tables are
    // for curated product workspaces and live agent sessions against bound infra.
    if (pathLower === '/api/workspace/create' && method === 'POST') {
        return jsonResponse(
            {
                error: 'local_explorer_client_only',
                detail:
                    'Folder open/recent state is browser-local only. Product workspaces are deliberate repo+Worker+bindings identities — not Local Explorer glances.',
            },
            410,
        );
    }

    const userWsMatch = pathLower.match(/^\/api\/workspace\/([^/]+)$/);
    if (userWsMatch && userWsMatch[1] !== 'create' && (method === 'GET' || method === 'PATCH')) {
        // Former ephemeral UUID session API — retired with Local Explorer D1 persistence.
        return jsonResponse(
            {
                error: 'local_explorer_client_only',
                detail: 'Ephemeral Local Explorer D1 state was removed. Use a real ws_* workspace for agent sessions.',
            },
            410,
        );
    }

    // ── /api/workspaces/current/shell ───────────────────────────────────────
    if (pathLower === '/api/workspaces/current/shell' && method === 'GET') {
        return jsonResponse({
            workspace_id: pickAuthUserWorkspaceId(authUser),
            product_name: 'IAM Explorer',
            version: 'v6'
        });
    }

    return jsonResponse({ error: 'Workspace route not found or not yet modularized' }, 404);
}
