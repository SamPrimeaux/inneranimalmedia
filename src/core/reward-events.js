/**
 * agentsam_reward_events — single-writer bandit updates.
 *
 * Contract: every mutation of agentsam_routing_arms success_alpha/beta (and
 * cost/latency/quality when applicable) for a rewardable signal MUST go
 * through applyRewardEvent. The event INSERT and arm UPDATE are one D1
 * batch — they commit together or neither does.
 *
 * Domain tables (image_generation_drafts, image_generation_feedback,
 * agentsam_tool_call_log) may still record facts; they must NOT independently
 * bump routing-arm bandit columns.
 */

/** @typedef {'user_thumbs_up'|'user_thumbs_down'|'user_star_rating'|'auto_success'|'auto_error'|'auto_latency'|'auto_cost_efficiency'} RewardSignalType */

/**
 * Pure delta math — no I/O.
 * @param {string} signalType
 * @param {number} signalValue
 * @returns {{ alphaDelta: number, betaDelta: number, quality?: number|null }}
 */
export function computeRewardDeltas(signalType, signalValue) {
  const t = String(signalType || '').trim();
  const v = Number(signalValue);
  switch (t) {
    case 'user_thumbs_up':
      return { alphaDelta: 1, betaDelta: 0, quality: 1 };
    case 'user_thumbs_down':
      return { alphaDelta: 0, betaDelta: 1, quality: 0 };
    case 'auto_success':
      return { alphaDelta: 1, betaDelta: 0, quality: null };
    case 'auto_error':
      return { alphaDelta: 0, betaDelta: 1, quality: null };
    case 'user_star_rating': {
      // Normalize 1..5 → roughly -1..1 bandit nudge
      const stars = Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3;
      if (stars >= 4) return { alphaDelta: 1, betaDelta: 0, quality: stars / 5 };
      if (stars <= 2) return { alphaDelta: 0, betaDelta: 1, quality: stars / 5 };
      return { alphaDelta: 0.25, betaDelta: 0.25, quality: stars / 5 };
    }
    case 'auto_latency':
    case 'auto_cost_efficiency':
      return { alphaDelta: 0, betaDelta: 0, quality: null };
    default:
      return { alphaDelta: 0, betaDelta: 0, quality: null };
  }
}

/**
 * Resolve routing arm id when caller only has model_key + workspace + task_type.
 * @param {unknown} env
 * @param {{ routing_arm_id?: string|null, model_key?: string|null, workspace_id: string, task_type: string }} p
 */
