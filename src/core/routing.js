/**
 * Agent Sam model routing — Thompson sampling over agentsam_routing_arms (Beta bandit).
 *
 * Schema is discovered via PRAGMA table_info(agentsam_routing_arms) before reads/writes.
 * Expected columns (any subset; routing adapts):
 *   - id | arm_id          — arm identifier (required for outcome updates)
 *   - model_id | ai_model_id — FK to agentsam_ai.id
 *   - task_key | intent_slug | task_type — filter for task (optional)
 *   - tenant_id           — optional scope
 *   - alpha, beta         — Beta prior/posterior parameters (must stay > 0)
 *   - success_count | successes  — alternative to alpha/beta (uses Beta(1+s,1+f))
 *   - failure_count | failures
 *   - is_active | active  — optional eligibility gate
 */

import { pickRoutingArmByThompson } from './thompson.js';

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
 * Load candidate routing arms for Thompson sampling (workspace-scoped first, then global).
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {{ taskType: string, mode: string, workspaceId: string, toolRequired?: boolean }} q
 */
export async function queryRoutingArmsCandidates(env, q) {
  const db = env?.DB;
  if (!db) return [];
  const tt = q.taskType != null ? String(q.taskType).trim() : 'chat';
  const m = q.mode != null && String(q.mode).trim() !== '' ? String(q.mode).trim() : 'auto';
  const toolReq = !!q.toolRequired;
  const toolsClause = toolReq ? ' AND supports_tools = 1' : '';
  const baseWhere = `task_type = ? AND mode = ? AND is_active = 1 AND is_eligible = 1 AND is_paused = 0 AND budget_exhausted = 0${toolsClause}`;
  const ws = q.workspaceId != null ? String(q.workspaceId).trim() : '';
  try {
    if (ws) {
      const sqlWs = `SELECT * FROM ${TABLE} WHERE ${baseWhere} AND workspace_id = ? ORDER BY decayed_score DESC, priority ASC LIMIT 10`;
      const r1 = await db.prepare(sqlWs).bind(tt, m, ws).all();
      if (r1.results?.length) return r1.results;
    }
    const sqlGlobal = `SELECT * FROM ${TABLE} WHERE ${baseWhere} ORDER BY decayed_score DESC LIMIT 10`;
    const r2 = await db.prepare(sqlGlobal).bind(tt, m).all();
    return r2.results || [];
  } catch {
    return [];
  }
}

/**
 * Map gate intent + request flags to `agentsam_routing_arms.task_type` (no tenant/workspace literals).
 * @param {{ intentSlug?: string, requireTools?: boolean, body?: Record<string, unknown> | null }} ctx
 */
export function resolveRoutingTaskType(ctx = {}) {
  const body = ctx.body && typeof ctx.body === 'object' ? ctx.body : {};
  if (body.debug === true || String(body.mode || '').toLowerCase() === 'debug') return 'debug';
  if (body.subagent === true || (body.subagent_profile_id != null && String(body.subagent_profile_id).trim() !== '')) {
    return 'subagent_dispatch';
  }
  if (body.workflow_step === true || body.workflow_run_id != null) return 'workflow_orchestration';
  if (body.terminal_session_id != null || body.pty_session_id != null) return 'terminal_execution';
  if (body.intent_classification_only === true) return 'intent_classification';
  if (body.rag_only === true || body.memory_search_only === true) return 'rag_query';
  if (body.skill_pick_only === true) return 'skill_invocation';
  if (ctx.requireTools) return 'tool_use';
  const slug = String(ctx.intentSlug ?? 'auto').toLowerCase().trim() || 'auto';
  return INTENT_SLUG_TO_ROUTING_TASK[slug] ?? 'chat';
}

/** Gate intent slugs → `task_type` rows (seeded / expanded schema). */
const INTENT_SLUG_TO_ROUTING_TASK = {
  auto: 'chat',
  question: 'chat',
  explain: 'chat',
  code_help: 'code/build',
  fix_bug: 'code/debug',
  write_code: 'code/build',
  plan: 'plan',
  deploy: 'deploy',
  sql: 'sql_d1_generation',
  summarize: 'summary',
  rag: 'rag_query',
};

/**
 * Resolve default model for a task using Thompson sampling over D1 arms.
 * Falls back to static routing when table missing, empty, or on error (caller unchanged).
 *
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {{
 *   taskKey?: string,
 *   tenantId?: string | null,
 *   workspaceId?: string | null,
 *   mode?: string,
 *   toolRequired?: boolean,
 * }} ctx
 * @returns {Promise<{ modelId: string | null, armId: string | null, source: 'thompson' | 'fallback', fallbackReason?: string, fallbackModelKey?: string | null }>}
 */
