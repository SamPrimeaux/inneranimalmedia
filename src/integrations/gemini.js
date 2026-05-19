import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { resolveModelApiKey } from './tokens.js';

/**
 * Google Gemini Service Integration.
 *
 * Translates between OpenAI-shaped params (from dispatchStream / dispatchProviderChat)
 * and Gemini's native REST + SSE format, then re-emits as OpenAI-compatible SSE so
 * the agent loop in agent.js parses it without any changes.
 *
 * Key contracts:
 *  - Input:  OpenAI messages array (role: user/assistant/tool/system), OpenAI tool defs
 *  - Output: `text/event-stream` with `data: <OpenAI-shaped JSON>` chunks + `data: [DONE]`
 */

// ─── Tool schema normalisation ────────────────────────────────────────────────

/**
 * Recursively uppercase JSON-Schema `type` fields — Gemini requires "STRING" not "string".
 */
function uppercaseTypes(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (out.type) out.type = String(out.type).toUpperCase();
  if (out.properties) {
    const props = {};
    for (const [k, v] of Object.entries(out.properties)) props[k] = uppercaseTypes(v);
    out.properties = props;
  }
  if (out.items) out.items = uppercaseTypes(out.items);
  return out;
}

/**
 * Convert OpenAI-shaped tool definitions → Gemini `function_declarations`.
 * Returns undefined (omit tools field) when the list is empty.
 */
export function normalizeGeminiTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return [{
    function_declarations: tools.map(t => {
      let parameters = { type: 'OBJECT', properties: {} };
      try {
        const raw = typeof t.input_schema === 'string'
          ? JSON.parse(t.input_schema)
          : (t.input_schema || {});
        if (raw?.type) parameters = uppercaseTypes(raw);
      } catch (_) {}
      return {
        name: t.tool_name || t.name,
        description: (t.description || t.tool_name || '').slice(0, 500),
        parameters,
      };
    }),
  }];
}

// ─── Message format conversion ────────────────────────────────────────────────

/**
 * Convert OpenAI-shaped messages → Gemini `contents` array.
 *
 * OpenAI roles → Gemini roles:
 *   system    → skipped here (goes to system_instruction at top level)
 *   user      → user
 *   assistant → model  (may contain tool_calls)
 *   tool      → user   (functionResponse part)
 */
function toGeminiContents(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || m.role === 'system') continue;

    // ── assistant turn (text and/or tool calls) ──────────────────────────────
    if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: String(m.content) });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          let args = {};
          try {
            args = typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments ?? {});
          } catch (_) {}
          parts.push({ functionCall: { name: tc.function?.name ?? 'unknown', args } });
        }
      }
      if (parts.length > 0) out.push({ role: 'model', parts });
      continue;
    }

    // ── tool result turn ─────────────────────────────────────────────────────
    if (m.role === 'tool') {
      let response = {};
      try {
        response = typeof m.content === 'string'
          ? JSON.parse(m.content)
          : (m.content ?? {});
        if (typeof response !== 'object' || response === null) {
          response = { result: String(m.content ?? '') };
        }
      } catch (_) {
        response = { result: String(m.content ?? '') };
      }
      out.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name || m.tool_call_id || 'tool', response } }],
      });
      continue;
    }

    // ── user turn (string or multi-part array) ───────────────────────────────
    const textContent = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter(p => p.type === 'text').map(p => p.text).join('\n')
        : String(m.content ?? '');
    if (textContent) out.push({ role: 'user', parts: [{ text: textContent }] });
  }
  return out;
}

// ─── SSE chunk translation ────────────────────────────────────────────────────

/**
 * Translate a single Gemini SSE JSON payload → zero or more OpenAI-shaped delta objects.
 *
 * Gemini:  {"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}]}
 * OpenAI:  {"choices":[{"delta":{"content":"hi"},"finish_reason":null,"index":0}]}
 *          {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
 */
