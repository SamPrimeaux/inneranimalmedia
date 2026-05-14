/**
 * Strict, awaited Supabase sync for Agent Sam workflow runs (server-side only).
 * Schema: agentsam.workflow_runs via PostgREST (Accept-Profile / Content-Profile: agentsam).
 */

export const AGENTSAM_WORKFLOW_RUNS_TABLE = 'agentsam_workflow_runs';

const WORKFLOW_RUNS_PATH = '/rest/v1/workflow_runs';

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

/** @param {string} text */
function parseSupabaseRpcWorkflowRunId(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j == null) return null;
    if (typeof j === 'string' && j) return j;
    if (typeof j === 'number' && Number.isFinite(j)) return String(j);
    if (typeof j === 'object' && !Array.isArray(j) && j.id != null) return String(j.id);
    if (Array.isArray(j) && j.length) {
      const x = j[0];
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object' && x.id != null) return String(x.id);
    }
  } catch {
    // non-JSON body (rare)
  }
  return null;
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

function supabaseRestBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) throw new Error('SUPABASE_URL is not configured');
  return String(raw).replace(/\/$/, '');
}

function supabaseServiceRole(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !String(key).trim()) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return String(key).trim();
}

function supabaseHeaders(env, extra = {}) {
  const key = supabaseServiceRole(env);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    'Accept-Profile': 'agentsam',
    'Content-Profile': 'agentsam',
    ...extra,
  };
}

/**
 * Insert a row in agentsam.workflow_runs. Returns the created row (must include id).
 * @param {any} env
 * @param {Record<string, unknown>} runPayload
 */
export async function createSupabaseWorkflowRun(env, runPayload) {
  const base = supabaseRestBase(env);
  const res = await fetch(`${base}${WORKFLOW_RUNS_PATH}`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(runPayload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase workflow_runs insert failed HTTP ${res.status}: ${text.slice(0, 4000)}`);
  }
  let json;
  try {
    json = text ? JSON.parse(text) : [];
  } catch (e) {
    throw new Error(`Supabase insert: invalid JSON: ${String(e?.message || e)}`);
  }
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || row.id == null || String(row.id).trim() === '') {
    throw new Error('Supabase insert returned no id');
  }
  return row;
}

/**
 * PATCH agentsam.workflow_runs by primary key id.
 * @param {any} env
 * @param {string} supabaseRunId
 * @param {Record<string, unknown>} patch
 */
export async function updateSupabaseWorkflowRun(env, supabaseRunId, patch) {
  const id = String(supabaseRunId || '').trim();
  if (!id) throw new Error('updateSupabaseWorkflowRun: supabaseRunId required');
  const base = supabaseRestBase(env);
  const url = `${base}${WORKFLOW_RUNS_PATH}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase workflow_runs PATCH failed HTTP ${res.status}: ${text.slice(0, 4000)}`);
  }
  if (res.status === 204) {
    return { ok: true, rows: [] };
  }
  let json;
  try {
    json = text ? JSON.parse(text) : [];
  } catch (e) {
    throw new Error(`Supabase PATCH: invalid JSON: ${String(e?.message || e)}`);
  }
  if (Array.isArray(json) && json.length === 0) {
    throw new Error('Supabase PATCH returned no updated rows');
  }
  return Array.isArray(json) ? json[0] : json;
}

/**
 * After a successful Supabase insert: store id + synced on D1.
 * @param {any} env
 * @param {string} d1RunId
 * @param {string} supabaseRunId
 */
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

/**
 * Record Supabase sync failure on the D1 run row.
 * @param {any} env
 * @param {string} d1RunId
 * @param {string} error
 */
const SUPABASE_RPC_FALLBACK_ORIGIN = null; // read from env.SUPABASE_URL at call time

function restOriginForRpc(env) {
  try {
    return supabaseRestBase(env);
  } catch {
    return SUPABASE_RPC_FALLBACK_ORIGIN.replace(/\/$/, '');
  }
}

/**
 * Fire-and-forget analytics sync to Supabase Postgres RPC (non-fatal; D1 remains source of truth).
 * @param {any} env
 * @param {Record<string, unknown>} run — D1 agentsam_workflow_runs row or compatible object
 */
export async function syncWorkflowRunToSupabase(env, run) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  const db = env?.DB;
  if (!key || !run?.id || !db) return;
  const secToIso = (t) => {
    if (t == null || t === '') return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  };
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

  try {
    const supabaseRow = await createSupabaseWorkflowRun(env, {
      d1_workflow_id: run.id,
      workflow_key: run.workflow_key ?? '',
      display_name: run.display_name ?? '',
      tenant_id: run.tenant_id ?? '',
      workspace_id:
        run.workspace_id ||
        (env.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : ''),
      status: status || 'unknown',
      started_at: secToIso(run.started_at),
      completed_at: secToIso(run.completed_at),
      duration_ms: run.duration_ms != null ? Number(run.duration_ms) : null,
      cost_usd: run.cost_usd != null ? Number(run.cost_usd) : 0,
      input_tokens: run.input_tokens != null ? Number(run.input_tokens) : 0,
      output_tokens: run.output_tokens != null ? Number(run.output_tokens) : 0,
      tool_calls_count: toolCallsCount,
      error_message: run.error_message ?? null,
      model_id: run.model_used ?? run.model_id ?? null,
    });

    const supabaseRunId = supabaseRow?.id != null ? String(supabaseRow.id) : null;
    await patchD1WorkflowRunSupabaseMirrorState(env, run.id, { ok: true, supabaseRunId });
  } catch (e) {
    await patchD1WorkflowRunSupabaseMirrorState(env, run.id, {
      ok: false,
      error: e?.message != null ? String(e.message) : String(e),
    });
  }
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
