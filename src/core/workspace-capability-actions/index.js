/**
 * Workspace Capability Action Runtime — agentsam_workflow_runs + surface adapters.
 */
import { syncWorkflowRunToSupabase } from '../agentsam-supabase-sync.js';
import { runBrowserCapabilityAction } from './browser.js';
import { runMonacoCapabilityAction } from './monaco.js';
import { runExcalidrawCapabilityAction } from './excalidraw.js';

export const WORKSPACE_CAPABILITY_SHELL_KEY = 'wf_workspace_capability_runtime';

export const WORKFLOW_KEYS = {
  browser: 'workspace_capability_browser',
  monaco: 'workspace_capability_monaco',
  excalidraw: 'workspace_capability_excalidraw',
};

/** @typedef {'browser'|'monaco'|'excalidraw'} CapabilityFamily */

/**
 * User asked for a concrete workspace action (not a conceptual question).
 * @param {string} message
 */
export function isWorkspaceCapabilityActionIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;

  if (/^(what is|what are|explain|define|describe)\s+(a |the )?(browser tool|monaco|excalidraw)\b/i.test(m)) {
    return false;
  }
  if (/\bwhat should we build\b/i.test(m)) return false;

  if (/\buse the browser\b/i.test(m)) return true;
  if (/\b(open|inspect)\b.*\b(in the )?browser\b/i.test(m)) return true;
  if (/\bscreenshot\b/i.test(m)) return true;
  if (/\bcheck\b.*\bvisually\b/i.test(m)) return true;
  if (/\binspect\b.*https?:\/\//i.test(m)) return true;
  if (/\b(create a diagram|draw this|in excalidraw|excalidraw)\b/i.test(m)) return true;
  if (/\b(open|create|edit)\b.*\b(file|draft)\b/i.test(m)) return true;
  if (/\bbuild this and preview\b/i.test(m)) return true;
  if (/https?:\/\/\S+/.test(m) && /\b(inspect|verify|open|check|summarize|look at|use the browser)\b/i.test(m)) {
    return true;
  }

  return false;
}

/**
 * @param {string} message
 * @param {Record<string, unknown>|null} decision
 * @returns {{ family: CapabilityFamily, workflowKey: string } | null}
 */
export function buildCapabilityPlanFromDecision(message, decision) {
  if (!decision || typeof decision !== 'object') return null;
  if (!isWorkspaceCapabilityActionIntent(message)) return null;

  const msg = String(message || '').toLowerCase();
  /** @type {Record<CapabilityFamily, number>} */
  const scores = { browser: 0, excalidraw: 0, monaco: 0 };

  if (decision.should_use_browser) scores.browser += 5;
  if (decision.should_use_excalidraw) scores.excalidraw += 5;
  if (decision.should_use_monaco) scores.monaco += 5;

  if (/https?:\/\//.test(msg) && /\b(browser|inspect|open|check|screenshot|summarize|page|visually)\b/.test(msg)) {
    scores.browser += 8;
  }
  if (/\b(diagram|excalidraw|draw|flowchart|sketch|wireframe)\b/.test(msg)) scores.excalidraw += 8;
  if (/\b(file|monaco|edit code|draft|implement|component|patch)\b/.test(msg)) scores.monaco += 6;

  const surf = String(decision.default_surface || 'chat');
  if (surf === 'browser') scores.browser += 3;
  if (surf === 'excalidraw') scores.excalidraw += 3;
  if (surf === 'monaco' || surf === 'code') scores.monaco += 3;

  /** @type {CapabilityFamily|null} */
  let best = null;
  let bestScore = 0;
  for (const k of /** @type {CapabilityFamily[]} */ (['browser', 'excalidraw', 'monaco'])) {
    if (scores[k] > bestScore) {
      bestScore = scores[k];
      best = k;
    }
  }

  if (!best || bestScore < 5) return null;
  if (best === 'browser' && !decision.should_use_browser) return null;
  if (best === 'excalidraw' && !decision.should_use_excalidraw) return null;
  if (best === 'monaco' && !decision.should_use_monaco) return null;

  return { family: best, workflowKey: WORKFLOW_KEYS[best] };
}

