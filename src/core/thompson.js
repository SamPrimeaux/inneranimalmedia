/**
 * Thompson/Beta bandit over agentsam_routing_arms + nightly updates from execution_performance_metrics.
 */

export async function thompsonSample(env, taskType, mode) {
  if (!env?.DB) return null;
  const { results } = await env.DB.prepare(
    `
    SELECT id, model_key, provider, success_alpha, success_beta,
           cost_mean, latency_mean
    FROM agentsam_routing_arms
    WHERE task_type = ? AND mode = ?
      AND is_eligible = 1 AND is_paused = 0
    `,
  )
    .bind(taskType, mode || 'auto')
    .all()
    .catch(() => ({ results: [] }));
  if (!results?.length) return null;
  let best = null;
  let bestScore = -1;
  for (const arm of results) {
    const s = betaSample(arm.success_alpha, arm.success_beta);
    const score =
      s -
      (arm.cost_mean > 0 ? Math.min(arm.cost_mean / 0.01, 1) * 0.1 : 0) -
      (arm.latency_mean > 0 ? Math.min(arm.latency_mean / 5000, 1) * 0.05 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = arm;
    }
  }
  return best;
}

export async function updateArmsFromMetrics(env) {
  if (!env?.DB) return;
  const { results: metrics } = await env.DB
    .prepare(
      `
    SELECT command_id, execution_count, success_count, failure_count,
           avg_duration_ms, total_cost_cents
    FROM execution_performance_metrics
    WHERE metric_date = date('now','-1 day') AND execution_count > 0
  `,
    )
    .all()
    .catch(() => ({ results: [] }));

  for (const m of metrics || []) {
    const arm = await env.DB
      .prepare(
        `
      SELECT id, success_alpha, success_beta, cost_n, cost_mean, latency_n, latency_mean
      FROM agentsam_routing_arms WHERE model_key = ? LIMIT 1
    `,
      )
      .bind(m.command_id)
      .first()
      .catch(() => null);
    if (!arm) continue;

    const newAlpha = arm.success_alpha + (m.success_count || 0);
    const newBeta = arm.success_beta + (m.failure_count || 0);
    const costUsd = ((m.total_cost_cents || 0) / 100) / m.execution_count;
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

  const { results: comps } = await env.DB
    .prepare(
      `
    SELECT tc.tool_name as model_key
    FROM execution_dependency_graph edg
    JOIN agentsam_tool_chain tc ON tc.id = edg.depends_on_execution_id
    WHERE edg.dependency_type = 'compensation'
      AND edg.created_at > unixepoch('now','-1 day')
  `,
    )
    .all()
    .catch(() => ({ results: [] }));

  for (const c of comps || []) {
    await env.DB
      .prepare(
        `
      UPDATE agentsam_routing_arms
      SET success_beta = success_beta + 1, updated_at = unixepoch()
      WHERE model_key = ?
    `,
      )
      .bind(c.model_key)
      .run()
      .catch(() => {});
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
  if (!taskType || !modelKey) return;
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
         WHERE task_type = ? AND mode = ? AND model_key = ?`,
      )
        .bind(costUsd, costUsd, durationMs, durationMs, taskType, mode, modelKey)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE agentsam_routing_arms SET
          success_beta = success_beta + 1,
          updated_at = unixepoch()
         WHERE task_type = ? AND mode = ? AND model_key = ?`,
      )
        .bind(taskType, mode, modelKey)
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
