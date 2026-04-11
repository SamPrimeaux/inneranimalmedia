/**
 * Integration Layer: BlueBubbles
 * iMessage send/receive via BlueBubbles self-hosted server.
 * Uses BLUEBUBBLES_URL and BLUEBUBBLES_PASSWORD secrets.
 *
 * Distinct from core/notifications.js (notifySamIMessage) which is a thin
 * fire-and-forget wrapper. This module is the full BlueBubbles API client:
 * send, receive, list conversations, list messages, react, etc.
 */
import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Build an authenticated BlueBubbles API URL.
 */
function bbUrl(env, path) {
  const base     = (env.BLUEBUBBLES_URL || '').replace(/\/$/, '');
  const password = env.BLUEBUBBLES_PASSWORD || '';
  const sep      = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}password=${encodeURIComponent(password)}`;
}

/**
 * Make an authenticated request to the BlueBubbles API.
 */
async function bbFetch(env, path, opts = {}) {
  const url = bbUrl(env, path);
  const res = await fetch(url, {
    method:  opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`BlueBubbles error ${res.status}: ${data.error || JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

// ─── Core Operations ──────────────────────────────────────────────────────────

/**
 * Send an iMessage.
 *
 * @param {object} env
 * @param {object} opts
 * @param {string} opts.chatGuid     - e.g. "iMessage;-;+15551234567" or group GUID
 * @param {string} opts.message      - message text
 * @param {string} [opts.subject]    - iMessage subject line
 * @param {string} [opts.effectId]   - iMessage effect (e.g. echo, fireworks)
 * @param {string} [opts.method]     - 'private-api' | 'apple-script'
 * @returns {Promise<{ok: boolean, guid?: string, error?: string}>}
 */
export async function sendIMessage(env, opts) {
  const { chatGuid, message, subject, effectId, method: sendMethod } = opts;

  if (!env.BLUEBUBBLES_URL || !env.BLUEBUBBLES_PASSWORD) {
    throw new Error('BLUEBUBBLES_URL or BLUEBUBBLES_PASSWORD not configured');
  }
  if (!chatGuid || !message) throw new Error('chatGuid and message are required');

  const tempGuid = `temp-${crypto.randomUUID()}`;

  const data = await bbFetch(env, '/api/v1/message/text', {
    method: 'POST',
    body: {
      chatGuid,
      tempGuid,
      message,
      ...(subject   ? { subject }   : {}),
      ...(effectId  ? { effectId }  : {}),
      ...(sendMethod ? { method: sendMethod } : {}),
    },
  });

  return { ok: true, guid: data.data?.guid || tempGuid };
}

/**
 * Send a reaction to a message.
 *
 * @param {object} env
 * @param {string} chatGuid       - chat GUID
 * @param {string} selectedMessageGuid - GUID of message to react to
 * @param {string} reaction       - e.g. 'love', 'like', 'dislike', 'laugh', 'emphasize', 'question'
 */
export async function sendReaction(env, chatGuid, selectedMessageGuid, reaction) {
  return bbFetch(env, '/api/v1/message/react', {
    method: 'POST',
    body: {
      chatGuid,
      selectedMessageGuid,
      reaction: `-${reaction}`, // BlueBubbles uses negative prefix to add reaction
    },
  });
}

/**
 * List conversations (chats).
 *
 * @param {object} env
 * @param {object} opts
 * @param {number} [opts.limit=25]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.sort='lastmessage'] - 'lastmessage' | 'date'
 * @returns {Promise<object[]>}
 */
export async function getConversations(env, opts = {}) {
  const { limit = 25, offset = 0, sort = 'lastmessage' } = opts;
  const data = await bbFetch(env, `/api/v1/chat?limit=${limit}&offset=${offset}&sort=${sort}&with=lastMessage`);
  return data.data || [];
}

/**
 * Get messages for a specific chat.
 *
 * @param {object} env
 * @param {string} chatGuid
 * @param {object} opts
 * @param {number} [opts.limit=25]
 * @param {number} [opts.offset=0]
 * @returns {Promise<object[]>}
 */
export async function getMessages(env, chatGuid, opts = {}) {
  const { limit = 25, offset = 0 } = opts;
  const encoded = encodeURIComponent(chatGuid);
  const data    = await bbFetch(env, `/api/v1/chat/${encoded}/message?limit=${limit}&offset=${offset}&sort=DESC&with=attachment,attributedBody`);
  return data.data || [];
}

/**
 * Get a single conversation by GUID.
 */
export async function getConversation(env, chatGuid) {
  const encoded = encodeURIComponent(chatGuid);
  const data    = await bbFetch(env, `/api/v1/chat/${encoded}?with=lastMessage,participants`);
  return data.data || null;
}

/**
 * Check BlueBubbles server health.
 * Returns { ok: boolean, version?: string }.
 */
export async function checkHealth(env) {
  try {
    const data = await bbFetch(env, '/api/v1/ping');
    return { ok: true, message: data.message || 'pong' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Find a chat GUID by phone number or email.
 * Returns the first matching chat GUID or null.
 */
export async function findChatGuid(env, address) {
  try {
    const encoded = encodeURIComponent(address);
    const data    = await bbFetch(env, `/api/v1/handle?q=${encoded}&limit=1`);
    const handle  = data.data?.[0];
    if (!handle?.id) return null;
    // Construct the iMessage chat GUID format
    return `iMessage;-;${handle.id}`;
  } catch (_) {
    return null;
  }
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

/**
 * HTTP dispatcher for /api/imessage/* routes.
 */
export async function handleBlueBubblesApi(request, url, env) {
  const path   = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!env.BLUEBUBBLES_URL || !env.BLUEBUBBLES_PASSWORD) {
    return jsonResponse({ error: 'BlueBubbles not configured' }, 503);
  }

  // ── GET /api/imessage/health ──────────────────────────────────────────────
  if (path === '/api/imessage/health' && method === 'GET') {
    const result = await checkHealth(env);
    return jsonResponse(result, result.ok ? 200 : 502);
  }

  // ── GET /api/imessage/conversations ──────────────────────────────────────
  if (path === '/api/imessage/conversations' && method === 'GET') {
    const limit  = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    try {
      const chats = await getConversations(env, { limit, offset });
      return jsonResponse({ conversations: chats });
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── GET /api/imessage/messages ────────────────────────────────────────────
  if (path === '/api/imessage/messages' && method === 'GET') {
    const chatGuid = url.searchParams.get('chat_guid');
    const limit    = parseInt(url.searchParams.get('limit') || '25', 10);
    const offset   = parseInt(url.searchParams.get('offset') || '0', 10);
    if (!chatGuid) return jsonResponse({ error: 'chat_guid required' }, 400);
    try {
      const msgs = await getMessages(env, chatGuid, { limit, offset });
      return jsonResponse({ messages: msgs });
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── POST /api/imessage/send ───────────────────────────────────────────────
  if (path === '/api/imessage/send' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    try {
      const result = await sendIMessage(env, body);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // ── POST /api/imessage/react ──────────────────────────────────────────────
  if (path === '/api/imessage/react' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const { chat_guid, message_guid, reaction } = body;
    if (!chat_guid || !message_guid || !reaction) {
      return jsonResponse({ error: 'chat_guid, message_guid, and reaction required' }, 400);
    }
    try {
      await sendReaction(env, chat_guid, message_guid, reaction);
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  return jsonResponse({ error: 'iMessage route not found', path }, 404);
}
