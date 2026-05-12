/**
 * Links agent-chat tool sessions to agentsam_executions + agentsam_execution_steps
 * (same pattern as workflow-executor graph runs: execution_id FK, task_id = workflow run id).
 */

import { resolveCanonicalUserId } from '../api/auth.js';
import { pragmaTableInfo } from './retention.js';

/**
 * @param {any} env
 * @param {Set<string>} execCols
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   userId: string | null | undefined,
 *   workflowRunId: string,
 *   workflowKey: string,
 *   modelKey: string | null,
 *   sessionId: string | null,
 * }} p
 * @returns {Promise<string | null>}
 */
export async function insertChatToolSessionParentExecution(env, execCols, p) {
  if (!env?.DB || !execCols?.size || !execCols.has('task_id')) return null;
  const runId = String(p.workflowRunId || '').trim();
  const wfKey = String(p.workflowKey || '').slice(0, 500);
  if (!runId) return null;

  const workflowExecId = `exec_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const uid =
    p.userId != null && String(p.userId).trim() !== ''
      ? await resolveCanonicalUserId(String(p.userId).trim(), env)
      : null;

  const tid = String(p.tenantId || '').trim() || null;
  const ws = String(p.workspaceId || '').trim();
  const sess = p.sessionId != null ? String(p.sessionId).slice(0, 200) : null;
  const mk = p.modelKey != null ? String(p.modelKey).slice(0, 500) : null;

  const parts = [];
  const ph = [];
  const binds = [];
  const add = (col, val) => {
    if (!execCols.has(col)) return;
    parts.push(col);
    ph.push('?');
    binds.push(val);
  };

  add('id', workflowExecId);
  add('tenant_id', tid);
  add('workspace_id', ws);
  add('user_id', uid);
  add('command_run_id', null);
  add('task_id', runId);
  add('execution_type', 'workflow');
  add('command', wfKey || null);
  if (execCols.has('workflow_run_id')) add('workflow_run_id', runId);
  if (execCols.has('work_session_id')) add('work_session_id', sess);
  if (execCols.has('model_key')) add('model_key', mk);
  if (execCols.has('status')) add('status', 'running');
  add('duration_ms', 0);
  if (execCols.has('created_at')) {
    parts.push('created_at');
    ph.push('unixepoch()');
  }

  if (parts.length < 5) return null;

  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO agentsam_executions (${parts.join(', ')}) VALUES (${ph.join(', ')})`,
      )
      .bind(...binds)
      .run();
    return workflowExecId;
  } catch (e) {
    console.warn('[agent-chat-tool-exec] agentsam_executions insert', e?.message ?? e);
    return null;
  }
}

/**
 * One completed step row per tool invocation (tool already finished before this runs).
 *
 * @param {any} env
 * @param {Set<string>} stepCols
 * @param {{
 *   executionParentId: string | null,
 *   workflowRunId: string,
 *   stepEntry: {
 *     tool_name: string,
 *     ok: boolean,
 *     duration_ms: number,
 *     output_preview?: string | null,
 *     error?: string | null,
 *     input_json?: Record<string, unknown> | null,
 *   },
 * }} p
 * @returns {Promise<string | null>} execution step id
 */
