/**
 * Cursor / agent alignment snapshots — D1 workflow run + Supabase RPC mirror (+ optional agentsam_memory).
 * Establishes supabase_run_id on the D1 row via syncWorkflowRunToSupabase → patchD1WorkflowRunSupabaseMirrorState.
 */
import { syncWorkflowRunToSupabase } from './agentsam-supabase-sync.js';
import { upsertAgentsamMemory } from './memory.js';

export const ALIGNMENT_WORKFLOW_KEY = 'wf_cursor_alignment_snapshot';

async function resolveAlignmentWorkflowId(env) {
  if (!env?.DB) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT id
       FROM agentsam_workflows
       WHERE workflow_key = ?
         AND COALESCE(is_active, 1) = 1
       LIMIT 1`
    )
      .bind(ALIGNMENT_WORKFLOW_KEY)
      .first();

    return row?.id ? String(row.id) : null;
  } catch (e) {
    console.warn('[alignment-sync] resolveAlignmentWorkflowId failed:', e?.message ?? e);
    return null;
  }
}


/**
 * @param {any} env
 * @param {any} [ctx]
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   userId: string,
 *   sessionId?: string|null,
 *   todoId?: string|null,
 *   planTaskId?: string|null,
 *   planId?: string|null,
 *   summary?: string,
 *   filesChanged?: string[],
 *   memory?: boolean,
 * }} payload
 */
export async function recordAlignmentSnapshot(env, ctx, payload) {
  const tenantId = payload.tenantId != null ? String(payload.tenantId).trim() : '';
  const workspaceId = payload.workspaceId != null ? String(payload.workspaceId).trim() : '';
  const userId = payload.userId != null ? String(payload.userId).trim() : '';
  if (!env?.DB || !tenantId || !workspaceId || !userId) {
    return { ok: false, error: 'missing tenant_id, workspace_id, or user_id' };
  }

  const wfId = await resolveAlignmentWorkflowId(env);
  if (!wfId) return { ok: false, error: 'alignment_workflow_missing', workflow_key: ALIGNMENT_WORKFLOW_KEY };

  const runId = `wrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const startedSec = Math.floor(Date.now() / 1000);

  const summaryObj = {
    todo_id: payload.todoId ?? null,
    plan_task_id: payload.planTaskId ?? null,
    plan_id: payload.planId ?? null,
    summary: payload.summary != null ? String(payload.summary).slice(0, 8000) : '',
    files_changed: Array.isArray(payload.filesChanged) ? payload.filesChanged.map(String).slice(0, 200) : [],
    source: 'cursor_alignment',
  };
  const inputJson = JSON.stringify(summaryObj);
  const steps = [
    {
      tool_name: 'alignment_snapshot',
      ok: true,
      output_preview: JSON.stringify(summaryObj).slice(0, 4000),
    },
  ];
  const stepJson = JSON.stringify(steps);
  const outputJson = JSON.stringify({ alignment: true, workflow_run_id: runId });

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, display_name, tenant_id, workspace_id,
      user_id, session_id, trigger_type, status,
      input_json, output_json, step_results_json, steps_total, steps_completed,
      input_tokens, output_tokens, cost_usd, supabase_sync_status,
      model_used, started_at, completed_at, duration_ms,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, 'cursor', 'completed',
      ?, ?, ?, 1, 1,
      0, 0, 0, 'pending',
      NULL, ?, unixepoch(), 0,
      datetime('now'), datetime('now')
    )`,
    )
      .bind(
        runId,
        wfId,
        ALIGNMENT_WORKFLOW_KEY,
        'Cursor · alignment snapshot',
        tenantId,
        workspaceId,
        userId,
        payload.sessionId != null ? String(payload.sessionId) : null,
        inputJson,
        outputJson,
        stepJson,
        startedSec,
      )
      .run();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const runForSb = {
    id: runId,
    workflow_key: ALIGNMENT_WORKFLOW_KEY,
    display_name: 'Cursor · alignment snapshot',
    tenant_id: tenantId,
    workspace_id: workspaceId,
    status: 'completed',
    started_at: startedSec,
    completed_at: startedSec,
    duration_ms: 0,
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    error_message: null,
    step_results_json: stepJson,
  };

  const syncPromise = syncWorkflowRunToSupabase(env, runForSb);
  if (ctx?.waitUntil) ctx.waitUntil(syncPromise);
  else await syncPromise;

  let supabaseRunId = null;
  let syncStatus = null;
  try {
    const row = await env.DB.prepare(
      `SELECT supabase_run_id, supabase_sync_status FROM agentsam_workflow_runs WHERE id = ?`,
    )
      .bind(runId)
      .first();
    supabaseRunId = row?.supabase_run_id != null ? String(row.supabase_run_id) : null;
    syncStatus = row?.supabase_sync_status != null ? String(row.supabase_sync_status) : null;
  } catch (_) {}

  if (payload.memory !== false) {
    const memKey =
      payload.todoId != null && String(payload.todoId).trim()
        ? `alignment:${String(payload.todoId).trim()}`
        : `alignment:${runId.slice(-12)}`;
    await upsertAgentsamMemory(
      env,
      {
        tenantId,
        userId,
        workspaceId,
        memoryType: 'project',
        key: memKey,
        value: JSON.stringify({
          ...summaryObj,
          workflow_run_id: runId,
          supabase_run_id: supabaseRunId,
          supabase_sync_status: syncStatus,
        }),
        source: 'alignment_sync',
      },
      { ctx },
    );
  }

  return {
    ok: true,
    workflow_run_id: runId,
    supabase_run_id: supabaseRunId,
    supabase_sync_status: syncStatus,
  };
}
