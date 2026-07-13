import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { resolveModelApiKey } from './tokens.js';
import { loadCatalogCapabilities } from '../core/model-catalog-capabilities.js';
export {
  sanitizeGeminiParameterSchema,
  normalizeGeminiTools,
} from './gemini-schema.js';
import { normalizeGeminiTools } from './gemini-schema.js';

/**
 * Append Gemini built-in code_execution when catalog says the model supports it.
 * Server-side sandbox (no programmatic tool calling — unlike Anthropic 20260120).
 * @param {unknown[] | undefined} geminiTools
 * @param {{ supports_code_execution?: boolean } | null | undefined} cap
 */
export function withGeminiCodeExecutionTool(geminiTools, cap) {
  if (!cap?.supports_code_execution) return geminiTools;
  const list = Array.isArray(geminiTools) ? [...geminiTools] : [];
  if (list.some((t) => t && typeof t === 'object' && 'code_execution' in t)) {
    return list;
  }
  list.push({ code_execution: {} });
  return list;
}

/**
 * Google Gemini Service Integration.
 *
 * Translates between OpenAI-shaped params (from dispatchStream / dispatchProviderChat)
 * and Gemini's native REST + SSE format, then re-emits as OpenAI-compatible SSE so
 * the agent loop in agent.js parses it without any changes.
 *
 * Gemini 3.x notes (Google generateContent docs, June 2026):
 *  - Default temperature should stay 1.0 (lower values can loop/degrade).
 *  - thinkingConfig.thinkingLevel: low | medium | high (not minimal on 3.5).
 *  - thoughtSignature on text/functionCall parts must round-trip for tool loops.
 */

// ─── Model ID + URL helpers ───────────────────────────────────────────────────

