/**
 * Integration Layer: OpenAI
 * Streaming chat completions via api.openai.com.
 * Key resolved via resolveOpenAiCompatibleApiKey (OpenAI, DeepSeek, BYOK).
 * Proxies OpenAI SSE stream directly — frontend handles choices[0].delta.content format.
 */
import { assertOpenAiImageModelActive } from '../core/image-model-routes.js';
import {
  resolveOpenAiApiKey,
  resolveOpenAiCompatibleApiKey,
  resolveOpenAiCompatibleBaseUrl,
  isDeepSeekOpenAiCompatibleDispatch,
} from './openai-credentials.js';
import {
  applyOpenAiChatCompletionsOutputLimit,
  applyOpenAiResponsesTokenLimit,
} from './openai-token-params.js';
import { jsonResponse } from '../core/responses.js';
import { isFeatureEnabled } from '../core/features.js';
import {
  allowedCallersFromCallerPolicy,
  applyDeferLoadingLaw,
} from '../core/openai-caller-policy.js';

const OPENAI_BASE = 'https://api.openai.com/v1';

/** @param {Record<string, unknown>} params */
function openAiCompatDispatchOpts(params) {
  const strictTools = params.deepseekStrictTools ?? params.deepseek_strict_tools ?? false;
  return {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
    apiPlatform: params.apiPlatform ?? params.api_platform,
    provider: params.provider,
    deepseekStrictTools: strictTools,
    deepseekBeta: params.deepseekBeta ?? params.deepseek_beta ?? strictTools,
  };
}

/** DeepSeek v4 effort mapping when thinking mode is on. */
function mapDeepSeekReasoningEffort(raw) {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!e || e === 'none') return 'high';
  if (e === 'low' || e === 'medium') return 'high';
  if (e === 'xhigh' || e === 'maximal') return 'max';
  if (e === 'high' || e === 'max') return e;
  return 'high';
}

/** @returns {'enabled'|null} null = omit thinking (non-thinking tool-call path). */
function resolveDeepSeekThinkingType(modelForApi, params) {
  const explicit = params.thinkingMode ?? params.thinking_mode ?? params.thinking;
  if (explicit === 'disabled' || explicit === false || explicit === 'off') return null;
  if (explicit === 'enabled' || explicit === true) return 'enabled';

  const policy = String(params.thinkingPolicy ?? params.thinking_policy ?? '').trim().toLowerCase();
  if (policy === 'omitted' || policy === 'disabled' || policy === 'off' || policy === 'non_thinking') {
    return null;
  }
  if (policy === 'enabled' || policy === 'adaptive' || policy === 'thinking' || policy === 'adaptive_only') {
    return 'enabled';
  }

  const m = String(modelForApi || '').trim().toLowerCase();
  if (m.includes('reasoner') || m.endsWith('-r1') || m === 'deepseek-r1') return 'enabled';
  if (m.includes('v4-pro')) return 'enabled';
  if (m.includes('v4-flash')) return null;
  return null;
}

/** @param {Record<string, unknown>} body @param {{ modelForApi: string, reasoningEffort?: string|null, verbosity?: string|null, params?: Record<string, unknown> }} opts */
function applyDeepSeekChatCompletionsBody(body, { modelForApi, reasoningEffort, verbosity, params = {} }) {
  const next = { ...body };
  delete next.reasoning;
  delete next.text;
  delete next.temperature;
  delete next.top_p;
  delete next.presence_penalty;
  delete next.frequency_penalty;
  void verbosity;

  const thinkingType = resolveDeepSeekThinkingType(modelForApi, params);
  const jsonOutput = next.response_format?.type === 'json_object';
  if (!jsonOutput && thinkingType === 'enabled') {
    next.thinking = { type: 'enabled' };
    next.reasoning_effort = mapDeepSeekReasoningEffort(reasoningEffort);
  }
  return next;
}

/**
 * OpenAI / DeepSeek chat.completions response_format (JSON Output).
 * @param {Record<string, unknown>} params
 * @param {{ hasTools?: boolean }} [opts]
 */
