/**
 * Agent Sam model routing — Thompson sampling over agentsam_routing_arms (Beta bandit).
 *
 * Schema is discovered via PRAGMA table_info(agentsam_routing_arms) before reads/writes.
 * Expected columns (any subset; routing adapts):
 *   - id | arm_id          — arm identifier (required for outcome updates)
 *   - model_id | ai_model_id — FK to ai_models.id
 *   - task_key | intent_slug | task_type — filter for task (optional)
 *   - tenant_id           — optional scope
 *   - alpha, beta         — Beta prior/posterior parameters (must stay > 0)
 *   - success_count | successes  — alternative to alpha/beta (uses Beta(1+s,1+f))
 *   - failure_count | failures
 *   - is_active | active  — optional eligibility gate
 */

const TABLE = 'agentsam_routing_arms';

/** @param {import('@cloudflare/workers-types').D1Database | undefined} db */
export async function pragmaRoutingArmsColumns(db) {
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(TABLE) ? TABLE : '';
  if (!safe || !db) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

function boxMullerNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Gamma(shape, scale=1) sample — Marsaglia–Tsang, shape >= 1; boosts shape<1 */
function randomGamma(shape) {
  const s = Number(shape) || 0;
  if (s <= 0) return 0;
  if (s < 1) return randomGamma(s + 1) * Math.pow(Math.random(), 1 / s);
  const d = s - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = boxMullerNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Draw ~ Beta(a,b) via independent Gammas */
export function sampleBeta(a, b) {
  const aa = Math.max(1e-9, Number(a) || 1);
  const bb = Math.max(1e-9, Number(b) || 1);
  const x = randomGamma(aa);
  const y = randomGamma(bb);
  return x / (x + y);
}

/**
 * Per-arm effective Beta parameters.
 * @param {Record<string, unknown>} row
 * @param {Set<string>} cols
 */
function effectiveBetaParams(row, cols) {
  const s =
    cols.has('success_count') ? Number(row.success_count)
      : cols.has('successes') ? Number(row.successes)
        : null;
  const f =
    cols.has('failure_count') ? Number(row.failure_count)
      : cols.has('failures') ? Number(row.failures)
        : null;

  if (s != null && Number.isFinite(s) && f != null && Number.isFinite(f)) {
    return { alpha: 1 + Math.max(0, s), beta: 1 + Math.max(0, f) };
  }

  if (cols.has('alpha') && cols.has('beta')) {
    return {
      alpha: Math.max(1e-9, Number(row.alpha) || 1),
      beta: Math.max(1e-9, Number(row.beta) || 1),
    };
  }

  return { alpha: 1, beta: 1 };
}

function pickIdColumn(cols) {
  if (cols.has('id')) return 'id';
  if (cols.has('arm_id')) return 'arm_id';
  return null;
}

function pickModelColumn(cols) {
  if (cols.has('model_id')) return 'model_id';
  if (cols.has('ai_model_id')) return 'ai_model_id';
  return null;
}

function pickTaskColumn(cols) {
  if (cols.has('task_key')) return 'task_key';
  if (cols.has('intent_slug')) return 'intent_slug';
  if (cols.has('task_type')) return 'task_type';
  return null;
}

function isActiveRow(row, cols) {
  if (cols.has('is_active')) return Number(row.is_active) !== 0;
  if (cols.has('active')) return Number(row.active) !== 0;
  return true;
}

/**
 * Load eligible routing arms for Thompson sampling.
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {{ taskKey?: string, tenantId?: string | null }} ctx
 */
async function loadEligibleArms(env, ctx) {
  const db = env?.DB;
  if (!db) return { cols: new Set(), arms: [] };

  const cols = await pragmaRoutingArmsColumns(db);
  if (!cols.size) return { cols, arms: [] };

  const idCol = pickIdColumn(cols);
  const modelCol = pickModelColumn(cols);
  if (!idCol || !modelCol) return { cols, arms: [] };

  const parts = [];
  const binds = [];

  const taskCol = pickTaskColumn(cols);
  const tk = ctx.taskKey != null ? String(ctx.taskKey).trim() : '';
  if (taskCol && tk) {
    parts.push(`${taskCol} = ?`);
    binds.push(tk);
  }

  if (cols.has('tenant_id') && ctx.tenantId != null && String(ctx.tenantId).trim() !== '') {
    parts.push(`(tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')`);
    binds.push(String(ctx.tenantId).trim());
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';

  const q = `SELECT * FROM ${TABLE} ${where}`;
  try {
    const stmt = binds.length ? db.prepare(q).bind(...binds) : db.prepare(q);
    const { results } = await stmt.all();
    const arms = (results || []).filter((r) => isActiveRow(r, cols));
    return { cols, arms };
  } catch {
    return { cols, arms: [] };
  }
}

/**
 * Thompson sample: one Beta draw per arm, pick argmax.
 * @returns {{ arm: Record<string, unknown> | null, samples: number }}
 */
export function thompsonSelectArm(arms, cols) {
  if (!arms?.length) return { arm: null, samples: 0 };
  let best = null;
  let bestDraw = -1;
  for (const row of arms) {
    const { alpha, beta } = effectiveBetaParams(row, cols);
    const draw = sampleBeta(alpha, beta);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = row;
    }
  }
  return { arm: best, samples: arms.length };
}

/**
 * Resolve default model for a task using Thompson sampling over D1 arms.
 * Falls back to static routing when table missing, empty, or on error (caller unchanged).
 *
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {{ taskKey?: string, tenantId?: string | null }} ctx
 * @returns {Promise<{ modelId: string | null, armId: string | null, source: 'thompson' | 'fallback', fallbackReason?: string }>}
 */
export async function getDefaultModelForTask(env, ctx = {}) {
  try {
    const { cols, arms } = await loadEligibleArms(env, ctx);
    if (!arms.length) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_eligible_arms' };
    }

    const idCol = pickIdColumn(cols);
    const modelCol = pickModelColumn(cols);
    const { arm } = thompsonSelectArm(arms, cols);
    if (!arm || !idCol || !modelCol) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'selection_skipped' };
    }

    const modelId = arm[modelCol] != null ? String(arm[modelCol]).trim() : '';
    const armId = arm[idCol] != null ? String(arm[idCol]).trim() : '';
    if (!modelId) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'empty_model_id' };
    }

    return {
      modelId,
      armId: armId || null,
      source: 'thompson',
    };
  } catch (e) {
    return {
      modelId: null,
      armId: null,
      source: 'fallback',
      fallbackReason: String(e?.message || e || 'routing_error'),
    };
  }
}

