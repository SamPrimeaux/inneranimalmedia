/**
 * AgentSam — Canonical Model Resolver
 * src/core/resolveModel.js
 *
 * SINGLE SOURCE OF TRUTH for model → provider → api_platform resolution.
 * Every runtime path (chat SSE, workflow nodes, MCP tools, eval runners,
 * terminal agents) must call resolveModelForTask() and consume the returned
 * ResolvedModel object. Nobody gets to decide provider from a raw string.
 *
 * Replace with this file. Deploy via: npm run deploy:full
 */

// ---------------------------------------------------------------------------
// 1. Provider normalizer
//    Accepts any legacy or canonical string and returns the canonical form.
//    DB values stay as-is; this runs at the boundary between DB and dispatch.
// ---------------------------------------------------------------------------
export function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'openai_api' || v === 'openai_chat_completions' || v === 'openai_responses') return 'openai';
  if (v === 'anthropic_api') return 'anthropic';
  if (v === 'google_gemini' || v === 'gemini_api' || v === 'vertex_ai') return 'google';
  if (v === 'workersai' || v === 'cloudflare_workers_ai' || v === 'workers_ai') return 'workers_ai';
  if (v === 'ollama') return 'ollama';
  return v; // pass through canonical values as-is
}

// ---------------------------------------------------------------------------
// 2. Pricing helper
//    Compute cost_usd from a resolved model + token counts.
//    All prices are per-1M-token in the catalog (cost_per_1k_in * 1000).
// ---------------------------------------------------------------------------
export function computeCostUsd(resolvedModel, { inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 } = {}) {
  const inPrice  = (resolvedModel.input_price_per_1m  || 0) / 1_000_000;
  const cchPrice = (resolvedModel.cached_input_price_per_1m || inPrice * 0.1) / 1_000_000;
  const outPrice = (resolvedModel.output_price_per_1m || 0) / 1_000_000;
  return (
    inputTokens        * inPrice  +
    cachedInputTokens  * cchPrice +
    outputTokens       * outPrice
  );
}

// ---------------------------------------------------------------------------
// 3. Routing policy table
//    Used when NO routing arm is specified — pure fallback logic.
//    Keys: task_type → mode → { primary, fallback }
// ---------------------------------------------------------------------------
const ROUTING_POLICY = {
  chat: {
    auto:   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash-lite' },
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash-lite' },
    ask:    { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash-lite' },
    build:  { primary: 'gpt-5.4-mini',  fallback: 'claude-sonnet-4-6' },
  },
  code: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },
    auto:   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },
    build:  { primary: 'gpt-5.4',       fallback: 'gpt-5.4-mini' },
    debug:  { primary: 'gpt-5.4',       fallback: 'claude-sonnet-4-6' },
  },
  plan: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },
  },
  tool_use: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'claude-sonnet-4-6' },
    auto:   { primary: 'gpt-5.4-mini',  fallback: 'claude-sonnet-4-6' },
  },
  intent_classification: {
    auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  },
  rag_query: {
    auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  },
  summary: {
    auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  },
  skill_invocation: {
    auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },
  },
  terminal_execution: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gpt-5.4' },
  },
  subagent_dispatch: {
    agent:  { primary: 'gpt-5.4',       fallback: 'gpt-5.4-mini' },
  },
  workflow_orchestration: {
    agent:  { primary: 'gpt-5.4',       fallback: 'gpt-5.4-mini' },
  },
  cms_edit: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },
  },
  cms_theme_generation: {
    agent:  { primary: 'gpt-5.4-nano',  fallback: 'claude-sonnet-4-6' },
  },
  sql_d1_generation: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },
  },
  deploy: {
    agent:  { primary: 'gpt-5.4-mini',  fallback: 'claude-haiku-4-5-20251001' },
  },
  embedding: {
    auto:   { primary: '@cf/baai/bge-m3', fallback: null },
  },
};

