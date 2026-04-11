/**
 * Integration: Anthropic
 * Full-coverage Anthropic SDK integration for the IAM platform.
 * All model capability flags are read from the ai_models D1 table.
 * Zero hardcoded model strings, zero stubs.
 *
 * Exports:
 *   chatWithAnthropic        — tool-aware chat, blocking or streaming
 *   streamWithAnthropic      — streaming with structured event callbacks
 *   countTokens              — pre-flight token count
 *   createAnthropicBatch     — async message batch submission
 *   getBatchResult           — retrieve a batch by ID
 *   cancelBatch              — cancel an in-flight batch
 *   listBatches              — list recent batches
 *   buildSystemWithMemory    — inject memory block into system prompt
 *   trimHistory              — trim message history to a message count cap
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function getClient(env, modelRow) {
  const keyName = modelRow?.secret_key_name || 'ANTHROPIC_API_KEY';
  const apiKey = env[keyName];
  if (!apiKey) throw new Error(`${keyName} missing from environment`);
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// Model row loader
// ---------------------------------------------------------------------------

async function loadModelRow(modelKey, env) {
  const row = await env.DB.prepare(
    `SELECT * FROM ai_models WHERE model_key = ? AND provider = 'anthropic' AND is_active = 1 LIMIT 1`
  ).bind(modelKey).first();
  if (!row) throw new Error(`Model not found or inactive in ai_models: ${modelKey}`);
  return row;
}

function parseFeatures(row) {
  try {
    return JSON.parse(row.features_json || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Beta header resolver — driven entirely by DB columns + features_json
// ---------------------------------------------------------------------------

function resolveBetas(row, features, options = {}) {
  const betas = new Set(options.betas || []);

  if (row.supports_cache)    betas.add('prompt-caching-2024-07-31');
  if (row.supports_fast_mode) betas.add('fast-mode-2026-02-01');
  if (features.compaction)   betas.add('compaction-2026-03-24');

  if (features.thinking) {
    betas.add('interleaved-thinking-2025-05-14');
    betas.add('extended-thinking-2025-01-24');
  }

  if (features.files_api || options.files) betas.add('files-api-2025-04-14');
  if (features.mcp_client  || options.mcp)  betas.add('mcp-client-2025-04-04');

  return betas.size > 0 ? [...betas] : undefined;
}

// ---------------------------------------------------------------------------
// Thinking config resolver — driven by features_json columns
// ---------------------------------------------------------------------------

function resolveThinking(features, options = {}) {
  if (!features.thinking) return undefined;
  if (options.thinking) return options.thinking;

  if (features.adaptive_thinking) {
    const cfg = { type: 'adaptive' };
    if (options.effort) cfg.effort = options.effort;
    return cfg;
  }

  if (options.thinkingBudget) {
    return { type: 'enabled', budget_tokens: Number(options.thinkingBudget) };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Tool normalizer
// ---------------------------------------------------------------------------

function normalizeTools(tools = [], row) {
  if (!row.supports_tools || !tools.length) return undefined;
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters || t.input_schema,
    ...(t.cache_control ? { cache_control: t.cache_control } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Message normalizer
// ---------------------------------------------------------------------------

function normalizeMessages(messages = []) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content
        : [{ type: 'text', text: String(m.content) }],
    }));
}

// ---------------------------------------------------------------------------
// Request param builder
// ---------------------------------------------------------------------------

function buildParams(row, features, messages, tools, options = {}) {
  const defaultTokens = row.context_default_tokens || 4096;
  const maxAllowed   = row.context_max_tokens || defaultTokens;
  const maxTokens    = Math.min(options.max_tokens || defaultTokens, maxAllowed);

  const params = {
    model:      row.model_key,
    max_tokens: maxTokens,
    system:     options.systemPrompt || 'You are Agent Sam.',
    messages:   normalizeMessages(messages),
  };

  const normalizedTools = normalizeTools(tools, row);
  if (normalizedTools) {
    params.tools       = normalizedTools;
    params.tool_choice = options.tool_choice || { type: 'auto' };
  }

  const betas = resolveBetas(row, features, options);
  if (betas) params.betas = betas;

  const thinking = resolveThinking(features, options);
  if (thinking) params.thinking = thinking;

  // Structured JSON output
  if (options.jsonSchema) {
    params.output_config = {
      format: { type: 'json_schema', schema: options.jsonSchema },
    };
  }

  // Data residency
  if (options.inference_geo) params.inference_geo = options.inference_geo;

  // Temperature — skip when thinking is active (Anthropic rejects it)
  if (!thinking && options.temperature !== undefined) {
    params.temperature = options.temperature;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Memory / compaction helpers
// ---------------------------------------------------------------------------

/**
 * Builds a system prompt that injects persistent memory rows as a
 * structured <memory> block. Pass rows from agent_memory_index or any
 * summary table. Returns baseSystem unchanged if no rows.
 *
 * @param {string}   baseSystem
 * @param {object[]} memoryRows  — each row needs .summary or .content
 * @returns {string}
 */
