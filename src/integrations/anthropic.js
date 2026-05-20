/**
 * Integration: Anthropic
 * Refactored: Official Anthropic TypeScript SDK Integration.
 * Handles tool-calling, streaming, and v4.6 features (Caching, Batching).
 * Zero-hardcoding: Model parameters and feature flags are DB-driven.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  anthropicFeaturesFromCatalogCapabilities,
  loadCatalogCapabilities,
  SCOUT_TASK_TYPES,
} from '../core/model-catalog-capabilities.js';
import { handlers as dbHandlers } from '../tools/db.js';
import { resolveApiKey } from '../core/vault.js';

/** BM25 tool search (official name per Anthropic tool reference). */
const TOOL_SEARCH_BM25 = {
  type: 'tool_search_tool_bm25_20251119',
  name: 'tool_search_tool_bm25',
};

/** Beta namespace for Anthropic-hosted code execution (bash + file ops + Python). @see https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/code-execution-tool */
export const ANTHROPIC_CODE_EXECUTION_BETA = 'code-execution-2025-08-25';

/**
 * Anthropic server-side sandbox tool — not deferred (always visible; avoids tool-search-only discovery).
 * Haiku 4.5: no server-side code execution. Sonnet/Opus 4.5+: prefer `code_execution_20260120`.
 * @param {string} modelKey
 * @returns {{ type: string, name: string } | null}
 */
export function anthropicCodeExecutionToolForModel(modelKey) {
  const mk = String(modelKey || '').toLowerCase();
  if (!mk.includes('claude') && !mk.includes('anthropic_')) return null;
  if (mk.includes('haiku')) {
    return null;
  }
  const is45PlusFamily =
    (mk.includes('sonnet') || mk.includes('opus')) &&
    (mk.includes('4-5') || mk.includes('4-6') || mk.includes('4-7'));
  if (is45PlusFamily) {
    return { type: 'code_execution_20260120', name: 'code_execution' };
  }
  return { type: 'code_execution_20250825', name: 'code_execution' };
}

/**
 * Prepends BM25 tool search, Anthropic code execution (unless disabled), and marks MCP tools deferred.
 * @param {any[]} tools
 * @param {{ modelKey?: string, features?: Record<string, unknown> }} [opts]
 */
export function buildAnthropicMessagesTools(tools, opts = {}) {
  const list = Array.isArray(tools) ? tools : [];
  const modelKey = opts.modelKey != null ? String(opts.modelKey) : '';
  const features = opts.features && typeof opts.features === 'object' ? opts.features : {};
  const codeExecOff = features.anthropic_code_execution === false;

  const rest = list.filter(
    (t) =>
      !(
        t &&
        t.type === TOOL_SEARCH_BM25.type &&
        String(t.name || '') === TOOL_SEARCH_BM25.name
      ),
  );
  // Deduplicate by tool name — multiple upstream sources (MCP tools, catalog
  // enrichment, minimum tool set) can produce the same name more than once.
  // First occurrence wins; Anthropic returns 400 on any duplicate name.
  const _seenNames = new Set();
  const deduped = rest.filter((t) => {
    const n = String(t?.name || '').trim();
    if (!n || _seenNames.has(n)) return false;
    _seenNames.add(n);
    return true;
  });
  const mapped = deduped.map((t) => {
    const schema = t.parameters ?? t.input_schema;
    const out = {
      name: t.name,
      defer_loading: true,
    };
    if (t.description) out.description = t.description;
    if (t.type) out.type = t.type;
    if (schema && typeof schema === 'object') out.input_schema = schema;
    if (t.cache_control) out.cache_control = t.cache_control;
    return out;
  });

  const codeTool = codeExecOff ? null : anthropicCodeExecutionToolForModel(modelKey);
  // Domain tools first (d1_query, terminal, github, r2), code execution last
  // Model picks the right tool — not biased by position
  const tail = codeTool ? [codeTool] : [];
  return [TOOL_SEARCH_BM25, ...mapped, ...tail];
}

/**
 * `code-execution-2025-08-25` beta applies to `code_execution_20250825` / legacy `20250522` only.
 * `code_execution_20260120` is first-party GA — sending the 08-25 beta with it can cause 400.
 */
/**
 * Top-level automatic prompt caching (Anthropic moves breakpoint to last cacheable block).
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching#automatic-caching
 * @param {Record<string, unknown>} features
 * @param {{ promptCaching?: boolean, cacheTtl?: string, systemPrompt?: string }} options
 * @returns {{ type: 'ephemeral', ttl?: string } | null}
 */
export function resolveAnthropicAutomaticCacheControl(features, options = {}) {
  const feats = features && typeof features === 'object' ? features : {};
  if (options.promptCaching === false || feats.prompt_caching === false) return null;

  const explicitOn =
    options.promptCaching === true ||
    feats.prompt_caching === true ||
    feats.prompt_caching === 1;
  const systemLen =
    options.systemPrompt != null ? String(options.systemPrompt).length : 0;
  /** Agent Sam layered prompts are typically 8k+ chars — worth caching on multi-turn chat. */
  const largeStaticPrefix = systemLen >= 8192;

  if (!explicitOn && !largeStaticPrefix) return null;

  const out = { type: 'ephemeral' };
  const ttlRaw = options.cacheTtl ?? feats.cache_ttl;
  const ttl = ttlRaw != null ? String(ttlRaw).trim() : '';
  if (ttl === '1h' || ttl === '5m') out.ttl = ttl;
  return out;
}

