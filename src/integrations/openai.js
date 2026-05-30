/**
 * Integration Layer: OpenAI
 * Streaming chat completions via api.openai.com.
 * Key resolved via resolveOpenAiApiKey (OPENAI_API_KEY vs AGENTSAMGPT_SERVICEKEY + BYOK).
 * Proxies OpenAI SSE stream directly — frontend handles choices[0].delta.content format.
 */
import { resolveOpenAiApiKey } from './openai-credentials.js';
import {
  applyOpenAiChatCompletionsOutputLimit,
  applyOpenAiResponsesTokenLimit,
} from './openai-token-params.js';
import { jsonResponse } from '../core/responses.js';

const OPENAI_BASE = 'https://api.openai.com/v1';

/** Strip obvious secrets before logging provider error bodies. */
function sanitizeOpenAiErrorBodyForLog(text) {
  const s = String(text || '').slice(0, 2000);
  return s.replace(/\bsk-[a-zA-Z0-9]{10,}\b/g, '[redacted]');
}

// ─── Tool Format ──────────────────────────────────────────────────────────────

/**
 * Convert Anthropic-style tools to OpenAI function format.
 * Passes through tools already in OpenAI format.
 */
function toOpenAITools(tools) {
  if (!tools?.length) return undefined;
  return tools.map(t => {
    if (t.type === 'function') return t; // already OpenAI format
    return {
      type: 'function',
      function: {
        name:        t.name,
        description: t.description || '',
        parameters:  t.input_schema || { type: 'object', properties: {} },
      },
    };
  });
}

/** Tools shape for POST /v1/responses (flat `name` + `parameters`, not nested `function`). */
function toOpenAIResponsesTools(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => {
    if (t.type === 'function' && t.function) {
      return {
        type: 'function',
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters || { type: 'object', properties: {} },
      };
    }
    return {
      type: 'function',
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || { type: 'object', properties: {} },
    };
  });
}

/**
 * Build `input` for /v1/responses. With `previousResponseId`, only `function_call_output` items
 * from the latest user message (tool results) are sent; otherwise user/assistant text turns.
 */
function buildOpenAIResponsesInput(messages, previousResponseId) {
  if (previousResponseId) {
    const last = messages[messages.length - 1];
    const out = [];
    if (last?.role === 'user' && Array.isArray(last.content)) {
      for (const b of last.content) {
        if (b.type === 'tool_result') {
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
      }
    }
    return out;
  }

  const items = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        items.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
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
    // Convert Anthropic tool_use blocks to OpenAI tool_calls
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const textParts  = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const toolCalls  = msg.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          id:       b.id || `call_${crypto.randomUUID().slice(0, 8)}`,
          type:     'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));

      normalized.push({
        role:       'assistant',
        content:    textParts || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // Convert Anthropic tool_result blocks to OpenAI tool messages
    if (msg.role === 'user' && Array.isArray(msg.content)) {
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

  const apiKey = await resolveOpenAiApiKey(env, modelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) return jsonResponse({ error: 'OpenAI API key not configured' }, 503);
  if (!modelForApi) return jsonResponse({ error: 'modelKey required' }, 400);

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const oaiTools    = toOpenAITools(tools);

  const reasoningEffort = params.reasoningEffort || null;
  const verbosity       = params.verbosity       || null;

  let body = {
    model:    modelForApi,
    messages: oaiMessages,
    stream:   true,
    ...(oaiTools?.length   ? { tools:     oaiTools                   } : {}),
    ...(reasoningEffort    ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity          ? { text:      { verbosity }               } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiChatCompletionsOutputLimit(body, modelForApi, params.maxOutputTokens);
  }

  let upstream;
  try {
    upstream = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
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
 * Stream /v1/responses (Responses API). Use when agentsam_ai.api_platform is `openai_responses` or `responses`.
 * Tool outputs for the next turn: pass `openaiPreviousResponseId` and messages ending in user tool_result blocks.
 */
export async function chatWithToolsOpenAIResponses(env, request, params) {
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

  const apiKey = await resolveOpenAiApiKey(env, modelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) return jsonResponse({ error: 'OpenAI API key not configured' }, 503);
  if (!modelForApi) return jsonResponse({ error: 'modelKey required' }, 400);

  const prev = openaiPreviousResponseId != null ? String(openaiPreviousResponseId).trim() : '';
  const input = buildOpenAIResponsesInput(messages, prev || null);
  const oaiTools = toOpenAIResponsesTools(tools);

  let body = {
    model: modelForApi,
    input,
    stream: true,
    ...(prev ? { previous_response_id: prev } : {}),
    ...(!prev && systemPrompt ? { instructions: String(systemPrompt) } : {}),
    ...(oaiTools?.length ? { tools: oaiTools, tool_choice: 'auto' } : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity ? { text: { verbosity } } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiResponsesTokenLimit(body, params.maxOutputTokens);
  }

  let upstream;
  try {
    upstream = await fetch(`${OPENAI_BASE}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
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

  const apiKey = await resolveOpenAiApiKey(env, modelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) throw new Error('OpenAI API key not configured');
  if (!modelForApi) throw new Error('modelKey required');

  const prev = openaiPreviousResponseId != null ? String(openaiPreviousResponseId).trim() : '';
  const input = buildOpenAIResponsesInput(messages, prev || null);
  const oaiTools = toOpenAIResponsesTools(tools);

  let body = {
    model: modelForApi,
    input,
    stream: false,
    ...(prev ? { previous_response_id: prev } : {}),
    ...(!prev && systemPrompt ? { instructions: String(systemPrompt) } : {}),
    ...(oaiTools?.length ? { tools: oaiTools, tool_choice: 'auto' } : {}),
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity ? { text: { verbosity } } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiResponsesTokenLimit(body, params.maxOutputTokens);
  }

  let res;
  try {
    res = await fetch(`${OPENAI_BASE}/responses`, {
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

  const apiKey = await resolveOpenAiApiKey(env, modelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const oaiTools    = toOpenAITools(tools);

  let body = {
    model:    modelForApi,
    messages: oaiMessages,
    ...(oaiTools?.length ? { tools: oaiTools } : {}),
  };
  if (params.maxOutputTokens != null) {
    body = applyOpenAiChatCompletionsOutputLimit(body, modelForApi, params.maxOutputTokens);
  }

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
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

  const apiKey = await resolveOpenAiApiKey(env, resolvedModelKey, userId, {
    secretKeyName: params.secretKeyName ?? params.secret_key_name,
  });
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const normalizedQuality = normalizeOpenAiImageQuality(resolvedModelKey, quality);
  const body = { model: resolvedModelKey, prompt, size, n };
  if (normalizedQuality) body.quality = normalizedQuality;

  // #region agent log
  const _dbgImageReq = { modelKey: resolvedModelKey, qualityIn: quality, qualityOut: normalizedQuality ?? null };
  console.log('[debug-6a3d77] openai_image_request', JSON.stringify(_dbgImageReq));
  fetch('http://127.0.0.1:7420/ingest/5e7c84bf-da6f-4db9-b6e9-6f241ecb8591',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a3d77'},body:JSON.stringify({sessionId:'6a3d77',location:'openai.js:generateImageOpenAI',message:'openai_image_request',data:_dbgImageReq,timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion

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