export function buildSystemWithMemory(baseSystem, memoryRows = []) {
  if (!memoryRows.length) return baseSystem;
  const block = memoryRows.map(r => `- ${r.summary || r.content}`).join('\n');
  return `${baseSystem}\n\n<memory>\n${block}\n</memory>`;
}

/**
 * Trims a message array to the most recent N non-system messages.
 * Use when compaction is off and context is long.
 *
 * @param {object[]} messages
 * @param {number}   maxMessages
 * @returns {object[]}
 */
export function trimHistory(messages, maxMessages = 40) {
  const system    = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  return [...system, ...nonSystem.slice(-maxMessages)];
}

// ---------------------------------------------------------------------------
// chatWithAnthropic — primary entry point
// ---------------------------------------------------------------------------

/**
 * Tool-aware chat completion. Blocking by default; pass options.stream = true
 * for a raw Anthropic stream you iterate yourself. For callback-based
 * streaming use streamWithAnthropic instead.
 *
 * @param {object}   params
 * @param {object[]} params.messages
 * @param {object[]} [params.tools]
 * @param {object}   params.env
 * @param {object}   params.options
 * @param {string}   params.options.model           — model_key (required)
 * @param {string}   [params.options.systemPrompt]
 * @param {number}   [params.options.max_tokens]
 * @param {boolean}  [params.options.stream]
 * @param {string}   [params.options.effort]        — 'high'|'medium'|'low'
 * @param {number}   [params.options.thinkingBudget]
 * @param {object}   [params.options.thinking]      — explicit thinking config
 * @param {object}   [params.options.tool_choice]
 * @param {object}   [params.options.jsonSchema]    — structured output schema
 * @param {string}   [params.options.inference_geo] — 'us'|'global'
 * @param {number}   [params.options.temperature]
 * @param {string[]} [params.options.betas]         — extra beta headers
 * @param {boolean}  [params.options.files]         — enable files API beta
 * @param {boolean}  [params.options.mcp]           — enable MCP client beta
 * @returns {Promise<object>}
 */
export async function chatWithAnthropic({ messages, tools = [], env, options = {} }) {
  if (!options.model) throw new Error('options.model is required');

  const row      = await loadModelRow(options.model, env);
  const features = parseFeatures(row);
  const client   = getClient(env, row);
  const params   = buildParams(row, features, messages, tools, options);

  if (options.stream) params.stream = true;

  return await client.messages.create(params);
}

// ---------------------------------------------------------------------------
// streamWithAnthropic — callback-based streaming
// ---------------------------------------------------------------------------

/**
 * Streams a chat completion and fires callbacks as events arrive.
 *
 * @param {object}   params
 * @param {object[]} params.messages
 * @param {object[]} [params.tools]
 * @param {object}   params.env
 * @param {object}   params.options              — same as chatWithAnthropic
 * @param {object}   params.handlers
 * @param {function} [params.handlers.onText]          (text: string) => void
 * @param {function} [params.handlers.onThinking]      (text: string) => void
 * @param {function} [params.handlers.onToolUse]       (block: object) => void
 * @param {function} [params.handlers.onInputTokens]   (count: number) => void
 * @param {function} [params.handlers.onOutputTokens]  (count: number) => void
 * @param {function} [params.handlers.onComplete]      (result: object) => void
 * @param {function} [params.handlers.onError]         (err: Error) => void
 * @returns {Promise<{ text: string, thinking: string, toolUses: object[] }>}
 */
