/**
 * agentsam-workflow-debug-store.js
 * Backend-only Hyperdrive/Postgres persistence for Agent Sam workflow debug tracing.
 *
 * Worker → env.HYPERDRIVE.connectionString → Supabase Postgres
 * Use this instead of Supabase REST for all workflow/debug writes.
 *
 * Tables (Supabase public schema):
 *   agentsam_workflow_runs
 *   agentsam_workflow_steps
 *   agentsam_workflow_events
 *   agentsam_debug_snapshots
 */
import {
  runHyperdriveQuery,
  runHyperdriveTransaction,
  isHyperdriveUsable,
} from './hyperdrive-query.js';

function nowIso() { return new Date().toISOString(); }

function textId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function j(value, fallback) { return JSON.stringify(value ?? fallback); }

export function canUseSupabaseWorkflowDebug(env) { return isHyperdriveUsable(env); }

// ── Workflow Runs ────────────────────────────────────────────────────────────

export async function createWorkflowRun(env, payload = {}) {
  const id = payload.id || payload.d1_run_id || textId('run');
  const sql = `
    INSERT INTO public.agentsam_workflow_runs (
      id, d1_run_id, tenant_id, workspace_id, workflow_id, workflow_key,
      display_name, trigger_type, status, session_id, conversation_id, user_id,
      run_group_id, mode, provider, model_key,
      input_json, output_json, step_results_json,
      steps_completed, steps_total, error_message, model_used,
      input_tokens, output_tokens, total_tokens, cost_usd, estimated_cost_usd,
      duration_ms, latency_ms, environment, metadata, started_at, completed_at,
      supabase_sync_status, supabase_synced_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17::jsonb,$18::jsonb,$19::jsonb,
      $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32::jsonb,
      $33,$34,'synced',now()
    )
    ON CONFLICT (id) DO UPDATE SET
      status            = EXCLUDED.status,
      workflow_key      = COALESCE(EXCLUDED.workflow_key,      public.agentsam_workflow_runs.workflow_key),
      display_name      = COALESCE(EXCLUDED.display_name,      public.agentsam_workflow_runs.display_name),
      input_json        = COALESCE(EXCLUDED.input_json,        public.agentsam_workflow_runs.input_json),
      metadata          = public.agentsam_workflow_runs.metadata || EXCLUDED.metadata,
      updated_at        = now(),
      supabase_synced_at = now()
    RETURNING *;`;

  return runHyperdriveQuery(env, sql, [
    id, payload.d1_run_id || id,
    payload.tenant_id || env?.TENANT_ID || '',
    payload.workspace_id || (() => { throw new Error('[workflow-debug-store] workspace_id is required'); })(),
    payload.workflow_id  || null,
    payload.workflow_key || 'agent_chat_tool_session',
    payload.display_name || 'Agent Chat Tool Session',
    payload.trigger_type || 'agent',
    payload.status       || 'running',
    payload.session_id        || null,
    payload.conversation_id   || null,
    payload.user_id           || null,
    payload.run_group_id      || null,
    payload.mode              || null,
    payload.provider          || null,
    payload.model_key         || null,
    j(payload.input_json,       {}),
    j(payload.output_json,      {}),
    j(payload.step_results_json,[]),
    Number(payload.steps_completed  || 0),
    Number(payload.steps_total      || 0),
    payload.error_message           || null,
    payload.model_used || payload.model_key || null,
    Number(payload.input_tokens     || 0),
    Number(payload.output_tokens    || 0),
    Number(payload.total_tokens     || 0),
    Number(payload.cost_usd         || 0),
    Number(payload.estimated_cost_usd || 0),
    payload.duration_ms == null ? null : Number(payload.duration_ms),
    payload.latency_ms  == null ? null : Number(payload.latency_ms),
    payload.environment || 'production',
    j(payload.metadata, {}),
    payload.started_at  || nowIso(),
    payload.completed_at || null,
  ]);
}

export async function updateWorkflowRun(env, runId, patch = {}) {
  if (!runId) return { ok: false, rows: [], error: 'missing_run_id' };
  const sql = `
    UPDATE public.agentsam_workflow_runs SET
      status            = COALESCE($2,         status),
      output_json       = COALESCE($3::jsonb,  output_json),
      step_results_json = COALESCE($4::jsonb,  step_results_json),
      steps_completed   = COALESCE($5,         steps_completed),
      steps_total       = COALESCE($6,         steps_total),
      error_message     = COALESCE($7,         error_message),
      input_tokens      = COALESCE($8,         input_tokens),
      output_tokens     = COALESCE($9,         output_tokens),
      total_tokens      = COALESCE($10,        total_tokens),
      cost_usd          = COALESCE($11,        cost_usd),
      duration_ms       = COALESCE($12,        duration_ms),
      completed_at      = COALESCE($13,        completed_at),
      metadata          = metadata || COALESCE($14::jsonb, '{}'::jsonb),
      updated_at        = now(),
      supabase_synced_at = now()
    WHERE id = $1 OR d1_run_id = $1
    RETURNING *;`;

  return runHyperdriveQuery(env, sql, [
    runId,
    patch.status       || null,
    patch.output_json       === undefined ? null : j(patch.output_json, {}),
    patch.step_results_json === undefined ? null : j(patch.step_results_json, []),
    patch.steps_completed == null ? null : Number(patch.steps_completed),
    patch.steps_total     == null ? null : Number(patch.steps_total),
    patch.error_message   || null,
    patch.input_tokens    == null ? null : Number(patch.input_tokens),
    patch.output_tokens   == null ? null : Number(patch.output_tokens),
    patch.total_tokens    == null ? null : Number(patch.total_tokens),
    patch.cost_usd        == null ? null : Number(patch.cost_usd),
    patch.duration_ms     == null ? null : Number(patch.duration_ms),
    patch.completed_at    || null,
    patch.metadata        === undefined ? null : j(patch.metadata, {}),
  ]);
}

