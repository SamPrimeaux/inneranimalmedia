/**
 * src/integrations/workers-ai.js
 * Cloudflare Workers AI integration.
 *
 * Handles: embeddings, chat inference, image generation, STT, TTS.
 * All models sourced from agent_model_registry (provider = 'workers_ai') in D1.
 *
 * Cost note: Workers AI bills in neurons internally. Nothing is free.
 * See agent_model_registry for exact rates. Models marked 'pricing TBD'
 * need to be looked up and added to agent_model_registry.
 */

// ── Model Constants ───────────────────────────────────────────────────────────
// Mirrors agent_model_registry.model_key where provider = 'workers_ai'

// Embeddings
export const WAI_EMBED_BASE     = '@cf/baai/bge-base-en-v1.5';                    // $0.067/1M tokens, 768-dim — D1 RAG ingest only
// DO NOT use WAI_EMBED_BASE to query env.VECTORIZE — that index uses qwen3 (1024-dim)

// Chat
export const WAI_LLAMA_8B       = '@cf/meta/llama-3.1-8b-instruct';               // $0.28 in / $0.83 out, 7968 ctx
export const WAI_LLAMA_8B_FP8   = '@cf/meta/llama-3.1-8b-instruct-fp8';           // $0.15 in / $0.29 out, 32k ctx
export const WAI_LLAMA_70B_FAST = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';     // pricing TBD
export const WAI_LLAMA_4_SCOUT  = '@cf/meta/llama-4-scout-17b-16e-instruct';      // pricing TBD
export const WAI_GLM_FLASH      = '@cf/zai-org/glm-4.7-flash';                    // $0.06 in / $0.40 out, 131k ctx, tools+reasoning
export const WAI_NEMOTRON       = '@cf/nvidia/nemotron-3-120b-a12b';               // pricing TBD
export const WAI_GPT_OSS_20B    = '@cf/openai/gpt-oss-20b';                       // $0.20 in / $0.30 out, 128k ctx, tools+reasoning
export const WAI_GPT_OSS_120B   = '@cf/openai/gpt-oss-120b';                      // $0.35 in / $0.75 out, 128k ctx, tools+reasoning
export const WAI_GEMMA_12B      = '@cf/google/gemma-3-12b-it';                    // pricing TBD
export const WAI_GEMMA_26B      = '@cf/google/gemma-4-26b-a4b-it';                // $0.10 in / $0.30 out, 256k ctx, tools+vision+reasoning
export const WAI_MISTRAL_7B     = '@cf/mistral/mistral-7b-instruct-v0.2';         // pricing TBD
export const WAI_QWEN3_MOE      = '@cf/qwen/qwen3-30b-a3b-fp8';                   // $0.051 in / $0.34 out, 32k ctx, tools+reasoning+batch
export const WAI_KIMI_K25       = '@cf/moonshotai/kimi-k2.5';                     // $0.60 in / $3.00 out, 256k ctx, tools+vision+reasoning — gate usage
export const WAI_QWQ_32B        = '@cf/qwen/qwq-32b';                             // $0.66 in / $1.00 out, 24k ctx, reasoning+LoRA
export const WAI_QWEN_CODER     = '@cf/qwen/qwen2.5-coder-32b-instruct';          // $0.66 in / $1.00 out, 32k ctx, code+LoRA
export const WAI_DEEPSEEK_R1    = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'; // $0.50 in / $4.88 out, 80k ctx — high output cost

// Image Generation
export const WAI_FLUX_4B        = '@cf/black-forest-labs/flux-2-klein-4b';        // pricing TBD
export const WAI_FLUX_9B        = '@cf/black-forest-labs/flux-2-klein-9b';        // pricing TBD
export const WAI_LEONARDO_LUCID = '@cf/leonardo/lucid-origin';                    // pricing TBD
export const WAI_LEONARDO_PHX   = '@cf/leonardo/phoenix-1.0';                     // pricing TBD