function resolveChatCompletionsResponseFormat(params, opts = {}) {
  const hasTools = opts.hasTools === true;
  const explicit = params.responseFormat ?? params.response_format ?? null;
  if (explicit && typeof explicit === 'object') {
    if (hasTools && explicit.type === 'json_object' && params.forceJsonOutput !== true) return null;
    return explicit;
  }
  const wantJson =
    params.jsonMode === true ||
    params.json_mode === true ||
    params.requireJsonOutput === true ||
    params.require_json_output === true;
  if (wantJson && !hasTools) return { type: 'json_object' };
  return null;
}

/** @param {Record<string, unknown>} body @param {Record<string, unknown>} params @param {boolean} hasTools */
function applyChatCompletionsResponseFormat(body, params, hasTools) {
  const rf = resolveChatCompletionsResponseFormat(params, { hasTools });
  if (!rf) return body;
  return { ...body, response_format: rf };
}

/** @param {Record<string, unknown>} body @param {Record<string, unknown>} params @param {string} modelForApi @param {{ secretKeyName?: string|null, apiPlatform?: string|null, provider?: string|null }} compatOpts */
function finalizeOpenAiCompatibleChatBody(body, params, modelForApi, compatOpts) {
  const reasoningEffort = params.reasoningEffort || null;
  const verbosity = params.verbosity || null;
  if (!isDeepSeekOpenAiCompatibleDispatch(compatOpts)) return body;
  return applyDeepSeekChatCompletionsBody(body, { modelForApi, reasoningEffort, verbosity, params });
}

/** Extract DeepSeek/OpenAI assistant reasoning_content from internal message shape. */
function assistantReasoningContentFromMessage(msg) {
  if (typeof msg?.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    return msg.reasoning_content;
  }
  if (Array.isArray(msg?.content)) {
    const fromBlocks = msg.content
      .filter((b) => b?.type === 'reasoning')
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .join('');
    if (fromBlocks.trim()) return fromBlocks;
  }
  return '';
}

/** Strip obvious secrets before logging provider error bodies. */
function sanitizeOpenAiErrorBodyForLog(text) {
  const s = String(text || '').slice(0, 2000);
  return s.replace(/\bsk-[a-zA-Z0-9]{10,}\b/g, '[redacted]');
}

// ─── Tool Format ──────────────────────────────────────────────────────────────

function deepSeekStrictToolsEnabled(params) {
  return (
    params.deepseekStrictTools === true ||
    params.deepseek_strict_tools === true ||
    String(params.toolInvocationStyle ?? params.tool_invocation_style ?? '').trim().toLowerCase() ===
      'deepseek_strict'
  );
}

/**
 * Convert Anthropic-style tools to OpenAI function format.
 * @param {unknown[]} tools
 * @param {{ deepseekStrictTools?: boolean }} [opts]
 */
function toOpenAITools(tools, opts = {}) {
  if (!tools?.length) return undefined;
  const strict = opts.deepseekStrictTools === true;
  return tools.map(t => {
    if (t.type === 'function') {
      if (!strict || !t.function) return t;
      return { ...t, function: { ...t.function, strict: true } };
    }
    return {
      type: 'function',
      function: {
        name:        t.name,
        description: t.description || '',
        parameters:  t.input_schema || { type: 'object', properties: {} },
        ...(strict ? { strict: true } : {}),
      },
    };
  });
}