/**
 * Update arm statistics after an observed outcome (success / failure).
 * Runs PRAGMA table_info before any write; only updates columns that exist.
 *
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {{ armId: string, success: boolean }} outcome
 */
/**
 * Bayesian bandit incremental update (success_alpha / success_beta + online means).
 * Fire-and-forget via ctx.waitUntil from callers.
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   taskType: string,
 *   mode: string,
 *   modelKey: string,
 *   success: boolean,
 *   costUsd?: number,
 *   durationMs?: number,
 * }} o
 */
export function scheduleRoutingArmBanditUpdate(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const taskType = o?.taskType != null ? String(o.taskType).trim() : '';
  const mode = o?.mode != null ? String(o.mode).trim() : '';
  const modelKey = o?.modelKey != null ? String(o.modelKey).trim() : '';
  if (!taskType || !mode || !modelKey) return;

  const costUsd = Number(o.costUsd) || 0;
  const durationMs = Number(o.durationMs) || 0;
  const success = !!o.success;

  ctx.waitUntil(
    (async () => {
      try {
        if (success) {
          await env.DB.prepare(
            `UPDATE agentsam_routing_arms SET
              success_alpha = success_alpha + 1,
              cost_n = cost_n + 1,
              cost_mean = cost_mean + (? - cost_mean) / (cost_n + 1),
              latency_n = latency_n + 1,
              latency_mean = latency_mean + (? - latency_mean) / (latency_n + 1),
              updated_at = unixepoch()
             WHERE task_type = ? AND mode = ? AND model_key = ?`,
          )
            .bind(costUsd, durationMs, taskType, mode, modelKey)
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
        console.warn('[routing_arms] bandit update failed', e?.message ?? e);
      }
    })(),
  );
}

export async function recordRoutingArmOutcome(env, outcome) {
  const db = env?.DB;
  const armId = outcome?.armId != null ? String(outcome.armId).trim() : '';
  if (!db || !armId) return { ok: false, reason: 'missing_db_or_arm' };

  const cols = await pragmaRoutingArmsColumns(db);
  if (!cols.size) return { ok: false, reason: 'no_table' };

  const idCol = pickIdColumn(cols);
  if (!idCol) return { ok: false, reason: 'no_id_column' };

  const success = !!outcome.success;

  const sets = [];
  const binds = [];

  if (success) {
    if (cols.has('success_count')) {
      sets.push('success_count = COALESCE(success_count, 0) + 1');
    } else if (cols.has('successes')) {
      sets.push('successes = COALESCE(successes, 0) + 1');
    } else if (cols.has('alpha')) {
      sets.push('alpha = COALESCE(alpha, 1) + 1');
    }
  } else if (cols.has('failure_count')) {
    sets.push('failure_count = COALESCE(failure_count, 0) + 1');
  } else if (cols.has('failures')) {
    sets.push('failures = COALESCE(failures, 0) + 1');
  } else if (cols.has('beta')) {
    sets.push('beta = COALESCE(beta, 1) + 1');
  }

  if (cols.has('updated_at')) {
    sets.push(`updated_at = datetime('now')`);
  }

  if (!sets.length) return { ok: false, reason: 'no_updatable_columns' };

  const sql = `UPDATE ${TABLE} SET ${sets.join(', ')} WHERE ${idCol} = ?`;
  binds.push(armId);

  try {
    await db.prepare(sql).bind(...binds).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
