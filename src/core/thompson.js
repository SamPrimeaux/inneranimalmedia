/**
 * Thompson/Beta bandit over agentsam_routing_arms + nightly updates from agentsam_execution_performance_metrics.
 */

import { isThompsonRoutingSamplingEnabled } from './routing-thompson-flag.js';

/**
 * Thompson-style pick from pre-fetched routing arm rows (cost/latency penalties).
 * @param {Array<Record<string, unknown>> | null | undefined} results
 */
export function pickRoutingArmByThompson(results) {
  if (!results?.length) return null;
  let best = null;
  let bestDraw = -1;
  for (const arm of results) {
    const draw = betaSample(arm.success_alpha, arm.success_beta);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = arm;
    }
  }
  return best;
}

/**
 * Single-draw Thompson sample for command/auto flows.
 * Candidate arms match {@link queryRoutingArmsCandidates} filters (workspace-scoped first, then global empty workspace_id).
 * Kept self-contained to avoid a circular import with `routing.js`.
 */
export async function thompsonSample(env, taskType, mode, workspaceId = '', opts = {}) {
  if (!env?.DB) return null;
  const tt = taskType != null ? String(taskType).trim() : 'chat';
  const m = mode != null && String(mode).trim() !== '' ? String(mode).trim() : 'auto';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const catalogOk =
    ` AND EXISTS (SELECT 1 FROM agentsam_model_catalog mc WHERE mc.model_key = ra.model_key AND mc.is_active = 1)`;
  const blockGpt55Base = ` AND lower(trim(ra.model_key)) != 'gpt-5.5'`;
  const baseWhere = `ra.task_type = ? AND ra.mode = ? AND ra.is_active = 1 AND ra.is_eligible = 1 AND ra.is_paused = 0 AND ra.budget_exhausted = 0${catalogOk}${blockGpt55Base}`;
  const orderSql = `(CASE WHEN LOWER(COALESCE(ra.provider,'')) IN ('cloudflare','workers_ai')
             OR ra.model_key LIKE 'wai-%' OR ra.model_key LIKE '@cf/%' THEN 1 ELSE 0 END) ASC,
       ra.decayed_score DESC, COALESCE(ra.priority, 0) DESC, ra.rowid ASC`;
  const projection =
    `SELECT ra.id, ra.model_key, ra.provider, ra.success_alpha, ra.success_beta, ra.cost_mean, ra.latency_mean`;

  try {
    let results = [];
    if (ws) {
      const sqlWs =
        `${projection} FROM agentsam_routing_arms ra WHERE ${baseWhere} AND ra.workspace_id = ? ORDER BY ${orderSql} LIMIT 40`;
      const r1 = await env.DB.prepare(sqlWs).bind(tt, m, ws).all();
      results = r1.results || [];
    }
    if (!results.length) {
      const sqlG =
        `${projection} FROM agentsam_routing_arms ra WHERE ${baseWhere} AND COALESCE(TRIM(ra.workspace_id), '') = '' ORDER BY ${orderSql} LIMIT 40`;
      const r2 = await env.DB.prepare(sqlG).bind(tt, m).all();
      results = r2.results || [];
    }
    const useThompson = await isThompsonRoutingSamplingEnabled(env, {
      userId: opts.userId,
      tenantId: opts.tenantId,
    });
    return useThompson ? pickRoutingArmByThompson(results) : results[0] ?? null;
  } catch {
    return null;
  }
}

