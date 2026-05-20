/**
 * AgentSam — Canonical Model Resolver  v2.0
 * src/core/resolveModel.js
 *
 * SINGLE SOURCE OF TRUTH for model → provider → api_platform resolution.
 * Every runtime path (chat SSE, workflow nodes, MCP tools, eval runners,
 * terminal agents) MUST call resolveModelForTask() and consume the returned
 * ResolvedModel. Nobody decides provider from a raw string.
 *
 * Resolution chain (first match wins, never returns null):
 *   A. Explicit routing_arm_id        → honor caller's arm directly
 *   B. Explicit requested_model_key   → respect user/UI picker choice
 *   C. Thompson sampling              → Beta(α,β) draw across eligible arms
 *   D. Global arm policy              → agentsam_routing_arms (no workspace)
 *   E. JS emergency hardstop          → EMERGENCY_POLICY (last resort, warns)
 *
 * Deploy: npm run deploy:full
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Provider normalizer
//    Canonical output: openai | anthropic | google | workers_ai | ollama
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['openai_api', 'openai_chat_completions', 'openai_responses'].includes(v)) return 'openai';
  if (v === 'anthropic_api') return 'anthropic';
  if (['google_gemini', 'gemini_api', 'vertex_ai', 'google'].includes(v)) return 'google';
  if (['workersai', 'cloudflare_workers_ai', 'workers_ai', 'cloudflare'].includes(v)) return 'workers_ai';
  if (v === 'ollama') return 'ollama';
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pricing
//    computeCostUsd — all prices stored as per-1k in catalog, converted here.
// ─────────────────────────────────────────────────────────────────────────────

export function computeCostUsd(resolvedModel, {
  inputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
} = {}) {
  if (!resolvedModel) return 0;
  const inRate  = (resolvedModel.input_price_per_1m  || 0) / 1_000_000;
  const cchRate = (resolvedModel.cached_input_price_per_1m || inRate * 0.1) / 1_000_000;
  const outRate = (resolvedModel.output_price_per_1m || 0) / 1_000_000;
  return (inputTokens * inRate) + (cachedInputTokens * cchRate) + (outputTokens * outRate);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Thompson sampling — real Beta(α, β) draws
//    Marsaglia-Tsang gamma + Box-Muller normal. No external deps.
// ─────────────────────────────────────────────────────────────────────────────

function _normalSample() {
  // Box-Muller transform
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function _gammaSample(alpha) {
  // Marsaglia & Tsang (2000) for alpha >= 1
  // Ahrens-Dieter reduction for alpha < 1
  if (alpha < 1) return _gammaSample(1 + alpha) * Math.pow(Math.random(), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = _normalSample();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Draw a sample from Beta(alpha, beta).
 * Used for Thompson sampling: arm with highest draw wins.
 * @param {number} alpha - success count + 1 (prior)
 * @param {number} beta  - failure count + 1 (prior)
 * @returns {number} sample in (0, 1)
 */
