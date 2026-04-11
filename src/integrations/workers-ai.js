/**
 * Integration Layer: Cloudflare Workers AI
 * Chat, image generation, embeddings, and speech-to-text via env.AI binding.
 * No API key required — binding authenticates automatically.
 * Model keys sourced from ai_models table (provider='workers_ai').
 */
import { jsonResponse } from '../core/responses.js';

// ─── Model Type Detection ─────────────────────────────────────────────────────

const IMAGE_GEN_PREFIXES = [
  '@cf/black-forest-labs/',
  '@cf/leonardo/',
  '@cf/bytedance/',
  '@cf/lykon/',
  '@cf/runwayml/',
  '@cf/stabilityai/',
];

const SPEECH_TO_TEXT_PREFIXES = [
  '@cf/openai/whisper',
  '@cf/deepgram/nova',
  '@cf/deepgram/aura',
];

const EMBEDDING_KEYS = [
  '@cf/baai/bge',
  '@cf/jina-ai/',
  'workers_ai_embeddings',
];

function isImageModel(modelKey) {
  return IMAGE_GEN_PREFIXES.some(p => modelKey.startsWith(p)) ||
    modelKey === 'workers_ai_image_generation';
}

function isSpeechModel(modelKey) {
  return SPEECH_TO_TEXT_PREFIXES.some(p => modelKey.startsWith(p)) ||
    modelKey === 'workers_ai_audio_transcription';
}

function isEmbeddingModel(modelKey) {
  return EMBEDDING_KEYS.some(p => modelKey.startsWith(p)) ||
    modelKey === 'workers_ai_embeddings';
}

// ─── Chat / Text Generation ───────────────────────────────────────────────────

/**
 * Stream a chat completion via Workers AI.
 * Returns Response with SSE stream proxied from env.AI.
 * Compatible with Llama, Gemma, Qwen, Mistral, and other chat models.
 */
export async function chatWithWorkersAI(env, params) {
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;

  if (!env.AI)     return jsonResponse({ error: 'Workers AI binding (env.AI) not configured' }, 503);
  if (!modelKey)   return jsonResponse({ error: 'modelKey required' }, 400);

  if (isImageModel(modelKey))   return jsonResponse({ error: 'Use runWorkersAIImage for image models' }, 400);
  if (isSpeechModel(modelKey))  return jsonResponse({ error: 'Use runWorkersAISpeechToText for speech models' }, 400);
  if (isEmbeddingModel(modelKey)) return jsonResponse({ error: 'Use runWorkersAIEmbedding for embedding models' }, 400);

  const aiMessages = [];
  if (systemPrompt) aiMessages.push({ role: 'system', content: systemPrompt });

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      aiMessages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      aiMessages.push({ role: msg.role, content: text });
    }
  }

  let stream;
  try {
    stream = await env.AI.run(modelKey, {
      messages: aiMessages,
      ...(tools?.length ? { tools } : {}),
      stream: true,
    });
  } catch (e) {
    return jsonResponse({ error: 'Workers AI run failed', detail: e.message }, 502);
  }

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Non-streaming Workers AI chat completion.
 * Returns the response text string.
 */
export async function completeWithWorkersAI(env, params) {
  const { modelKey, systemPrompt, messages = [] } = params;

  if (!env.AI)   throw new Error('Workers AI binding not configured');
  if (!modelKey) throw new Error('modelKey required');

  const aiMessages = [];
  if (systemPrompt) aiMessages.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    aiMessages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  }

  try {
    const result = await env.AI.run(modelKey, { messages: aiMessages });
    return result?.response || result?.result || '';
  } catch (e) {
    throw new Error(`Workers AI error: ${e.message}`);
  }
}

// ─── Image Generation ─────────────────────────────────────────────────────────

/**
 * Generate an image via Workers AI.
 * Returns a Response with image/png body, or throws on error.
 *
 * @param {object} env
 * @param {string} modelKey - e.g. '@cf/black-forest-labs/flux-1-schnell'
 * @param {string} prompt
 * @param {object} options - { num_steps, guidance, width, height }
 * @returns {Promise<Response>}
 */
export async function runWorkersAIImage(env, modelKey, prompt, options = {}) {
  if (!env.AI) throw new Error('Workers AI binding not configured');

  const result = await env.AI.run(modelKey, {
    prompt,
    num_steps:    options.num_steps    || 20,
    guidance:     options.guidance     || 7.5,
    width:        options.width        || 1024,
    height:       options.height       || 1024,
  });

  // Workers AI returns { image: base64string } for image models
  if (result?.image) {
    const binary = atob(result.image);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes, {
      headers: {
        'Content-Type':                'image/png',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Some models return the image directly as a ReadableStream
  if (result instanceof ReadableStream || result instanceof Response) {
    return new Response(result, {
      headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' },
    });
  }

  throw new Error('Unexpected image response format from Workers AI');
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

/**
 * Generate text embeddings via Workers AI.
 *
 * @param {object} env
 * @param {string} modelKey - e.g. '@cf/baai/bge-base-en-v1.5'
 * @param {string|string[]} text
 * @returns {Promise<number[][]>} - array of embedding vectors
 */
export async function runWorkersAIEmbedding(env, modelKey, text) {
  if (!env.AI) throw new Error('Workers AI binding not configured');

  const input = Array.isArray(text) ? text : [text];
  const result = await env.AI.run(modelKey, { text: input });
  return result?.data || result || [];
}

// ─── Speech to Text ───────────────────────────────────────────────────────────

/**
 * Transcribe audio via Workers AI Whisper / Deepgram Nova.
 *
 * @param {object} env
 * @param {string} modelKey - e.g. '@cf/deepgram/nova-3'
 * @param {Uint8Array|ArrayBuffer} audioData - raw audio bytes
 * @returns {Promise<{text: string, words?: object[]}>}
 */
export async function runWorkersAISpeechToText(env, modelKey, audioData) {
  if (!env.AI) throw new Error('Workers AI binding not configured');

  const bytes  = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData);
  const result = await env.AI.run(modelKey, { audio: [...bytes] });

  return {
    text:  result?.text || result?.transcript || '',
    words: result?.words || [],
  };
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * HTTP dispatcher for /api/workers-ai/* routes.
 * Routes to the appropriate Workers AI function based on model type.
 */
export async function handleWorkersAIApi(request, url, env) {
  const method = request.method.toUpperCase();
  if (method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const { model, prompt, messages, system, tools, options } = body;
  if (!model) return jsonResponse({ error: 'model required' }, 400);

  try {
    if (isImageModel(model)) {
      if (!prompt) return jsonResponse({ error: 'prompt required for image generation' }, 400);
      const res = await runWorkersAIImage(env, model, prompt, options || {});
      return res;
    }

    if (isEmbeddingModel(model)) {
      if (!prompt && !body.text) return jsonResponse({ error: 'text required for embeddings' }, 400);
      const vectors = await runWorkersAIEmbedding(env, model, prompt || body.text);
      return jsonResponse({ embeddings: vectors });
    }

    // Chat
    return chatWithWorkersAI(env, {
      modelKey:     model,
      systemPrompt: system,
      messages:     messages || [],
      tools:        tools    || [],
    });
  } catch (e) {
    return jsonResponse({ error: 'Workers AI error', detail: e.message }, 500);
  }
}
