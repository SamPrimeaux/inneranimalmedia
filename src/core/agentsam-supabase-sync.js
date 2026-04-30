/**
 * Strict, awaited Supabase sync for Agent Sam workflow runs (server-side only).
 * Schema: agentsam.workflow_runs via PostgREST (Accept-Profile / Content-Profile: agentsam).
 */

export const AGENTSAM_WORKFLOW_RUNS_TABLE = 'agentsam_workflow_runs';

const WORKFLOW_RUNS_PATH = '/rest/v1/workflow_runs';

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