export function betaSample(alpha, beta) {
  const a = Math.max(0.01, Number(alpha) || 1);
  const b = Math.max(0.01, Number(beta)  || 1);
  const x = _gammaSample(a);
  const y = _gammaSample(b);
  return x / (x + y);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Structured error type
// ─────────────────────────────────────────────────────────────────────────────

export class ResolutionError extends Error {
  /**
   * @param {string} code   - machine-readable code
   * @param {string} detail - human-readable detail
   * @param {object} [meta] - extra context
   */
  constructor(code, detail, meta = {}) {
    super(`[resolveModel:${code}] ${detail}`);
    this.name = 'ResolutionError';
    this.code = code;
    this.meta = meta;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Emergency JS policy (Path E — last resort only)
//    These are NEVER the primary routing decision.
//    Thompson arms and DB policy take precedence.
//    Update here only if you add a new task_type with zero arms.
// ─────────────────────────────────────────────────────────────────────────────

const EMERGENCY_POLICY = {
  chat:                   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash-lite' },
  code:                   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash'      },
  plan:                   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash'      },
  tool_use:               { primary: 'gpt-5.4-mini',  fallback: 'claude-sonnet-4-6'     },
  intent_classification:  { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  rag_query:              { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  summary:                { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  skill_invocation:       { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  terminal_execution:     { primary: 'gpt-5.4-mini',  fallback: 'gpt-5.4'              },
  subagent_dispatch:      { primary: 'gpt-5.4',        fallback: 'gpt-5.4-mini'         },
  workflow_orchestration: { primary: 'gpt-5.4',        fallback: 'gpt-5.4-mini'         },
  cms_edit:               { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash'      },
  cms_theme_generation:   { primary: 'gpt-5.4-nano',  fallback: 'claude-sonnet-4-6'     },
  sql_d1_generation:      { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash'      },
  deploy:                 { primary: 'gpt-5.4-mini',  fallback: 'claude-haiku-4-5-20251001' },
  debug:                  { primary: 'gpt-5.4',        fallback: 'claude-sonnet-4-6'     },
  research:               { primary: 'gemini-2.5-pro', fallback: 'gpt-5.4'              },
  embedding:              { primary: '@cf/baai/bge-m3', fallback: null                  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Core model loader
//    Joins agentsam_model_catalog + agentsam_ai for the complete picture.
//    Returns a ResolvedModel — the canonical object every dispatch path uses.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ResolvedModel
 * @property {string}   model_key
 * @property {string}   model_catalog_id
 * @property {string}   provider          - canonical: openai|anthropic|google|workers_ai|ollama
 * @property {string}   api_platform      - same as provider (dispatch compat)
 * @property {string}   routing_lane      - fast|standard|reasoning|specialized
 * @property {string}   resolution_source - arm|requested|thompson|policy|emergency
 * @property {string|null} routing_arm_id
 * // Provider-specific model IDs (send these to the API, not model_key)
 * @property {string|null} openai_model_id
 * @property {string|null} anthropic_model_id
 * @property {string|null} google_model_id
 * @property {string|null} workers_ai_model_id
 * @property {string|null} ollama_model_id
 * // Capabilities
 * @property {boolean}  supports_tools
 * @property {boolean}  supports_vision
 * @property {boolean}  supports_json_mode
 * @property {boolean}  supports_streaming
 * @property {boolean}  supports_reasoning
 * @property {boolean}  supports_prompt_cache
 * @property {boolean}  supports_thinking
 * // Context
 * @property {number}   context_window
 * @property {number}   max_output_tokens
 * // Pricing (per 1M tokens in USD)
 * @property {number}   input_price_per_1m
 * @property {number}   cached_input_price_per_1m
 * @property {number}   output_price_per_1m
 * // Runtime
 * @property {number}   timeout_ms
 * @property {string|null} secret_key_name  - env var holding the API key
 * @property {string}   reasoning_effort  - low|medium|high
 */

async function loadModelRecord(db, model_key, source, arm_id = null, opts = {}) {
  const {
    require_tools   = false,
    require_vision  = false,
    require_json_mode = false,
  } = opts;

  // Join both tables — catalog has specs, agentsam_ai has runtime config
  const row = await db.prepare(`
    SELECT
      mc.id                    AS catalog_id,
      mc.model_key,
      mc.provider              AS catalog_provider,
      mc.anthropic_model_id,
      mc.openai_model_id,
      mc.google_model_id,
      mc.workers_ai_model_id,
      mc.ollama_model_id,
      mc.context_window,
      mc.max_output_tokens,
      mc.cost_per_1k_in,
      mc.cost_per_1k_out,
      mc.supports_tools,
      mc.supports_vision,
      mc.supports_json_mode,
      mc.supports_streaming,
      mc.supports_reasoning,
      mc.supports_code_execution,
      mc.routing_lane,
      mc.avg_latency_p50_ms,
      mc.is_degraded,
      mc.degraded_reason,
      mc.budget_exhausted,
      -- agentsam_ai runtime overrides (prefer these when present)
      ai.id                    AS ai_id,
      ai.api_platform,
      ai.secret_key_name,
      ai.default_timeout_ms,
      ai.supports_prompt_cache,
      ai.supports_thinking,
      ai.reasoning_effort,
      ai.context_max_tokens,
      ai.output_max_tokens,
      ai.input_rate_per_mtok,
      ai.output_rate_per_mtok,
      ai.cache_read_rate_per_mtok,
      ai.show_in_picker,
      ai.picker_eligible
    FROM agentsam_model_catalog mc
    LEFT JOIN agentsam_ai ai
      ON ai.model_key = mc.model_key
     AND ai.status    = 'active'
     AND (ai.mode = 'model' OR ai.mode IS NULL OR ai.model_key IS NOT NULL)
    WHERE mc.model_key = ?
      AND mc.is_active = 1
    LIMIT 1
  `).bind(model_key).first();

  if (!row) {
    throw new ResolutionError('MODEL_NOT_FOUND',
      `model_key "${model_key}" not found or inactive`, { model_key, source });
  }
  if (row.is_degraded) {
    console.warn(`[resolveModel] DEGRADED model=${model_key} reason=${row.degraded_reason}`);
  }
  if (row.budget_exhausted) {
    throw new ResolutionError('BUDGET_EXHAUSTED',
      `model "${model_key}" budget exhausted`, { model_key, source });
  }
  if (require_tools    && !row.supports_tools)    throw new ResolutionError('CAPABILITY_MISMATCH', `${model_key} no tools`,     { model_key });
  if (require_vision   && !row.supports_vision)   throw new ResolutionError('CAPABILITY_MISMATCH', `${model_key} no vision`,    { model_key });
  if (require_json_mode && !row.supports_json_mode) throw new ResolutionError('CAPABILITY_MISMATCH', `${model_key} no json_mode`, { model_key });

  const provider = normalizeProvider(row.api_platform || row.catalog_provider);

  // Pricing: prefer agentsam_ai per-mtok rates, fall back to catalog per-1k * 1000
  const inputPer1m  = row.input_rate_per_mtok  != null
    ? Number(row.input_rate_per_mtok)
    : (Number(row.cost_per_1k_in  || 0) * 1000);
  const outputPer1m = row.output_rate_per_mtok != null
    ? Number(row.output_rate_per_mtok)
    : (Number(row.cost_per_1k_out || 0) * 1000);
  const cachedPer1m = row.cache_read_rate_per_mtok != null
    ? Number(row.cache_read_rate_per_mtok)
    : inputPer1m * 0.1;

  return {
    // Identity
    model_key,
    model_catalog_id:         row.catalog_id,
    provider,
    api_platform:             provider,
    routing_lane:             row.routing_lane || 'standard',
    resolution_source:        source,
    routing_arm_id:           arm_id ?? null,
    // Provider-specific IDs
    openai_model_id:          row.openai_model_id       || null,
    anthropic_model_id:       row.anthropic_model_id    || null,
    google_model_id:          row.google_model_id       || null,
    workers_ai_model_id:      row.workers_ai_model_id   || null,
    ollama_model_id:          row.ollama_model_id       || null,
    // Capabilities
    supports_tools:           !!row.supports_tools,
    supports_vision:          !!row.supports_vision,
    supports_json_mode:       !!row.supports_json_mode,
    supports_streaming:       !!row.supports_streaming,
    supports_reasoning:       !!row.supports_reasoning,
    supports_code_execution:  !!row.supports_code_execution,
    supports_prompt_cache:    !!(row.supports_prompt_cache),
    supports_thinking:        !!(row.supports_thinking),
    // Context limits (prefer agentsam_ai overrides)
    context_window:           Number(row.context_max_tokens || row.context_window || 0),
    max_output_tokens:        Number(row.output_max_tokens  || row.max_output_tokens || 0),
    // Pricing
    input_price_per_1m:       inputPer1m,
    cached_input_price_per_1m: cachedPer1m,
    output_price_per_1m:      outputPer1m,
    // Runtime
    timeout_ms:               Number(row.default_timeout_ms || 30000),
    secret_key_name:          row.secret_key_name || null,
    reasoning_effort:         row.reasoning_effort || 'medium',
    avg_latency_p50_ms:       row.avg_latency_p50_ms || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Thompson arm selector (Path C)
//    Fetches up to N eligible arms, draws Beta(α,β) for each, returns winner.
//    Falls through to null if no eligible arms exist.
// ─────────────────────────────────────────────────────────────────────────────

const THOMPSON_CANDIDATE_LIMIT = 8;

async function selectThompsonArm(db, {
  task_type,
  mode,
  workspace_id,
  require_tools,
}) {
  const wsId = workspace_id ?? '';

  const { results: arms } = await db.prepare(`
    SELECT
      ra.id,
      ra.model_key,
      ra.success_alpha,
      ra.success_beta,
      ra.decayed_score,
      ra.priority,
      ra.workspace_id
    FROM agentsam_routing_arms ra
    INNER JOIN agentsam_model_catalog mc
      ON mc.model_key = ra.model_key
     AND mc.is_active = 1
     AND mc.is_degraded = 0
     AND mc.budget_exhausted = 0
    WHERE ra.task_type = ?
      AND ra.mode      = ?
      AND ra.is_active  = 1
      AND ra.is_eligible = 1
      AND ra.is_paused   = 0
      AND ra.budget_exhausted = 0
      AND (ra.workspace_id = ? OR ra.workspace_id = '' OR ra.workspace_id IS NULL)
      ${require_tools ? 'AND mc.supports_tools = 1' : ''}
    ORDER BY
      CASE WHEN ra.workspace_id = ? THEN 0 ELSE 1 END,
      ra.priority DESC
    LIMIT ${THOMPSON_CANDIDATE_LIMIT}
  `).bind(task_type, mode, wsId, wsId).all().catch(() => ({ results: [] }));

  if (!arms || arms.length === 0) return null;

  // Draw Beta(α, β) sample for each arm — highest draw wins
  const ranked = arms
    .map(arm => ({
      ...arm,
      draw: betaSample(
        Number(arm.success_alpha) || 1,
        Number(arm.success_beta)  || 1,
      ),
    }))
    .sort((a, b) => b.draw - a.draw);

  // Return arms in priority order so caller can try next on failure
  return ranked;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Global policy query (Path D)
//    Global arms (no workspace) act as the DB-driven policy fallback.
//    No hardcoded model strings here — this is entirely data-driven.
// ─────────────────────────────────────────────────────────────────────────────

async function queryGlobalPolicyArm(db, { task_type, mode, require_tools }) {
  // Try exact mode, then 'auto', then any mode for this task
  for (const tryMode of [mode, 'auto', null]) {
    const modeClause = tryMode != null ? 'AND ra.mode = ?' : '';
    const binds = tryMode != null
      ? [task_type, tryMode]
      : [task_type];

    const arm = await db.prepare(`
      SELECT ra.id, ra.model_key
      FROM agentsam_routing_arms ra
      INNER JOIN agentsam_model_catalog mc
        ON mc.model_key = ra.model_key
       AND mc.is_active = 1
       AND mc.is_degraded = 0
      WHERE ra.task_type = ?
        ${modeClause}
        AND ra.is_active = 1
        AND ra.is_eligible = 1
        AND ra.is_paused = 0
        AND ra.budget_exhausted = 0
        AND (ra.workspace_id IS NULL OR ra.workspace_id = '')
        ${require_tools ? 'AND mc.supports_tools = 1' : ''}
      ORDER BY ra.priority DESC, ra.decayed_score DESC
      LIMIT 1
    `).bind(...binds).first().catch(() => null);

    if (arm) return arm;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Main resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} env
 * @param {object} opts
 * @param {string}   opts.task_type
 * @param {string}   [opts.mode='auto']
 * @param {string}   [opts.requested_model_key]
 * @param {string}   [opts.routing_arm_id]
 * @param {string}   [opts.workspace_id]
 * @param {string}   [opts.tenant_id]
 * @param {boolean}  [opts.require_tools=false]
 * @param {boolean}  [opts.require_vision=false]
 * @param {boolean}  [opts.require_json_mode=false]
 * @returns {Promise<ResolvedModel>}
 */
export async function resolveModelForTask(env, {
  task_type,
  mode            = 'auto',
  requested_model_key = null,
  routing_arm_id  = null,
  workspace_id    = null,
  tenant_id       = null,
  require_tools   = false,
  require_vision  = false,
  require_json_mode = false,
} = {}) {
  if (!env?.DB) throw new ResolutionError('NO_DB', 'env.DB unavailable');
  if (!task_type) throw new ResolutionError('MISSING_TASK_TYPE', 'task_type is required');

  const db  = env.DB;
  const t0  = Date.now();
  const cap = { require_tools, require_vision, require_json_mode };
  let   source = 'unknown';

  try {
    // ── Path A: explicit arm ID ─────────────────────────────────────────────
    if (routing_arm_id) {
      source = 'arm';
      const arm = await db.prepare(`
        SELECT ra.id, ra.model_key
        FROM agentsam_routing_arms ra
        WHERE ra.id = ?
          AND ra.is_active = 1 AND ra.is_eligible = 1
          AND ra.is_paused = 0 AND ra.budget_exhausted = 0
      `).bind(routing_arm_id).first();

      if (!arm) throw new ResolutionError('ARM_NOT_ELIGIBLE',
        `arm "${routing_arm_id}" is not eligible`, { routing_arm_id });

      const resolved = await loadModelRecord(db, arm.model_key, 'arm', arm.id, cap);
      _log(resolved, t0, 'A');
      return resolved;
    }

    // ── Path B: explicit model key (user/UI picker) ─────────────────────────
    if (requested_model_key) {
      source = 'requested';
      const resolved = await loadModelRecord(db, requested_model_key, 'requested', null, cap);
      _log(resolved, t0, 'B');
      return resolved;
    }

    // ── Path C: Thompson sampling across eligible arms ──────────────────────
    source = 'thompson';
    const candidates = await selectThompsonArm(db, {
      task_type, mode, workspace_id, require_tools,
    });

    if (candidates && candidates.length > 0) {
      // Try arms in Thompson-ranked order — skip degraded/missing
      for (const arm of candidates) {
        try {
          const resolved = await loadModelRecord(db, arm.model_key, 'thompson', arm.id, cap);
          _log(resolved, t0, 'C', { draw: arm.draw, candidates: candidates.length });
          return resolved;
        } catch (e) {
          if (e instanceof ResolutionError && ['MODEL_NOT_FOUND', 'BUDGET_EXHAUSTED', 'CAPABILITY_MISMATCH'].includes(e.code)) {
            console.warn(`[resolveModel] C skip arm=${arm.id} model=${arm.model_key}: ${e.code}`);
            continue;
          }
          throw e;
        }
      }
    }

    // ── Path D: DB global policy (workspace-agnostic arms) ──────────────────
    source = 'policy';
    const globalArm = await queryGlobalPolicyArm(db, { task_type, mode, require_tools });
    if (globalArm) {
      try {
        const resolved = await loadModelRecord(db, globalArm.model_key, 'policy', globalArm.id, cap);
        _log(resolved, t0, 'D');
        return resolved;
      } catch (e) {
        console.warn(`[resolveModel] D policy arm failed model=${globalArm.model_key}: ${e.message}`);
      }
    }

    // ── Path E: JS emergency hardstop ───────────────────────────────────────
    source = 'emergency';
    const policy = EMERGENCY_POLICY[task_type]
      ?? EMERGENCY_POLICY['chat'];

    console.warn(`[resolveModel] E EMERGENCY task=${task_type} mode=${mode} — no arms or global policy found. Seed agentsam_routing_arms.`);

    for (const [key, src] of [
      [policy?.primary,  'emergency'],
      [policy?.fallback, 'emergency_fallback'],
    ]) {
      if (!key) continue;
      try {
        const resolved = await loadModelRecord(db, key, src, null, cap);
        _log(resolved, t0, 'E');
        return resolved;
      } catch (e) {
        console.warn(`[resolveModel] E emergency model="${key}" failed: ${e.message}`);
      }
    }

    throw new ResolutionError('RESOLUTION_EXHAUSTED',
      `all paths failed for task_type="${task_type}" mode="${mode}"`,
      { task_type, mode, workspace_id });

  } catch (e) {
    if (e instanceof ResolutionError) throw e;
    throw new ResolutionError('UNEXPECTED', e?.message ?? String(e), { task_type, mode, source });
  }
}

function _log(resolved, t0, path, extra = {}) {
  console.log('[resolveModel]', JSON.stringify({
    path,
    model: resolved.model_key,
    provider: resolved.provider,
    lane: resolved.routing_lane,
    arm: resolved.routing_arm_id,
    source: resolved.resolution_source,
    ms: Date.now() - t0,
    ...extra,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Run finalizer
//     Call after EVERY provider call to write telemetry back to D1.
//     Uses PRAGMA-driven column set — safe against schema drift.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object}        env
 * @param {string}        run_id        - agentsam_agent_run.id
 * @param {ResolvedModel} resolvedModel - from resolveModelForTask()
 * @param {object}        usage         - token counts from provider response
 * @param {object}        [opts]        - { status, error_message }
 */
export async function finalizeAgentRun(env, run_id, resolvedModel, usage = {}, opts = {}) {
  if (!run_id) return;
  const {
    input_tokens        = 0,
    cached_input_tokens = 0,
    output_tokens       = 0,
    reasoning_tokens    = 0,
    latency_ms          = 0,
  } = usage;

  const cost_usd = resolvedModel
    ? computeCostUsd(resolvedModel, { inputTokens: input_tokens, cachedInputTokens: cached_input_tokens, outputTokens: output_tokens })
    : 0;
  const status = opts.status ?? 'completed';

  // Column-safe: only write what exists in the schema
  const sets  = [];
  const binds = [];
  const push  = (col, val) => { sets.push(`${col} = ?`); binds.push(val); };

  push('status', status);
  push('input_tokens',  Math.max(0, Math.floor(Number(input_tokens)  || 0)));
  push('output_tokens', Math.max(0, Math.floor(Number(output_tokens) || 0)));
  push('cost_usd', Number(cost_usd) || 0);
  push('completed_at', new Date().toISOString());

  if (resolvedModel) {
    push('model_id',      resolvedModel.model_key);
    push('ai_model_ref',  resolvedModel.model_key);
    push('model_key',     resolvedModel.model_key);
    push('model_catalog_id', resolvedModel.model_catalog_id ?? null);
  }
  if (opts.error_message != null) push('error_message', String(opts.error_message).slice(0, 8000));

  // Optional columns added by Phase 1 migration
  const optionalCols = {
    cached_input_tokens: Math.max(0, Math.floor(Number(cached_input_tokens) || 0)),
    reasoning_tokens:    Math.max(0, Math.floor(Number(reasoning_tokens)    || 0)),
    latency_ms:          Math.max(0, Math.floor(Number(latency_ms)          || 0)),
  };

  // Check schema once per request (cheap — D1 caches pragma results)
  try {
    const { results: cols } = await env.DB.prepare(
      `SELECT name FROM pragma_table_info('agentsam_agent_run')`
    ).all();
    const colSet = new Set(cols.map(c => c.name));
    for (const [col, val] of Object.entries(optionalCols)) {
      if (colSet.has(col)) push(col, val);
    }
  } catch (_) { /* pragma failure — skip optional cols */ }

  if (!sets.length) return;
  binds.push(run_id);

  try {
    await env.DB.prepare(
      `UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...binds).run();
  } catch (e) {
    console.error('[finalizeAgentRun]', e?.message ?? e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Webhook node handler
//     Drop-in for workflow engine node dispatch.
//     case 'webhook': return executeWebhookNode(env, node, input, ctx)
// ─────────────────────────────────────────────────────────────────────────────

export async function executeWebhookNode(env, node, stepInput, ctx = {}) {
  const config = node.handler_key != null
    ? await env.DB.prepare(
        `SELECT config_json FROM agentsam_workflow_nodes WHERE id = ? LIMIT 1`
      ).bind(node.id).first()
        .then(r => { try { return JSON.parse(r?.config_json || '{}'); } catch { return {}; } })
        .catch(() => ({}))
    : {};

  const url = config.url || node.handler_config?.url;
  if (!url) throw new ResolutionError('WEBHOOK_NO_URL',
    `webhook node "${node.node_key}" has no url in config_json`);

  const timeout = Number(node.timeout_ms) || 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method:  config.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
      body:    JSON.stringify({ node_key: node.node_key, workflow_run_id: ctx.run_id, ...stepInput }),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`webhook HTTP ${resp.status} from ${url}`);
    const text = await resp.text();
    try { return { ok: true, output: JSON.parse(text) }; }
    catch { return { ok: true, output: { raw: text } }; }
  } catch (e) {
    clearTimeout(timer);
    const msg = e?.name === 'AbortError' ? `webhook timeout after ${timeout}ms` : e.message;
    return { ok: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Integration guide (agent.js wiring)
// ─────────────────────────────────────────────────────────────────────────────
/*
IMPORT (top of agent.js):
  import {
    resolveModelForTask,
    finalizeAgentRun,
    computeCostUsd,
    betaSample,
    ResolutionError,
  } from '../core/resolveModel.js';

USAGE PATTERN inside chat SSE handler:

  const runId = newChatAgentRunId({ label: quickstartBatch });

  // Insert run stub (status=running) — existing scheduleAgentsamChatAgentRunStart handles this

  let resolved;
  try {
    resolved = await resolveModelForTask(env, {
      task_type:           resolvedRoutingTaskType ?? 'chat',
      mode:                requestedMode,
      requested_model_key: rawRequestedKey || null,
      routing_arm_id:      routingArmIdForRun || null,
      workspace_id:        resolvedWorkspaceId,
      tenant_id:           tenantId,
      require_tools:       requireTools,
    });
  } catch (e) {
    if (e instanceof ResolutionError) {
      emit('error', { message: e.message, code: e.code });
      emit('done', {});
      writer.close();
      return new Response(readable, sseHeaders);
    }
    throw e;
  }

  // Dispatch using canonical provider — no raw string branching
  // resolved.provider ∈ { openai, anthropic, google, workers_ai, ollama }
  // resolved.openai_model_id / anthropic_model_id / google_model_id
  // resolved.timeout_ms / resolved.secret_key_name

  // After stream completes:
  await finalizeAgentRun(env, runId, resolved, {
    input_tokens:        finalInputTokens,
    cached_input_tokens: cacheReadTokens ?? 0,
    output_tokens:       finalOutputTokens,
    reasoning_tokens:    reasoningTokens  ?? 0,
    latency_ms:          Date.now() - chatT0,
  }, { status: succeeded ? 'completed' : 'failed', error_message: loopFailureReason });

TESTING:
  // Dry-run resolution without dispatching
  const m = await resolveModelForTask(env, { task_type: 'chat', mode: 'agent', workspace_id: 'ws_inneranimalmedia' });
  console.log(m.model_key, m.provider, m.resolution_source, m.routing_arm_id);
*/
