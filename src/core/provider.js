/**
 * IAM — Unified Provider Dispatch
 * Routes agent calls to correct provider based on ai_models.api_platform.
 * No hardcoded model strings or provider names.
 */
import { chatWithAnthropic }   from '../integrations/anthropic.js';
import { chatWithToolsOpenAI,
         completeWithOpenAI }  from '../integrations/openai.js';
import { chatWithToolsGemini } from '../integrations/gemini.js';
import { chatWithToolsVertex } from '../integrations/vertex.js';
import { jsonResponse }        from './responses.js';

export async function resolveModelMeta(env, modelKey) {
  if (!env.DB || !modelKey) return null;
  try {
    return await env.DB.prepare(
      `SELECT provider, api_platform, secret_key_name
       FROM ai_models WHERE model_key = ? LIMIT 1`
    ).bind(modelKey).first();
  } catch (_) { return null; }
}

export async function dispatchStream(env, request, params) {
  const { modelKey, systemPrompt, messages, tools = [], options = {} } = params;
  const meta     = await resolveModelMeta(env, modelKey);
  const platform = meta?.api_platform || 'anthropic';
  const dp       = { modelKey, systemPrompt, messages, tools, ...options };

  switch (platform) {
    case 'openai':
      return chatWithToolsOpenAI(env, request, dp);
    case 'gemini_api':
      return chatWithToolsGemini(env, request, dp);
    case 'vertex':
      return chatWithToolsVertex(env, request, dp);
    case 'workers_ai':
      return dispatchWorkersAI(env, dp);
    case 'ollama':
      return dispatchOllama(env, request, dp);
    case 'anthropic':
    default:
      return chatWithAnthropic({
        messages, tools, env,
        options: { model: modelKey, systemPrompt, ...options },
      });
  }
}

export async function dispatchComplete(env, params) {
  const { modelKey, systemPrompt, messages, tools = [], options = {} } = params;
  const meta     = await resolveModelMeta(env, modelKey);
  const platform = meta?.api_platform || 'anthropic';

  if (platform === 'openai') {
    return completeWithOpenAI(env, {
      modelKey, systemPrompt, messages, tools,
      reasoningEffort: options.reasoningEffort || 'none',
      verbosity:       options.verbosity       || 'low',
    });
  }

  // Fallback non-streaming via Anthropic
  const res = await chatWithAnthropic({
    messages, tools, env,
    options: { model: modelKey, systemPrompt, stream: false },
  });
  if (res instanceof Response) {
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { text }; }
  }
  return res;
}

async function dispatchWorkersAI(env, params) {
  if (!env.AI) return jsonResponse({ error: 'Workers AI binding not available' }, 503);
  const { modelKey, systemPrompt, messages } = params;
  const waiMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  ;(async () => {
    try {
      const response = await env.AI.run(modelKey, { messages: waiMessages, stream: true });
      if (response instanceof ReadableStream) {
        const reader = response.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } else {
        const text  = response?.response || JSON.stringify(response);
        const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
        await writer.write(encoder.encode(chunk));
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      }
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
  });
}

async function dispatchOllama(env, request, params) {
  const base = env.OLLAMA_TUNNEL_URL || 'http://localhost:11434';
  const { modelKey, systemPrompt, messages } = params;
  const ollamaMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];
  try {
    const upstream = await fetch(`${base}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelKey, messages: ollamaMessages, stream: true, keep_alive: '10m' }),
    });
    if (!upstream.ok) throw new Error(`Ollama ${upstream.status}`);
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    console.error('[provider] Ollama unavailable:', e.message);
    // Fallback to cheapest OpenAI model
    try {
      const fallback = await env.DB.prepare(
        `SELECT model_key FROM ai_models WHERE api_platform='openai' AND supports_tools=1 AND is_active=1 ORDER BY input_rate_per_mtok ASC LIMIT 1`
      ).first();
      if (fallback?.model_key) return dispatchStream(env, request, { ...params, modelKey: fallback.model_key });
    } catch (_) {}
    return jsonResponse({ error: 'Ollama unavailable', detail: e.message }, 503);
  }
}
