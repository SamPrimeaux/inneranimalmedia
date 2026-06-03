/**
 * HTTP JSON-RPC bridge for Cursor ACP-shaped messages (dashboard / cloud agent flows).
 */
import { jsonResponse } from '../core/auth.js';
import { resolveIdentity } from '../core/identity.js';
import { newChatAgentRunId, scheduleAgentsamChatAgentRunStart } from '../core/agent-run-routing.js';
import { pragmaTableInfo } from '../core/retention.js';

/**
 * @param {string|number|null|undefined} id
 * @param {unknown} result
 * @param {{ code: number, message: string } | null} [error]
 */
function jsonRpc(id, result, error = null) {
  const body = error
    ? { jsonrpc: '2.0', id: id ?? null, error }
    : { jsonrpc: '2.0', id: id ?? null, result: result ?? {} };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} identity
 * @param {string} runId
 * @param {Record<string, unknown>} params
 */
async function insertAcpAgentRun(env, identity, runId, params) {
  const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  if (!cols.size) return;

  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!cols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  const mode = params?.mode != null ? String(params.mode).trim() : 'agent';
  add('id', runId);
  add('user_id', identity.userId);
  add('tenant_id', identity.tenantId);
  add('workspace_id', identity.workspaceId);
  add('mode', mode);
  add('task_type', 'acp_session');
  add('trigger', 'cursor_acp');
  add('status', 'queued');
  add('conversation_id', params?.sessionId != null ? String(params.sessionId) : runId);

  const isoNow = new Date().toISOString();
  if (cols.has('started_at')) {
    parts.push('started_at');
    binds.push(isoNow);
  }
  if (cols.has('created_at')) {
    parts.push('created_at');
    binds.push(isoNow);
  }
  if (cols.has('created_at_unix')) {
    add('created_at_unix', Math.floor(Date.now() / 1000));
  }

  if (parts.length < 2) return;

  await env.DB.prepare(
    `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
  )
    .bind(...binds)
    .run()
    .catch((e) => console.warn('[cursor-acp] agent_run insert', e?.message ?? e));
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} identity
 * @param {Array<Record<string, unknown>>} todos
 * @param {boolean} merge
 * @param {string} sessionId
 */
async function upsertAcpTodos(env, identity, todos, merge, sessionId) {
  if (!env?.DB || !Array.isArray(todos) || todos.length === 0) return;

  for (let i = 0; i < todos.length; i += 1) {
    const t = todos[i] || {};
    const title = String(t.content ?? t.title ?? t.name ?? `ACP todo ${i + 1}`).slice(0, 500);
    const todoId = `todo_acp_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const status = String(t.status ?? 'open').slice(0, 40);

    await env.DB.prepare(
      `INSERT INTO agentsam_todo (
        id, tenant_id, title, status, execution_status, plan_id,
        category, created_by, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, 'cursor_acp', 'cursor_acp', ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        todoId,
        identity.tenantId,
        title,
        status,
        sessionId,
        i * 10,
      )
      .run()
      .catch(() => {});
  }

  if (!merge) {
    /* merge=false: future pass could retire prior session todos; v1 only appends */
  }
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export async function handleCursorAcpMessage(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const identity = await resolveIdentity(env, request);
  if (!identity?.userId || !identity?.tenantId || !identity?.workspaceId) {
    return jsonRpc(null, null, { code: -32001, message: 'Unauthorized' });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonRpc(null, null, { code: -32700, message: 'Parse error' });
  }

  const method = String(body?.method || '').trim();
  const params =
    body?.params != null && typeof body.params === 'object' ? body.params : {};
  const id = body?.id ?? null;

  switch (method) {
    case 'session/new': {
      const runId = newChatAgentRunId({ label: 'acp' });
      await insertAcpAgentRun(env, identity, runId, params);
      if (ctx?.waitUntil) {
        scheduleAgentsamChatAgentRunStart(env, ctx, {
          runId,
          userId: identity.userId,
          tenantId: identity.tenantId,
          workspaceId: identity.workspaceId,
          conversationId: runId,
          mode: params?.mode != null ? String(params.mode) : 'agent',
          taskType: 'acp_session',
          trigger: 'cursor_acp',
        });
      }
      return jsonRpc(id, { sessionId: runId });
    }

    case 'session/prompt': {
      const sessionId = params?.sessionId != null ? String(params.sessionId).trim() : '';
      if (!sessionId) {
        return jsonRpc(id, null, { code: -32602, message: 'sessionId required' });
      }
      if (env?.DB) {
        await env.DB.prepare(
          `UPDATE agentsam_agent_run SET status = 'running', updated_at_unix = unixepoch() WHERE id = ? AND user_id = ?`,
        )
          .bind(sessionId, identity.userId)
          .run()
          .catch(() => {});
      }
      return jsonRpc(id, { stopReason: 'end_turn' });
    }

    case 'cursor/update_todos': {
      const sessionId = params?.sessionId != null ? String(params.sessionId).trim() : 'acp';
      const todos = Array.isArray(params?.todos) ? params.todos : [];
      await upsertAcpTodos(env, identity, todos, params?.merge === true, sessionId);
      return jsonRpc(id, { outcome: { outcome: 'accepted', todos } });
    }

    case 'cursor/create_plan': {
      const planName = String(params?.name ?? 'ACP plan').slice(0, 200);
      const planId = `plan_acp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const today = new Date().toISOString().slice(0, 10);
      await env.DB.prepare(
        `INSERT INTO agentsam_plans (
          id, tenant_id, workspace_id, plan_date, plan_type, title, status,
          tasks_total, tasks_done, tasks_blocked, session_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'feature', ?, 'pending_approval', ?, 0, 0, ?, unixepoch(), unixepoch())`,
      )
        .bind(
          planId,
          identity.tenantId,
          identity.workspaceId,
          today,
          planName,
          Array.isArray(params?.todos) ? params.todos.length : 0,
          JSON.stringify({ source: 'cursor_acp', plan: params?.plan ?? null }).slice(0, 4000),
        )
        .run()
        .catch((e) => console.warn('[cursor-acp] plan insert', e?.message ?? e));

      if (Array.isArray(params?.todos) && params.todos.length) {
        await upsertAcpTodos(env, identity, params.todos, false, planId);
      }

      return jsonRpc(id, { outcome: { outcome: 'accepted' }, planId });
    }

    case 'session/request_permission': {
      return jsonRpc(id, {
        outcome: { outcome: 'selected', optionId: 'allow-once' },
      });
    }

    default:
      return jsonRpc(id, null, { code: -32601, message: 'Method not found' });
  }
}
