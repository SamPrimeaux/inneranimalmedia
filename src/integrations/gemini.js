/**
 * Integration Layer: Google Gemini / Google AI
 * Streaming chat via generativelanguage.googleapis.com.
 * Handles both provider='gemini' (GEMINI_API_KEY) and provider='google' (GOOGLE_AI_API_KEY).
 * Message + tool format identical to Vertex AI — different auth only (API key vs JWT).
 * Normalizes SSE output to {delta: {text}} format.
 */
import { resolveModelApiKey, getProviderDefaultKey } from './tokens.js';
import { jsonResponse } from '../core/responses.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Format Conversion ────────────────────────────────────────────────────────

/**
 * Convert messages to Gemini contents format.
 * Handles Anthropic multi-part arrays, OpenAI tool_calls, and plain strings.
 */
function toGeminiContents(messages) {
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (typeof msg.content === 'string') {
      contents.push({ role, parts: [{ text: msg.content }] });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({ functionCall: { name: block.name, args: block.input || {} } });
        } else if (block.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name:     block.tool_use_id || 'tool',
              response: {
                content: typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content),
              },
            },
          });
        }
      }
      if (parts.length) contents.push({ role, parts });
      continue;
    }

    if (msg.tool_calls?.length) {
      const parts = msg.tool_calls.map(tc => ({
        functionCall: {
          name: tc.function.name,
          args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
        },
      }));
      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      contents.push({
        role:  'user',
        parts: [{
          functionResponse: {
            name:     msg.name || 'tool',
            response: { content: msg.content || '' },
          },
        }],
      });
      continue;
    }
  }

  return contents;
}

/**
 * Convert Anthropic or OpenAI tool definitions to Gemini functionDeclarations.
 */
function toGeminiFunctionDeclarations(tools) {
  if (!tools?.length) return null;
  const declarations = tools.map(t => {
    if (t.type === 'function' && t.function) {
      return {
        name:        t.function.name,
        description: t.function.description || '',
        parameters:  t.function.parameters || { type: 'object', properties: {} },
      };
    }
    return {
      name:        t.name,
      description: t.description || '',
      parameters:  t.input_schema || { type: 'object', properties: {} },
    };
  });
  return [{ functionDeclarations: declarations }];
}

function extractSystemText(systemPrompt, messages) {
  if (systemPrompt) return systemPrompt;
  return messages.find(m => m.role === 'system')?.content || null;
}

// ─── Key Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve API key for gemini or google provider.
 * Checks model-specific secret_key_name first, then provider fallback.
 */
async function resolveGeminiKey(env, provider, modelKey) {
  // Try model-specific key first
  const key = await resolveModelApiKey(env, provider, modelKey);
  if (key) return key;
  // Cross-fallback: gemini ↔ google share the same key pool
  return getProviderDefaultKey(env, 'gemini') || getProviderDefaultKey(env, 'google') || null;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Stream a chat completion via Google Generative AI.
 * Handles both provider='gemini' and provider='google'.
 * Returns Response with normalized {delta: {text}} SSE.
 */
export async function chatWithToolsGemini(env, request, params) {
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;

  // Determine which provider the model belongs to
  const provider = params.provider || 'gemini';

  if (!modelKey) return jsonResponse({ error: 'modelKey required' }, 400);

  const apiKey = await resolveGeminiKey(env, provider, modelKey);
  if (!apiKey) return jsonResponse({ error: 'Gemini/Google API key not configured' }, 503);

  const endpoint = `${GEMINI_BASE}/${modelKey}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const systemText = extractSystemText(systemPrompt, messages);
  const contents   = toGeminiContents(messages);
  const gTools     = toGeminiFunctionDeclarations(tools);

  const body = {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    ...(gTools     ? { tools: gTools } : {}),
    generationConfig: {
      temperature:     1.0,
      maxOutputTokens: 8192,
      topP:            0.95,
    },
  };

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (e) {
    return jsonResponse({ error: 'Gemini request failed', detail: e.message }, 502);
  }

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => '');
    return jsonResponse({ error: 'Gemini API error', status: upstream.status, detail: err.slice(0, 500) }, upstream.status);
  }

  // Transform Gemini SSE → normalized {delta: {text}} SSE
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = upstream.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          let chunk;
          try { chunk = JSON.parse(raw); } catch { continue; }

          const candidate = chunk.candidates?.[0];
          if (!candidate) continue;

          for (const part of candidate.content?.parts || []) {
            if (part.text) {
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ delta: { text: part.text } })}\n\n`)
              );
            }
            if (part.functionCall) {
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ delta: { tool_use: { name: part.functionCall.name, input: part.functionCall.args } } })}\n\n`)
              );
            }
          }

          if (chunk.usageMetadata) {
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({
                usage: {
                  input_tokens:  chunk.usageMetadata.promptTokenCount     || 0,
                  output_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
                },
              })}\n\n`)
            );
          }
        }
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Non-streaming Gemini completion. Returns the first candidate text.
 */
export async function completeWithGemini(env, params) {
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;
  const provider = params.provider || 'gemini';

  const apiKey = await resolveGeminiKey(env, provider, modelKey);
  if (!apiKey) throw new Error('Gemini/Google API key not configured');

  const endpoint   = `${GEMINI_BASE}/${modelKey}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const systemText = extractSystemText(systemPrompt, messages);
  const contents   = toGeminiContents(messages);
  const gTools     = toGeminiFunctionDeclarations(tools);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents,
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      ...(gTools     ? { tools: gTools } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