async function resolveArmId(env, p) {
  const explicit = p.routing_arm_id != null ? String(p.routing_arm_id).trim() : '';
  if (explicit) return explicit;
  const mk = p.model_key != null ? String(p.model_key).trim() : '';
  const ws = String(p.workspace_id || '').trim();
  const tt = String(p.task_type || '').trim();
  if (!mk || !ws || !tt || !env?.DB) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM agentsam_routing_arms
     WHERE model_key = ? AND workspace_id = ? AND task_type = ? AND is_paused = 0
     ORDER BY is_active DESC, updated_at DESC
     LIMIT 1`,
  )
    .bind(mk, ws, tt)
    .first();
  return row?.id != null ? String(row.id) : null;
}

/**
 * Single writer: INSERT reward event + UPDATE arm in one D1 batch.
 *
 * @param {unknown} env
 * @param {{
 *   tenant_id: string,
 *   workspace_id: string,
 *   task_type: string,
 *   signal_type: string,
 *   signal_value?: number,
 *   signal_source?: string,
 *   routing_arm_id?: string|null,
 *   model_key?: string|null,
 *   provider?: string|null,
 *   content_tier?: string|null,
 *   cost_usd?: number|null,
 *   latency_ms?: number|null,
 *   apply_cost?: boolean,
 *   apply_latency?: boolean,
 *   apply_execution?: boolean,
 *   agent_run_id?: string|null,
 *   tool_call_log_id?: string|null,
 *   reason?: string|null,
 *   metadata?: Record<string, unknown>|null,
 *   dedup_key?: string|null,
 * }} p
 */
export async function applyRewardEvent(env, p) {
  if (!env?.DB) throw new Error('Database not configured');
  const tenantId = String(p.tenant_id || '').trim();
  const workspaceId = String(p.workspace_id || '').trim();
  const taskType = String(p.task_type || '').trim();
  const signalType = String(p.signal_type || '').trim();
  if (!tenantId) throw new Error('tenant_id required');
  if (!workspaceId) throw new Error('workspace_id required');
  if (!taskType) throw new Error('task_type required');
  if (!signalType) throw new Error('signal_type required');

  const signalValue = Number.isFinite(Number(p.signal_value)) ? Number(p.signal_value) : 0;
  const { alphaDelta, betaDelta, quality } = computeRewardDeltas(signalType, signalValue);

  const armId = await resolveArmId(env, {
    routing_arm_id: p.routing_arm_id,
    model_key: p.model_key,
    workspace_id: workspaceId,
    task_type: taskType,
  });
  if (!armId) throw new Error('routing_arm_id_unresolved');

  const id = `re_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const nowUnix = Math.floor(Date.now() / 1000);
  const dedup =
    p.dedup_key != null && String(p.dedup_key).trim()
      ? String(p.dedup_key).trim().slice(0, 191)
      : null;
  const meta =
    p.metadata && typeof p.metadata === 'object' ? JSON.stringify(p.metadata) : '{}';

  const costRaw = Number(p.cost_usd);
  const applyCost =
    p.apply_cost === true ||
    (p.apply_cost !== false && Number.isFinite(costRaw) && costRaw >= 0 && signalType.startsWith('auto_'));
  const costUsd = applyCost && Number.isFinite(costRaw) && costRaw >= 0 ? costRaw : null;

  const latencyRaw = Number(p.latency_ms);
  const applyLatency =
    p.apply_latency === true ||
    (p.apply_latency !== false && Number.isFinite(latencyRaw) && latencyRaw >= 0 && signalType.startsWith('auto_'));
  const latencyMs =
    applyLatency && Number.isFinite(latencyRaw) && latencyRaw >= 0 ? Math.round(latencyRaw) : null;

  const applyExecution = p.apply_execution === true || signalType.startsWith('auto_');
  const applyQuality = quality != null && Number.isFinite(quality);

  const insertStmt = env.DB.prepare(
    `INSERT INTO agentsam_reward_events (
       id, tenant_id, workspace_id, task_type,
       agent_run_id, tool_call_log_id, routing_arm_id,
       model_key, provider, content_tier,
       signal_type, signal_source, signal_value,
       alpha_delta, beta_delta, cost_usd, latency_ms,
       reason, metadata_json, dedup_key, created_at_unix
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    tenantId,
    workspaceId,
    taskType,
    p.agent_run_id ?? null,
    p.tool_call_log_id ?? null,
    armId,
    p.model_key ?? null,
    p.provider ?? null,
    p.content_tier ?? null,
    signalType,
    String(p.signal_source || (signalType.startsWith('user_') ? 'user' : 'system')).slice(0, 32),
    signalValue,
    alphaDelta,
    betaDelta,
    costUsd,
    latencyMs,
    p.reason != null ? String(p.reason).slice(0, 500) : null,
    meta.slice(0, 4000),
    dedup,
    nowUnix,
  );

  // One arm UPDATE covering alpha/beta + optional cost/latency/quality/executions.
  const updateStmt = env.DB.prepare(
    `UPDATE agentsam_routing_arms SET
       success_alpha = success_alpha + ?,
       success_beta  = success_beta + ?,
       cost_mean = CASE
         WHEN ? IS NOT NULL THEN CAST((COALESCE(cost_mean, 0) * COALESCE(cost_n, 0) + ?) / (COALESCE(cost_n, 0) + 1) AS REAL)
         ELSE cost_mean
       END,
       cost_n = CASE WHEN ? IS NOT NULL THEN COALESCE(cost_n, 0) + 1 ELSE cost_n END,
       latency_mean = CASE
         WHEN ? IS NOT NULL THEN CAST((COALESCE(latency_mean, 0) * COALESCE(latency_n, 0) + ?) / (COALESCE(latency_n, 0) + 1) AS REAL)
         ELSE latency_mean
       END,
       latency_n = CASE WHEN ? IS NOT NULL THEN COALESCE(latency_n, 0) + 1 ELSE latency_n END,
       avg_quality_score = CASE
         WHEN ? IS NOT NULL THEN ((COALESCE(avg_quality_score, 0) * COALESCE(quality_n, 0)) + ?) / (COALESCE(quality_n, 0) + 1)
         ELSE avg_quality_score
       END,
       quality_n = CASE WHEN ? IS NOT NULL THEN COALESCE(quality_n, 0) + 1 ELSE quality_n END,
       total_executions = total_executions + ?,
       updated_at = unixepoch()
     WHERE id = ? AND is_paused = 0`,
  ).bind(
    alphaDelta,
    betaDelta,
    costUsd,
    costUsd ?? 0,
    costUsd,
    latencyMs,
    latencyMs ?? 0,
    latencyMs,
    applyQuality ? quality : null,
    applyQuality ? quality : 0,
    applyQuality ? quality : null,
    applyExecution ? 1 : 0,
    armId,
  );

  try {
    await env.DB.batch([insertStmt, updateStmt]);
    return {
      ok: true,
      id,
      routing_arm_id: armId,
      alpha_delta: alphaDelta,
      beta_delta: betaDelta,
      deduped: false,
    };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (dedup && /UNIQUE|constraint/i.test(msg)) {
      return { ok: true, id: null, routing_arm_id: armId, deduped: true };
    }
    throw e;
  }
}

/** @deprecated Use applyRewardEvent — insert-only creates a fifth parallel writer. */
export async function recordRewardEvent(env, p) {
  return applyRewardEvent(env, {
    ...p,
    apply_cost: false,
    apply_latency: false,
    apply_execution: false,
  });
}