export function anthropicCodeExecutionNeeds202508Beta(tools) {
  const list = Array.isArray(tools) ? tools : [];
  return list.some(
    (t) =>
      t &&
      String(t.name || '') === 'code_execution' &&
      (t.type === 'code_execution_20250825' || t.type === 'code_execution_20250522'),
  );
}

/**
 * Executes a tool-aware chat completion using the official Anthropic SDK.
 */
export async function chatWithAnthropic({ messages, tools, env, userId, options = {} }) {
  const apiKey = await resolveApiKey(env, userId, 'ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured for this user');

  const client = new Anthropic({ apiKey });
  const modelForApi = options.model || 'claude-3-5-sonnet-20240620';
  const logicalModelKey =
    options.catalogModelKey != null && String(options.catalogModelKey).trim() !== ''
      ? String(options.catalogModelKey).trim()
      : modelForApi;

  // Dynamic feature and rate lookup from D1 (logical model_key; API id may differ)
  const modelInfo = await dbHandlers.d1_query(
    {
      sql: 'SELECT * FROM agentsam_ai WHERE model_key = ?',
      params: [logicalModelKey],
    },
    env,
  );
  
  const modelData = modelInfo.results?.[0] || {};
  const catalogCap = await loadCatalogCapabilities(env, logicalModelKey);
  const features = {
    ...anthropicFeaturesFromCatalogCapabilities(catalogCap),
    ...JSON.parse(modelData.features_json || '{}'),
  };
  const betas = [...(options.betas || [])];
  if (Array.isArray(features.betas)) {
    for (const b of features.betas) {
      if (typeof b === 'string' && b.trim()) betas.push(b.trim());
    }
  }
  const compactionEnabled = features.compaction === true || features.compaction === 1;
  if (compactionEnabled) betas.push('compact-2026-01-12');

  /** Betas Anthropic no longer accepts on current models (400 invalid_request_error). */
  const RETIRED_ANTHROPIC_BETAS = new Set([
    'context-1m-2025-08-07',
    'thinking-2024-10-22',
  ]);

  const automaticCacheControl = resolveAnthropicAutomaticCacheControl(features, {
    promptCaching:
      options.promptCaching === true
        ? true
        : options.promptCaching === false
          ? false
          : Number(modelData.supports_cache) === 1
            ? true
            : undefined,
    cacheTtl: options.cacheTtl,
    systemPrompt: options.systemPrompt,
  });

  // Feature-driven betas only (plus merged features.betas above).
  if (automaticCacheControl) betas.push('prompt-caching-2024-07-31');
  // Do not send thinking-2024-10-22 — Sonnet 4.6 / Opus 4.7 use effort + adaptive thinking in-body, not this beta.

  const builtTools = buildAnthropicMessagesTools(tools, { modelKey: logicalModelKey, features });
  if (anthropicCodeExecutionNeeds202508Beta(builtTools)) {
    betas.push(ANTHROPIC_CODE_EXECUTION_BETA);
  }

  const betasFiltered = [...new Set(betas)].filter(
    (b) =>
      b &&
      !RETIRED_ANTHROPIC_BETAS.has(b) &&
      !String(b).startsWith('context-1m-'),
  );

  const streamParams = {
    model: modelForApi,
    max_tokens: options.max_tokens || 4096,
    system: options.systemPrompt || 'You are Agent Sam, a high-performance coding assistant.',
    ...(automaticCacheControl ? { cache_control: automaticCacheControl } : {}),
    messages: messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content) ? m.content : m.content
    })).filter(m => m.role !== 'system'),
    tools: builtTools,
    tool_choice: options.tool_choice || undefined,
    stream: true,
    // betas sent via client.beta path below, not in body
  };

  const lk = logicalModelKey.toLowerCase();
  const apiId = String(modelForApi).toLowerCase();
  const isHaiku = lk.includes('haiku') || apiId.includes('haiku');
  const isOpus47 = lk.includes('opus_4_7') || apiId.includes('opus-4-7');
  const isSonnet46 = lk.includes('sonnet_4_6') || apiId.includes('sonnet-4-6');
  const routingTaskType =
    options.routingTaskType != null ? String(options.routingTaskType).trim() : '';
  const isScoutTask = SCOUT_TASK_TYPES.has(routingTaskType);

  // Effort — DB-driven via features.supports_effort_scaling.
  // Sonnet 4.6, Opus 4.6, Opus 4.7 all support effort per /v1/models capabilities.
  // Haiku does not. Add new models by setting supports_effort_scaling=true
  // in agentsam_ai.features_json — no code change required.
  const supportsEffort =
    features.supports_effort_scaling === true ||
    features.supports_effort_scaling === 1;

  if (supportsEffort && !isScoutTask) {
    const effortVal =
      options.effort ||
      (modelData.effort != null && String(modelData.effort).trim() !== ''
        ? String(modelData.effort).trim()
        : null);
    if (effortVal) {
      const existingOut =
        streamParams.output_config && typeof streamParams.output_config === 'object'
          ? streamParams.output_config
          : {};
      streamParams.output_config = { ...existingOut, effort: effortVal };
    }
  }

  // Thinking — driven entirely by agentsam_ai.thinking_mode.
  // Values (set in DB; never hardcode model names here):
  //   'none'                 → no thinking param (Haiku scout role)
  //   'adaptive'             → {type:'adaptive'} only — Opus 4.7 rejects 'enabled'
  //   'adaptive_and_enabled' → {type:'enabled',budget_tokens} if budget provided,
  //                            else {type:'adaptive'} — Sonnet 4.6, Opus 4.6
  // To support a new model: update thinking_mode in agentsam_ai row only.
  const thinkingMode = String(modelData.thinking_mode || 'none').trim();

  if (options.thinking && typeof options.thinking === 'object') {
    // Explicit object passed by caller — validate against model capability before forwarding.
    const requestedType = String(options.thinking.type || '');
    if (thinkingMode === 'none') {
      // Strip — model not using thinking operationally (e.g. Haiku).
    } else if (thinkingMode === 'adaptive' && requestedType === 'enabled') {
      // Downgrade: model only supports adaptive (Opus 4.7 returns 400 on 'enabled').
      streamParams.thinking = { type: 'adaptive' };
    } else {
      streamParams.thinking = options.thinking;
    }
  } else if (thinkingMode === 'none' || isScoutTask) {
    // No thinking — scout task or model has no operational thinking mode.
  } else if (thinkingMode === 'adaptive') {
    // Opus 4.7: adaptive only — budget_tokens causes 400.
    streamParams.thinking = { type: 'adaptive' };
  } else if (thinkingMode === 'adaptive_and_enabled') {
    // Sonnet 4.6 / Opus 4.6: use enabled+budget if provided, else adaptive.
    if (options.thinkingBudget && Number(options.thinkingBudget) > 0) {
      streamParams.thinking = {
        type: 'enabled',
        budget_tokens: Number(options.thinkingBudget),
      };
    } else {
      streamParams.thinking = { type: 'adaptive' };
    }
  }
  // Any unknown future thinking_mode value → no param sent (safe default).

  // 3. Structured Output Config (GA moving from legacy output_format)
  if (options.jsonSchema) {
    const existingOut =
      streamParams.output_config && typeof streamParams.output_config === 'object'
        ? streamParams.output_config
        : {};
    streamParams.output_config = {
      ...existingOut,
      format: { type: 'json_schema', schema: options.jsonSchema },
    };
  }

  // 4. Data Residency — inference_geo is not a standard Anthropic field; skip

  // Code execution / multi-part turns: reuse Anthropic sandbox container across pause_turn continuations
  const c = options.container;
  if (c != null && c !== '') {
    streamParams.container = typeof c === 'string' ? c : c?.id;
  }

  if (compactionEnabled) {
    const existing =
      options.context_management && typeof options.context_management === 'object'
        ? options.context_management
        : {};
    const edits = Array.isArray(existing.edits) ? [...existing.edits] : [];
    if (!edits.some((e) => e && String(e.type) === 'compact_20260112')) {
      edits.push({ type: 'compact_20260112' });
    }
    streamParams.context_management = { ...existing, edits };
  }

  // Route to beta endpoint when betas are required, standard endpoint otherwise
  const response = betasFiltered.length > 0
    ? await client.beta.messages.create({ ...streamParams, betas: betasFiltered })
    : await client.messages.create(streamParams);
  return response;
}

