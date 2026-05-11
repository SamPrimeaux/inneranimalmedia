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
import { pragmaTableInfo } from './retention.js';

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
/** Routes/tasks where Workers AI arms are allowed to compete fairly (not forced last). */
const ROUTE_KEYS_ALLOW_WORKERS_AI = new Set([
  'classifier',
  'tiny_summary',
  'embedding_fallback',
  'smoke_test',
]);

const TASK_TYPES_ALLOW_WORKERS_AI = new Set([
  'intent_classification',
  'embedding',
  'smoke_test',
  'tiny_summary',
]);

function routingAllowsWorkersAiEarly(routeKey, taskType) {
  const rk = routeKey != null ? String(routeKey).trim().toLowerCase() : '';
  const tt = taskType != null ? String(taskType).trim().toLowerCase() : '';
  if (rk && ROUTE_KEYS_ALLOW_WORKERS_AI.has(rk)) return true;
  if (tt && TASK_TYPES_ALLOW_WORKERS_AI.has(tt)) return true;
  return false;
}

/**
 * Live D1: arms reference canonical catalog keys. Block the **base** SKU `gpt-5.5` only (not API-accessible).
 * `gpt-5.5-pro` may exist in catalog; eligibility is governed by `agentsam_model_catalog.is_active` (keep off until smoke-tested).
 * Workers AI (`provider` / `wai-*` / `@cf/*`) is sorted last unless the route/task explicitly allows it.
 */
export async function queryRoutingArmsCandidates(env, q) {
  const db = env?.DB;
  if (!db) return [];
  const tt = q.taskType != null ? String(q.taskType).trim() : 'chat';
  const m = q.mode != null && String(q.mode).trim() !== '' ? String(q.mode).trim() : 'auto';
  const toolReq = !!q.toolRequired;
  const routeKey = q.routeKey != null ? String(q.routeKey).trim() : '';
  const allowWaiSort = routingAllowsWorkersAiEarly(routeKey || undefined, tt);
  const toolsClause = toolReq ? ' AND ra.supports_tools = 1' : '';
  const ws = q.workspaceId != null ? String(q.workspaceId).trim() : '';

  const catalogOk =
    ` AND EXISTS (SELECT 1 FROM agentsam_model_catalog mc WHERE mc.model_key = ra.model_key AND mc.is_active = 1)`;
  /** Base-only ban; `gpt-5.5-pro` is allowed through only when catalog marks it active. */
  const blockGpt55Base = ` AND lower(trim(ra.model_key)) != 'gpt-5.5'`;
  const baseWhere = `ra.task_type = ? AND ra.mode = ? AND ra.is_active = 1 AND ra.is_eligible = 1 AND ra.is_paused = 0 AND ra.budget_exhausted = 0${toolsClause}${catalogOk}${blockGpt55Base}`;

  const orderSql = allowWaiSort
    ? `ra.decayed_score DESC, COALESCE(ra.priority, 50) ASC`
    : `(CASE WHEN LOWER(COALESCE(ra.provider,'')) IN ('cloudflare','workers_ai')
             OR ra.model_key LIKE 'wai-%' OR ra.model_key LIKE '@cf/%' THEN 1 ELSE 0 END) ASC,
       ra.decayed_score DESC, COALESCE(ra.priority, 50) ASC`;

  try {
    if (ws) {
      const sqlWs = `SELECT ra.* FROM ${TABLE} ra WHERE ${baseWhere} AND ra.workspace_id = ? ORDER BY ${orderSql} LIMIT 40`;
      const r1 = await db.prepare(sqlWs).bind(tt, m, ws).all();
      if (r1.results?.length) return r1.results;
    }
    const sqlGlobal =
      `SELECT ra.* FROM ${TABLE} ra WHERE ${baseWhere} AND COALESCE(TRIM(ra.workspace_id), '') = '' ORDER BY ${orderSql} LIMIT 40`;
    const r2 = await db.prepare(sqlGlobal).bind(tt, m).all();
    return r2.results || [];
  } catch {
    return [];
  }
}