export async function insertChatToolSessionExecutionStep(env, stepCols, p) {
  if (!env?.DB || !stepCols?.size) return null;
  const hasExec = stepCols.has('execution_id');
  const hasWrun = stepCols.has('workflow_run_id');
  if (!hasExec && !hasWrun) return null;
  if (hasExec && !p.executionParentId) return null;

  const stepId = `estep_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const nk = String(p.stepEntry?.tool_name || 'tool').slice(0, 500);
  const nt = 'mcp_tool';
  const ok = !!p.stepEntry?.ok;
  const st = ok ? 'success' : 'failed';
  const dur = Math.max(0, Math.floor(Number(p.stepEntry?.duration_ms) || 0));
  const nowMs = Date.now();
  const startedSec = Math.max(0, Math.floor((nowMs - dur) / 1000));
  const completedSec = Math.floor(nowMs / 1000);

  const inputObj =
    p.stepEntry?.input_json && typeof p.stepEntry.input_json === 'object'
      ? p.stepEntry.input_json
      : { tool: nk };
  const inputJson = JSON.stringify(inputObj).slice(0, 8000);
  const outJson = JSON.stringify({
    ok,
    output_preview: String(p.stepEntry?.output_preview || '').slice(0, 12000),
    duration_ms: dur,
  }).slice(0, 16000);
  const errJson = ok
    ? '{}'
    : JSON.stringify({ message: String(p.stepEntry?.error || 'failed').slice(0, 4000) }).slice(0, 8000);

  const colNames = [];
  const placeholders = [];
  const binds = [];

  colNames.push('id');
  placeholders.push('?');
  binds.push(stepId);

  if (hasExec) {
    colNames.push('execution_id');
    placeholders.push('?');
    binds.push(String(p.executionParentId));
  }
  if (hasWrun) {
    colNames.push('workflow_run_id');
    placeholders.push('?');
    binds.push(String(p.workflowRunId));
  }

  colNames.push('node_key', 'node_type', 'status', 'input_json');
  placeholders.push('?', '?', '?', '?');
  binds.push(nk, nt, st, inputJson);

  if (stepCols.has('output_json')) {
    colNames.push('output_json');
    placeholders.push('?');
    binds.push(outJson);
  }
  if (stepCols.has('error_json')) {
    colNames.push('error_json');
    placeholders.push('?');
    binds.push(errJson);
  }
  if (stepCols.has('started_at')) {
    colNames.push('started_at');
    placeholders.push('?');
    binds.push(startedSec);
  }
  if (stepCols.has('completed_at')) {
    colNames.push('completed_at');
    placeholders.push('?');
    binds.push(completedSec);
  }
  if (stepCols.has('latency_ms')) {
    colNames.push('latency_ms');
    placeholders.push('?');
    binds.push(dur);
  }
  if (stepCols.has('tokens_in')) {
    colNames.push('tokens_in');
    placeholders.push('?');
    binds.push(0);
  }
  if (stepCols.has('tokens_out')) {
    colNames.push('tokens_out');
    placeholders.push('?');
    binds.push(0);
  }
  if (stepCols.has('cost_usd')) {
    colNames.push('cost_usd');
    placeholders.push('?');
    binds.push(0);
  }
  if (stepCols.has('attempt')) {
    colNames.push('attempt');
    placeholders.push('?');
    binds.push(1);
  }
  if (stepCols.has('created_at')) {
    colNames.push('created_at');
    placeholders.push(`datetime('now')`);
  }

  const sql = `INSERT INTO agentsam_execution_steps (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
  try {
    await env.DB.prepare(sql).bind(...binds).run();
    return stepId;
  } catch (e) {
    console.warn('[agent-chat-tool-exec] agentsam_execution_steps insert', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {Set<string>} execCols
 * @param {{
 *   executionParentId: string | null,
 *   ok: boolean,
 *   durationMs: number,
 *   errorMessage: string | null,
 *   stepsCount: number,
 *   lastToolName: string | null,
 *   modelKey: string | null,
 * }} p
 */
export async function finalizeChatToolSessionParentExecution(env, execCols, p) {
  if (!env?.DB || !execCols?.size || !p.executionParentId) return;
  const eid = String(p.executionParentId).trim();
  if (!eid) return;

  const sets = [];
  const binds = [];
  const push = (name, val) => {
    if (!execCols.has(name)) return;
    sets.push(`${name} = ?`);
    binds.push(val);
  };

  if (execCols.has('status')) {
    push('status', p.ok ? 'completed' : 'failed');
  }
  push('duration_ms', Math.max(0, Math.floor(Number(p.durationMs) || 0)));
  push('error', p.ok ? null : String(p.errorMessage || 'failed').slice(0, 8000));
  const summary = JSON.stringify({
    steps: p.stepsCount,
    last_tool: p.lastToolName,
  }).slice(0, 8000);
  push('output', summary);
  if (execCols.has('model_key') && p.modelKey) {
    push('model_key', String(p.modelKey).slice(0, 500));
  }

  if (!sets.length) return;
  binds.push(eid);
  try {
    await env.DB.prepare(`UPDATE agentsam_executions SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  } catch (e) {
    console.warn('[agent-chat-tool-exec] agentsam_executions finalize', e?.message ?? e);
  }
}

/**
 * Load step + execution column sets once per tool session.
 * @param {any} env
 */
export async function loadAgentChatExecutionLedgerPragma(env) {
  if (!env?.DB) return { execCols: new Set(), stepCols: new Set() };
  const [execCols, stepCols] = await Promise.all([
    pragmaTableInfo(env.DB, 'agentsam_executions'),
    pragmaTableInfo(env.DB, 'agentsam_execution_steps'),
  ]);
  return { execCols, stepCols };
}