// Audio
export const WAI_TTS_AURA       = '@cf/deepgram/aura-2-es';   // TTS — $0.03/1k chars
export const WAI_STT_NOVA       = '@cf/deepgram/nova-3';       // STT — $0.0052/min HTTP, $0.0092/min WS

// Classification
export const WAI_DISTILBERT     = '@cf/huggingface/distilbert-sst-2-int8'; // $0.026/1M input tokens

// ── Recommended defaults by use case ─────────────────────────────────────────
export const WAI_DEFAULT_CHAT      = WAI_GLM_FLASH;      // best cost/performance for general chat
export const WAI_DEFAULT_AGENT     = WAI_GPT_OSS_20B;    // best balance for agent reasoning
export const WAI_DEFAULT_SMART     = WAI_GEMMA_26B;      // long context + cheap + vision
export const WAI_DEFAULT_CODE      = WAI_QWEN_CODER;     // code tasks
export const WAI_DEFAULT_REASONING = WAI_GPT_OSS_120B;   // heavy reasoning/planning

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertBinding(env) {
  if (!env?.AI) throw new Error('[workers-ai] env.AI binding is missing');
}

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
 * D1 ai_knowledge_chunks ingest only.
 * DO NOT use to query env.VECTORIZE — dimension mismatch (768 vs 1024).
 */
export async function embed(env, text, model = WAI_EMBED_BASE) {
  assertBinding(env);
  const input  = Array.isArray(text) ? text : [text];
  const result = await env.AI.run(model, { text: input });
  const data   = result?.data ?? result?.result?.data ?? [];
  return Array.isArray(text) ? data : (data[0] ?? null);
}

// ── Chat Inference ────────────────────────────────────────────────────────────

/**
 * Run a chat completion via Workers AI.
 *
 * @param {object}                  env
 * @param {string|{role,content}[]} messages
 * @param {object}                  [opts]
 * @param {string}                  [opts.model]       — defaults to WAI_DEFAULT_CHAT
 * @param {string}                  [opts.system]      — system prompt
 * @param {number}                  [opts.max_tokens]  — default 1024
 * @param {number}                  [opts.temperature] — default 0.7
 * @param {boolean}                 [opts.stream]      — enable streaming
 * @param {object[]}                [opts.tools]       — tool definitions
 * @returns {Promise<{text: string, usage?: object, model: string}|ReadableStream>}
 */
export async function runInference(env, messages, opts = {}) {
  assertBinding(env);

  const model       = opts.model       ?? WAI_DEFAULT_CHAT;
  const max_tokens  = opts.max_tokens  ?? 1024;
  const temperature = opts.temperature ?? 0.7;
  const stream      = opts.stream      ?? false;

  const normalized = normalizeMessages(messages, opts.system);
  const payload    = { messages: normalized, max_tokens, temperature };

  if (opts.tools?.length) payload.tools  = opts.tools;
  if (stream)             payload.stream = true;

  const result = await env.AI.run(model, payload);

  if (stream) return result;

  const text = result?.response ?? result?.result?.response ?? '';
  return { text, usage: result?.usage ?? null, model };
}

/**
 * Cheap inference — GLM Flash. $0.06 in / $0.40 out.
 * Use for classification, tagging, summarization, query rewrite.
 */
export async function cheapInference(env, prompt, opts = {}) {
  return runInference(env, prompt, {
    model:       WAI_GLM_FLASH,
    max_tokens:  opts.max_tokens ?? 256,
    temperature: 0,
    ...opts,
  });
}

/**
 * Agent inference — GPT OSS 20B. $0.20 in / $0.30 out.
 */
export async function agentInference(env, messages, opts = {}) {
  return runInference(env, messages, {
    model: WAI_DEFAULT_AGENT,
    ...opts,
  });
}

/**
 * Smart inference — Gemma 4 26B. $0.10 in / $0.30 out, 256k ctx.
 */
