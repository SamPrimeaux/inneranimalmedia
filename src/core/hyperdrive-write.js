/**
 * Non-fatal Hyperdrive INSERT helpers for agentsam.* mirror tables.
 * D1 remains source of truth; Supabase writes are additive only.
 */
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';

function isoNow() {
  return new Date().toISOString();
}

function isoFromUnix(v) {
  if (v == null || v === '') return isoNow();
  const n = Number(v);
  if (!Number.isFinite(n)) return isoNow();
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

/**
 * @param {any} env
 * @param {string} table — unqualified table name (agentsam schema)
 * @param {string[]} fields
 * @param {unknown[]} values
 * @param {{ onConflict?: string|null, skipOnConflict?: boolean }} [opts]
 */
export async function hyperdriveInsert(env, table, fields, values, opts = {}) {
  if (!isHyperdriveUsable(env)) return { ok: false, skipped: true, reason: 'hyperdrive_unavailable' };
  const t = String(table || '').trim();
  if (!t || !fields?.length || fields.length !== values.length) {
    return { ok: false, skipped: true, reason: 'invalid_insert_args' };
  }
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const skipOnConflict = opts.skipOnConflict === true || opts.onConflict === null;
  const onConflictClause = skipOnConflict
    ? ''
    : ` ON CONFLICT ${opts.onConflict != null ? String(opts.onConflict) : 'DO NOTHING'}`;
  const sql = `INSERT INTO agentsam.${t} (${fields.join(', ')})
               VALUES (${placeholders})${onConflictClause}`;
  const out = await runHyperdriveQuery(env, sql, values);
  if (!out.ok) {
    console.error(`[hyperdrive-write] ${t}:`, out.error);
  }
  return out;
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {string} table
 * @param {string[]} fields
 * @param {unknown[]} values
 * @param {{ onConflict?: string }} [opts]
 */
export function scheduleHyperdriveInsert(env, ctx, table, fields, values, opts = {}) {
  const p = hyperdriveInsert(env, table, fields, values, opts).catch((e) => {
    console.error(`[hyperdrive-write] ${table}:`, e?.message ?? e);
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  else void p;
}

/**
 * Real-time mirror of one D1 agentsam_usage_events row (or equivalent params).
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} params
 */
export function scheduleMirrorUsageEventToSupabase(env, ctx, params) {
  const workspaceId = params.workspace_id != null ? String(params.workspace_id).trim() : '';
  if (!workspaceId) return;

  const tokensIn = Math.floor(Number(params.tokens_in ?? params.input_tokens) || 0);
  const tokensOut = Math.floor(Number(params.tokens_out ?? params.output_tokens) || 0);
  const modelKey =
    params.model_key != null && String(params.model_key).trim() !== ''
      ? String(params.model_key).trim()
      : params.model != null
        ? String(params.model).trim()
        : 'unknown';
  const d1Id =
    params.d1_id != null && String(params.d1_id).trim() !== ''
      ? String(params.d1_id).trim()
      : `ue_mirror_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  const metadata = JSON.stringify({
    event_type: params.event_type ?? null,
    ref_table: params.ref_table ?? null,
    ref_id: params.ref_id ?? null,
    model_key: modelKey,
    input_tokens: tokensIn,
    output_tokens: tokensOut,
    sync_source: 'usage-event-writer',
  });

  scheduleHyperdriveInsert(
    env,
    ctx,
    'agentsam_usage_events',
    [
      'd1_id',
      'tenant_id',
      'workspace_id',
      'user_id',
      'session_id',
      'agent_name',
      'provider',
      'model',
      'workflow_key',
      'tokens_in',
      'tokens_out',
      'cost_usd',
      'status',
      'tool_name',
      'metadata_json',
      'created_at',
    ],
    [
      d1Id,
      params.tenant_id != null ? String(params.tenant_id) : 'system',
      workspaceId,
      params.user_id != null ? String(params.user_id) : null,
      params.session_id != null ? String(params.session_id) : null,
      'agent-sam',
      params.provider != null ? String(params.provider) : 'unknown',
      params.model != null ? String(params.model) : modelKey,
      null,
      tokensIn,
      tokensOut,
      Number(params.cost_usd) || 0,
      params.status != null ? String(params.status) : 'ok',
      params.tool_name != null ? String(params.tool_name) : null,
      metadata,
      isoFromUnix(params.created_at),
    ],
    { skipOnConflict: true },
  );
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} params
 */
export function scheduleMirrorToolCallEventToSupabase(env, ctx, params) {
  const workspaceId = params.workspace_id != null ? String(params.workspace_id).trim() : '';
  if (!workspaceId) return;

  const toolKey =
    params.tool_key != null && String(params.tool_key).trim() !== ''
      ? String(params.tool_key).trim()
      : params.tool_name != null
        ? String(params.tool_name).trim()
        : 'unknown';
  const statusRaw = String(params.status || (params.success === false ? 'failed' : 'completed')).toLowerCase();
  const status =
    statusRaw === 'success' || statusRaw === 'ok' || statusRaw === 'completed'
      ? 'completed'
      : statusRaw === 'error' || statusRaw === 'failed'
        ? 'failed'
        : statusRaw;

  const id =
    params.id != null && String(params.id).trim() !== ''
      ? String(params.id).trim()
      : `tce_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  scheduleHyperdriveInsert(
    env,
    ctx,
    'agentsam_tool_call_events',
    [
      'id',
      'workspace_id',
      'run_id',
      'tool_key',
      'tool_category',
      'status',
      'input_tokens',
      'output_tokens',
      'cost_usd',
      'duration_ms',
      'created_at',
    ],
    [
      id,
      workspaceId,
      params.run_id != null ? String(params.run_id) : null,
      toolKey,
      params.tool_category != null ? String(params.tool_category) : null,
      status,
      Math.floor(Number(params.input_tokens) || 0),
      Math.floor(Number(params.output_tokens) || 0),
      Number(params.cost_usd) || 0,
      params.duration_ms != null ? Math.floor(Number(params.duration_ms) || 0) : null,
      isoFromUnix(params.created_at),
    ],
    { onConflict: '(id) DO NOTHING' },
  );
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} params
 */
export function scheduleMirrorDeployEventToSupabase(env, ctx, params) {
  const workspaceId = params.workspace_id != null ? String(params.workspace_id).trim() : '';
  const workerName = params.worker_name != null ? String(params.worker_name).trim() : '';
  if (!workspaceId || !workerName) return;

  const metadata =
    params.metadata != null && typeof params.metadata === 'object'
      ? JSON.stringify(params.metadata)
      : params.metadata_json != null
        ? String(params.metadata_json)
        : JSON.stringify({ sync_source: params.sync_source || 'post-deploy' });

  scheduleHyperdriveInsert(
    env,
    ctx,
    'agentsam_deploy_events',
    [
      'workspace_id',
      'worker_name',
      'worker_version',
      'deploy_status',
      'commit_sha',
      'notes',
      'metadata',
      'created_at',
    ],
    [
      workspaceId,
      workerName,
      params.worker_version != null ? String(params.worker_version) : null,
      params.deploy_status != null ? String(params.deploy_status) : 'passed',
      params.commit_sha != null ? String(params.commit_sha) : null,
      params.notes != null ? String(params.notes).slice(0, 500) : null,
      metadata,
      isoFromUnix(params.created_at),
    ],
    { onConflict: 'DO NOTHING' },
  );
}
