/**
 * src/integrations/workers-ai.js
 * Cloudflare Workers AI integration.
 *
 * Handles: embeddings, chat inference, image generation, STT, TTS.
 * All models sourced from ai_models (provider = 'workers_ai') in D1.
 *
 * Cost note: Workers AI bills in neurons @ ~$0.011/1k.
 * Free-tier models have neurons_usd_per_1k = 0 — prefer these for cheap paths.
 */

// ── Model Constants ───────────────────────────────────────────────────────────
// Sourced from D1 ai_models WHERE provider = 'workers_ai'

// Embeddings
export const WAI_EMBED_BASE   = '@cf/baai/bge-base-en-v1.5';   // 768-dim — used in rag.js
export const WAI_EMBED_LARGE  = '@cf/baai/bge-large-en-v1.5';  // 1024-dim — memory/precision

// Chat — FREE (neurons_usd_per_1k = 0)
export const WAI_LLAMA_8B       = '@cf/meta/llama-3.1-8b-instruct';          // tools, free
export const WAI_LLAMA_70B_FAST = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'; // tools, fast, free
export const WAI_LLAMA_4_SCOUT  = '@cf/meta/llama-4-scout-17b-16e-instruct';  // tools+vision, 131k, free
export const WAI_KIMI_K25       = '@cf/moonshotai/kimi-k2.5';                 // tools+vision, 256k, free
export const WAI_GLM_FLASH      = '@cf/zai-org/glm-4.7-flash';                // tools, 131k, free
export const WAI_NEMOTRON       = '@cf/nvidia/nemotron-3-120b-a12b';           // free

// Chat — BILLED ($0.011/1k neurons)
export const WAI_GEMMA_12B      = '@cf/google/gemma-3-12b-it';
export const WAI_GEMMA_26B      = '@cf/google/gemma-4-26b-a4b-it';   // tools+vision
export const WAI_MISTRAL_7B     = '@cf/mistral/mistral-7b-instruct-v0.2';
export const WAI_QWEN_CODER     = '@cf/qwen/qwen2.5-coder-32b-instruct'; // tools, code

// Image Generation — FREE
export const WAI_FLUX_4B        = '@cf/black-forest-labs/flux-2-klein-4b';
export const WAI_FLUX_9B        = '@cf/black-forest-labs/flux-2-klein-9b';
export const WAI_LEONARDO_LUCID = '@cf/leonardo/lucid-origin';
export const WAI_LEONARDO_PHX   = '@cf/leonardo/phoenix-1.0';

// Audio — FREE
export const WAI_TTS_AURA       = '@cf/deepgram/aura-1';      // Text-to-Speech
export const WAI_STT_NOVA       = '@cf/deepgram/nova-3';       // Speech-to-Text

// Recommended cheap-path defaults
export const WAI_DEFAULT_CHAT   = WAI_LLAMA_8B;       // cheapest capable model
export const WAI_DEFAULT_SMART  = WAI_KIMI_K25;       // best free model for complex tasks
export const WAI_DEFAULT_CODE   = WAI_QWEN_CODER;     // code tasks

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertBinding(env) {
  if (!env?.AI) throw new Error('[workers-ai] env.AI binding is missing — only available in prod worker');
}

/**
 * Normalize messages to the Workers AI format.
 * Accepts: string prompt OR { role, content }[] array.
 */
function normalizeMessages(input, systemPrompt) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    messages.push(...input);
  }
  return messages;
}

// ── Embeddings ────────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for one or more texts.
 * @param {object} env
 * @param {string|string[]} text
 * @param {string} [model] — defaults to WAI_EMBED_BASE
 * @returns {Promise<number[]|number[][]>} — single vector or array of vectors
 */
export async function embed(env, text, model = WAI_EMBED_BASE) {
  assertBinding(env);
  const input  = Array.isArray(text) ? text : [text];
  const result = await env.AI.run(model, { text: input });
  const data   = result?.data ?? result?.result?.data ?? [];
  return Array.isArray(text) ? data : (data[0] ?? null);
}

/**
 * Embed with the larger/more precise model (bge-large).
 * Use for memory compaction and long-term knowledge indexing.
 */
export async function embedPrecise(env, text) {
  return embed(env, text, WAI_EMBED_LARGE);
}

// ── Chat Inference ────────────────────────────────────────────────────────────

/**
 * Run a chat completion via Workers AI.
 *
 * @param {object}  env
 * @param {string|{role,content}[]} messages
 * @param {object}  [opts]
 * @param {string}  [opts.model]        — defaults to WAI_DEFAULT_CHAT
 * @param {string}  [opts.system]       — system prompt string
 * @param {number}  [opts.max_tokens]   — default 1024
 * @param {number}  [opts.temperature]  — default 0.7
 * @param {boolean} [opts.stream]       — enable streaming (async iterator)
 * @param {object[]}[opts.tools]        — tool definitions (model must support tools)
 * @returns {Promise<{text: string, usage?: object}|ReadableStream>}
 */