/** Strip leading models/ — catalog stores canonical `models/gemini-*` ids. */
export function normalizeGeminiModelId(raw) {
  return String(raw || '').trim().replace(/^models\//, '');
}

export function isGemini3ModelId(modelId) {
  const id = normalizeGeminiModelId(modelId).toLowerCase();
  return id.startsWith('gemini-3');
}

/** Visible user-facing text — exclude internal thought summaries only. */
export function isVisibleGeminiTextPart(part) {
  if (!part || part.text == null) return false;
  if (part.thought === true) return false;
  return true;
}

/** @param {string} providerModelId @param {string} apiKey @param {{ stream?: boolean }} [opts] */
export function buildGeminiUrl(providerModelId, apiKey, opts = {}) {
  const modelId = normalizeGeminiModelId(providerModelId);
  if (modelId.startsWith('models/')) {
    throw new Error(`[gemini] double models/ prefix: ${modelId}`);
  }
  const action = opts.stream ? 'streamGenerateContent' : 'generateContent';
  // Keep `key` and `alt` as separate query params. The historical bug was `alt=sse?key=…`
  // (key glued to alt). For streaming, `alt=sse` is required — without it Google returns a
  // JSON array stream, not `data:` SSE lines that geminiChunkToOpenAI expects.
  const params = new URLSearchParams({ key: apiKey });
  if (opts.stream) params.set('alt', 'sse');
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${action}?${params.toString()}`;
}

/**
 * @param {{ mode?: string, lane?: string|null, taskType?: string|null }} routingDecision
 * @param {{ maxOutputTokens?: number, modelId?: string|null }} [opts]
 */
/** Gemini 3.x thinking shares the output budget — keep a floor so visible text is not starved. */
export function resolveGeminiMaxOutputTokens(modelId, requested) {
  const gemini3 = isGemini3ModelId(modelId);
  const floor = gemini3 ? 8192 : 2048;
  const req = Number(requested ?? 0);
  if (req > 0) return Math.max(req, floor);
  return floor;
}

export function buildGeminiGenerationConfig(routingDecision, opts = {}) {
  const mode = String(routingDecision?.mode || '').toLowerCase();
  const taskType = String(routingDecision?.taskType || '').toLowerCase();
  const lane = String(routingDecision?.lane || '').toLowerCase();
  const modelId = normalizeGeminiModelId(opts.modelId || '');
  const gemini3 = isGemini3ModelId(modelId);

  const agentic =
    ['agent', 'code', 'debug', 'plan', 'terminal_execution'].includes(mode) ||
    ['agent', 'code', 'debug', 'plan', 'terminal_execution'].includes(taskType);
  const premium = ['debug', 'plan'].includes(mode) || ['debug', 'plan'].includes(taskType);
  const askLike =
    mode === 'ask' ||
    ['ask', 'greeting', 'chat', 'explain', 'summary', 'question'].includes(taskType);

  let thinkingLevel = 'low';
  if (gemini3) {
    if (premium && lane === 'premium') thinkingLevel = 'high';
    else if (agentic && !askLike) thinkingLevel = 'medium';
    else thinkingLevel = 'low';
  } else if (premium) {
    thinkingLevel = 'high';
  } else if (!agentic) {
    thinkingLevel = 'minimal';
  }

  const config = {
    maxOutputTokens: resolveGeminiMaxOutputTokens(modelId, opts.maxOutputTokens),
    thinkingConfig: { thinkingLevel },
  };

  if (gemini3) {
    config.temperature = 1.0;
  } else {
    config.temperature = premium ? 0.7 : 0.2;
  }

  return config;
}

/** Parse Gemini response text for user-visible output. */
export function parseGeminiResponseText(json) {
  return (json?.candidates?.[0]?.content?.parts ?? [])
    .filter(isVisibleGeminiTextPart)
    .map((p) => p.text || '')
    .join('')
    .trim();
}

/** @param {any} json */
export function parseGeminiUsageMetadata(json) {
  const um = json?.usageMetadata ?? {};
  return {
    prompt_tokens: um.promptTokenCount ?? 0,
    output_tokens: um.candidatesTokenCount ?? 0,
    thinking_tokens: um.thoughtsTokenCount ?? 0,
    total_tokens: um.totalTokenCount ?? 0,
    model_version: json?.modelVersion ?? null,
    finish_reason: json?.candidates?.[0]?.finishReason ?? null,
  };
}

// ─── Message format conversion ────────────────────────────────────────────────

function buildToolNameById(messages) {
  const map = new Map();
  for (const m of messages || []) {
    if (m?.role !== 'assistant') continue;
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === 'tool_use' && b.id && b.name) map.set(String(b.id), String(b.name));
      }
    }
    if (Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        const id = tc?.id != null ? String(tc.id) : '';
        const name = tc?.function?.name != null ? String(tc.function.name) : '';
        if (id && name) map.set(id, name);
      }
    }
  }
  return map;
}

function parseFunctionResponsePayload(content) {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
    return { result: content };
  }
  if (content && typeof content === 'object') return content;
  return { result: String(content ?? '') };
}

function assistantAnthropicBlocksToGeminiParts(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && b.text) {
      const part = { text: String(b.text) };
      if (b.gemini_thought_signature) part.thoughtSignature = String(b.gemini_thought_signature);
      parts.push(part);
      continue;
    }
    if (b.type === 'tool_use' && b.name) {
      const fc = {
        name: String(b.name),
        args: b.input && typeof b.input === 'object' ? b.input : {},
      };
      if (b.id) fc.id = String(b.id);
      const part = { functionCall: fc };
      if (b.gemini_thought_signature) part.thoughtSignature = String(b.gemini_thought_signature);
      parts.push(part);
    }
  }
  return parts;
}

function openAiToolCallsToGeminiParts(toolCalls) {
  const parts = [];
  for (const tc of toolCalls) {
    let args = {};
    try {
      args = typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : (tc.function?.arguments ?? {});
    } catch (_) {}
    const fc = {
      name: tc.function?.name ?? 'unknown',
      args,
    };
    if (tc.id) fc.id = String(tc.id);
    const part = { functionCall: fc };
    const sig = tc.gemini_thought_signature ?? tc.function?.gemini_thought_signature;
    if (sig) part.thoughtSignature = String(sig);
    parts.push(part);
  }
  return parts;
}

/**
 * Convert agent/OpenAI-shaped messages → Gemini `contents` array.
 * Supports Anthropic-style content blocks (tool_use / tool_result) used by AgentSam.
 */
export function toGeminiContents(messages) {
  const toolNames = buildToolNameById(messages);
  const out = [];

  for (const m of messages) {
    if (!m || m.role === 'system') continue;

    if (m.role === 'assistant') {
      if (Array.isArray(m.gemini_model_parts) && m.gemini_model_parts.length > 0) {
        out.push({ role: 'model', parts: m.gemini_model_parts });
        continue;
      }

      const parts = [];
      if (typeof m.content === 'string' && m.content.trim()) {
        parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        parts.push(...assistantAnthropicBlocksToGeminiParts(m.content));
      }
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
        parts.push(...openAiToolCallsToGeminiParts(m.tool_calls));
      }
      if (parts.length > 0) out.push({ role: 'model', parts });
      continue;
    }

    if (m.role === 'tool') {
      out.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: m.name || m.tool_call_id || 'tool',
            response: parseFunctionResponsePayload(m.content),
          },
        }],
      });
      continue;
    }

    if (m.role === 'user') {
      const parts = [];
      if (typeof m.content === 'string' && m.content.trim()) {
        parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && block.text) {
            parts.push({ text: String(block.text) });
            continue;
          }
          if (block.type === 'tool_result') {
            const toolId = block.tool_use_id != null ? String(block.tool_use_id) : '';
            const toolName =
              (block.name && String(block.name)) ||
              (toolId && toolNames.get(toolId)) ||
              'tool';
            parts.push({
              functionResponse: {
                name: toolName,
                response: parseFunctionResponsePayload(block.content),
              },
            });
            continue;
          }
          if (block.type === 'image' && block.source?.data) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type || 'image/png',
                data: String(block.source.data),
              },
            });
          }
        }
      }
      if (parts.length > 0) out.push({ role: 'user', parts });
    }
  }

  return out;
}

// ─── SSE chunk translation ────────────────────────────────────────────────────

/**
 * Translate Gemini SSE JSON → OpenAI-shaped deltas.
 * Preserves gemini_thought_signature on tool_calls for multi-turn tool loops.
 */
export function geminiChunkToOpenAI(jsonStr) {
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch (_) { return []; }

  const candidate = parsed?.candidates?.[0];
  if (!candidate) return [];

  const parts = candidate?.content?.parts ?? [];
  const finishReason = candidate?.finishReason ?? null;
  const out = [];

  const textParts = parts.filter(isVisibleGeminiTextPart);
  // Native code_execution is server-side — surface code + result as visible text
  // so the agent loop / UI aren't blind to sandbox turns.
  const codeBits = [];
  for (const p of parts) {
    if (p?.executableCode?.code) {
      codeBits.push(`\`\`\`python\n${String(p.executableCode.code)}\n\`\`\``);
    }
    if (p?.codeExecutionResult) {
      const outcome = p.codeExecutionResult.outcome
        ? String(p.codeExecutionResult.outcome)
        : '';
      const output =
        p.codeExecutionResult.output != null
          ? String(p.codeExecutionResult.output)
          : '';
      if (outcome || output) {
        codeBits.push(
          outcome
            ? `[code_execution ${outcome}]\n${output}`.trim()
            : output,
        );
      }
    }
  }
  const visible = [
    ...textParts.map((p) => p.text),
    ...codeBits,
  ].filter(Boolean);
  if (visible.length > 0) {
    out.push({
      choices: [{
        delta: { content: visible.join('\n') },
        finish_reason: null,
        index: 0,
      }],
    });
  }

  const fcParts = parts.filter(p => p.functionCall != null);
  for (let i = 0; i < fcParts.length; i++) {
    const fcPart = fcParts[i];
    const fc = fcPart.functionCall;
    const fn = {
      name: fc.name ?? 'unknown',
      arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
    };
    if (fcPart.thoughtSignature) fn.gemini_thought_signature = fcPart.thoughtSignature;
    out.push({
      choices: [{
        delta: {
          tool_calls: [{
            index: i,
            id: fc.id ? String(fc.id) : `call_g_${Date.now()}_${i}`,
            type: 'function',
            function: fn,
          }],
        },
        finish_reason: null,
        index: 0,
      }],
    });
  }

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

  const catalogCap = await loadCatalogCapabilities(env, modelKey);
  const geminiTools = withGeminiCodeExecutionTool(
    normalizeGeminiTools(toolDefinitions),
    catalogCap,
  );
  const normalizedModelId = normalizeGeminiModelId(
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : modelKey,
  );

  const contents = toGeminiContents(messages);
  const body = {
    contents,
    ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
    ...(geminiTools && geminiTools.length ? { tools: geminiTools } : {}),
    generationConfig: buildGeminiGenerationConfig(
      { mode: params.mode, lane: params.lane, taskType: params.taskType },
      { maxOutputTokens: params.maxOutputTokens, modelId: normalizedModelId },
    ),
  };

  const url = buildGeminiUrl(normalizedModelId, apiKey, { stream: true });

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      ...(params.signal != null ? { signal: params.signal } : {}),
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

  const resolvedModel = normalizeGeminiModelId(
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim(),
  );
  if (!resolvedModel) throw new Error('modelKey required');

  const catalogCap = await loadCatalogCapabilities(env, modelKey);
  const geminiTools = withGeminiCodeExecutionTool(
    normalizeGeminiTools(toolDefinitions),
    catalogCap,
  );
  const contents = toGeminiContents(messages);
  const body = {
    contents,
    ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
    ...(geminiTools && geminiTools.length ? { tools: geminiTools } : {}),
    generationConfig: buildGeminiGenerationConfig(
      { mode: params.mode, lane: params.lane, taskType: params.taskType },
      { maxOutputTokens: params.maxOutputTokens, modelId: resolvedModel },
    ),
  };

  const url = buildGeminiUrl(resolvedModel, apiKey, { stream: false });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      ...(params.signal != null ? { signal: params.signal } : {}),
    });
  } catch (e) {
    throw new Error(`Gemini request failed: ${e?.message ?? e}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const text = parseGeminiResponseText(data);
  return { text, output_text: text, usage: parseGeminiUsageMetadata(data) };
}
