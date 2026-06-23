/**
 * Kanban API — /api/kanban/* (D1 kanban_boards, kanban_columns, kanban_tasks).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';
import { userCanAccessWorkspace } from '../core/workspace-access.js';

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

function inClausePlaceholders(count) {
  const n = Number(count) || 0;
  return n > 0 ? Array(n).fill('?').join(', ') : "''";
}

async function listCollabTenantIds(db, workspaceId) {
  try {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT tenant_id
         FROM workspace_members
         WHERE workspace_id = ?
           AND COALESCE(is_active, 1) = 1
           AND tenant_id IS NOT NULL
           AND TRIM(tenant_id) != ''`,
      )
      .bind(workspaceId)
      .all();
    return [...new Set((results || []).map((r) => String(r.tenant_id).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

async function resolveKanbanTenantScope(db, authUser, env, workspaceId) {
  const tenantId = resolveTenantId(authUser, env);
  if (!tenantId) return [];
  if (!workspaceId) return [tenantId];
  const collabTenantIds = await listCollabTenantIds(db, workspaceId);
  if (collabTenantIds.length < 2) return [tenantId];
  if (!(await userCanAccessWorkspace(env, authUser, workspaceId))) return [tenantId];
  return collabTenantIds;
}

async function assertBoardAccess(db, boardId, tenantIds, workspaceId) {
  if (!tenantIds?.length) return false;
  const row = await db
    .prepare(
      `SELECT id FROM kanban_boards
       WHERE id = ?
         AND tenant_id IN (${inClausePlaceholders(tenantIds.length)})
         AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
       LIMIT 1`,
    )
    .bind(boardId, ...tenantIds, workspaceId)
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

const DEFAULT_WORKSPACE_COLUMNS = [
  { name: 'Backlog', position: 0, status: 'backlog' },
  { name: 'To Do', position: 1, status: 'todo' },
  { name: 'In Progress', position: 2, status: 'in_progress' },
  { name: 'Testing', position: 3, status: 'testing' },
  { name: 'Awaiting Approval', position: 4, status: 'awaiting_approval' },
  { name: 'Complete', position: 5, status: 'complete' },
  { name: 'Blocked', position: 6, status: 'blocked' },
];

async function ensureDefaultWorkspaceBoard(db, tenantId, workspaceId, ownerId) {
  const boardId = `kb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO kanban_boards (
         id, tenant_id, workspace_id, owner_id, name, description, board_type, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'Workspace Board', 'Default workspace kanban', 'workspace', 1, ?, ?)`,
    )
    .bind(boardId, tenantId, workspaceId, ownerId || null, now, now)
    .run();

  for (const col of DEFAULT_WORKSPACE_COLUMNS) {
    const columnId = `kcol_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const configJson = JSON.stringify({ status: col.status });
    await db
      .prepare(
        `INSERT INTO kanban_columns (
           id, tenant_id, board_id, name, position, config_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(columnId, tenantId, boardId, col.name, col.position, configJson, now, now)
      .run();
  }

  return boardId;
}

async function handleBoards(url, env, authUser) {
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  const tenantIds = await resolveKanbanTenantScope(env.DB, authUser, env, workspaceId);
  if (!tenantIds.length) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);

  let { results } = await env.DB.prepare(
    `SELECT id, tenant_id, workspace_id, project_id, owner_id, name, description, board_type, is_active, created_at, updated_at
     FROM kanban_boards
     WHERE tenant_id IN (${inClausePlaceholders(tenantIds.length)})
       AND is_active = 1
       AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
     ORDER BY COALESCE(updated_at, created_at) DESC, name ASC`,
  )
    .bind(...tenantIds, workspaceId)
    .all();

  if (!(results || []).length) {
    const ownerId = authUser?.id ?? authUser?.user_id ?? null;
    const primaryTenantId = resolveTenantId(authUser, env);
    await ensureDefaultWorkspaceBoard(env.DB, primaryTenantId, workspaceId, ownerId);
    ({ results } = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id, project_id, owner_id, name, description, board_type, is_active, created_at, updated_at
       FROM kanban_boards
       WHERE tenant_id IN (${inClausePlaceholders(tenantIds.length)})
         AND is_active = 1
         AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = '')
       ORDER BY COALESCE(updated_at, created_at) DESC, name ASC`,
    )
      .bind(...tenantIds, workspaceId)
      .all());
  }

  return jsonResponse({ ok: true, boards: results || [] });
}

async function handleColumns(url, env, authUser) {
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  const tenantIds = await resolveKanbanTenantScope(env.DB, authUser, env, workspaceId);
  const boardId = url.searchParams.get('board_id')?.trim();
  if (!tenantIds.length) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);
  if (!boardId) return jsonResponse({ ok: false, error: 'board_id_required' }, 400);

  if (!(await assertBoardAccess(env.DB, boardId, tenantIds, workspaceId))) {
    return jsonResponse({ ok: false, error: 'board_not_found' }, 404);
  }

  const isCollab = tenantIds.length > 1;
  const { results } = isCollab
    ? await env.DB.prepare(
        `SELECT id, board_id, name, position, color, config_json, created_at, updated_at
         FROM kanban_columns
         WHERE board_id = ?
         ORDER BY position ASC, name ASC`,
      )
        .bind(boardId)
        .all()
    : await env.DB.prepare(
        `SELECT id, board_id, name, position, color, config_json, created_at, updated_at
         FROM kanban_columns
         WHERE tenant_id = ? AND board_id = ?
         ORDER BY position ASC, name ASC`,
      )
        .bind(tenantIds[0], boardId)
        .all();

  return jsonResponse({ ok: true, columns: results || [] });
}

async function handleTasksList(url, env, authUser) {
  const workspaceId = resolveWorkspaceId(authUser, env, url);
  const tenantIds = await resolveKanbanTenantScope(env.DB, authUser, env, workspaceId);
  const boardId = url.searchParams.get('board_id')?.trim();
  const projectId = url.searchParams.get('project_id')?.trim();
  if (!tenantIds.length) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);
  if (!boardId && !projectId) return jsonResponse({ ok: false, error: 'board_id_or_project_id_required' }, 400);

  if (boardId) {
    if (!(await assertBoardAccess(env.DB, boardId, tenantIds, workspaceId))) {
      return jsonResponse({ ok: false, error: 'board_not_found' }, 404);
    }
    const { results } = await env.DB.prepare(
      `SELECT kt.*, kb.project_id
       FROM kanban_tasks kt
       INNER JOIN kanban_boards kb ON kb.id = kt.board_id
       WHERE kt.board_id = ?
         AND kt.tenant_id IN (${inClausePlaceholders(tenantIds.length)})
         AND (kb.workspace_id = ? OR kb.workspace_id IS NULL OR kb.workspace_id = '')
       ORDER BY kt.column_id ASC, kt.position ASC, kt.created_at ASC`,
    )
      .bind(boardId, ...tenantIds, workspaceId)
      .all();
    return jsonResponse({ ok: true, tasks: (results || []).map(mapTaskRow) });
  }

  const { results } = await env.DB.prepare(
    `SELECT kt.*, kb.project_id
     FROM kanban_tasks kt
     INNER JOIN kanban_boards kb ON kb.id = kt.board_id
     WHERE kt.tenant_id IN (${inClausePlaceholders(tenantIds.length)})
       AND kb.project_id = ?
       AND (kb.workspace_id = ? OR kb.workspace_id IS NULL OR kb.workspace_id = '')
     ORDER BY kt.position ASC, kt.created_at ASC`,
  )
    .bind(...tenantIds, projectId, workspaceId)
    .all();

  return jsonResponse({ ok: true, tasks: (results || []).map(mapTaskRow) });
}

async function handleTaskPatch(request, env, authUser, taskId) {
  const workspaceId = resolveWorkspaceId(authUser, env, new URL(request.url));
  const tenantIds = await resolveKanbanTenantScope(env.DB, authUser, env, workspaceId);
  if (!tenantIds.length) return jsonResponse({ ok: false, error: 'tenant_required' }, 403);
  if (!workspaceId) return jsonResponse({ ok: false, error: 'workspace_required' }, 403);

  const row = await env.DB.prepare(
    `SELECT kt.id, kt.board_id, kt.column_id
     FROM kanban_tasks kt
     INNER JOIN kanban_boards kb ON kb.id = kt.board_id
     WHERE kt.id = ?
       AND kt.tenant_id IN (${inClausePlaceholders(tenantIds.length)})
       AND (kb.workspace_id = ? OR kb.workspace_id IS NULL OR kb.workspace_id = '')
     LIMIT 1`,
  )
    .bind(taskId, ...tenantIds, workspaceId)
    .first();

  if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);

  const body = await request.json().catch(() => ({}));
  const updates = [];
  const binds = [];
  const isCollab = tenantIds.length > 1;

  if (body.column_id != null) {
    const columnId = String(body.column_id).trim();
    const col = isCollab
      ? await env.DB.prepare(`SELECT id FROM kanban_columns WHERE id = ? AND board_id = ? LIMIT 1`)
          .bind(columnId, row.board_id)
          .first()
      : await env.DB.prepare(
          `SELECT id FROM kanban_columns WHERE id = ? AND board_id = ? AND tenant_id = ? LIMIT 1`,
        )
          .bind(columnId, row.board_id, tenantIds[0])
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