/**
 * Asynchronous Message Batch handler.
 * Leverages the SDK's batches namespace for high-volume background tasks.
 */
export async function createAnthropicBatch({ requests, env, userId }) {
  const apiKey = await resolveApiKey(env, userId, 'ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured for this user');
  const client = new Anthropic({ apiKey });
  
  return await client.messages.batches.create({ requests });
}

/**
 * Optional preflight token count for Anthropic payloads.
 *
 * NOT called on every chat request — that would add a full round-trip before
 * each message. Use only for:
 *   - Hard context-window enforcement before sending a large payload
 *   - Audit/debug when prompt size estimates feel wrong
 *
 * Post-call usage.input_tokens / usage.output_tokens from the API response
 * remains the canonical source for billing and agentsam_usage_events rows.
 * The chars/4 heuristic in provider.js is intentionally cheap telemetry only.
 *
 * @param {{ messages: any[], system?: string, tools?: any[], model: string }} params
 * @param {string} apiKey
 * @returns {Promise<number|null>} input token count or null on error
 */
export async function countAnthropicTokens({ messages, system, tools, model }, apiKey) {
  if (!apiKey || !messages?.length) return null;
  try {
    const client = new Anthropic({ apiKey });
    const result = await client.messages.countTokens({
      model,
      messages,
      ...(system  ? { system  } : {}),
      ...(tools?.length ? { tools } : {}),
    });
    return result?.input_tokens ?? null;
  } catch {
    return null;
  }
}