export async function streamWithAnthropic({ messages, tools = [], env, options = {}, handlers = {} }) {
  if (!options.model) throw new Error('options.model is required');

  const row      = await loadModelRow(options.model, env);
  const features = parseFeatures(row);
  const client   = getClient(env, row);
  const params   = buildParams(row, features, messages, tools, { ...options, stream: true });

  let fullText    = '';
  let thinkingText = '';
  const toolUses  = [];

  try {
    const stream = await client.messages.create(params);

    for await (const event of stream) {
      if (event.type === 'message_start' && event.message?.usage) {
        handlers.onInputTokens?.(event.message.usage.input_tokens);
      }

      if (event.type === 'content_block_delta') {
        const { delta } = event;
        if (delta.type === 'text_delta') {
          fullText += delta.text;
          handlers.onText?.(delta.text);
        } else if (delta.type === 'thinking_delta') {
          thinkingText += delta.thinking;
          handlers.onThinking?.(delta.thinking);
        } else if (delta.type === 'input_json_delta') {
          handlers.onToolUse?.(delta);
        }
      }

      if (event.type === 'content_block_stop' && event.content_block?.type === 'tool_use') {
        toolUses.push(event.content_block);
        handlers.onToolUse?.(event.content_block);
      }

      if (event.type === 'message_delta' && event.usage) {
        handlers.onOutputTokens?.(event.usage.output_tokens);
      }
    }
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  }

  const result = { text: fullText, thinking: thinkingText, toolUses };
  handlers.onComplete?.(result);
  return result;
}

// ---------------------------------------------------------------------------
// countTokens — pre-flight token estimation
// ---------------------------------------------------------------------------

/**
 * Returns estimated input token count for a request without executing it.
 *
 * @param {object}   params
 * @param {object[]} params.messages
 * @param {object[]} [params.tools]
 * @param {object}   params.env
 * @param {string}   params.modelKey
 * @param {string}   [params.systemPrompt]
 * @returns {Promise<number>}
 */
export async function countTokens({ messages, tools = [], env, modelKey, systemPrompt }) {
  if (!modelKey) throw new Error('modelKey is required');

  const row    = await loadModelRow(modelKey, env);
  const client = getClient(env, row);

  const body = {
    model:    row.model_key,
    system:   systemPrompt || '',
    messages: normalizeMessages(messages),
  };

  const normalizedTools = normalizeTools(tools, row);
  if (normalizedTools) body.tools = normalizedTools;

  const result = await client.messages.countTokens(body);
  return result.input_tokens;
}

// ---------------------------------------------------------------------------
// Batch API
// ---------------------------------------------------------------------------

/**
 * Submits a message batch for async processing.
 *
 * @param {object}   params
 * @param {object[]} params.requests  — [{ custom_id, params: { model, messages, max_tokens, ... } }]
 * @param {object}   params.env
 * @param {string}   [params.modelKey] — used only to resolve secret_key_name
 * @returns {Promise<object>} batch object
 */
export async function createAnthropicBatch({ requests, env, modelKey }) {
  const row    = modelKey ? await loadModelRow(modelKey, env) : {};
  const client = getClient(env, row);
  return await client.messages.batches.create({ requests });
}

/**
 * Retrieves a submitted batch by ID.
 *
 * @param {object} params
 * @param {string} params.batchId
 * @param {object} params.env
 * @param {string} [params.modelKey]
 * @returns {Promise<object>}
 */
export async function getBatchResult({ batchId, env, modelKey }) {
  const row    = modelKey ? await loadModelRow(modelKey, env) : {};
  const client = getClient(env, row);
  return await client.messages.batches.retrieve(batchId);
}

/**
 * Cancels an in-flight batch.
 *
 * @param {object} params
 * @param {string} params.batchId
 * @param {object} params.env
 * @param {string} [params.modelKey]
 * @returns {Promise<object>}
 */
export async function cancelBatch({ batchId, env, modelKey }) {
  const row    = modelKey ? await loadModelRow(modelKey, env) : {};
  const client = getClient(env, row);
  return await client.messages.batches.cancel(batchId);
}

/**
 * Lists recent batches.
 *
 * @param {object} params
 * @param {object} params.env
 * @param {string} [params.modelKey]
 * @param {number} [params.limit]    — default 20
 * @returns {Promise<object>}
 */
export async function listBatches({ env, modelKey, limit = 20 }) {
  const row    = modelKey ? await loadModelRow(modelKey, env) : {};
  const client = getClient(env, row);
  return await client.messages.batches.list({ limit });
}