// ---------------------------------------------------------------------------
// 4. The resolver
//    Returns a sealed ResolvedModel or throws. Never returns null.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ResolveModelInput
 * @property {string}  task_type
 * @property {string}  [mode='auto']
 * @property {string}  [requested_model_key]   - explicit override from user/UI picker
 * @property {string}  [routing_arm_id]         - use this arm directly
 * @property {string}  [workspace_id]
 * @property {string}  [tenant_id]
 * @property {boolean} [require_tools=false]
 * @property {boolean} [require_vision=false]
 * @property {boolean} [require_json_mode=false]
 *
 * @typedef {Object} ResolvedModel
 * @property {string}  model_key
 * @property {string}  provider                  - canonical: openai | anthropic | google | workers_ai | ollama
 * @property {string}  api_platform              - canonical same as provider (kept for compat)
 * @property {string}  model_catalog_id
 * @property {string}  [openai_model_id]         - actual string to send to OpenAI API
 * @property {string}  [anthropic_model_id]      - actual string to send to Anthropic API
 * @property {string}  [google_model_id]         - actual string to send to Google API
 * @property {string}  [workers_ai_model_id]
 * @property {string}  [ollama_model_id]
 * @property {number}  context_window
 * @property {number}  max_output_tokens
 * @property {number}  input_price_per_1m        - price per 1M input tokens in USD
 * @property {number}  cached_input_price_per_1m
 * @property {number}  output_price_per_1m
 * @property {boolean} supports_tools
 * @property {boolean} supports_vision
 * @property {boolean} supports_json_mode
 * @property {boolean} supports_streaming
 * @property {boolean} supports_reasoning
 * @property {string}  [routing_arm_id]
 * @property {string}  resolution_source         - 'arm' | 'requested' | 'policy' | 'fallback'
 */

