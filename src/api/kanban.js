/**
 * Kanban API — /api/kanban/* (D1 kanban_boards, kanban_columns, kanban_tasks).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

function resolveWorkspaceId(authUser, env, url) {
  const fromQuery = url?.searchParams?.get('workspace_id') ?? null;
  if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
  const fromSession = authUser?.active_workspace_id ?? authUser?.workspace_id ?? authUser?.workspaceId ?? null;
  if (fromSession && String(fromSession).trim()) return String(fromSession).trim();
  const fromEnv = env?.WORKSPACE_ID ?? null;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return null;
}

function resolveTenantId(authUser, env) {
  const tid = authUser?.tenant_id ?? authUser?.tenantId ?? null;
  if (tid != null && String(tid).trim() !== '') return String(tid).trim();
  return env?.TENANT_ID ? String(env.TENANT_ID).trim() : null;
}

async function assertBoardAccess(db, boardId, tenantId, workspaceId) {
  const row = await db
    .prepare(
      `SELECT id FROM kanban_boards
       WHERE id = ?
         AND tenant_id = ?
         AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
       LIMIT 1`,
    )
    .bind(boardId, tenantId, workspaceId)
    .first();
  return !!row;
}

function mapTaskRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    board_id: row.board_id != null ? String(row.board_id) : null,
    column_id: row.column_id != null ? String(row.column_id) : null,
    project_id: row.project_id != null ? String(row.project_id) : null,
    title: String(row.title || ''),
    description: row.description != null ? String(row.description) : null,
    category: row.category != null ? String(row.category) : null,
    priority: row.priority != null ? String(row.priority) : 'medium',
    assignee_id: row.assignee_id != null ? String(row.assignee_id) : null,
    client_name: row.client_name != null ? String(row.client_name) : null,
    tags: row.tags != null ? String(row.tags) : null,
    position: Number(row.position) || 0,
    due_date: row.due_date != null ? Number(row.due_date) : null,
    completed_at: row.completed_at != null ? Number(row.completed_at) : null,
    todo_id: row.todo_id != null ? String(row.todo_id) : null,
    created_at: row.created_at != null ? Number(row.created_at) : null,
    updated_at: row.updated_at != null ? Number(row.updated_at) : null,
  };
}

async function handleBoards(url, env, authUser) {
  const tenantId = resolveTenantId(authUser, env);
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);

  const { results } = await env.DB.prepare(
    `SELECT id, tenant_id, workspace_id, project_id, owner_id, name, description, board_type, is_active, created_at, updated_at
     FROM kanban_boards
     WHERE tenant_id = ?
       AND is_active = 1
       AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
     ORDER BY COALESCE(updated_at, created_at) DESC, name ASC`,
  )
    .bind(tenantId, workspaceId)
    .all();

  return jsonResponse({ ok: true, boards: results || [] });
}

async function handleColumns(url, env, authUser) {
  const tenantId = resolveTenantId(authUser, env);
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  const boardId = url.searchParams.get('board_id')?.trim();
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);
  if (!boardId) return jsonResponse({ ok: false, error: 'board_id_required' }, 400);

  if (!(await assertBoardAccess(env.DB, boardId, tenantId, workspaceId))) {
    return jsonResponse({ ok: false, error: 'board_not_found' }, 404);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, board_id, name, position, color, config_json, created_at, updated_at
     FROM kanban_columns
     WHERE tenant_id = ? AND board_id = ?
     ORDER BY position ASC, name ASC`,
  )
    .bind(tenantId, boardId)
    .all();

  return jsonResponse({ ok: true, columns: results || [] });
}

async function handleTasksList(url, env, authUser) {
  const tenantId = resolveTenantId(authUser, env);
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  const boardId = url.searchParams.get('board_id')?.trim();
  const projectId = url.searchParams.get('project_id')?.trim();
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);
  if (!boardId && !projectId) return jsonResponse({ ok: false, error: 'board_id_or_project_id_required' }, 400);

  if (boardId) {
    if (!(await assertBoardAccess(env.DB, boardId, tenantId, workspaceId))) {
      return jsonResponse({ ok: false, error: 'board_not_found' }, 404);
    }
    const { results } = await env.DB.prepare(
      `SELECT kt.*, kb.project_id
       FROM kanban_tasks kt
       INNER JOIN kanban_boards kb ON kb.id = kt.board_id
       WHERE kt.tenant_id = ? AND kt.board_id = ?
       ORDER BY kt.column_id ASC, kt.position ASC, kt.created_at ASC`,
    )
      .bind(tenantId, boardId)
      .all();
    return jsonResponse({ ok: true, tasks: (results || []).map(mapTaskRow) });
  }

  const { results } = await env.DB.prepare(
    `SELECT kt.*, kb.project_id
     FROM kanban_tasks kt
     INNER JOIN kanban_boards kb ON kb.id = kt.board_id
     WHERE kt.tenant_id = ?
       AND kb.project_id = ?
       AND (kb.workspace_id = ? OR kb.workspace_id IS NULL OR kb.workspace_id = '')
     ORDER BY kt.position ASC, kt.created_at ASC`,
  )
    .bind(tenantId, projectId, workspaceId)
    .all();

  return jsonResponse({ ok: true, tasks: (results || []).map(mapTaskRow) });
}

async function handleTaskPatch(request, env, authUser, taskId) {
  const tenantId = resolveTenantId(authUser, env);
  const workspaceId = resolveWorkspaceId(authUser, env, new URL(request.url));
  if (!tenantId) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);

  const row = await env.DB.prepare(
    `SELECT kt.id, kt.board_id, kt.column_id
     FROM kanban_tasks kt
     INNER JOIN kanban_boards kb ON kb.id = kt.board_id
     WHERE kt.id = ?
       AND kt.tenant_id = ?
       AND (kb.workspace_id = ? OR kb.workspace_id IS NULL OR kb.workspace_id = '')
     LIMIT 1`,
  )
    .bind(taskId, tenantId, workspaceId)
    .first();

  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);

  const body = await request.json().catch(() => ({}));
  const updates = [];
  const binds = [];

  if (body.column_id != null) {
    const columnId = String(body.column_id).trim();
    const col = await env.DB.prepare(
      `SELECT id FROM kanban_columns WHERE id = ? AND board_id = ? AND tenant_id = ? LIMIT 1`,
    )
      .bind(columnId, row.board_id, tenantId)
      .first();
    if (!col) return jsonResponse({ ok: false, error: 'invalid_column' }, 400);
    updates.push('column_id = ?');
    binds.push(columnId);
  }

  if (body.position != null) {
    updates.push('position = ?');
    binds.push(Number(body.position) || 0);
  }

  if (body.status === 'complete' || body.completed === true) {
    updates.push('completed_at = ?');
    binds.push(Math.floor(Date.now() / 1000));
  } else if (body.completed === false || body.status === 'open') {
    updates.push('completed_at = NULL');
  }

  if (body.title != null) {
    updates.push('title = ?');
    binds.push(String(body.title).trim());
  }

  if (!updates.length) return jsonResponse({ ok: false, error: 'no_updates' }, 400);

  updates.push('updated_at = unixepoch()');
  binds.push(taskId);

  await env.DB.prepare(`UPDATE kanban_tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  const next = await env.DB.prepare(
    `SELECT kt.*, kb.project_id
     FROM kanban_tasks kt
     INNER JOIN kanban_boards kb ON kb.id = kt.board_id
     WHERE kt.id = ? LIMIT 1`,
  )
    .bind(taskId)
    .first();

  return jsonResponse({ ok: true, task: mapTaskRow(next) });
}

export async function handleKanbanApi(request, url, env) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ ok: false, error: 'DB not configured' }, 503);

  if (pathLower === '/api/kanban/boards' && method === 'GET') {
    return handleBoards(url, env, authUser);
  }

  if (pathLower === '/api/kanban/columns' && method === 'GET') {
    return handleColumns(url, env, authUser);
  }

  if (pathLower === '/api/kanban/tasks' && method === 'GET') {
    return handleTasksList(url, env, authUser);
  }

  const taskMatch = pathLower.match(/^\/api\/kanban\/tasks\/([^/]+)$/);
  if (taskMatch && method === 'PATCH') {
    return handleTaskPatch(request, env, authUser, taskMatch[1]);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}