export async function updateArmsFromMetrics(env) {
  if (!env?.DB) return;
  const { results: metrics } = await env.DB
    .prepare(
      `
    SELECT routing_arm_id, model_key, workspace_id, execution_count, success_count, failure_count,
           avg_duration_ms, total_cost_cents, command_id
    FROM agentsam_execution_performance_metrics
    WHERE metric_date = date('now','-1 day') AND execution_count > 0
  `,
    )
    .all()
    .catch(() => ({ results: [] }));

  for (const m of metrics || []) {
    let arm = null;
    const rid = m.routing_arm_id != null ? String(m.routing_arm_id).trim() : '';
    if (rid) {
      arm = await env.DB
        .prepare(
          `
      SELECT id, success_alpha, success_beta, cost_n, cost_mean, latency_n, latency_mean
      FROM agentsam_routing_arms WHERE id = ? LIMIT 1
    `,
        )
        .bind(rid)
        .first()
        .catch(() => null);
    }
    const mk = m.model_key != null ? String(m.model_key).trim() : '';
    const wsv = m.workspace_id != null ? String(m.workspace_id).trim() : '';
    if (!arm && mk && wsv) {
      arm = await env.DB
        .prepare(
          `
      SELECT id, success_alpha, success_beta, cost_n, cost_mean, latency_n, latency_mean
      FROM agentsam_routing_arms
      WHERE model_key = ? AND workspace_id = ?
      LIMIT 1
    `,
        )
        .bind(mk, wsv)
        .first()
        .catch(() => null);
    }

    if (!arm && mk && !wsv) {
      arm = await env.DB
        .prepare(
          `
      SELECT id, success_alpha, success_beta, cost_n, cost_mean, latency_n, latency_mean
      FROM agentsam_routing_arms WHERE model_key = ? LIMIT 1
    `,
        )
        .bind(mk)
        .first()
        .catch(() => null);
    }

    if (!arm) continue;

    const execN = Math.max(1, Number(m.execution_count) || 1);
    const newAlpha = arm.success_alpha + (m.success_count || 0);
    const newBeta = arm.success_beta + (m.failure_count || 0);
    const costUsd = ((m.total_cost_cents || 0) / 100) / execN;
    const cn = arm.cost_n + 1;
    const newCostMean = arm.cost_mean + (costUsd - arm.cost_mean) / cn;
    const ln = arm.latency_n + 1;
    const newLatMean = arm.latency_mean + ((m.avg_duration_ms || 0) - arm.latency_mean) / ln;

    await env.DB
      .prepare(
        `
      UPDATE agentsam_routing_arms SET
        success_alpha = ?, success_beta = ?,
        cost_n = ?, cost_mean = ?,
        latency_n = ?, latency_mean = ?,
        decayed_score = ? / (? + ?),
        updated_at = unixepoch()
      WHERE id = ?
    `,
      )
      .bind(
        newAlpha,
        newBeta,
        cn,
        newCostMean,
        ln,
        newLatMean,
        newAlpha,
        newAlpha,
        newBeta,
        arm.id,
      )
      .run()
      .catch(() => {});
  }

  let hasToolChain = false;
  try {
    const probe = await env.DB.prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'agentsam_tool_chain' LIMIT 1`,
    ).first();
    hasToolChain = !!probe?.ok;
  } catch {
    hasToolChain = false;
  }
  if (hasToolChain) {
    const { results: comps } = await env.DB
      .prepare(
        `
    SELECT tc.tool_name AS model_key
    FROM agentsam_execution_dependency_graph edg
    JOIN agentsam_tool_chain tc ON tc.id = edg.depends_on_chain_id
    WHERE edg.dependency_type = 'compensation'
      AND edg.created_at > unixepoch('now','-1 day')
  `,
      )
      .all()
      .catch(() => ({ results: [] }));

    for (const c of comps || []) {
      const cmk = c.model_key != null ? String(c.model_key).trim() : '';
      if (!cmk) continue;
      await env.DB
        .prepare(
          `
      UPDATE agentsam_routing_arms
      SET success_beta = success_beta + 1, updated_at = unixepoch()
      WHERE model_key = ?
    `,
        )
        .bind(cmk)
        .run()
        .catch(() => {});
    }
  }
}

/**
 * Incremental routing-arm feedback after a tool/command completes (Thompson/Beta update).
 * @param {any} env
 * @param {{ taskType: string, mode?: string, modelKey: string, provider?: string, success: boolean, costUsd?: number, durationMs?: number }} payload
 */
export async function recordCallOutcome(env, payload) {
  if (!env?.DB) return;
  const taskType = payload?.taskType != null ? String(payload.taskType).trim() : '';
  const modelKey = payload?.modelKey != null ? String(payload.modelKey).trim() : '';
  const workspaceId =
    payload?.workspaceId != null ? String(payload.workspaceId).trim() : '';
  if (!taskType || !modelKey || !workspaceId) return;
  const mode = payload?.mode != null ? String(payload.mode).trim() : 'auto';
  const success = !!payload?.success;
  const costUsd = Number(payload?.costUsd) || 0;
  const durationMs = Number(payload?.durationMs) || 0;
  try {
    if (success) {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          success_alpha = success_alpha + 1,
          cost_n        = cost_n + 1,
          cost_mean     = CASE WHEN cost_n = 0 THEN ?
                  ELSE (cost_mean * cost_n + ?) / (cost_n + 1) END,
          latency_n     = latency_n + 1,
          latency_mean  = CASE WHEN latency_n = 0 THEN ?
                  ELSE (latency_mean * latency_n + ?) / (latency_n + 1) END,
          updated_at    = unixepoch()
         WHERE task_type = ? AND mode = ? AND model_key = ? AND workspace_id = ?`,
      )
        .bind(costUsd, costUsd, durationMs, durationMs, taskType, mode, modelKey, workspaceId)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          success_beta = success_beta + 1,
          updated_at = unixepoch()
         WHERE task_type = ? AND mode = ? AND model_key = ? AND workspace_id = ?`,
      )
        .bind(taskType, mode, modelKey, workspaceId)
        .run();
    }
  } catch (e) {
    console.warn('[thompson] recordCallOutcome', e?.message ?? e);
  }
}

export async function decayRoutingArms(env) {
  if (!env?.DB) return;
  await env.DB
    .prepare(
      `
    UPDATE agentsam_routing_arms SET
      success_alpha = MAX(1.0, success_alpha * 0.95),
      success_beta  = MAX(1.0, success_beta  * 0.95),
      decayed_score = (success_alpha * 0.95) / ((success_alpha * 0.95) + (success_beta * 0.95)),
      last_decay_at = unixepoch(),
      updated_at    = unixepoch()
    WHERE is_eligible = 1
  `,
    )
    .run()
    .catch(() => {});
}

function betaSample(alpha, beta) {
  const a = Math.max(1e-9, Number(alpha) || 1);
  const b = Math.max(1e-9, Number(beta) || 1);
  let x;
  let y;
  do {
    x = Math.pow(Math.random(), 1 / a);
    y = Math.pow(Math.random(), 1 / b);
  } while (x + y > 1 || x + y === 0);
  return x / (x + y);
}