export async function resolveModelForTask(env, {
  task_type,
  mode = 'auto',
  requested_model_key = null,
  routing_arm_id = null,
  workspace_id = null,
  tenant_id = null,
  require_tools = false,
  require_vision = false,
  require_json_mode = false,
} = {}) {
  const db = env.DB;

  // Helper: load a catalog row and convert to ResolvedModel
  async function loadCatalog(model_key, source, arm_id = null) {
    const row = await db.prepare(
      `SELECT * FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`
    ).bind(model_key).first();
    if (!row) throw new Error(`resolveModel: model_key "${model_key}" not found or inactive in catalog`);
    if (row.is_degraded) console.warn(`[resolveModel] model ${model_key} is degraded: ${row.degraded_reason}`);
    if (row.budget_exhausted) throw new Error(`resolveModel: model "${model_key}" budget exhausted`);
    if (require_tools && !row.supports_tools) throw new Error(`resolveModel: model "${model_key}" does not support tools`);
    if (require_vision && !row.supports_vision) throw new Error(`resolveModel: model "${model_key}" does not support vision`);
    if (require_json_mode && !row.supports_json_mode) throw new Error(`resolveModel: model "${model_key}" does not support JSON mode`);

    const provider = normalizeProvider(row.api_platform || row.provider);
    return {
      model_key:                row.model_key,
      provider,
      api_platform:             provider,
      model_catalog_id:         row.id,
      openai_model_id:          row.openai_model_id   || null,
      anthropic_model_id:       row.anthropic_model_id || null,
      google_model_id:          row.google_model_id    || null,
      workers_ai_model_id:      row.workers_ai_model_id || null,
      ollama_model_id:          row.ollama_model_id    || null,
      context_window:           row.context_window,
      max_output_tokens:        row.max_output_tokens,
      // Convert per-1k to per-1M for consistent math
      input_price_per_1m:       (row.cost_per_1k_in  || 0) * 1000,
      cached_input_price_per_1m:(row.cost_per_1k_in  || 0) * 100,  // prefer agentsam_ai.cache_read_rate_per_mtok for billing
      output_price_per_1m:      (row.cost_per_1k_out || 0) * 1000,
      supports_tools:           !!row.supports_tools,
      supports_vision:          !!row.supports_vision,
      supports_json_mode:       !!row.supports_json_mode,
      supports_streaming:       !!row.supports_streaming,
      supports_reasoning:       !!row.supports_reasoning,
      routing_arm_id:           arm_id,
      resolution_source:        source,
    };
  }

  // --- Path A: explicit arm ID ---
  if (routing_arm_id) {
    const arm = await db.prepare(
      `SELECT ra.*, mc.model_key as cat_model_key
       FROM agentsam_routing_arms ra
       LEFT JOIN agentsam_model_catalog mc ON mc.id = ra.model_catalog_id
       WHERE ra.id = ? AND ra.is_active = 1 AND ra.is_eligible = 1
         AND ra.is_paused = 0 AND ra.budget_exhausted = 0`
    ).bind(routing_arm_id).first();
    if (!arm) throw new Error(`resolveModel: routing arm "${routing_arm_id}" not eligible`);
    return loadCatalog(arm.model_key, 'arm', arm.id);
  }

  // --- Path B: explicit model key from UI/user ---
  if (requested_model_key) {
    return loadCatalog(requested_model_key, 'requested');
  }

  // --- Path C: routing arms query (workspace-first, then global) ---
  const armRow = await db.prepare(`
    SELECT ra.id, ra.model_key
    FROM agentsam_routing_arms ra
    INNER JOIN agentsam_model_catalog mc ON mc.id = ra.model_catalog_id AND mc.is_active = 1
    WHERE ra.task_type = ?
      AND ra.mode = ?
      AND ra.is_active = 1
      AND ra.is_eligible = 1
      AND ra.is_paused = 0
      AND ra.budget_exhausted = 0
      AND (ra.workspace_id = ? OR ra.workspace_id = '' OR ra.workspace_id IS NULL)
      ${require_tools ? 'AND ra.supports_tools = 1' : ''}
    ORDER BY
      CASE WHEN ra.workspace_id = ? THEN 0 ELSE 1 END,
      ra.priority DESC,
      ra.decayed_score DESC
    LIMIT 1
  `).bind(task_type, mode, workspace_id ?? '', workspace_id ?? '').first();

  if (armRow) {
    return loadCatalog(armRow.model_key, 'arm', armRow.id);
  }

  // --- Path D: policy table fallback ---
  const policy = ROUTING_POLICY[task_type]?.[mode]
    ?? ROUTING_POLICY[task_type]?.['auto']
    ?? ROUTING_POLICY['chat']?.['auto'];

  if (!policy) throw new Error(`resolveModel: no routing arm or policy for task_type="${task_type}" mode="${mode}"`);

  // Try primary, then fallback
  for (const [key, source] of [[policy.primary, 'policy'], [policy.fallback, 'fallback']]) {
    if (!key) continue;
    try {
      return await loadCatalog(key, source);
    } catch (e) {
      console.warn(`[resolveModel] policy model "${key}" failed: ${e.message}`);
    }
  }

  throw new Error(`resolveModel: all resolution paths exhausted for task_type="${task_type}" mode="${mode}"`);
}

// ---------------------------------------------------------------------------
// 5. Run finalizer
//    Call this after EVERY provider call to write token/cost data back.
//    Handles both agentsam_agent_run and agentsam_executions.
// ---------------------------------------------------------------------------

/**
 * @param {Object} env - Cloudflare Worker env
 * @param {string} run_id - agentsam_agent_run.id
 * @param {ResolvedModel} resolvedModel
 * @param {Object} usage - { input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, latency_ms }
 * @param {Object} [opts] - { status, error_message }
 */