/** Tools shape for POST /v1/responses (flat `name` + `parameters`, not nested `function`). */
function toOpenAIResponsesTools(tools, opts = {}) {
  if (!tools?.length) return undefined;
  const openaiPtcEnabled = opts.openaiPtcEnabled === true;
  return tools.map((t) => {
    const rawPolicy =
      t.caller_policy != null
        ? t.caller_policy
        : t.function?.caller_policy != null
          ? t.function.caller_policy
          : t.allowed_callers != null
            ? t.allowed_callers
            : t.function?.allowed_callers;
    const allowed_callers = allowedCallersFromCallerPolicy(rawPolicy, { openaiPtcEnabled });
    let def;
    if (t.type === 'function' && t.function) {
      def = {
        type: 'function',
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters || { type: 'object', properties: {} },
        allowed_callers,
      };
      if (t.function.defer_loading === true || t.defer_loading === true) {
        def.defer_loading = true;
      }
    } else {
      def = {
        type: 'function',
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
        allowed_callers,
      };
      if (t.defer_loading === true) def.defer_loading = true;
    }
    return applyDeferLoadingLaw(def, allowed_callers);
  });
}

/**
 * Map Anthropic-style vision blocks → OpenAI Responses API content parts.
 * @param {unknown[]} blocks
 */
function anthropicVisionBlocksToResponsesContent(blocks) {
  const parts = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'input_text', text: String(block.text) });
      continue;
    }
    if (block.type === 'image' && block.source?.data) {
      const mime = block.source.media_type || 'image/png';
      parts.push({
        type: 'input_image',
        image_url: `data:${mime};base64,${block.source.data}`,
        detail: 'auto',
      });
    }
  }
  return parts;
}

/**
 * Build `input` for /v1/responses. With `previousResponseId`, only `function_call_output` items
 * from the latest tool-result user message are sent; otherwise user/assistant text turns.
 */
function buildOpenAIResponsesInput(messages, previousResponseId) {
  if (previousResponseId) {
    const out = [];
    // Walk backward — a trailing text user nudge must not hide tool_result payloads.
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!(msg?.role === 'user' && Array.isArray(msg.content))) continue;
      const hasToolResult = msg.content.some((b) => b?.type === 'tool_result');
      if (!hasToolResult) continue;
      for (const b of msg.content) {
        if (b.type !== 'tool_result') continue;
        const callId = String(b.tool_use_id || '').trim();
        if (!callId) continue;
        const payload =
          typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? {});
        out.push({
          type: 'function_call_output',
          call_id: callId,
          output: payload,
        });
      }
      break;
    }
    return out;
  }

  const items = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        items.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const visionParts = anthropicVisionBlocksToResponsesContent(msg.content);
        if (visionParts.length) {
          items.push({ role: 'user', content: visionParts });
          continue;
        }
        const text = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('\n')
          .trim();
        if (text) items.push({ role: 'user', content: text });
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        items.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('')
          .trim();
        if (text) items.push({ role: 'assistant', content: text });
      }
    }
  }
  return items;
}

/**
 * Build the messages array for OpenAI.
 * Prepends systemPrompt as a system message if provided and not already present.
 */
