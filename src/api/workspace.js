/**
 * API Layer: Workspace Operations
 * Ephemeral workspace states, file explorer root resolution, workspace CRUD.
 * Tables: workspaces, workspace_projects, agent_workspace_state
 */
import { jsonResponse }          from '../core/responses.js';
import { tenantIdFromEnv }       from '../core/auth.js';

export async function handleWorkspaceApi(request, url, env, ctx, authUser) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);

  try {

    // ── /api/workspaces/list ────────────────────────────────────────────────
    if (path === '/api/workspaces/list' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT w.id, w.name, w.domain, w.status, w.theme_id, w.handle,
                (SELECT p.id FROM workspace_projects p WHERE p.workspace_id = w.id LIMIT 1) AS project_id
         FROM workspaces w
         WHERE COALESCE(w.is_archived, 0) = 0
         ORDER BY w.created_at DESC`
      ).all();
      return jsonResponse({ workspaces: (results || []).map(r => ({ ...r, worker_id: null })) });
    }

    // ── /api/workspaces/current/shell ─────────────────────────────────────
    // workspace_id from env — never hardcoded
    if (path === '/api/workspaces/current/shell' && method === 'GET') {
      return jsonResponse({
        workspace_id: env.DEFAULT_WORKSPACE_ID || null,
        product_name: env.PRODUCT_LABEL        || 'Agent Sam',
        version:      env.CF_VERSION_METADATA?.id ?? 'dev',
      });
    }

    // ── /api/workspace/create ─────────────────────────────────────────────
    if (path === '/api/workspace/create' && method === 'POST') {
      const body   = await request.json().catch(() => ({}));
      const t      = body?.type;
      const type   = t === 'github' || t === 'r2' ? t : 'local';
      const wsUuid = crypto.randomUUID();
      const userId = String(authUser.id         ?? '').trim();
      const tid    = String(authUser.tenant_id  ?? tenantIdFromEnv(env) ?? '').trim();
      const rowId  = `uws:${tid}:${userId}:${wsUuid}`;
      const now    = Date.now();

      const record = {
        schema:        'user_workspace_v1',
        id:            wsUuid,
        userId,
        tenantId:      tid,
        type,
        folderName:    typeof body.folderName    === 'string' ? body.folderName    : undefined,
        lastKnownPath: typeof body.lastKnownPath === 'string' ? body.lastKnownPath : 'unknown',
        githubRepo:    typeof body.githubRepo    === 'string' ? body.githubRepo    : undefined,
        r2Bucket:      typeof body.r2Bucket      === 'string' ? body.r2Bucket      : undefined,
        lastOpenedAt:  typeof body.lastOpenedAt  === 'number' ? body.lastOpenedAt  : now,
        recentFiles:   Array.isArray(body.recentFiles) ? body.recentFiles.slice(0, 24) : [],
      };

      await env.DB.prepare(
        `INSERT INTO agent_workspace_state (id, state_json, updated_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = unixepoch()`
      ).bind(rowId, JSON.stringify(record)).run();

      return jsonResponse({ workspaceId: wsUuid });
    }

    // ── /api/workspace/:id GET/PATCH ──────────────────────────────────────
    const wsMatch = path.match(/^\/api\/workspace\/([^/]+)$/);
    if (wsMatch && wsMatch[1] !== 'create') {
      const wsUuid = wsMatch[1];
      const userId = String(authUser.id         ?? '').trim();
      const tid    = String(authUser.tenant_id  ?? tenantIdFromEnv(env) ?? '').trim();
      const rowId  = `uws:${tid}:${userId}:${wsUuid}`;

      if (method === 'GET') {
        const row = await env.DB.prepare(
          `SELECT state_json FROM agent_workspace_state WHERE id = ?`
        ).bind(rowId).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse(JSON.parse(row.state_json || '{}'));
      }

      if (method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const row  = await env.DB.prepare(
          `SELECT state_json FROM agent_workspace_state WHERE id = ?`
        ).bind(rowId).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);

        const rec = JSON.parse(row.state_json || '{}');
        if (typeof body.lastOpenedAt  === 'number') rec.lastOpenedAt  = body.lastOpenedAt;
        if (typeof body.folderName    === 'string') rec.folderName    = body.folderName;
        if (typeof body.lastKnownPath === 'string') rec.lastKnownPath = body.lastKnownPath;
        if (Array.isArray(body.recentFiles))        rec.recentFiles   = body.recentFiles.slice(0, 24);

        await env.DB.prepare(
          `UPDATE agent_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`
        ).bind(JSON.stringify(rec), rowId).run();

        return jsonResponse({ ok: true, record: rec });
      }
    }

    return jsonResponse({ error: 'Workspace route not found', path }, 404);

  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
