/**
 * OpenAI Responses API — WebSocket transport (Phase 1).
 * DO-held socket → SSE ReadableStream compatible with consumeOpenAIResponsesSse.
 * On any WS failure, callers should fall back to HTTP chatWithToolsOpenAIResponses.
 */
import { chatWithToolsOpenAIResponses, buildOpenAIResponsesRequestParts } from './openai.js';
import { jsonResponse } from '../core/responses.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Stable privacy-preserving safety id (not raw au_*).
 * @param {string|null|undefined} userId
 */
export async function openaiSafetyIdentifier(userId) {
  const uid = trim(userId);
  if (!uid) return null;
  const data = new TextEncoder().encode(`iam:openai-safety:${uid}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

/**
 * @param {any} env
 * @param {string} sessionKey
 */
function getOpenAiResponsesWsStub(env, sessionKey) {
  const ns = env?.OPENAI_RESPONSES_WS;
  if (!ns || typeof ns.idFromName !== 'function') return null;
  const name = `oai-resp-ws:${trim(sessionKey) || 'anon'}`;
  return ns.get(ns.idFromName(name));
}

/**
 * Stream Responses via DO-held WebSocket. Returns the same SSE Response shape as HTTP path.
 * Falls back to HTTP when binding missing, connect fails, or previous_response_not_found mid-reconnect.
 *
 * @param {any} env
 * @param {Request} request
 * @param {Record<string, unknown>} params — same as chatWithToolsOpenAIResponses + sessionKey
 */
export async function chatWithToolsOpenAIResponsesWs(env, request, params) {
  const sessionKey =
    trim(params.sessionKey) ||
    trim(params.sessionId) ||
    trim(params.agentRunId) ||
    trim(params.userId) ||
    'default';

  const stub = getOpenAiResponsesWsStub(env, sessionKey);
  if (!stub) {
    console.warn('[openai_responses_ws] binding_missing_fallback_http');
    return chatWithToolsOpenAIResponses(env, request, params);
  }

  let parts;
  try {
    parts = await buildOpenAIResponsesRequestParts(env, params);
  } catch (e) {
    return jsonResponse(
      { error: 'OpenAI Responses WS prep failed', detail: e?.message || String(e) },
      502,
    );
  }
  if (parts.errorResponse) return parts.errorResponse;

  const { apiKey, body } = parts;
  const safetyIdentifier = await openaiSafetyIdentifier(params.userId);

  // WS mode: no stream/background fields
  const create = { ...body };
  delete create.stream;
  delete create.background;

  let readable;
  try {
    readable = await stub.createResponseSse({
      apiKey,
      safetyIdentifier,
      create,
    });
  } catch (e) {
    console.warn('[openai_responses_ws] create_failed_fallback_http', e?.message ?? e);
    return chatWithToolsOpenAIResponses(env, request, params);
  }

  // Tee first chunks to detect previous_response_not_found and fall back
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let peeked = '';
  let firstChunk = null;
  try {
    const { value, done } = await reader.read();
    if (!done && value) {
      firstChunk = value;
      peeked = decoder.decode(value, { stream: true });
    }
  } catch (e) {
    console.warn('[openai_responses_ws] peek_failed_fallback_http', e?.message ?? e);
    return chatWithToolsOpenAIResponses(env, request, params);
  }

  if (/previous_response_not_found|websocket_connection_limit_reached/i.test(peeked)) {
    console.warn('[openai_responses_ws] cache_miss_fallback_http');
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    // Clear previous_response_id so HTTP rebuilds full input
    return chatWithToolsOpenAIResponses(env, request, {
      ...params,
      openaiPreviousResponseId: null,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (firstChunk) controller.enqueue(firstChunk);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-IAM-OpenAI-Transport': 'websocket',
    },
  });
}
