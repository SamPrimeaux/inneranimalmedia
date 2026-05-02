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

/** Thrown when Ollama is skipped so the agent model chain can try the next provider (no SSE error text). */
export const OLLAMA_SKIP_MESSAGE = 'ollama_skip';

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
      return dispatchWorkersAI(env, request, dp);
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

/** When Workers AI fails or returns an unusable stream, continue with OpenAI (same SSE shape as upstream OpenAI). */
const WORKERS_AI_OPENAI_FALLBACK_MODEL = 'gpt-4.1-mini';

function extractWorkersAiSseToken(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const c0 = Array.isArray(obj.choices) ? obj.choices[0] : null;
  const t =
    c0?.delta?.content ??
    c0?.text ??
    (typeof obj.response === 'string' ? obj.response : obj.response != null ? String(obj.response) : '') ??
    '';
  return typeof t === 'string' ? t : String(t || '');
}

async function dispatchWorkersAI(env, request, params) {
  const { modelKey, systemPrompt, messages } = params;
  const waiMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];

  const openAiFallback = async (reason) => {
    console.warn('[provider] Workers AI → OpenAI fallback', WORKERS_AI_OPENAI_FALLBACK_MODEL, reason?.message || String(reason));
    if (!env?.OPENAI_API_KEY) {
      return jsonResponse(
        { error: 'Workers AI failed and OpenAI is not configured', detail: String(reason?.message || reason) },
        503,
      );
    }
    return chatWithToolsOpenAI(env, request, {
      ...params,
      modelKey: WORKERS_AI_OPENAI_FALLBACK_MODEL,
    });
  };

  if (!env.AI) return openAiFallback('AI binding not available');

  let response;
  try {
    response = await env.AI.run(modelKey, { messages: waiMessages, stream: true });
  } catch (e) {
    return openAiFallback(e);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const writeToken = async (text) => {
    if (text == null || text === '') return;
    const line = `data: ${JSON.stringify({ type: 'token', text: String(text) })}\n\n`;
    await writer.write(encoder.encode(line));
  };

  void (async () => {
    try {
      if (response instanceof ReadableStream) {
        const reader = response.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            const t = line.trim();
            if (!t) continue;
            let j;
            try {
              j = JSON.parse(t);
            } catch {
              await writeToken(t);
              continue;
            }
            const piece = extractWorkersAiSseToken(j);
            if (piece) await writeToken(piece);
          }
        }
        const tail = buf.trim();
        if (tail) {
          try {
            const piece = extractWorkersAiSseToken(JSON.parse(tail));
            if (piece) await writeToken(piece);
          } catch {
            await writeToken(tail);
          }
        }
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } else {
        let text = '';
        if (typeof response?.response === 'string') text = response.response;
        else if (response?.response != null && typeof response.response !== 'object') {
          text = String(response.response);
        } else if (typeof response === 'string') text = response;
        await writeToken(text);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      }
    } catch (e) {
      console.warn('[provider] Workers AI stream failed mid-flight', e?.message || e);
      try {
        const fb = await chatWithToolsOpenAI(env, request, {
          ...params,
          modelKey: WORKERS_AI_OPENAI_FALLBACK_MODEL,
        });
        if (fb instanceof Response && fb.ok && fb.body) {
          const rdr = fb.body.getReader();
          while (true) {
            const { done, value } = await rdr.read();
            if (done) break;
            if (value?.byteLength) await writer.write(value);
          }
        } else if (fb instanceof Response) {
          console.warn('[provider] Workers AI OpenAI fallback HTTP', fb.status);
          await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'stream_unavailable' })}\n\n`));
        }
      } catch (e2) {
        console.warn('[provider] Workers AI OpenAI fallback threw', e2?.message ?? e2);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'stream_unavailable' })}\n\n`));
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
  });
}

async function dispatchOllama(env, request, params) {
  const base =
    (env.OLLAMA_BASE_URL && String(env.OLLAMA_BASE_URL).trim()) ||
    (env.OLLAMA_TUNNEL_URL && String(env.OLLAMA_TUNNEL_URL).trim()) ||
    'https://ollama.inneranimalmedia.com';
  const { modelKey, systemPrompt, messages } = params;
  const ollamaMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];
  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.OLLAMA_CF_CLIENT_ID && env.OLLAMA_CF_CLIENT_SECRET
          ? {
              'CF-Access-Client-Id': env.OLLAMA_CF_CLIENT_ID,
              'CF-Access-Client-Secret': env.OLLAMA_CF_CLIENT_SECRET,
            }
          : {}),
      },
      body: JSON.stringify({ model: modelKey, messages: ollamaMessages, stream: true, keep_alive: '10m' }),
    });
    if (!upstream.ok) {
      if (upstream.status === 403) {
        console.warn('[provider] Ollama upstream 403; continuing provider chain');
        throw new Error(OLLAMA_SKIP_MESSAGE);
      }
      console.warn('[provider] Ollama upstream error', upstream.status);
      throw new Error(OLLAMA_SKIP_MESSAGE);
    }
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    if (String(e?.message || '') === OLLAMA_SKIP_MESSAGE) throw e;
    const msg = String(e?.message || e || '');
    const refused = /ECONNREFUSED|connection refused|Failed to fetch|NetworkError/i.test(msg);
    if (refused) {
      console.warn('[provider] Ollama connection refused or unreachable; continuing provider chain');
    } else {
      console.warn('[provider] Ollama unavailable; continuing provider chain');
    }
    throw new Error(OLLAMA_SKIP_MESSAGE);
  }
}
