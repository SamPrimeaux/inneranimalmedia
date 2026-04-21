/**
 * Integration Layer: OpenAI
 * Streaming chat completions via api.openai.com.
 * Key resolved from ai_models.secret_key_name → env.OPENAI_API_KEY fallback.
 * Proxies OpenAI SSE stream directly — frontend handles choices[0].delta.content format.
 */
import { resolveModelApiKey } from './tokens.js';
import { jsonResponse } from '../core/responses.js';

const OPENAI_BASE = 'https://api.openai.com/v1';

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
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;

  const apiKey = await resolveModelApiKey(env, 'openai', modelKey);
  if (!apiKey) return jsonResponse({ error: 'OpenAI API key not configured' }, 503);
  if (!modelKey) return jsonResponse({ error: 'modelKey required' }, 400);

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const oaiTools    = toOpenAITools(tools);

  const reasoningEffort = params.reasoningEffort || null;
  const verbosity       = params.verbosity       || null;

  const body = {
    model:    modelKey,
    messages: oaiMessages,
    stream:   true,
    ...(oaiTools?.length   ? { tools:     oaiTools                   } : {}),
    ...(reasoningEffort    ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(verbosity          ? { text:      { verbosity }               } : {}),
  };

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
 * Non-streaming OpenAI completion. Returns parsed response object.
 * Use for batch / background tasks where streaming is not needed.
 */
export async function completeWithOpenAI(env, params) {
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;

  const apiKey = await resolveModelApiKey(env, 'openai', modelKey);
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const oaiTools    = toOpenAITools(tools);

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      model:    modelKey,
      messages: oaiMessages,
      ...(oaiTools?.length ? { tools: oaiTools } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Generate an image via OpenAI DALL-E.
 * Returns { url, revised_prompt } or throws on error.
 */
export async function generateImageOpenAI(env, params) {
  const { modelKey = 'dall-e-3', prompt, size = '1024x1024', quality = 'standard', n = 1 } = params;

  const apiKey = await resolveModelApiKey(env, 'openai', modelKey);
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: modelKey, prompt, size, quality, n }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`DALL-E error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.data?.[0] || null;
}
