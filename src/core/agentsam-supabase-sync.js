/**
 * Supabase mirror for Agent Sam workflow runs — Hyperdrive SQL only (agentsam schema).
 * D1 agentsam_workflow_runs remains source of truth.
 */

import { isHyperdriveUsable } from './hyperdrive-query.js';
import { createWorkflowRun, updateWorkflowRun } from './agentsam-workflow-debug-store.js';

export const AGENTSAM_WORKFLOW_RUNS_TABLE = 'agentsam_workflow_runs';

/** @param {import('@cloudflare/workers-types').D1Database} db */
async function pragmaAgentsamWorkflowRunsColumns(db) {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${AGENTSAM_WORKFLOW_RUNS_TABLE})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

/**
 * Reflect Supabase mirror outcome on the D1 workflow run row (optional columns for older DBs).
 * @param {any} env
 * @param {string} d1RunId
 * @param {{ ok: boolean, supabaseRunId?: string|null, error?: string|null }} outcome
 */
export async function patchD1WorkflowRunSupabaseMirrorState(env, d1RunId, outcome) {
  const db = env?.DB;
  const rid = String(d1RunId || '').trim();
  if (!db || !rid) return;
  const cols = await pragmaAgentsamWorkflowRunsColumns(db);
  const fragments = [];
  const binds = [];

  if (cols.has('updated_at')) {
    fragments.push(`updated_at = datetime('now')`);
  }

  if (outcome.ok) {
    if (cols.has('supabase_sync_status')) fragments.push(`supabase_sync_status = 'synced'`);
    if (cols.has('supabase_sync_error')) fragments.push(`supabase_sync_error = NULL`);
    if (cols.has('supabase_synced_at')) fragments.push(`supabase_synced_at = datetime('now')`);
    const sid = outcome.supabaseRunId != null ? String(outcome.supabaseRunId).trim() : '';
    if (sid && cols.has('supabase_run_id')) {
      fragments.push(`supabase_run_id = ?`);
      binds.push(sid);
    }
    if (cols.has('supabase_sync_attempts')) {
      fragments.push(`supabase_sync_attempts = COALESCE(supabase_sync_attempts, 0) + 1`);
    }
  } else {
    const msg = String(outcome.error || 'supabase_sync_failed').slice(0, 8000);
    if (cols.has('supabase_sync_status')) fragments.push(`supabase_sync_status = 'failed'`);
    if (cols.has('supabase_sync_error')) {
      fragments.push(`supabase_sync_error = ?`);
      binds.push(msg);
    }
    if (cols.has('supabase_sync_attempts')) {
      fragments.push(`supabase_sync_attempts = COALESCE(supabase_sync_attempts, 0) + 1`);
    }
  }

  if (!fragments.length) return;
  binds.push(rid);
  const sql = `UPDATE ${AGENTSAM_WORKFLOW_RUNS_TABLE} SET ${fragments.join(', ')} WHERE id = ?`;
  try {
    await db.prepare(sql).bind(...binds).run();
  } catch (e) {
    console.warn('[agentsam-supabase-sync] patchD1WorkflowRunSupabaseMirrorState', e?.message ?? e);
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Result} result
 * @param {string} label
 */
export function assertD1Write(result, label) {
  if (result == null) throw new Error(`[${label}] D1: no result`);
  if (result.success === false) throw new Error(`[${label}] D1: success=false`);
  const changes = result.meta?.changes ?? 0;
  if (changes < 1) throw new Error(`[${label}] D1: expected ≥1 row changed, got ${changes}`);
}

function secToIso(t) {
  if (t == null || t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

function mapRunToHyperdrivePayload(env, run) {
  let toolCallsCount = run.tool_calls_count != null ? Number(run.tool_calls_count) : null;
  if (toolCallsCount == null || !Number.isFinite(toolCallsCount)) {
    try {
      const raw = run.step_results_json;
      const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      if (Array.isArray(arr)) toolCallsCount = arr.length;
    } catch {
      toolCallsCount = 0;
    }
  }
  if (!Number.isFinite(toolCallsCount)) toolCallsCount = 0;

  let status = run.status != null ? String(run.status) : '';
  if (status === 'success') status = 'completed';

  const workspaceId =
    run.workspace_id != null && String(run.workspace_id).trim() !== ''
      ? String(run.workspace_id).trim()
      : '';

  return {
    id: String(run.id),
    d1_run_id: String(run.id),
    workflow_key: run.workflow_key ?? '',
    display_name: run.display_name ?? run.workflow_key ?? 'Workflow run',
    tenant_id: run.tenant_id ?? '',
    workspace_id: workspaceId,
    workflow_id: run.workflow_id ?? null,
    trigger_type: run.trigger_type || 'agent',
    status: status || 'unknown',
    session_id: run.session_id ?? null,
    conversation_id: run.conversation_id ?? null,
    user_id: run.user_id ?? null,
    run_group_id: run.run_group_id ?? null,
    mode: run.mode ?? null,
    provider: run.provider ?? null,
    model_key: run.model_key ?? run.model_used ?? null,
    input_json: run.input_json,
    output_json: run.output_json,
    step_results_json: run.step_results_json,
    steps_completed: run.steps_completed ?? 0,
    steps_total: run.steps_total ?? toolCallsCount,
    error_message: run.error_message ?? null,
    model_used: run.model_used ?? run.model_key ?? null,
    input_tokens: run.input_tokens != null ? Number(run.input_tokens) : 0,
    output_tokens: run.output_tokens != null ? Number(run.output_tokens) : 0,
    total_tokens:
      (run.input_tokens != null ? Number(run.input_tokens) : 0) +
      (run.output_tokens != null ? Number(run.output_tokens) : 0),
    cost_usd: run.cost_usd != null ? Number(run.cost_usd) : 0,
    duration_ms: run.duration_ms != null ? Number(run.duration_ms) : null,
    latency_ms: run.duration_ms != null ? Number(run.duration_ms) : null,
    environment: run.environment || 'production',
    started_at: secToIso(run.started_at),
    completed_at: secToIso(run.completed_at),
    metadata: {
      sync_source: 'agentsam-supabase-sync.js',
      tool_calls_count: toolCallsCount,
    },
  };
}

/**
 * Non-fatal Hyperdrive upsert for a D1 workflow run row.
 * @param {any} env
 * @param {Record<string, unknown>} run
 */
export async function syncWorkflowRunToSupabase(env, run) {
  const db = env?.DB;
  if (!run?.id || !db || !isHyperdriveUsable(env)) return;

  const payload = mapRunToHyperdrivePayload(env, run);
  if (!payload.workspace_id) {
    await patchD1WorkflowRunSupabaseMirrorState(env, run.id, {
      ok: false,
      error: 'workspace_id_required',
    });
    return;
  }

  try {
    const terminal = ['completed', 'failed', 'cancelled'].includes(String(payload.status));
    const hd = terminal
      ? await updateWorkflowRun(env, payload.id, payload)
      : await createWorkflowRun(env, payload);

    if (!hd?.ok) {
      await patchD1WorkflowRunSupabaseMirrorState(env, run.id, {
        ok: false,
        error: hd?.error || 'hyperdrive_sync_failed',
      });
      return;
    }

    const supabaseRunId = hd.rows?.[0]?.id != null ? String(hd.rows[0].id) : payload.id;
    await patchD1WorkflowRunSupabaseMirrorState(env, run.id, { ok: true, supabaseRunId });
  } catch (e) {
    await patchD1WorkflowRunSupabaseMirrorState(env, run.id, {
      ok: false,
      error: e?.message != null ? String(e.message) : String(e),
    });
  }
}

/**
 * Fire-and-forget workflow run mirror after D1 finalize.
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} run
 */
export function scheduleSyncWorkflowRunToSupabase(env, ctx, run) {
  const p = syncWorkflowRunToSupabase(env, run).catch((e) => {
    console.warn('[scheduleSyncWorkflowRunToSupabase]', e?.message ?? e);
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  else void p;
}

export async function markWorkflowRunSupabaseSynced(env, d1RunId, supabaseRunId) {
  const db = env?.DB;
  if (!db) throw new Error('markWorkflowRunSupabaseSynced: DB not configured');
  const sid = String(supabaseRunId ?? '').trim();
  let result;
  if (sid) {
    result = await db
      .prepare(
        `UPDATE ${AGENTSAM_WORKFLOW_RUNS_TABLE}
         SET supabase_run_id = ?,
             supabase_sync_status = 'synced',
             supabase_synced_at = datetime('now'),
             supabase_sync_error = NULL,
             supabase_sync_attempts = COALESCE(supabase_sync_attempts, 0) + 1
         WHERE id = ?`,
      )
      .bind(sid, d1RunId)
      .run();
  } else {
    result = await db
      .prepare(
        `UPDATE ${AGENTSAM_WORKFLOW_RUNS_TABLE}
         SET supabase_sync_status = 'synced',
             supabase_synced_at = datetime('now'),
             supabase_sync_error = NULL,
             supabase_sync_attempts = COALESCE(supabase_sync_attempts, 0) + 1
         WHERE id = ?`,
      )
      .bind(d1RunId)
      .run();
  }
  assertD1Write(result, 'markWorkflowRunSupabaseSynced');
}

export async function markWorkflowRunSupabaseFailed(env, d1RunId, error) {
  const db = env?.DB;
  if (!db) throw new Error('markWorkflowRunSupabaseFailed: DB not configured');
  const msg = String(error || 'unknown error').slice(0, 8000);
  const result = await db
    .prepare(
      `UPDATE ${AGENTSAM_WORKFLOW_RUNS_TABLE}
       SET supabase_sync_status = 'failed',
           supabase_sync_error = ?,
           supabase_sync_attempts = COALESCE(supabase_sync_attempts, 0) + 1
       WHERE id = ?`,
    )
    .bind(msg, d1RunId)
    .run();
  assertD1Write(result, 'markWorkflowRunSupabaseFailed');
}