export async function getDefaultModelForTask(env, ctx = {}) {
  try {
    const db = env?.DB;
    if (!db) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_db' };
    }
    const workspaceId = ctx.workspaceId != null ? String(ctx.workspaceId).trim() : '';
    if (!workspaceId) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'missing_workspace' };
    }
    const taskType =
      ctx.taskKey != null && String(ctx.taskKey).trim() !== ''
        ? String(ctx.taskKey).trim()
        : 'chat';
    const mode = ctx.mode != null && String(ctx.mode).trim() !== '' ? String(ctx.mode).trim() : 'auto';
    const arms = await queryRoutingArmsCandidates(env, {
      taskType,
      mode,
      workspaceId,
      toolRequired: !!ctx.toolRequired,
    });
    const arm = pickRoutingArmByThompson(arms);
    if (!arm?.model_key) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_eligible_arms' };
    }
    const row = await db
      .prepare(
        `SELECT id FROM agentsam_ai WHERE model_key = ? AND mode = 'model' AND status = 'active' LIMIT 1`,
      )
      .bind(String(arm.model_key))
      .first()
      .catch(() => null);
    const modelId = row?.id != null ? String(row.id).trim() : '';
    const armId = arm.id != null ? String(arm.id).trim() : '';
    const fallbackModelKey =
      arm.fallback_model_key != null && String(arm.fallback_model_key).trim() !== ''
        ? String(arm.fallback_model_key).trim()
        : null;
    if (!modelId) {
      return {
        modelId: null,
        armId: armId || null,
        source: 'fallback',
        fallbackReason: 'unknown_model_key',
        fallbackModelKey,
      };
    }
    return {
      modelId,
      armId: armId || null,
      source: 'thompson',
      fallbackModelKey,
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

/** OpenAI chat SKUs used only when `agentsam_routing_arms` lookup fails or returns no rows. */
export const CHAT_ROUTING_STATIC_FALLBACK_KEYS = Object.freeze([
  'gpt-5.4-nano',
  'gpt-5.4-mini',
  'gpt-5.4',
]);

/**
 * Ordered model_key list for SSE chat fallback chain from D1 routing arms (per-mode decayed scores).
 * Falls back to {@link CHAT_ROUTING_STATIC_FALLBACK_KEYS} when the query fails or is empty.
 *
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 * @param {string} [mode] agent mode slug (must match `agentsam_routing_arms.mode`)
 * @param {string} [workspaceId] session workspace (never a hardcoded literal from callers)
 * @param {{ toolRequired?: boolean }} [opts]
 */
export async function loadChatRoutingArmsModelKeyOrder(env, mode, workspaceId, opts = {}) {
  const m = mode != null && String(mode).trim() !== '' ? String(mode).trim() : 'agent';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const rows = await queryRoutingArmsCandidates(env, {
    taskType: 'chat',
    mode: m,
    workspaceId: ws,
    toolRequired: !!opts.toolRequired,
  });
  const keys = rows.map((r) => String(r?.model_key ?? '').trim()).filter(Boolean);
  if (keys.length) return keys;
  return [...CHAT_ROUTING_STATIC_FALLBACK_KEYS];
}

/**
 * Execution + Thompson feedback on `agentsam_routing_arms` (fire-and-forget).
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   taskType: string,
 *   mode: string,
 *   modelKey: string,
 *   workspaceId: string,
 *   success: boolean,
 *   lastChainId?: string | null,
 * }} o
 */
export function scheduleRoutingArmBanditUpdate(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const taskType = o?.taskType != null ? String(o.taskType).trim() : '';
  const mode = o?.mode != null ? String(o.mode).trim() : '';
  const modelKey = o?.modelKey != null ? String(o.modelKey).trim() : '';
  const workspaceId = o?.workspaceId != null ? String(o.workspaceId).trim() : '';
  if (!taskType || !mode || !modelKey || !workspaceId) return;
  const success = !!o.success;
  const succInt = success ? 1 : 0;
  const lastChainId = o?.lastChainId != null ? String(o.lastChainId).trim() : '';

  ctx.waitUntil(
    (async () => {
      try {
        await env.DB.prepare(
          `UPDATE ${TABLE}
           SET total_executions = total_executions + 1,
               success_alpha = success_alpha + CASE WHEN ? THEN 0.8 ELSE 0 END,
               success_beta  = success_beta  + CASE WHEN ? THEN 0 ELSE 0.8 END,
               last_chain_id = ?,
               updated_at    = unixepoch()
           WHERE task_type = ? AND mode = ? AND model_key = ? AND workspace_id = ?`,
        )
          .bind(succInt, succInt, lastChainId || null, taskType, mode, modelKey, workspaceId)
          .run();
      } catch (e) {
        console.warn('[routing_arms] bandit update failed', e?.message ?? e);
      }
    })(),
  );
}

/**
 * Rolling mean quality score on the routing arm row (fire-and-forget).
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   taskType: string,
 *   mode: string,
 *   modelKey: string,
 *   workspaceId: string,
 *   qualityScore: number,
 * }} o
 */
export function scheduleRoutingArmQualityUpdate(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const taskType = o?.taskType != null ? String(o.taskType).trim() : '';
  const mode = o?.mode != null ? String(o.mode).trim() : '';
  const modelKey = o?.modelKey != null ? String(o.modelKey).trim() : '';
  const workspaceId = o?.workspaceId != null ? String(o.workspaceId).trim() : '';
  const q = Number(o?.qualityScore);
  if (!taskType || !mode || !modelKey || !workspaceId || !Number.isFinite(q)) return;

  ctx.waitUntil(
    (async () => {
      try {
        await env.DB.prepare(
          `UPDATE ${TABLE}
           SET avg_quality_score =
                 ((COALESCE(avg_quality_score, 0) * COALESCE(quality_n, 0)) + ?)
                 / (COALESCE(quality_n, 0) + 1),
               quality_n = COALESCE(quality_n, 0) + 1,
               updated_at = unixepoch()
           WHERE task_type = ? AND mode = ? AND model_key = ? AND workspace_id = ?`,
        )
          .bind(q, taskType, mode, modelKey, workspaceId)
          .run();
      } catch (e) {
        console.warn('[routing_arms] quality update failed', e?.message ?? e);
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
