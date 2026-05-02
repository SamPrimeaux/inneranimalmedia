/**
 * API Service: Workspace Operations
 * Handles ephemeral workspace states, file explorer root resolution, and workspace creation.
 * Deconstructed from legacy worker.js.
 */
import { jsonResponse } from '../core/auth.js';
import { handleAgentsamWorkspacesApi } from './workspaces.js';

const IAM_EXPLORER_WS_SANDBOX = 'ws_inneranimalmedia';

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
        const tenantId = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '' ? String(authUser.tenant_id).trim() : null;
        if (!tenantId) return jsonResponse({ workspaces: [] });
        try {
            const { results } = await env.DB.prepare(
                `SELECT w.id, w.name, w.type, w.status, w.created_at, w.updated_at
                 FROM tenant_workspaces tw
                 LEFT JOIN workspaces w ON w.id = tw.workspace_id
                 WHERE tw.tenant_id = ?
                 ORDER BY COALESCE(w.updated_at, w.created_at) DESC
                 LIMIT 200`,
            ).bind(tenantId).all();
            const rows = (results || []).filter(Boolean);
            return jsonResponse({ workspaces: rows });
        } catch (_) {
            return jsonResponse({ workspaces: [] });
        }
    }

    const agentsamRes = await handleAgentsamWorkspacesApi(request, url, env, ctx, authUser);
    if (agentsamRes) return agentsamRes;

    // ── /api/workspace/create (Ephemeral User State) ───────────────────────
    if (pathLower === '/api/workspace/create' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const t = body?.type;
        const type = t === 'github' || t === 'r2' ? t : 'local';
        const wsUuid = crypto.randomUUID();
        const rowId = `uws:${String(authUser.tenant_id ?? '').trim()}:${String(authUser.id ?? '').trim()}:${wsUuid}`;
        const now = Date.now();
        
        const record = {
            schema: 'user_workspace_v1',
            id: wsUuid,
            userId: String(authUser.id ?? '').trim(),
            tenantId: String(authUser.tenant_id ?? '').trim(),
            type,
            folderName: typeof body.folderName === 'string' ? body.folderName : undefined,
            lastKnownPath: typeof body.lastKnownPath === 'string' ? body.lastKnownPath : 'unknown',
            githubRepo: typeof body.githubRepo === 'string' ? body.githubRepo : undefined,
            r2Bucket: typeof body.r2Bucket === 'string' ? body.r2Bucket : undefined,
            lastOpenedAt: typeof body.lastOpenedAt === 'number' ? body.lastOpenedAt : now,
            recentFiles: Array.isArray(body.recentFiles) ? body.recentFiles.slice(0, 24) : [],
        };
        
        const stateJson = JSON.stringify(record);
        await env.DB.prepare(
            `INSERT INTO agent_workspace_state (id, state_json, updated_at) VALUES (?, ?, unixepoch())
             ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = unixepoch()`
        ).bind(rowId, stateJson).run();
        
        return jsonResponse({ workspaceId: wsUuid });
    }

    // ── /api/workspace/:id (Ephemeral User State Fetch/Update) ─────────────
    const userWsMatch = pathLower.match(/^\/api\/workspace\/([^/]+)$/);
    if (userWsMatch && userWsMatch[1] !== 'create') {
        const wsUuid = userWsMatch[1];
        const rowId = `uws:${String(authUser.tenant_id ?? '').trim()}:${String(authUser.id ?? '').trim()}:${wsUuid}`;

        if (method === 'GET') {
            const row = await env.DB.prepare('SELECT state_json FROM agent_workspace_state WHERE id = ?').bind(rowId).first();
            if (!row) return jsonResponse({ error: 'Not found' }, 404);
            return jsonResponse(JSON.parse(row.state_json || '{}'));
        }

        if (method === 'PATCH') {
            const body = await request.json().catch(() => ({}));
            const row = await env.DB.prepare('SELECT state_json FROM agent_workspace_state WHERE id = ?').bind(rowId).first();
            if (!row) return jsonResponse({ error: 'Not found' }, 404);
            
            const rec = JSON.parse(row.state_json || '{}');
            if (typeof body.lastOpenedAt === 'number') rec.lastOpenedAt = body.lastOpenedAt;
            if (typeof body.folderName === 'string') rec.folderName = body.folderName;
            
            await env.DB.prepare('UPDATE agent_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?')
                .bind(JSON.stringify(rec), rowId)
                .run();
            return jsonResponse({ ok: true, record: rec });
        }
    }

    // ── /api/workspaces/current/shell ───────────────────────────────────────
    if (pathLower === '/api/workspaces/current/shell' && method === 'GET') {
        return jsonResponse({
            workspace_id: IAM_EXPLORER_WS_SANDBOX,
            product_name: 'IAM Explorer',
            version: 'v6'
        });
    }

    return jsonResponse({ error: 'Workspace route not found or not yet modularized' }, 404);
}