// ── Steps ────────────────────────────────────────────────────────────────────

export async function appendWorkflowStep(env, payload = {}) {
  const sql = `
    INSERT INTO public.agentsam_workflow_steps (
      id, run_id, tenant_id, workspace_id,
      step_index, step_key, step_type, status,
      tool_key, command_key, provider, model_key,
      input_json, output_json, error_message,
      started_at, completed_at, latency_ms, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19::jsonb)
    RETURNING *;`;

  return runHyperdriveQuery(env, sql, [
    payload.id          || textId('wfs'),
    payload.run_id,
    payload.tenant_id || env?.TENANT_ID || '',
    payload.workspace_id || (() => { throw new Error('[workflow-debug-store] workspace_id is required'); })(),
    Number(payload.step_index || 0),
    payload.step_key    || null,
    payload.step_type   || 'tool_call',
    payload.status      || 'completed',
    payload.tool_key    || null,
    payload.command_key || null,
    payload.provider    || null,
    payload.model_key   || null,
    j(payload.input_json,  {}),
    j(payload.output_json, {}),
    payload.error_message || null,
    payload.started_at    || nowIso(),
    payload.completed_at  || null,
    payload.latency_ms == null ? null : Number(payload.latency_ms),
    j(payload.metadata, {}),
  ]);
}

// ── Events (batch via transaction) ──────────────────────────────────────────

export async function appendWorkflowEvent(env, payload = {}) {
  return appendWorkflowEvents(env, [payload]);
}

export async function appendWorkflowEvents(env, events = []) {
  const clean = events.filter(Boolean);
  if (!clean.length) return { ok: true, rows: [] };

  return runHyperdriveTransaction(env, async (client) => {
    const rows = [];
    for (const ev of clean) {
      const r = await client.query(`
        INSERT INTO public.agentsam_workflow_events (
          id, run_id, step_id, tenant_id, workspace_id,
          event_type, event_level, message, payload_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        RETURNING *;`,
        [
          ev.id           || textId('wfe'),
          ev.run_id       || null,
          ev.step_id      || null,
          ev.tenant_id    || (() => { throw new Error('[workflow-debug-store] tenant_id is required'); })(),
          ev.workspace_id || (() => { throw new Error('[workflow-debug-store] workspace_id is required'); })(),
          ev.event_type   || 'workflow_event',
          ev.event_level  || 'info',
          ev.message      || null,
          j(ev.payload_json, {}),
        ],
      );
      rows.push(...(r.rows || []));
    }
    return { rows };
  });
}

// ── Debug Snapshots ──────────────────────────────────────────────────────────

export async function captureDebugSnapshot(env, payload = {}) {
  const sql = `
    INSERT INTO public.agentsam_debug_snapshots (
      id, tenant_id, workspace_id, run_id, snapshot_key, source, status,
      request_json, response_json, environment_json, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)
    RETURNING *;`;

  return runHyperdriveQuery(env, sql, [
    payload.id           || textId('dbg'),
    payload.tenant_id || env?.TENANT_ID || '',
    payload.workspace_id || (() => { throw new Error('[workflow-debug-store] workspace_id is required'); })(),
    payload.run_id       || null,
    payload.snapshot_key || 'agent_debug_snapshot',
    payload.source       || 'agent_sam',
    payload.status       || 'captured',
    j(payload.request_json,     {}),
    j(payload.response_json,    {}),
    j(payload.environment_json, {}),
    payload.notes || null,
  ]);
}

// ── Read helpers ─────────────────────────────────────────────────────────────

export async function getWorkflowDebugTrace(env, runId) {
  if (!runId) return { ok: false, rows: [], error: 'missing_run_id' };

  return runHyperdriveTransaction(env, async (client) => {
    const run = await client.query(
      `SELECT * FROM public.agentsam_workflow_runs WHERE id=$1 OR d1_run_id=$1 LIMIT 1`,
      [runId],
    );
    const actualId = run.rows?.[0]?.id || runId;

    const [steps, events, snapshots] = await Promise.all([
      client.query(`SELECT * FROM public.agentsam_workflow_steps  WHERE run_id=$1 ORDER BY step_index ASC, created_at ASC`, [actualId]),
      client.query(`SELECT * FROM public.agentsam_workflow_events WHERE run_id=$1 ORDER BY created_at ASC`,                 [actualId]),
      client.query(`SELECT * FROM public.agentsam_debug_snapshots WHERE run_id=$1 ORDER BY created_at DESC`,               [actualId]),
    ]);

    return {
      rows: run.rows || [],
      trace: {
        run:       run.rows?.[0] || null,
        steps:     steps.rows     || [],
        events:    events.rows    || [],
        snapshots: snapshots.rows || [],
      },
    };
  });
}

export async function getRecentWorkflowRuns(env, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);
  const wsId  = options.workspace_id || null;

  const sql = wsId
    ? `SELECT * FROM public.agentsam_workflow_runs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`
    : `SELECT * FROM public.agentsam_workflow_runs ORDER BY created_at DESC LIMIT $1`;

  return runHyperdriveQuery(env, sql, wsId ? [wsId, limit] : [limit]);
}