export async function smartInference(env, messages, opts = {}) {
  return runInference(env, messages, {
    model: WAI_DEFAULT_SMART,
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
 * @param {string} [opts.model] — defaults to WAI_FLUX_4B
 * @param {number} [opts.steps] — diffusion steps, default 4
 * @returns {Promise<Uint8Array>}
 */
export async function generateImage(env, prompt, opts = {}) {
  assertBinding(env);
  const model  = opts.model ?? WAI_FLUX_4B;
  const steps  = opts.steps ?? 4;
  const result = await env.AI.run(model, { prompt, num_steps: steps });
  return result?.image ?? result;
}

// ── Speech ────────────────────────────────────────────────────────────────────

/**
 * Transcribe audio to text (STT).
 * Pricing: $0.0052/min HTTP, $0.0092/min WebSocket.
 */
export async function transcribe(env, audioBytes, model = WAI_STT_NOVA) {
  assertBinding(env);
  const result = await env.AI.run(model, { audio: [...audioBytes] });
  return { text: result?.text ?? result?.result?.text ?? '' };
}

/**
 * Convert text to speech (TTS).
 * Pricing: $0.03/1k characters.
 */
export async function textToSpeech(env, text, model = WAI_TTS_AURA) {
  assertBinding(env);
  const result = await env.AI.run(model, { text });
  return result?.audio ?? result;
}

// ── Model Registry ────────────────────────────────────────────────────────────

/**
 * Fetch Workers AI models from agent_model_registry.
 *
 * @param {object}  env
 * @param {object}  [filter]
 * @param {string}  [filter.role]           — 'chat'|'agent'|'reasoning'|'code'|'embedding'|'tts'|'stt'|'classification'
 * @param {string}  [filter.cost_tier]      — 'cheap'|'mid'|'premium'
 * @param {boolean} [filter.tools_only]     — supports_function_calling = 1
 * @param {boolean} [filter.vision_only]    — supports_vision = 1
 * @param {boolean} [filter.reasoning_only] — supports_reasoning = 1
 * @returns {Promise<object[]>}
 */
export async function getWorkersAiModels(env, filter = {}) {
  if (!env?.DB) return [];

  let sql = `SELECT id, model_key, display_name, role, cost_tier,
                    input_cost_per_1m, output_cost_per_1m, charge_type,
                    context_window, supports_function_calling,
                    supports_vision, supports_reasoning, supports_batch,
                    strengths, best_for
             FROM agent_model_registry
             WHERE provider = 'workers_ai'`;
  const params = [];

  if (filter.role) {
    sql += ` AND role = ?`;
    params.push(filter.role);
  }
  if (filter.cost_tier) {
    sql += ` AND cost_tier = ?`;
    params.push(filter.cost_tier);
  }
  if (filter.tools_only)     sql += ` AND supports_function_calling = 1`;
  if (filter.vision_only)    sql += ` AND supports_vision = 1`;
  if (filter.reasoning_only) sql += ` AND supports_reasoning = 1`;

  sql += ` ORDER BY role, input_cost_per_1m ASC`;

  const stmt = params.length
    ? env.DB.prepare(sql).bind(...params)
    : env.DB.prepare(sql);

  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return results || [];
}

/**
 * Pick a model key for a given use case.
 * Does not hit D1 — uses hardcoded defaults.
 */
export function pickModel(useCase = 'general') {
  const map = {
    general:   WAI_DEFAULT_CHAT,
    agent:     WAI_DEFAULT_AGENT,
    smart:     WAI_DEFAULT_SMART,
    code:      WAI_DEFAULT_CODE,
    reasoning: WAI_DEFAULT_REASONING,
    vision:    WAI_GEMMA_26B,
    long:      WAI_KIMI_K25,
    fast:      WAI_GLM_FLASH,
    cheap:     WAI_LLAMA_8B_FP8,
  };
  return map[useCase] ?? WAI_DEFAULT_CHAT;
}
