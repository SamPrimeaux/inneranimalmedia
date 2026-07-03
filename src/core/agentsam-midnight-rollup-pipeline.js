/**
 * Midnight rollup pipeline — D1 rollups + batch Supabase sync via Hyperdrive (SQL only, no LLM).
 * D1 remains source of truth; Supabase writes are additive and non-fatal.
 */

import { rollupAgentsamUsageDaily } from './retention.js';
import { isHyperdriveUsable, runHyperdriveTransaction } from './hyperdrive-query.js';
import { pragmaTableInfo } from './retention.js';

const USAGE_SYNC_DAYS = 2;
const DEPLOY_SYNC_DAYS = 1;
const MAX_USAGE_ROWS_PER_RUN = 8000;

/**
 * @param {number | null | undefined} unixSec
 */
function isoFromUnixSec(unixSec) {
  if (unixSec == null || unixSec === '') return new Date().toISOString();
  const n = Number(unixSec);
  if (!Number.isFinite(n)) return new Date().toISOString();
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

/**
 * Step 1 — D1 daily rollup into agentsam_usage_rollups_daily (yesterday UTC).
 * @param {any} env
 */
export async function runD1UsageRollupDaily(env) {
  return rollupAgentsamUsageDaily(env);
}

/**
 * Step 2 — One Hyperdrive INSERT…SELECT from JSON batch (last N days of D1 usage_events).
 * Dedup: skip rows whose d1_id already exists in agentsam.agentsam_usage_events.
 * @param {any} env
 */
export async function syncUsageEventsBatchToSupabase(env) {
  if (!isHyperdriveUsable(env)) {
    return { ok: false, skipped: true, reason: 'hyperdrive_unavailable' };
  }
  if (!env?.DB) {
    return { ok: false, skipped: true, reason: 'no_db' };
  }

  const cols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
  if (!cols.has('created_at')) {
    return { ok: false, skipped: true, reason: 'usage_events_no_created_at' };
  }

  const selectCols = [
    'id',
    cols.has('tenant_id') && 'tenant_id',
    cols.has('workspace_id') && 'workspace_id',
    cols.has('user_id') && 'user_id',
    cols.has('session_id') && 'session_id',
    cols.has('agent_name') && 'agent_name',
    cols.has('provider') && 'provider',
    cols.has('model') && 'model',
    cols.has('model_key') && 'model_key',
    cols.has('tokens_in') && 'tokens_in',
    cols.has('tokens_out') && 'tokens_out',
    cols.has('cost_usd') && 'cost_usd',
    cols.has('status') && 'status',
    cols.has('tool_name') && 'tool_name',
    cols.has('event_type') && 'event_type',
    cols.has('ref_table') && 'ref_table',
    cols.has('ref_id') && 'ref_id',
    'created_at',
  ].filter(Boolean);

  const { results } = await env.DB.prepare(
    `SELECT ${selectCols.join(', ')}
     FROM agentsam_usage_events
     WHERE created_at >= unixepoch('now', '-${USAGE_SYNC_DAYS} days')
     ORDER BY created_at ASC
     LIMIT ${MAX_USAGE_ROWS_PER_RUN}`,
  ).all();

  const rowsRead = (results || []).length;
  if (!rowsRead) {
    return { ok: true, rowsRead: 0, rowsInserted: 0, skipped: true, reason: 'no_usage_rows' };
  }

  const payload = (results || []).map((r) => {
    const modelKey =
      r.model_key != null && String(r.model_key).trim() !== ''
        ? String(r.model_key).trim()
        : r.model != null
          ? String(r.model).trim()
          : 'unknown';
    return {
      d1_id: String(r.id),
      tenant_id: r.tenant_id != null ? String(r.tenant_id) : 'system',
      workspace_id: r.workspace_id != null ? String(r.workspace_id) : 'system',
      user_id: r.user_id != null ? String(r.user_id) : null,
      session_id: r.session_id != null ? String(r.session_id) : null,
      agent_name: r.agent_name != null ? String(r.agent_name) : 'agent-sam',
      provider: r.provider != null ? String(r.provider) : 'unknown',
      model: r.model != null ? String(r.model) : modelKey,
      workflow_key: null,
      tokens_in: Math.floor(Number(r.tokens_in) || 0),
      tokens_out: Math.floor(Number(r.tokens_out) || 0),
      cost_usd: Number(r.cost_usd) || 0,
      status: r.status != null ? String(r.status) : 'ok',
      tool_name: r.tool_name != null ? String(r.tool_name) : null,
      metadata_json: JSON.stringify({
        event_type: r.event_type ?? null,
        ref_table: r.ref_table ?? null,
        ref_id: r.ref_id ?? null,
        model_key: modelKey,
        sync_source: 'rollup_usage_events_daily',
      }),
      created_at: isoFromUnixSec(r.created_at),
    };
  });

  const sql = `
    INSERT INTO agentsam.agentsam_usage_events (
      d1_id,
      tenant_id,
      workspace_id,
      user_id,
      session_id,
      agent_name,
      provider,
      model,
      workflow_key,
      tokens_in,
      tokens_out,
      cost_usd,
      status,
      tool_name,
      metadata_json,
      created_at
    )
    SELECT
      r.d1_id,
      r.tenant_id,
      r.workspace_id,
      r.user_id,
      r.session_id,
      r.agent_name,
      r.provider,
      r.model,
      r.workflow_key,
      r.tokens_in,
      r.tokens_out,
      r.cost_usd,
      r.status,
      r.tool_name,
      r.metadata_json::jsonb,
      r.created_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS r(
      d1_id text,
      tenant_id text,
      workspace_id text,
      user_id text,
      session_id text,
      agent_name text,
      provider text,
      model text,
      workflow_key text,
      tokens_in integer,
      tokens_out integer,
      cost_usd numeric,
      status text,
      tool_name text,
      metadata_json text,
      created_at text
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM agentsam.agentsam_usage_events e WHERE e.d1_id = r.d1_id
    )
  `;

  const hd = await runHyperdriveTransaction(env, async (client) => client.query(sql, [JSON.stringify(payload)]));
  if (!hd.ok) {
    console.warn('[syncUsageEventsBatchToSupabase]', hd.error);
    return { ok: false, rowsRead, rowsInserted: 0, error: hd.error };
  }

  const rowsInserted = Number(hd.result?.rowCount ?? 0) || 0;
  return { ok: true, rowsRead, rowsInserted };
}

/**
 * Step 3 — Batch sync recent D1 cicd_events → agentsam.agentsam_deploy_events (Hyperdrive).
 * @param {any} env
 */
export async function syncCicdDeployEventsBatchToSupabase(env) {
  if (!isHyperdriveUsable(env)) {
    return { ok: false, skipped: true, reason: 'hyperdrive_unavailable' };
  }
  if (!env?.DB) {
    return { ok: false, skipped: true, reason: 'no_db' };
  }

  const cicdCols = await pragmaTableInfo(env.DB, 'cicd_events');
  if (!cicdCols.has('created_at')) {
    return { ok: false, skipped: true, reason: 'cicd_events_missing' };
  }

  const { results } = await env.DB.prepare(
    `SELECT id, source, event_type, git_commit_sha, worker_name, raw_payload_json, created_at
     FROM cicd_events
     WHERE created_at >= unixepoch('now', '-${DEPLOY_SYNC_DAYS} days')
     ORDER BY created_at ASC
     LIMIT 500`,
  ).all();

  const rowsRead = (results || []).length;
  if (!rowsRead) {
    return { ok: true, rowsRead: 0, rowsInserted: 0, skipped: true, reason: 'no_cicd_rows' };
  }

  const payload = (results || []).map((r) => {
    let payloadJson = {};
    try {
      payloadJson =
        typeof r.raw_payload_json === 'string'
          ? JSON.parse(r.raw_payload_json || '{}')
          : r.raw_payload_json && typeof r.raw_payload_json === 'object'
            ? r.raw_payload_json
            : {};
    } catch {
      payloadJson = {};
    }
    const workerVersion =
      payloadJson.worker_version_id != null
        ? String(payloadJson.worker_version_id)
        : payloadJson.version != null
          ? String(payloadJson.version)
          : null;
    const deployStatus =
      String(r.event_type || '').includes('fail') || String(r.event_type || '').includes('error')
        ? 'failed'
        : 'success';
    return {
      d1_cicd_id: String(r.id),
      worker_name: r.worker_name != null ? String(r.worker_name) : 'inneranimalmedia',
      worker_version: workerVersion,
      deploy_status: deployStatus,
      commit_sha: r.git_commit_sha != null ? String(r.git_commit_sha) : null,
      notes: `${r.source || 'cicd'}:${r.event_type || 'event'}`.slice(0, 500),
      metadata_json: JSON.stringify({
        d1_cicd_id: String(r.id),
        source: r.source ?? null,
        event_type: r.event_type ?? null,
        raw_payload: payloadJson,
        sync_source: 'rollup_usage_events_daily',
      }),
      created_at: isoFromUnixSec(r.created_at),
    };
  });

  const sql = `
    INSERT INTO agentsam.agentsam_deploy_events (
      worker_name,
      worker_version,
      deploy_status,
      commit_sha,
      notes,
      metadata,
      created_at
    )
    SELECT
      r.worker_name,
      r.worker_version,
      r.deploy_status,
      r.commit_sha,
      r.notes,
      r.metadata_json::jsonb,
      r.created_at::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS r(
      d1_cicd_id text,
      worker_name text,
      worker_version text,
      deploy_status text,
      commit_sha text,
      notes text,
      metadata_json text,
      created_at text
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM agentsam.agentsam_deploy_events d
      WHERE d.metadata->>'d1_cicd_id' = r.d1_cicd_id
    )
  `;

  const hd = await runHyperdriveTransaction(env, async (client) => client.query(sql, [JSON.stringify(payload)]));
  if (!hd.ok) {
    console.warn('[syncCicdDeployEventsBatchToSupabase]', hd.error);
    return { ok: false, rowsRead, rowsInserted: 0, error: hd.error };
  }

  const rowsInserted = Number(hd.result?.rowCount ?? 0) || 0;
  return { ok: true, rowsRead, rowsInserted };
}

/**
 * Full midnight rollup_usage_events_daily pipeline (3 SQL steps, no LLM).
 * @param {any} env
 */
export async function runMidnightUsageRollupPipeline(env) {
  const d1Rollup = await runD1UsageRollupDaily(env);
  const usageSync = await syncUsageEventsBatchToSupabase(env);
  const deploySync = await syncCicdDeployEventsBatchToSupabase(env);

  const rowsWritten =
    (Number(d1Rollup?.changes) || 0) +
    (Number(usageSync?.rowsInserted) || 0) +
    (Number(deploySync?.rowsInserted) || 0);
  const rowsRead =
    (Number(usageSync?.rowsRead) || 0) + (Number(deploySync?.rowsRead) || 0);

  return {
    ok: d1Rollup?.ok !== false && usageSync?.ok !== false && deploySync?.ok !== false,
    rowsRead,
    rowsWritten,
    metadata: {
      d1_rollup: d1Rollup,
      usage_sync: usageSync,
      deploy_sync: deploySync,
    },
  };
}