function geminiChunkToOpenAI(jsonStr) {
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch (_) { return []; }

  const candidate = parsed?.candidates?.[0];
  if (!candidate) return [];

  const parts = candidate?.content?.parts ?? [];
  const finishReason = candidate?.finishReason ?? null;
  const out = [];

  // Text parts → content delta
  const textParts = parts.filter(p => p.text != null);
  if (textParts.length > 0) {
    out.push({
      choices: [{
        delta: { content: textParts.map(p => p.text).join('') },
        finish_reason: null,
        index: 0,
      }],
    });
  }

  // functionCall parts → tool_calls delta (OpenAI streaming format)
  const fcParts = parts.filter(p => p.functionCall != null);
  for (let i = 0; i < fcParts.length; i++) {
    const fc = fcParts[i].functionCall;
    out.push({
      choices: [{
        delta: {
          tool_calls: [{
            index: i,
            id: `call_g_${Date.now()}_${i}`,
            type: 'function',
            function: {
              name: fc.name ?? 'unknown',
              arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
            },
          }],
        },
        finish_reason: null,
        index: 0,
      }],
    });
  }

  // Finish reason chunk
  if (finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
    const oaiFinish =
      finishReason === 'STOP'       ? 'stop'
      : finishReason === 'MAX_TOKENS' ? 'length'
      : finishReason === 'SAFETY'     ? 'content_filter'
      : finishReason === 'TOOL_CODE_EXECUTION' ? 'tool_calls'
      : finishReason.toLowerCase();
    out.push({
      choices: [{ delta: {}, finish_reason: oaiFinish, index: 0 }],
    });
  }

  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function chatWithToolsGemini(env, request, params) {
  const {
    modelKey,
    providerModelId,
    messages,
    tools: toolDefinitions,
    systemPrompt,
    userId: paramUserId,
  } = params;

  const authUser = await getAuthUser(request, env);
  const userId =
    paramUserId != null && String(paramUserId).trim() !== ''
      ? String(paramUserId).trim()
      : authUser
        ? String(authUser.id)
        : null;
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

  const apiKey = await resolveModelApiKey(env, 'google', modelKey, userId);
  if (!apiKey || !String(apiKey).trim()) {
    return jsonResponse({ error: 'Google AI API key not configured' }, 503);
  }

  const geminiTools = normalizeGeminiTools(toolDefinitions);
  const resolvedModel =
    (providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : null)
    || modelKey;

  const contents = toGeminiContents(messages);
  const body = {
    contents,
    ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
    ...(geminiTools ? { tools: geminiTools } : {}),
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}` +
    `:streamGenerateContent?alt=sse&key=${apiKey}`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return jsonResponse({ error: `Gemini fetch failed: ${e?.message ?? e}` }, 502);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    let detail = errText;
    try {
      const j = JSON.parse(errText);
      detail = j?.error?.message ?? j?.message ?? detail;
    } catch {
      /* keep errText */
    }
    const status = upstream.status >= 400 ? upstream.status : 502;
    return jsonResponse({ error: `Gemini ${upstream.status}: ${detail}` }, status);
  }

  if (!upstream.body) {
    return jsonResponse({ error: 'Gemini stream body missing' }, 502);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emitJson = async (obj) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          for (const chunk of geminiChunkToOpenAI(jsonStr)) {
            await emitJson(chunk);
          }
        }
      }

      const tail = buf.trim();
      if (tail.startsWith('data:')) {
        const jsonStr = tail.slice(5).trim();
        if (jsonStr && jsonStr !== '[DONE]') {
          for (const chunk of geminiChunkToOpenAI(jsonStr)) await emitJson(chunk);
        }
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e) {
      await emitJson({
        choices: [{ delta: {}, finish_reason: 'error', index: 0 }],
        error: { message: e?.message ?? String(e) },
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Non-streaming generateContent for plan tasks, workflows, and other dispatchComplete callers.
 */
export async function completeWithGemini(env, params) {
  const {
    modelKey,
    providerModelId,
    systemPrompt,
    messages = [],
    tools: toolDefinitions = [],
    userId,
  } = params;

  const apiKey = await resolveModelApiKey(env, 'google', modelKey, userId);
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('Google AI API key not configured');
  }

  const resolvedModel =
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim();
  if (!resolvedModel) throw new Error('modelKey required');

  const geminiTools = normalizeGeminiTools(toolDefinitions);
  const contents = toGeminiContents(messages);
  const body = {
    contents,
    ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
    ...(geminiTools ? { tools: geminiTools } : {}),
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}` +
    `:generateContent?key=${apiKey}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Gemini request failed: ${e?.message ?? e}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  let text = '';
  for (const c of data?.candidates || []) {
    for (const p of c?.content?.parts || []) {
      if (typeof p?.text === 'string') text += p.text;
    }
  }
  return { text, output_text: text };
}
