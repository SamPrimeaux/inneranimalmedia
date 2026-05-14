/**
 * Integration: Anthropic
 * Refactored: Official Anthropic TypeScript SDK Integration.
 * Handles tool-calling, streaming, and v4.6 features (Caching, Batching).
 * Zero-hardcoding: Model parameters and feature flags are DB-driven.
 */

import Anthropic from '@anthropic-ai/sdk';
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
 * Haiku 4.5: `code_execution_20250825` only. Sonnet/Opus 4.5+: prefer `code_execution_20260120` (REPL + programmatic tools).
 * @param {string} modelKey
 * @returns {{ type: string, name: string } | null}
 */
export function anthropicCodeExecutionToolForModel(modelKey) {
  const mk = String(modelKey || '');
  if (!mk.includes('claude')) return null;
  if (mk.includes('haiku')) {
    return { type: 'code_execution_20250825', name: 'code_execution' };
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
  const mapped = rest.map((t) => {
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
  const head = [TOOL_SEARCH_BM25, ...(codeTool ? [codeTool] : [])];
  return [...head, ...mapped];
}

/**
 * `code-execution-2025-08-25` beta applies to `code_execution_20250825` / legacy `20250522` only.
 * `code_execution_20260120` is first-party GA — sending the 08-25 beta with it can cause 400.
 */
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
  const features = JSON.parse(modelData.features_json || '{}');
  const betas = [...(options.betas || [])];
  if (Array.isArray(features.betas)) {
    for (const b of features.betas) {
      if (typeof b === 'string' && b.trim()) betas.push(b.trim());
    }
  }
  if (features.compaction) betas.push('compact-2026-01-12');

  /** Betas Anthropic no longer accepts on current Sonnet / Haiku (400 extra inputs / retired headers). */
  const RETIRED_ANTHROPIC_BETAS = new Set(['context-1m-2025-08-07']);

  // Feature-driven betas only (plus merged features.betas above): no unconditional fast-mode / extended-thinking here — add via features_json.betas if needed.
  if (features.prompt_caching) betas.push('prompt-caching-2024-07-31');
  if (features.thinking) betas.push('thinking-2024-10-22');

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
    messages: messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content) ? m.content : m.content
    })).filter(m => m.role !== 'system'),
    tools: builtTools,
    tool_choice: options.tool_choice || undefined,
    stream: true,
    // betas sent via client.beta path below, not in body
  };

  // 2. Adaptive Thinking & Effort (v4.6 GA Path)
  const isSotaModel =
    (logicalModelKey.includes('4-6') || logicalModelKey.includes('4-5')) &&
    !logicalModelKey.includes('haiku');
  if (isSotaModel) {
    // Claude 4 models use effort param directly, not inside thinking object
    // 'adaptive' is not a valid type — valid: 'enabled' (with budget_tokens) or 'disabled'
    if (options.effort) {
      streamParams.effort = options.effort; // 'max', 'high', 'medium', 'low'
    }
    // Only enable explicit thinking budget if caller specifically requested it
    if (options.thinkingBudget) {
      streamParams.thinking = { type: 'enabled', budget_tokens: Number(options.thinkingBudget) };
    }
  } else if (options.thinking) {
    streamParams.thinking = options.thinking;
  } else if (features.thinking && options.thinkingBudget) {
    streamParams.thinking = { 
      type: 'enabled', 
      budget_tokens: Number(options.thinkingBudget) 
    };
  }

  // 3. Structured Output Config (GA moving from legacy output_format)
  if (options.jsonSchema) {
    streamParams.output_config = { format: { type: 'json_schema', schema: options.jsonSchema } };
  }

  // 4. Data Residency — inference_geo is not a standard Anthropic field; skip

  // Code execution / multi-part turns: reuse Anthropic sandbox container across pause_turn continuations
  const c = options.container;
  if (c != null && c !== '') {
    streamParams.container = typeof c === 'string' ? c : c?.id;
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