export async function finalizeAgentRun(env, run_id, resolvedModel, usage = {}, opts = {}) {
  if (!run_id || !resolvedModel) return;
  const {
    input_tokens = 0,
    cached_input_tokens = 0,
    output_tokens = 0,
    reasoning_tokens = 0,
    latency_ms = 0,
  } = usage;
  const cost_usd = computeCostUsd(resolvedModel, { inputTokens: input_tokens, cachedInputTokens: cached_input_tokens, outputTokens: output_tokens });
  const status = opts.status ?? 'completed';

  try {
    await env.DB.prepare(`
      UPDATE agentsam_agent_run SET
        status              = ?,
        ai_model_ref        = ?,
        model_key           = ?,
        model_id            = ?,
        model_catalog_id    = ?,
        input_tokens        = ?,
        cached_input_tokens = ?,
        output_tokens       = ?,
        reasoning_tokens    = ?,
        cost_usd            = ?,
        latency_ms          = ?,
        error_message       = ?,
        completed_at        = datetime('now')
      WHERE id = ?
    `).bind(
      status,
      resolvedModel.model_key,
      resolvedModel.model_key,
      resolvedModel.model_key,
      resolvedModel.model_catalog_id ?? null,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      reasoning_tokens,
      cost_usd,
      latency_ms,
      opts.error_message ?? null,
      run_id,
    ).run();
  } catch (e) {
    console.error('[finalizeAgentRun] failed to write run:', e?.message ?? e);
  }
}

// ---------------------------------------------------------------------------
// 6. Webhook node handler
//    Add this to your workflow engine's node dispatch switch.
//    case 'webhook': return executeWebhookNode(env, node, input, ctx)
// ---------------------------------------------------------------------------
export async function executeWebhookNode(env, node, stepInput, ctx = {}) {
  const config = typeof node.handler_key === 'string'
    ? await env.DB.prepare(
        `SELECT config_json FROM agentsam_workflow_nodes WHERE id = ? LIMIT 1`
      ).bind(node.id).first().then(r => JSON.parse(r?.config_json || '{}'))
    : {};

  const url = config.url || node.handler_config?.url;
  if (!url) throw new Error(`webhook node "${node.node_key}" has no url in config_json`);

  const timeout = node.timeout_ms ?? 15_000;
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
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 7. Usage — drop-in example for agent.js chat SSE handler
// ---------------------------------------------------------------------------

/*
import { resolveModelForTask, finalizeAgentRun, computeCostUsd } from '../core/resolveModel.js';

// Inside your chat SSE handler:
const runId = `arun_${crypto.randomUUID().replace(/-/g,'')}`;
await env.DB.prepare(
  `INSERT INTO agentsam_agent_run (id, user_id, status, trigger, started_at, created_at)
   VALUES (?, ?, 'in_progress', 'chat_sse', datetime('now'), datetime('now'))`
).bind(runId, userId).run();

let resolved;
try {
  resolved = await resolveModelForTask(env, {
    task_type:  'chat',
    mode,
    requested_model_key: body.model_id || null,
    workspace_id,
    tenant_id,
    require_tools: hasTools,
  });
} catch (e) {
  await finalizeAgentRun(env, runId, null, {}, { status: 'failed', error_message: e.message });
  return jsonResponse({ error: e.message }, 503);
}

// Dispatch using canonical provider — no more raw string branching
let result;
const startMs = Date.now();
switch (resolved.provider) {
  case 'openai':    result = await chatWithOpenAI(env, resolved, messages, opts); break;
  case 'anthropic': result = await chatWithAnthropic(env, resolved, messages, opts); break;
  case 'google':    result = await chatWithGemini(env, resolved, messages, opts); break;
  case 'workers_ai':result = await chatWithWorkersAI(env, resolved, messages, opts); break;
  case 'ollama':    result = await chatWithOllama(env, resolved, messages, opts); break;
  default:          throw new Error(`Unsupported provider: ${resolved.provider}`);
}

// Write results back — no more zero-token completed runs
await finalizeAgentRun(env, runId, resolved, {
  input_tokens:        result.usage?.input_tokens  ?? result.usage?.prompt_tokens ?? 0,
  cached_input_tokens: result.usage?.cache_read_input_tokens ?? 0,
  output_tokens:       result.usage?.output_tokens ?? result.usage?.completion_tokens ?? 0,
  reasoning_tokens:    result.usage?.reasoning_tokens ?? 0,
  latency_ms:          Date.now() - startMs,
});

// Also update Thompson arms score
if (resolved.routing_arm_id) {
  await updateArmScore(env, resolved.routing_arm_id, { success: true, cost_usd: computeCostUsd(resolved, result.usage) });
}
*/