export function shouldExecuteWorkspaceCapabilityAction(message, decision) {
  return buildCapabilityPlanFromDecision(message, decision) != null;
}

async function pragmaColumns(db, table) {
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(table || '')) ? String(table) : '';
  if (!safe) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

/** D1 FK target for chat-led runs (capability runtime + agent tool ledger). */
export async function resolveWorkspaceCapabilityShellWorkflowId(env) {
  if (!env?.DB) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM agentsam_mcp_workflows WHERE workflow_key = ? AND COALESCE(is_active,1)=1 LIMIT 1`,
  )
    .bind(WORKSPACE_CAPABILITY_SHELL_KEY)
    .first();
  return row?.id ? String(row.id) : null;
}

async function resolveShellWorkflowId(env) {
  return resolveWorkspaceCapabilityShellWorkflowId(env);
}

function stepsTotalForFamily(family) {
  if (family === 'browser') return 6;
  if (family === 'monaco') return 4;
  return 5;
}

/**
 * @param {object} opts
 * @param {any} opts.env
 * @param {any} [opts.ctx]
 * @param {string} opts.tenantId
 * @param {string} opts.workspaceId
 * @param {string} opts.userId
 * @param {string|null} opts.sessionId
 * @param {string} opts.message
 * @param {string} opts.requestedMode
 * @param {{ family: CapabilityFamily, workflowKey: string }} opts.capabilityPlan
 * @param {Record<string, unknown>|null} [opts.browserContext]
 * @param {(type: string, payload: Record<string, unknown>) => void} opts.emit
 */
export async function runWorkspaceCapabilityAction(opts) {
  const {
    env,
    ctx,
    tenantId,
    workspaceId,
    userId,
    sessionId,
    message,
    requestedMode,
    capabilityPlan,
    browserContext,
    emit,
  } = opts;

  if (String(requestedMode || '').toLowerCase() !== 'agent' || !capabilityPlan?.family) {
    return { ok: false, skipped: true, reason: 'not_agent_or_no_plan' };
  }
  if (!env?.DB || !tenantId || !workspaceId || !userId) {
    return { ok: false, skipped: true, reason: 'missing_db_scope' };
  }

  const shellId = await resolveShellWorkflowId(env);
  if (!shellId) {
    const err = 'missing_shell_workflow: run migration 319 (wf_workspace_capability_runtime)';
    console.warn('[workspace-capability-actions]', err);
    return { ok: false, error: err };
  }

  const runId = `wrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const workflowKey = capabilityPlan.workflowKey;
  const t0 = Date.now();
  const startedSec = Math.floor(t0 / 1000);
  const stepsTotal = stepsTotalForFamily(capabilityPlan.family);

  const inputPayload = {
    message: String(message || '').slice(0, 24000),
    capability: capabilityPlan.family,
    browserContext: browserContext || null,
  };

  const cols = await pragmaColumns(env.DB, 'agentsam_workflow_runs');
  const heartbeatFrag = cols.has('heartbeat_at') ? ', heartbeat_at' : '';
  const heartbeatVal = cols.has('heartbeat_at') ? ', unixepoch()' : '';

  await env.DB
    .prepare(
      `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, display_name, tenant_id, workspace_id,
      user_id, session_id, trigger_type, status,
      input_json, output_json, step_results_json, steps_total, steps_completed,
      input_tokens, output_tokens, cost_usd, supabase_sync_status,
      started_at, created_at, updated_at
      ${heartbeatFrag}
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, 'agent', 'running',
      ?, '{}', '[]', ?, 0,
      0, 0, 0, 'pending',
      unixepoch(), datetime('now'), datetime('now')
      ${heartbeatVal}
    )`,
    )
    .bind(
      runId,
      shellId,
      workflowKey,
      `Workspace capability · ${capabilityPlan.family}`,
      String(tenantId).trim(),
      String(workspaceId).trim(),
      String(userId).trim(),
      sessionId != null ? String(sessionId) : null,
      JSON.stringify(inputPayload),
      stepsTotal,
    )
    .run();

  emit('workflow_start', { run_id: runId, steps_total: stepsTotal });

  /** @type {{ ok?: boolean, error?: string, step_results?: unknown[], output?: unknown, artifact_for_model?: unknown }} */
  let adapterResult = { ok: false, step_results: [], error: 'no_adapter' };
  try {
    if (capabilityPlan.family === 'browser') {
      adapterResult = await runBrowserCapabilityAction({
        env,
        runId,
        tenantId: String(tenantId).trim(),
        workspaceId: String(workspaceId).trim(),
        userId: String(userId).trim(),
        message,
        browserContext,
        emit,
      });
    } else if (capabilityPlan.family === 'monaco') {
      adapterResult = await runMonacoCapabilityAction({
        env,
        runId,
        tenantId: String(tenantId).trim(),
        workspaceId: String(workspaceId).trim(),
        userId: String(userId).trim(),
        message,
        emit,
      });
    } else {
      adapterResult = await runExcalidrawCapabilityAction({
        env,
        runId,
        tenantId: String(tenantId).trim(),
        workspaceId: String(workspaceId).trim(),
        userId: String(userId).trim(),
        message,
        emit,
      });
    }
  } catch (e) {
    adapterResult = {
      ok: false,
      error: e?.message != null ? String(e.message) : String(e),
      step_results: [],
      output: {},
    };
  }

  const duration = Math.max(0, Date.now() - t0);
  const ok = !!adapterResult?.ok;
  const stepList = Array.isArray(adapterResult?.step_results) ? adapterResult.step_results : [];
  const stepResultsJson = JSON.stringify(stepList);
  const outputJson = JSON.stringify(adapterResult?.output ?? {});
  const errMsg = ok ? null : String(adapterResult?.error || 'capability_failed').slice(0, 4000);

  let updateSql = `UPDATE agentsam_workflow_runs SET
    status = ?,
    output_json = ?,
    step_results_json = ?,
    steps_completed = ?,
    error_message = ?,
    duration_ms = ?,
    completed_at = unixepoch(),
    updated_at = datetime('now')`;
  if (cols.has('heartbeat_at')) {
    updateSql += ', heartbeat_at = unixepoch()';
  }
  updateSql += ' WHERE id = ?';

  await env.DB
    .prepare(updateSql)
    .bind(
      ok ? 'completed' : 'failed',
      outputJson,
      stepResultsJson,
      stepList.length,
      errMsg,
      duration,
      runId,
    )
    .run();

  if (ok) {
    emit('workflow_complete', {
      run_id: runId,
      status: 'completed',
      message: 'Workspace capability run finished',
    });
  } else {
    emit('workflow_error', {
      run_id: runId,
      status: 'failed',
      message: errMsg || 'failed',
    });
  }

  const runForSb = {
    id: runId,
    workflow_key: workflowKey,
    display_name: `Workspace capability · ${capabilityPlan.family}`,
    tenant_id: String(tenantId).trim(),
    workspace_id: String(workspaceId).trim(),
    status: ok ? 'completed' : 'failed',
    started_at: startedSec,
    completed_at: Math.floor(Date.now() / 1000),
    duration_ms: duration,
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    error_message: errMsg,
    step_results_json: stepResultsJson,
  };

  const syncP = syncWorkflowRunToSupabase(env, runForSb).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(syncP);
  else await syncP;

  return {
    ok,
    run_id: runId,
    workflow_key: workflowKey,
    status: ok ? 'completed' : 'failed',
    output_json: adapterResult?.output ?? null,
    step_results_json: stepList,
    artifact_for_model: adapterResult?.artifact_for_model ?? null,
    error: errMsg,
  };
}