function buildOpenAIMessages(systemPrompt, messages) {
  const hasSystem = messages.some(m => m.role === 'system');
  const normalized = [];

  if (systemPrompt && !hasSystem) {
    normalized.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      const reasoning_content = assistantReasoningContentFromMessage(msg);
      normalized.push({
        role: 'assistant',
        content: msg.content,
        ...(reasoning_content ? { reasoning_content } : {}),
        ...(Array.isArray(msg.tool_calls) && msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}),
      });
      continue;
    }

    // Convert Anthropic tool_use blocks to OpenAI tool_calls (+ DeepSeek reasoning_content)
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const textParts  = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const toolCalls  = msg.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          id:       b.id || `call_${crypto.randomUUID().slice(0, 8)}`,
          type:     'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));
      const reasoning_content = assistantReasoningContentFromMessage(msg);

      normalized.push({
        role:       'assistant',
        content:    textParts || null,
        ...(reasoning_content ? { reasoning_content } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // Convert Anthropic tool_result blocks to OpenAI tool messages
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const hasImage = msg.content.some((b) => b?.type === 'image' && b?.source?.data);
      const hasToolResult = msg.content.some((b) => b?.type === 'tool_result');
      if (hasImage && !hasToolResult) {
        const parts = [];
        for (const block of msg.content) {
          if (block?.type === 'text' && block.text) {
            parts.push({ type: 'text', text: String(block.text) });
          } else if (block?.type === 'image' && block.source?.data) {
            const mime = block.source.media_type || 'image/png';
            parts.push({
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${block.source.data}` },
            });
          }
        }
        if (parts.length) normalized.push({ role: 'user', content: parts });
        continue;
      }
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          normalized.push({
            role:         'tool',
            tool_call_id: block.tool_use_id,
            content:      typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          });
        } else if (block.type === 'text') {
          normalized.push({ role: 'user', content: block.text });
        }
      }
      continue;
    }

    normalized.push(msg);
  }

  return normalized;
}

export { buildOpenAIMessages, buildOpenAIResponsesInput, assistantReasoningContentFromMessage };

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Stream a chat completion via OpenAI.
 * Returns a Response with the OpenAI SSE stream proxied directly.
 */
export async function chatWithToolsOpenAI(env, request, params) {
  const { modelKey, providerModelId, systemPrompt, messages = [], tools = [], userId } = params;
  const modelForApi =
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim();

  const compatOpts = openAiCompatDispatchOpts(params);
  const apiKey = await resolveOpenAiCompatibleApiKey(env, modelKey, userId, compatOpts);
  const apiBase = resolveOpenAiCompatibleBaseUrl(compatOpts);
  if (!apiKey) {
    return jsonResponse(
      { error: isDeepSeekOpenAiCompatibleDispatch(compatOpts) ? 'DeepSeek API key not configured' : 'OpenAI API key not configured' },
      503,
    );
  }
  if (!modelForApi) return jsonResponse({ error: 'modelKey required' }, 400);

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const deepseekStrict = isDeepSeekOpenAiCompatibleDispatch(compatOpts) && deepSeekStrictToolsEnabled(params);
  const oaiTools = toOpenAITools(tools, { deepseekStrictTools: deepseekStrict });

  const reasoningEffort = params.reasoningEffort || null;
  const verbosity       = params.verbosity       || null;

  let body = {
    model:    modelForApi,
    messages: oaiMessages,
    stream:   true,
    ...(oaiTools?.length   ? { tools:     oaiTools                   } : {}),
    ...(oaiTools?.length && params.forcedToolName
      ? { tool_choice: { type: 'function', function: { name: String(params.forcedToolName) } } }
      : {}),
    ...(reasoningEffort    ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity          ? { text:      { verbosity }               } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiChatCompletionsOutputLimit(body, modelForApi, params.maxOutputTokens);
  }
  body = applyChatCompletionsResponseFormat(body, params, Boolean(oaiTools?.length));
  body = finalizeOpenAiCompatibleChatBody(body, params, modelForApi, compatOpts);
  if (isDeepSeekOpenAiCompatibleDispatch(compatOpts) && body.stream === true) {
    body.stream_options = { include_usage: true };
  }

  let upstream;
  try {
    upstream = await fetch(`${apiBase}/chat/completions`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
      ...(params.signal != null ? { signal: params.signal } : {}),
    });
  } catch (e) {
    return jsonResponse({ error: 'OpenAI request failed', detail: e.message }, 502);
  }

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => '');
    return jsonResponse({ error: 'OpenAI API error', status: upstream.status, detail: err.slice(0, 500) }, upstream.status);
  }

  // Proxy SSE stream directly — OpenAI format (choices[0].delta.content) is
  // handled by both ChatAssistant and GorillaModeShell buddy panel.
  return new Response(upstream.body, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Optional background Responses + webhook attribution metadata.
 * When `params.background` is true, OpenAI finishes async and fires response.* webhooks;
 * metadata lets the Worker stamp usage to the right workspace/user.
 *
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} params
 */
export function applyOpenAiResponsesBackgroundAndMetadata(body, params) {
  const out = body && typeof body === 'object' ? { ...body } : {};
  const background =
    params?.background === true ||
    params?.background === 1 ||
    String(params?.background || '').trim().toLowerCase() === 'true';

  const metaIn =
    params?.openaiMetadata && typeof params.openaiMetadata === 'object'
      ? { ...params.openaiMetadata }
      : params?.metadata && typeof params.metadata === 'object'
        ? { ...params.metadata }
        : {};

  const pick = (a, b) => {
    const v = params?.[a] ?? params?.[b];
    return v != null && String(v).trim() ? String(v).trim() : null;
  };
  if (pick('workspaceId', 'workspace_id')) metaIn.workspace_id = pick('workspaceId', 'workspace_id');
  if (pick('tenantId', 'tenant_id')) metaIn.tenant_id = pick('tenantId', 'tenant_id');
  if (pick('userId', 'user_id')) metaIn.user_id = pick('userId', 'user_id');
  if (pick('sessionId', 'session_id')) metaIn.session_id = pick('sessionId', 'session_id');
  if (pick('conversationId', 'conversation_id')) {
    metaIn.conversation_id = pick('conversationId', 'conversation_id');
  }

  if (background) {
    out.background = true;
    // stream + background are incompatible for our SSE path; prefer background completion.
    out.stream = false;
    metaIn.iam_background = '1';
    metaIn.iam_usage_via_webhook = '1';
  }

  if (Object.keys(metaIn).length) {
    // OpenAI metadata values must be strings ≤64 chars keys / ≤512 values — truncate safely.
    /** @type {Record<string, string>} */
    const clean = {};
    for (const [k, v] of Object.entries(metaIn)) {
      const key = String(k).trim().slice(0, 64);
      if (!key || v == null) continue;
      clean[key] = String(v).trim().slice(0, 512);
    }
    if (Object.keys(clean).length) out.metadata = clean;
  }
  return out;
}

/**
 * Shared prep for HTTP and WebSocket Responses transports.
 * @returns {Promise<{ apiKey: string, apiBase: string, body: Record<string, unknown>, modelForApi: string } | { errorResponse: Response }>}
 */
export async function buildOpenAIResponsesRequestParts(env, params) {
  const {
    modelKey,
    providerModelId,
    systemPrompt,
    messages = [],
    tools = [],
    userId,
    openaiPreviousResponseId,
    reasoningEffort,
    verbosity,
  } = params;
  const modelForApi =
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim();

  const compatOpts = openAiCompatDispatchOpts(params);
  const apiKey = await resolveOpenAiCompatibleApiKey(env, modelKey, userId, compatOpts);
  const apiBase = resolveOpenAiCompatibleBaseUrl(compatOpts);
  if (!apiKey) {
    return {
      errorResponse: jsonResponse(
        {
          error: isDeepSeekOpenAiCompatibleDispatch(compatOpts)
            ? 'DeepSeek API key not configured'
            : 'OpenAI API key not configured',
        },
        503,
      ),
    };
  }
  if (!modelForApi) return { errorResponse: jsonResponse({ error: 'modelKey required' }, 400) };

  const prev = openaiPreviousResponseId != null ? String(openaiPreviousResponseId).trim() : '';
  const input = buildOpenAIResponsesInput(messages, prev || null);
  const openaiPtcEnabled =
    params.openaiPtcEnabled === true ||
    (await isFeatureEnabled(env, 'openai_ptc', { userId, tenantId: params.tenantId }));
  const oaiTools = toOpenAIResponsesTools(tools, { openaiPtcEnabled });

  let body = {
    model: modelForApi,
    input,
    stream: true,
    ...(prev ? { previous_response_id: prev } : {}),
    ...(!prev && systemPrompt ? { instructions: String(systemPrompt) } : {}),
    ...(oaiTools?.length
      ? {
          tools: oaiTools,
          tool_choice: params.forcedToolName
            ? { type: 'function', name: String(params.forcedToolName) }
            : 'auto',
        }
      : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity ? { text: { verbosity } } : {}),
  };
  body = applyOpenAiResponsesBackgroundAndMetadata(body, params);
  if (params.maxOutputTokens != null) {
    body = applyOpenAiResponsesTokenLimit(body, params.maxOutputTokens);
  }

  return { apiKey, apiBase, body, modelForApi, openaiPtcEnabled };
}

/**
 * Stream /v1/responses (Responses API). Use when agentsam_ai.api_platform is `openai_responses` or `responses`.
 * Tool outputs for the next turn: pass `openaiPreviousResponseId` and messages ending in user tool_result blocks.
 */
export async function chatWithToolsOpenAIResponses(env, request, params) {
  const parts = await buildOpenAIResponsesRequestParts(env, params);
  if (parts.errorResponse) return parts.errorResponse;
  const { apiKey, apiBase, body, modelForApi } = parts;

  let upstream;
  try {
    upstream = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(params.signal != null ? { signal: params.signal } : {}),
    });
  } catch (e) {
    return jsonResponse({ error: 'OpenAI Responses request failed', detail: e.message }, 502);
  }

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => '');
    const safe = sanitizeOpenAiErrorBodyForLog(err);
    console.warn(
      `[openai_responses] http_error status=${upstream.status} model=${modelForApi} body=${safe}`,
    );
    return jsonResponse(
      {
        error: 'OpenAI Responses API error',
        status: upstream.status,
        detail: safe,
      },
      upstream.status,
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-IAM-OpenAI-Transport': 'http',
    },
  });
}

/**
 * Non-streaming POST /v1/responses. Use when catalog `api_platform` is `openai_responses` or `responses`
 * (same surface as {@link chatWithToolsOpenAIResponses}, not Chat Completions).
 * Returns a normalized object with `text`, `output_text`, and a `choices[0].message.content` shim for callers
 * that expect chat-completions-shaped JSON.
 */
export async function completeWithOpenAIResponsesNonStream(env, params) {
  const {
    modelKey,
    providerModelId,
    systemPrompt,
    messages = [],
    tools = [],
    userId,
    openaiPreviousResponseId,
    reasoningEffort,
    verbosity,
  } = params;
  const modelForApi =
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim();

  const compatOpts = openAiCompatDispatchOpts(params);
  const apiKey = await resolveOpenAiCompatibleApiKey(env, modelKey, userId, compatOpts);
  const apiBase = resolveOpenAiCompatibleBaseUrl(compatOpts);
  if (!apiKey) throw new Error(isDeepSeekOpenAiCompatibleDispatch(compatOpts) ? 'DeepSeek API key not configured' : 'OpenAI API key not configured');
  if (!modelForApi) throw new Error('modelKey required');

  const prev = openaiPreviousResponseId != null ? String(openaiPreviousResponseId).trim() : '';
  const input = buildOpenAIResponsesInput(messages, prev || null);
  const openaiPtcEnabled =
    params.openaiPtcEnabled === true ||
    (await isFeatureEnabled(env, 'openai_ptc', { userId, tenantId: params.tenantId }));
  const oaiTools = toOpenAIResponsesTools(tools, { openaiPtcEnabled });

  let body = {
    model: modelForApi,
    input,
    stream: false,
    ...(prev ? { previous_response_id: prev } : {}),
    ...(!prev && systemPrompt ? { instructions: String(systemPrompt) } : {}),
    ...(oaiTools?.length
      ? {
          tools: oaiTools,
          tool_choice: params.forcedToolName
            ? { type: 'function', name: String(params.forcedToolName) }
            : 'auto',
        }
      : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity ? { text: { verbosity } } : {}),
  };
  body = applyOpenAiResponsesBackgroundAndMetadata(body, params);
  if (params.maxOutputTokens != null) {
    body = applyOpenAiResponsesTokenLimit(body, params.maxOutputTokens);
  }

  let res;
  try {
    res = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`OpenAI Responses request failed: ${e.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const safe = sanitizeOpenAiErrorBodyForLog(JSON.stringify(data));
    throw new Error(`OpenAI Responses error ${res.status}: ${safe}`);
  }

  let text = '';
  if (typeof data.output_text === 'string' && data.output_text) text = data.output_text;
  else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      for (const c of item?.content || []) {
        if (typeof c?.text === 'string') text += c.text;
      }
    }
  }

  const mergedText = text || (typeof data.output_text === 'string' ? data.output_text : '') || '';
  return {
    ...data,
    text: mergedText,
    output_text: data.output_text ?? mergedText,
    choices: [{ message: { content: mergedText } }],
  };
}

/**
 * Non-streaming OpenAI completion. Returns parsed response object.
 * Use for batch / background tasks where streaming is not needed.
 */
export async function completeWithOpenAI(env, params) {
  const { modelKey, providerModelId, systemPrompt, messages = [], tools = [], userId } = params;
  const modelForApi =
    providerModelId != null && String(providerModelId).trim() !== ''
      ? String(providerModelId).trim()
      : String(modelKey || '').trim();

  const compatOpts = openAiCompatDispatchOpts(params);
  const apiKey = await resolveOpenAiCompatibleApiKey(env, modelKey, userId, compatOpts);
  const apiBase = resolveOpenAiCompatibleBaseUrl(compatOpts);
  if (!apiKey) throw new Error(isDeepSeekOpenAiCompatibleDispatch(compatOpts) ? 'DeepSeek API key not configured' : 'OpenAI API key not configured');

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const deepseekStrict = isDeepSeekOpenAiCompatibleDispatch(compatOpts) && deepSeekStrictToolsEnabled(params);
  const oaiTools = toOpenAITools(tools, { deepseekStrictTools: deepseekStrict });

  let body = {
    model:    modelForApi,
    messages: oaiMessages,
    ...(oaiTools?.length ? { tools: oaiTools } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiChatCompletionsOutputLimit(body, modelForApi, params.maxOutputTokens);
  }
  body = applyChatCompletionsResponseFormat(body, params, Boolean(oaiTools?.length));
  body = finalizeOpenAiCompatibleChatBody(body, params, modelForApi, compatOpts);

  const res = await fetch(`${apiBase}/chat/completions`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Map legacy DALL-E quality values to the model family OpenAI expects.
 * gpt-image-* accepts low | medium | high | auto — not dall-e-3's standard | hd.
 * @param {string} modelKey
 * @param {string | undefined | null} quality
 * @returns {string | undefined}
 */
export function normalizeOpenAiImageQuality(modelKey, quality) {
  const mk = String(modelKey || '').trim().toLowerCase();
  const q = String(quality || '').trim().toLowerCase();
  if (mk.startsWith('gpt-image') || mk === 'chatgpt-image-latest') {
    const allowed = new Set(['low', 'medium', 'high', 'auto']);
    if (allowed.has(q)) return q;
    if (q === 'hd') return 'high';
    return 'auto';
  }
  if (mk === 'dall-e-3') {
    return q === 'hd' ? 'hd' : 'standard';
  }
  if (mk.startsWith('dall-e-2')) return undefined;
  if (q === 'hd' || q === 'standard') return q;
  return q || 'standard';
}

/**
 * Generate an image via OpenAI DALL-E.
 * Returns { url, revised_prompt } or throws on error.
 */
export async function generateImageOpenAI(env, params) {
  const { modelKey, prompt, size = '1024x1024', quality = 'standard', n = 1, userId } = params;
  const resolvedModelKey = modelKey != null ? String(modelKey).trim() : '';
  if (!resolvedModelKey) throw new Error('modelKey required for OpenAI image generation');
  assertOpenAiImageModelActive(resolvedModelKey);

  const apiKey = await resolveOpenAiApiKey(env, resolvedModelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const normalizedQuality = normalizeOpenAiImageQuality(resolvedModelKey, quality);
  const body = { model: resolvedModelKey, prompt, size, n };
  if (normalizedQuality) body.quality = normalizedQuality;

  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`DALL-E error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.data?.[0] || null;
}