/**
 * Ordered active catalog keys for chat/tool chains when routing arms return nothing (global rows only).
 * @param {{ DB?: import('@cloudflare/workers-types').D1Database }} env
 */
export async function loadActiveCatalogModelKeysOrdered(env) {
  const db = env?.DB;
  if (!db) return [];
  const cols = await pragmaTableInfo(db, 'agentsam_model_catalog');
  if (!cols.has('model_key') || !cols.has('is_active')) return [];
  const hasTenant = cols.has('tenant_id') && cols.has('workspace_id');
  const hasTier = cols.has('tier');
  const hasDegraded = cols.has('is_degraded');
  const scope = hasTenant ? `AND COALESCE(tenant_id,'') = '' AND COALESCE(workspace_id,'') = ''` : '';
  const degradedClause = hasDegraded ? `AND COALESCE(is_degraded,0) = 0` : '';
  const orderBy = hasTier
    ? `CASE LOWER(COALESCE(tier,'')) WHEN 'micro' THEN 0 WHEN 'flash' THEN 1 WHEN 'standard' THEN 2 WHEN 'power' THEN 3 WHEN 'reasoning' THEN 4 WHEN 'frontier' THEN 5 ELSE 9 END, model_key ASC`
    : 'model_key ASC';
  try {
    const { results } = await db
      .prepare(
        `SELECT model_key FROM agentsam_model_catalog
         WHERE is_active = 1 ${degradedClause} ${scope}
         ORDER BY ${orderBy}
         LIMIT 40`,
      )
      .all();
    return (results || [])
      .map((r) => String(r?.model_key ?? '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function loadRouteRequirementsRow(env, routeKey) {
  const rk = routeKey != null ? String(routeKey).trim() : '';
  if (!rk || !env?.DB) return null;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_route_requirements');
  if (!cols.size || !cols.has('route_key')) return null;
  return env.DB
    .prepare(`SELECT * FROM agentsam_route_requirements WHERE route_key = ? LIMIT 1`)
    .bind(rk)
    .first()
    .catch(() => null);
}

function parseBlockedProviders(raw) {
  if (raw == null || raw === '') return [];
  try {
    const j = JSON.parse(String(raw));
    return Array.isArray(j) ? j.map((x) => String(x || '').toLowerCase()) : [];
  } catch {
    return String(raw)
      .split(/[,|]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
}

function armMatchesRouteRequirements(arm, req) {
  if (!req) return true;
  if (Number(req.requires_tools) === 1 && Number(arm.supports_tools) !== 1) return false;
  if (Number(req.requires_vision) === 1) {
    const v = Number(arm.supports_vision);
    if (Number.isFinite(v) && v !== 1) return false;
  }
  if (Number(req.requires_json_mode) === 1) {
    const j = Number(arm.supports_structured_output);
    if (Number.isFinite(j) && j !== 1) return false;
  }
  const minQ = Number(req.min_quality_score);
  if (Number.isFinite(minQ) && minQ > 0) {
    const aq = Number(arm.avg_quality_score);
    if (!Number.isFinite(aq) || aq < minQ) return false;
  }
  const maxLat = Number(req.max_latency_p50_ms);
  if (Number.isFinite(maxLat) && maxLat > 0) {
    const lm = Number(arm.latency_mean);
    if (Number.isFinite(lm) && lm > maxLat) return false;
  }
  const maxCost = Number(req.max_cost_per_1k_in);
  if (Number.isFinite(maxCost) && maxCost > 0) {
    const cap = Number(arm.max_cost_per_call_usd);
    if (Number.isFinite(cap) && cap > maxCost) return false;
  }
  const blocked = parseBlockedProviders(req.blocked_providers);
  if (blocked.length) {
    const p = String(arm.provider || '').toLowerCase();
    if (blocked.includes(p)) return false;
  }
  const prefTier = req.preferred_tier != null ? String(req.preferred_tier).trim() : '';
  if (prefTier && arm.preferred_tier != null && String(arm.preferred_tier).trim() !== prefTier) {
    return false;
  }
  return true;
}

/**
 * Filter pre-fetched arms by `agentsam_route_requirements` for `route_key` (capability / SLA gates).
 * @param {any} env
 * @param {string | null | undefined} routeKey
 * @param {Record<string, unknown>[] | null | undefined} arms
 */
export async function filterArmsForRouteKey(env, routeKey, arms) {
  const req = await loadRouteRequirementsRow(env, routeKey);
  if (!req || !arms?.length) return arms || [];
  return arms.filter((a) => armMatchesRouteRequirements(a, req));
}

/**
 * Cold-start: blend `agentsam_model_routing_memory.success_rate` into Beta priors (in-memory copy only).
 */
export async function mergeModelRoutingMemoryPriors(env, workspaceId, taskType, arms) {
  if (!env?.DB || !arms?.length) return arms;
  const mem = await pragmaTableInfo(env.DB, 'agentsam_model_routing_memory');
  if (!mem.size || !mem.has('model_key')) return arms;
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!ws) return arms;
  const tt = taskType != null ? String(taskType).trim() : 'chat';
  const out = [];
  for (const arm of arms) {
    const mk = String(arm.model_key ?? '').trim();
    if (!mk) {
      out.push(arm);
      continue;
    }
    let row = null;
    try {
      row = await env.DB
        .prepare(
          `SELECT success_rate, avg_latency_ms, avg_cost_usd, code_pass_rate, hallucination_rate
           FROM agentsam_model_routing_memory
           WHERE workspace_id = ? AND task_type = ? AND model_key = ?
           LIMIT 1`,
        )
        .bind(ws, tt, mk)
        .first();
    } catch {
      row = null;
    }
    if (!row || row.success_rate == null) {
      out.push(arm);
      continue;
    }
    const sr = Math.max(0.05, Math.min(0.95, Number(row.success_rate) || 0.5));
    const pseudo = 12;
    const succ = Math.max(0, Math.round(sr * pseudo));
    const fail = Math.max(0, pseudo - succ);
    out.push({
      ...arm,
      success_alpha: Math.max(1e-6, Number(arm.success_alpha ?? 1) + succ),
      success_beta: Math.max(1e-6, Number(arm.success_beta ?? 1) + fail),
    });
  }
  return out;
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
 *   routeKey?: string | null,
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
    let arms = await queryRoutingArmsCandidates(env, {
      taskType,
      mode,
      workspaceId,
      toolRequired: !!ctx.toolRequired,
      routeKey: ctx.routeKey ?? null,
    });
    arms = await filterArmsForRouteKey(env, ctx.routeKey ?? null, arms);
    arms = await mergeModelRoutingMemoryPriors(env, workspaceId, taskType, arms);
    const arm = pickRoutingArmByThompson(arms);
    if (!arm?.model_key) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_eligible_arms' };
    }
    const mk = String(arm.model_key);
    const armId = arm.id != null ? String(arm.id).trim() : '';
    const fallbackModelKey =
      arm.fallback_model_key != null && String(arm.fallback_model_key).trim() !== ''
        ? String(arm.fallback_model_key).trim()
        : null;
    const catOk = await db
      .prepare(
        `SELECT 1 AS ok FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`,
      )
      .bind(mk)
      .first()
      .catch(() => null);
    const row = await db
      .prepare(
        `SELECT id FROM agentsam_ai WHERE model_key = ? AND mode = 'model' AND status = 'active' LIMIT 1`,
      )
      .bind(mk)
      .first()
      .catch(() => null);
    if (catOk?.ok && !row?.id) {
      return {
        modelId: null,
        armId: armId || null,
        source: 'fallback',
        fallbackReason: 'catalog_without_agentsam_ai_row',
        fallbackModelKey,
      };
    }
    const modelId = row?.id != null ? String(row.id).trim() : '';
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

/**
 * Ordered model_key list for SSE chat fallback chain from D1 routing arms (per-mode decayed scores).
 * When arms yield nothing, falls back to active global `agentsam_model_catalog` keys (tier-ordered).
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
    routeKey: opts.routeKey ?? null,
  });
  const keys = rows.map((r) => String(r?.model_key ?? '').trim()).filter(Boolean);
  if (keys.length) return keys;
  return loadActiveCatalogModelKeysOrdered(env);
}

/**
 * Thompson/Beta + Welford cost/latency update by arm primary key (awaitable).
 * @param {any} env
 * @param {{
 *   armId: string,
 *   success: boolean,
 *   costUsd?: number,
 *   durationMs?: number,
 * }} o
 */
export async function applyRoutingArmUsageFeedback(env, o) {
  const db = env?.DB;
  const armId = o?.armId != null ? String(o.armId).trim() : '';
  if (!db || !armId) return;
  const success = !!o.success;
  const costUsd = Number(o.costUsd) || 0;
  const durationMs = Math.max(0, Math.floor(Number(o.durationMs) || 0));
  const da = success ? 1 : 0;
  const dBeta = success ? 0 : 1;

  const cols = await pragmaTableInfo(db, TABLE);
  try {
    if (cols.has('cost_m2') && cols.has('latency_m2')) {
      const row = await db
        .prepare(
          `SELECT cost_n, cost_mean, cost_m2, latency_n, latency_mean, latency_m2 FROM ${TABLE} WHERE id = ?`,
        )
        .bind(armId)
        .first();
      if (!row) return;

      const cn = Number(row.cost_n) || 0;
      const cm = Number(row.cost_mean) || 0;
      const cm2 = Number(row.cost_m2) || 0;
      const ln = Number(row.latency_n) || 0;
      const lm = Number(row.latency_mean) || 0;
      const lm2 = Number(row.latency_m2) || 0;

      const newCn = cn + 1;
      const newCm = cn === 0 ? costUsd : cm + (costUsd - cm) / newCn;
      const newCm2 = cm2 + (costUsd - cm) * (costUsd - newCm);

      const newLn = ln + 1;
      const newLm = ln === 0 ? durationMs : lm + (durationMs - lm) / newLn;
      const newLm2 = lm2 + (durationMs - lm) * (durationMs - newLm);

      await db
        .prepare(
          `UPDATE ${TABLE} SET
            success_alpha = success_alpha + ?,
            success_beta = success_beta + ?,
            cost_n = ?, cost_mean = ?, cost_m2 = ?,
            latency_n = ?, latency_mean = ?, latency_m2 = ?,
            updated_at = unixepoch()
           WHERE id = ?`,
        )
        .bind(da, dBeta, newCn, newCm, newCm2, newLn, newLm, newLm2, armId)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE ${TABLE} SET
            success_alpha = success_alpha + ?,
            success_beta = success_beta + ?,
            cost_n = cost_n + 1,
            cost_mean = CASE WHEN cost_n = 0 THEN ? ELSE (cost_mean * cost_n + ?) / (cost_n + 1) END,
            latency_n = latency_n + 1,
            latency_mean = CASE WHEN latency_n = 0 THEN ? ELSE (latency_mean * latency_n + ?) / (latency_n + 1) END,
            updated_at = unixepoch()
           WHERE id = ?`,
        )
        .bind(da, dBeta, costUsd, costUsd, durationMs, durationMs, armId)
        .run();
    }
  } catch (e) {
    console.warn('[routing_arms] usage feedback', e?.message ?? e);
  }
}

export function scheduleRoutingArmFeedbackFromUsage(env, ctx, o) {
  if (!env?.DB || !ctx?.waitUntil) return;
  ctx.waitUntil(applyRoutingArmUsageFeedback(env, o));
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

/** Alias for {@link getDefaultModelForTask} — Thompson arm pick for auto model. */
export async function selectAutoModel(env, ctx = {}) {
  return getDefaultModelForTask(env, ctx);
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