export async function runInference(env, messages, opts = {}) {
  assertBinding(env);

  const model      = opts.model       ?? WAI_DEFAULT_CHAT;
  const max_tokens = opts.max_tokens  ?? 1024;
  const temperature= opts.temperature ?? 0.7;
  const stream     = opts.stream      ?? false;

  const normalized = normalizeMessages(messages, opts.system);

  const payload = { messages: normalized, max_tokens, temperature };
  if (opts.tools?.length) payload.tools = opts.tools;
  if (stream)             payload.stream = true;

  const result = await env.AI.run(model, payload);

  if (stream) return result; // async iterator — caller handles chunks

  const text = result?.response ?? result?.result?.response ?? '';
  return { text, usage: result?.usage ?? null, model };
}

/**
 * Cheap one-shot inference — Llama 8B, no tools, short output.
 * Use for classification, tagging, summarization stubs.
 */
export async function cheapInference(env, prompt, opts = {}) {
  return runInference(env, prompt, {
    model:      WAI_LLAMA_8B,
    max_tokens: opts.max_tokens ?? 256,
    temperature: 0,
    ...opts,
  });
}

/**
 * Smart free-tier inference — Kimi K2.5 (256k ctx, tools+vision, free neurons).
 * Use as Workers AI alternative to paid providers for complex tasks.
 */
export async function smartInference(env, messages, opts = {}) {
  return runInference(env, messages, {
    model: WAI_KIMI_K25,
    ...opts,
  });
}

// ── Image Generation ──────────────────────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 *
 * @param {object} env
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.model]   — defaults to WAI_FLUX_4B (free, fast)
 * @param {number} [opts.steps]   — diffusion steps, default 4
 * @returns {Promise<Uint8Array>} — raw image bytes (PNG)
 */
export async function generateImage(env, prompt, opts = {}) {
  assertBinding(env);
  const model = opts.model ?? WAI_FLUX_4B;
  const steps = opts.steps ?? 4;
  const result = await env.AI.run(model, { prompt, num_steps: steps });
  return result?.image ?? result;
}

// ── Speech ────────────────────────────────────────────────────────────────────

/**
 * Transcribe audio to text (Speech-to-Text).
 * @param {object}      env
 * @param {Uint8Array}  audioBytes
 * @param {string}      [model] — defaults to WAI_STT_NOVA (Deepgram Nova 3, free)
 * @returns {Promise<{text: string}>}
 */
export async function transcribe(env, audioBytes, model = WAI_STT_NOVA) {
  assertBinding(env);
  const result = await env.AI.run(model, { audio: [...audioBytes] });
  return { text: result?.text ?? result?.result?.text ?? '' };
}

/**
 * Convert text to speech audio.
 * @param {object} env
 * @param {string} text
 * @param {string} [model] — defaults to WAI_TTS_AURA (Deepgram Aura 1, free)
 * @returns {Promise<Uint8Array>} — audio bytes
 */
export async function textToSpeech(env, text, model = WAI_TTS_AURA) {
  assertBinding(env);
  const result = await env.AI.run(model, { text });
  return result?.audio ?? result;
}

// ── Model Registry ────────────────────────────────────────────────────────────

/**
 * Fetch all active Workers AI models from D1.
 * Useful for dynamic model pickers and routing rule validation.
 * @param {object} env
 * @param {object} [filter]
 * @param {string} [filter.size_class]        — 'small'|'medium'|'large'|'embedding'|'image'|'audio'
 * @param {boolean}[filter.tools_only]        — only models with supports_tools = 1
 * @param {boolean}[filter.free_only]         — only models with neurons_usd_per_1k = 0
 * @returns {Promise<object[]>}
 */
export async function getWorkersAiModels(env, filter = {}) {
  if (!env?.DB) return [];

  let sql    = `SELECT id, model_key, display_name, size_class,
                       neurons_usd_per_1k, supports_tools, supports_vision,
                       is_active, features_json
                FROM ai_models
                WHERE provider = 'workers_ai' AND is_active = 1`;
  const params = [];

  if (filter.size_class) {
    sql += ` AND size_class = ?`;
    params.push(filter.size_class);
  }
  if (filter.tools_only) {
    sql += ` AND supports_tools = 1`;
  }
  if (filter.free_only) {
    sql += ` AND neurons_usd_per_1k = 0`;
  }

  sql += ` ORDER BY size_class, display_name`;

  const stmt   = params.length
    ? env.DB.prepare(sql).bind(...params)
    : env.DB.prepare(sql);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * Pick the best free Workers AI chat model for a given use case.
 * Returns a model_key string.
 */
export function pickCheapModel(useCase = 'general') {
  const map = {
    general:    WAI_LLAMA_8B,
    smart:      WAI_KIMI_K25,
    code:       WAI_QWEN_CODER,   // billed but best for code
    vision:     WAI_LLAMA_4_SCOUT,
    long:       WAI_KIMI_K25,     // 256k context
    fast:       WAI_GLM_FLASH,
  };
  return map[useCase] ?? WAI_DEFAULT_CHAT;
}
