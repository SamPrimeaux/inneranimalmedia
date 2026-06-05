import { jsonResponse } from '../core/responses.js';
import { getAuthUser, fetchAuthUserTenantId } from '../core/auth.js';
import { resolveTerminalWorkspaceId } from '../core/bootstrap.js';

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

async function resolveTenantId(env, authUser) {
  const tid =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : '';
  if (tid) return tid;
  if (!env?.DB) return '';
  const uid = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!uid) return '';
  const out = await fetchAuthUserTenantId(env, uid).catch(() => '');
  return out != null ? String(out).trim() : '';
}

/**
 * GET /api/workflows
 *
 * Returns recent `agentsam_workflow_runs` rows (tenant + workspace scoped) for UnifiedSearchBar wf prefix search.
 *
 * Query:
 * - q: optional search term (matches workflow_key, display_name, id)
 * - limit: default 10, max 50
 */
export async function handleWorkflowsApi(request, url, env) {
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const tenantId = await resolveTenantId(env, authUser);
  if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);

  const tw = await resolveTerminalWorkspaceId(
    env,
    request,
    authUser,
    url.searchParams.get('workspace_id'),
  );
  const workspaceId = tw.workspaceId || '';

  const q = String(url.searchParams.get('q') || '').trim();
  const limit = clampLimit(url.searchParams.get('limit'));

  const where = [];
  const binds = [];
  where.push('tenant_id = ?');
  binds.push(tenantId);
  if (workspaceId) {
    where.push('workspace_id = ?');
    binds.push(workspaceId);
  }
  if (q) {
    where.push('(workflow_key LIKE ? OR display_name LIKE ? OR id LIKE ?)');
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    binds.push(like, like, like);
  }

  const sqlBase = `
    SELECT id, workflow_key, display_name, status, created_at, workspace_id
    FROM agentsam_workflow_runs
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `;

  try {
    const res = await env.DB.prepare(sqlBase).bind(...binds, limit).all();
    return jsonResponse({ workflows: res?.results || [], workspace_id: workspaceId || null });
  } catch (e) {
    // Older schemas may not have display_name.
    const sqlFallback = `
      SELECT id, workflow_key, status, created_at, workspace_id
      FROM agentsam_workflow_runs
      WHERE ${where
        .map((w) => (w.includes('display_name') ? w.replace(/display_name LIKE \?/g, "''") : w))
        .join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    try {
      const res = await env.DB.prepare(sqlFallback).bind(...binds, limit).all();
      return jsonResponse({ workflows: res?.results || [], workspace_id: workspaceId || null });
    } catch (e2) {
      return jsonResponse({ error: e2?.message ?? String(e2) }, 500);
    }
  }
}

