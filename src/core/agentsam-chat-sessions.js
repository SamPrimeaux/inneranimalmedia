/**
 * agentsam_chat_sessions — conversation titling metadata (display layer).
 * INSERT OR IGNORE on first chat message; never overwrites existing titles.
 *
 * R2 primary storage (migration 637):
 *   context/{au_id}/{ws_id}/chats/{conversation_id}/meta.json
 *   context/{au_id}/{ws_id}/chats/{conversation_id}/messages.jsonl
 *   context/{au_id}/{ws_id}/chats/{conversation_id}/digest.md        ← compaction
 *   context/{au_id}/{ws_id}/chats/{conversation_id}/digests/{epoch}.md
 */
import { getWorkspaceGithubRepo } from './agentsam-workspace.js';
import {
  chatSessionR2Prefix,
  buildChatDigestText,
  estimateMessagesTokens,
  CHAT_COMPACT_TOKEN_THRESHOLD,
  writeR2Text,
} from './exec-context-tier.js';
import {
  expandChatProjectRefs,
  parseSessionProjectIdFromChatBody,
  resolveChatProjectId,
} from './project-chat-link.js';
import { isD1OverloadError, withD1Retry } from './d1-retry.js';

function getAgentSessionStub(env, conversationId) {
  if (!env?.AGENT_SESSION) return null;
  const convId = String(conversationId || '').trim();
  if (!convId) return null;
  return env.AGENT_SESSION.get(env.AGENT_SESSION.idFromName(convId));
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {{
 *   id?: string|null,
 *   turn_id?: string|null,
 *   role: string,
 *   content: string,
 *   status?: string,
 *   error?: string|null,
 *   model_key?: string|null,
 *   tokens_in?: number,
 *   tokens_out?: number,
 *   tool_calls?: unknown,
 * }} turn
 */
/**
 * @param {Promise<Response|null>} fetchPromise
 * @param {number} [timeoutMs]
 */
async function withDoFetchTimeout(fetchPromise, timeoutMs = 5000) {
  const ms = Math.max(500, Number(timeoutMs) || 5000);
  return Promise.race([
    fetchPromise,
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

async function appendChatMessageToDo(env, conversationId, turn, opts = {}) {
  const stub = getAgentSessionStub(env, conversationId);
  if (!stub) return { ok: false, reason: 'no_binding' };

  const resp = await withDoFetchTimeout(
    stub.fetch(
      new Request('https://do/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: turn.id ?? undefined,
          turn_id: turn.turn_id ?? null,
          role: turn.role,
          content: turn.content,
          status: turn.status ?? 'complete',
          error: turn.error ?? null,
          model_used: turn.model_key ?? null,
          input_tokens: Number(turn.tokens_in) || 0,
          output_tokens: Number(turn.tokens_out) || 0,
          tool_calls: turn.tool_calls ?? null,
        }),
      }),
    ),
    opts.timeoutMs ?? 5000,
  );
  if (!resp) return { ok: false, reason: 'do_timeout' };
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  const data = await resp.json().catch(() => ({}));
  return { ok: true, id: data?.id ?? turn.id ?? null };
}

/**
 * Best-effort wipe of DO SQLite for a conversation (messages + outbox).
 * @param {any} env
 * @param {string} conversationId
 */
export async function wipeChatSessionDo(env, conversationId) {
  const stub = getAgentSessionStub(env, conversationId);
  if (!stub) return { ok: false, reason: 'no_binding' };
  const resp = await withDoFetchTimeout(
    stub.fetch(new Request('https://do/wipe', { method: 'POST' })),
    8000,
  );
  if (!resp) return { ok: false, reason: 'do_timeout' };
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  return { ok: true };
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {string} messageId
 * @param {{ status: string, error?: string|null, output_tokens?: number|null, content?: string|null }} patch
 */
async function patchChatMessageInDo(env, conversationId, messageId, patch) {
  const stub = getAgentSessionStub(env, conversationId);
  const msgId = String(messageId || '').trim();
  if (!stub || !msgId) return { ok: false, reason: 'missing_target' };

  const resp = await stub.fetch(
    new Request(`https://do/message/${encodeURIComponent(msgId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  return { ok: true };
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {number} [limit]
 */
async function getChatMessagesFromDo(env, conversationId, limit = 200) {
  const stub = getAgentSessionStub(env, conversationId);
  if (!stub) return null;

  const resp = await stub.fetch(
    new Request(`https://do/history?limit=${encodeURIComponent(String(limit))}`),
  );
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => ({}));
  const rows = Array.isArray(data) ? data : (data?.messages || []);
  if (!rows.length) return null;

  return rows.map((r) => ({
    id: r.id,
    turn_id: r.turn_id ?? null,
    role: r.role,
    content: r.content,
    status: r.status ?? 'complete',
    error: r.error ?? null,
    ts: r.created_at ? new Date(Number(r.created_at) * 1000).toISOString() : null,
    model_key: r.model_used ?? null,
    tokens_in: Number(r.input_tokens) || 0,
    tokens_out: Number(r.output_tokens) || 0,
    tool_calls: r.tool_calls ?? null,
  }));
}

/** @param {string} status */
function mapChatTurnStatusToMessageStatus(status) {
  const st = String(status || '').trim();
  if (st === 'completed') return 'complete';
  if (st === 'done_no_token') return 'failed';
  if (st === 'in_progress') return 'pending';
  return st;
}

/** @param {string} sseType */
export function mapSseTypeToOutboxEventType(sseType) {
  const t = String(sseType || '').trim();
  if (t === 'text' || t === 'content') return 'token';
  if (t === 'done') return 'done';
  if (t === 'error') return 'error';
  return 'status';
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {string} turnId
 * @param {string} sseType
 * @param {Record<string, unknown>} [payload]
 */
export async function appendTurnOutboxEvent(env, conversationId, turnId, sseType, payload = {}) {
  return appendTurnOutboxBatch(env, conversationId, turnId, [{ sseType, payload }]);
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {string} turnId
 * @param {Array<{ sseType: string, payload?: Record<string, unknown> }>} events
 */
export async function appendTurnOutboxBatch(env, conversationId, turnId, events) {
  const convId = String(conversationId || '').trim();
  const tid = String(turnId || '').trim();
  const batch = (Array.isArray(events) ? events : [])
    .map((evt) => ({
      sseType: String(evt?.sseType || evt?.type || 'status').trim(),
      payload: evt?.payload && typeof evt.payload === 'object' ? evt.payload : {},
    }))
    .filter((evt) => evt.sseType);
  if (!convId || !tid || !batch.length) return { ok: false, reason: 'missing_ids' };

  const stub = getAgentSessionStub(env, convId);
  if (!stub) return { ok: false, reason: 'no_binding' };

  const resp = await withDoFetchTimeout(
    stub.fetch(
      new Request('https://do/outbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turn_id: tid,
          events: batch.map((evt) => ({
            event_type: mapSseTypeToOutboxEventType(evt.sseType),
            payload: { type: evt.sseType, ...evt.payload },
          })),
        }),
      }),
    ),
    2000,
  );
  if (!resp) return { ok: false, reason: 'do_timeout' };
  if (!resp.ok) return { ok: false, reason: `do_${resp.status}` };
  const data = await resp.json().catch(() => ({}));
  return {
    ok: true,
    seq: data?.latest_seq ?? data?.seq ?? null,
    count: Number(data?.count) || batch.length,
  };
}

/**
 * Coalesce SSE events before writing to the conversation DO outbox.
 *
 * @param {any} env
 * @param {string} conversationId
 * @param {string} turnId
 * @param {{ flushMs?: number, maxBatch?: number, maxTokenChars?: number }} [opts]
 */
export function createTurnOutboxBatcher(env, conversationId, turnId, opts = {}) {
  const convId = String(conversationId || '').trim();
  const tid = String(turnId || '').trim();
  const flushMs = Math.max(100, Number(opts.flushMs) || 350);
  const maxBatch = Math.max(5, Number(opts.maxBatch) || 24);
  const maxTokenChars = Math.max(256, Number(opts.maxTokenChars) || 4096);

  /** @type {Array<{ sseType: string, payload: Record<string, unknown> }>} */
  let queue = [];
  let tokenBuffer = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  /** @type {Promise<void>|null} */
  let flushPromise = null;
  /** @type {Promise<void>|null} */
  let terminalPromise = null;
  let closed = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = async () => {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      try {
        clearTimer();
        if (tokenBuffer) {
          queue.push({ sseType: 'text', payload: { type: 'text', text: tokenBuffer } });
          tokenBuffer = '';
        }
        while (queue.length) {
          const batch = queue.splice(0, maxBatch);
          if (!batch.length) break;
          await appendTurnOutboxBatch(env, convId, tid, batch).catch((e) =>
            console.warn('[turn_outbox] batch append failed', e?.message ?? e),
          );
        }
      } finally {
        flushPromise = null;
      }
    })();
    return flushPromise;
  };

  const scheduleFlush = () => {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, flushMs);
  };

  return {
    append(sseType, payload = {}) {
      if (closed || !convId || !tid || !env?.AGENT_SESSION) return;
      const t = String(sseType || 'status').trim();
      const body = payload && typeof payload === 'object' ? payload : {};

      if (t === 'text' || t === 'content') {
        const piece =
          typeof body.text === 'string'
            ? body.text
            : typeof body.content === 'string'
              ? body.content
              : '';
        if (!piece) return;
        tokenBuffer += piece;
        if (tokenBuffer.length >= maxTokenChars) {
          void flush();
        } else {
          scheduleFlush();
        }
        return;
      }

      if (t === 'status' && body.heartbeat) return;

      if (t === 'done' || t === 'error' || t === 'turn_meta') {
        terminalPromise = Promise.resolve(terminalPromise)
          .catch(() => {})
          .then(() => flush())
          .then(async () => {
            await appendTurnOutboxBatch(env, convId, tid, [
              { sseType: t, payload: { type: t, ...body } },
            ]).catch((e) => console.warn('[turn_outbox] terminal append failed', e?.message ?? e));
          });
        void terminalPromise;
        if (t === 'done' || t === 'error') closed = true;
        return;
      }

      queue.push({ sseType: t, payload: { type: t, ...body } });
      if (queue.length >= maxBatch) void flush();
      else scheduleFlush();
    },
    async finish() {
      closed = true;
      clearTimer();
      await flush();
      await terminalPromise;
    },
  };
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {string} turnId
 * @param {number} [sinceSeq]
 */
export async function fetchTurnOutboxEvents(env, conversationId, turnId, sinceSeq = 0) {
  const convId = String(conversationId || '').trim();
  const tid = String(turnId || '').trim();
  if (!convId || !tid) return { events: [], latest_seq: sinceSeq };

  const stub = getAgentSessionStub(env, convId);
  if (!stub) return { events: [], latest_seq: sinceSeq };

  const resp = await stub.fetch(
    new Request(
      `https://do/outbox?turn_id=${encodeURIComponent(tid)}&since_seq=${encodeURIComponent(String(Math.max(0, Number(sinceSeq) || 0)))}`,
    ),
  );
  if (!resp.ok) return { events: [], latest_seq: sinceSeq };
  const data = await resp.json().catch(() => ({}));
  return {
    events: Array.isArray(data?.events) ? data.events : [],
    latest_seq: Number(data?.latest_seq) || sinceSeq,
    turn_id: tid,
  };
}

/**
 * @param {any} env
 * @param {string|null|undefined} conversationId
 * @param {string|null|undefined} turnId
 * @param {(type: string, payload?: Record<string, unknown>) => unknown} emit
 */
export function wrapEmitWithTurnOutbox(env, conversationId, turnId, emit) {
  const batcher = createTurnOutboxBatcher(env, conversationId, turnId);
  return wrapEmitWithTurnOutboxBatcher(batcher, emit);
}

/**
 * @param {ReturnType<typeof createTurnOutboxBatcher>|null|undefined} batcher
 * @param {(type: string, payload?: Record<string, unknown>) => unknown} emit
 */
export function wrapEmitWithTurnOutboxBatcher(batcher, emit) {
  if (!batcher) return emit;
  return (type, payload = {}) => {
    batcher.append(type, payload);
    return emit(type, payload);
  };
}

/**
 * Parse complete SSE blocks from a byte buffer; optionally record lifecycle + outbox batch.
 *
 * @param {string} chunk
 * @param {{ buffer?: string }} state
 * @param {{ batcher?: ReturnType<typeof createTurnOutboxBatcher>|null, onEvent?: (type: string, payload: Record<string, unknown>) => void }} [hooks]
 */
export function ingestSseChunkToTurnOutbox(chunk, state = {}, hooks = {}) {
  if (!chunk) return;

  const buf = String(state.buffer || '') + chunk;
  const parts = buf.split('\n\n');
  state.buffer = parts.pop() || '';

  for (const block of parts) {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line.toLowerCase().startsWith('data:')) continue;
      const dataStr = line.replace(/^data:\s*/i, '').trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const type = typeof parsed?.type === 'string' ? parsed.type : 'status';
        hooks.batcher?.append(type, parsed);
        hooks.onEvent?.(type, parsed);
      } catch {
        /* ignore malformed SSE */
      }
    }
  }
}

/**
 * Reserve a turn in the conversation DO: pending assistant row + turn_id for grouping.
 *
 * @param {any} env
 * @param {string} conversationId
 * @param {{ model_key?: string|null }} [opts]
 * @returns {Promise<{ turnId: string, assistantMessageId: string }|null>}
 */
export async function beginChatTurn(env, conversationId, opts = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return null;

  const turnId = `turn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const assistantMessageId = crypto.randomUUID();

  // Persist the user turn immediately so reopen/history survives mid-turn hard fails.
  const userContent =
    typeof opts.user_content === 'string'
      ? opts.user_content
      : typeof opts.userContent === 'string'
        ? opts.userContent
        : '';
  if (userContent.trim()) {
    const userWrite = await appendChatMessageToDo(
      env,
      convId,
      {
        turn_id: turnId,
        role: 'user',
        content: userContent,
        status: 'complete',
        model_key: opts.model_key ?? null,
      },
      { timeoutMs: opts.timeoutMs ?? 4000 },
    );
    if (!userWrite.ok) {
      console.warn('[beginChatTurn] user_write', userWrite.reason || 'do_write_failed', convId);
    }
  }

  const pending = await appendChatMessageToDo(
    env,
    convId,
    {
      id: assistantMessageId,
      turn_id: turnId,
      role: 'assistant',
      content: '',
      status: 'pending',
      model_key: opts.model_key ?? null,
    },
    { timeoutMs: opts.timeoutMs ?? 4000 },
  );
  if (!pending.ok) {
    console.warn('[beginChatTurn]', pending.reason || 'do_write_failed', convId);
    return null;
  }
  void appendTurnOutboxEvent(env, convId, turnId, 'status', {
    phase: 'turn_started',
    assistant_message_id: assistantMessageId,
  }).catch(() => {});
  return { turnId, assistantMessageId };
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'my', 'your', 'me', 'us', 'them', 'this', 'that', 'these', 'those', 'please', 'hey', 'hi',
]);

/**
 * @param {string} message
 * @returns {string}
 */
export function deriveChatSessionTitle(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'New Chat';

  const cleaned = raw.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (!words.length) return 'New Chat';

  const meaningful = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const pool = meaningful.length >= 3 ? meaningful : words;
  const capped = pool.slice(0, 8).map((w) => {
    const lower = w.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  let selected = [...capped];
  while (selected.length > 1 && selected.join(' ').length > 40) {
    selected.pop();
  }
  let title = selected.join(' ');
  if (title.length > 40) title = title.slice(0, 40).trim();

  return title || 'New Chat';
}

/**
 * @param {any} env
 * @param {{
 *   workspaceId?: string|null,
 *   activeFileEnvelope?: { github_repo?: string|null }|null,
 *   body?: Record<string, unknown>|null,
 * }} input
 * @returns {Promise<string|null>}
 */
export async function resolveGithubRepoForChatSession(env, input) {
  const envelopeRepo =
    input.activeFileEnvelope?.github_repo != null
      ? String(input.activeFileEnvelope.github_repo).trim()
      : '';
  if (envelopeRepo) return envelopeRepo;

  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const fromBody = String(
    body.selectedGithubRepoContext ?? body.github_repo_context ?? body.githubRepoContext ?? '',
  ).trim();
  if (fromBody) return fromBody;

  const workspaceId = input.workspaceId != null ? String(input.workspaceId).trim() : '';
  if (!env?.DB || !workspaceId) return null;

  return (await getWorkspaceGithubRepo(env, workspaceId)) || null;
}

/**
 * Write meta.json to R2 and backfill r2_messages_key + r2_meta_key on the D1 row.
 * Called once after a new agentsam_chat_sessions row is inserted.
 *
 * @param {any} env
 * @param {{
 *   conversationId: string,
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string,
 *   title?: string,
 *   modelKey?: string|null,
 *   githubRepo?: string|null,
 * }} session
 * @returns {Promise<{ ok: boolean, metaKey: string, messagesKey: string }>}
 */
export async function initChatSessionR2(env, session) {
  const conversationId = String(session.conversationId || '').trim();
  const userId = String(session.userId || '').trim();
  const workspaceId = String(session.workspaceId || '').trim();
  const tenantId = String(session.tenantId || '').trim();

  if (!conversationId || !userId || !workspaceId) {
    return { ok: false, metaKey: '', messagesKey: '' };
  }

  const prefix = chatSessionR2Prefix({ userId, workspaceId, conversationId });
  const metaKey = `${prefix}/meta.json`;
  const messagesKey = `${prefix}/messages.jsonl`;

  const meta = {
    conversation_id: conversationId,
    user_id: userId,
    workspace_id: workspaceId,
    tenant_id: tenantId,
    title: String(session.title || 'New Chat').trim(),
    model_key: session.modelKey ?? null,
    github_repo: session.githubRepo ?? null,
    created_at: new Date().toISOString(),
    r2_messages_key: messagesKey,
  };

  try {
    if (env.AUTORAG_BUCKET) {
      await env.AUTORAG_BUCKET.put(metaKey, JSON.stringify(meta), {
        httpMetadata: { contentType: 'application/json' },
      });
    } else if (env.R2) {
      await env.R2.put(metaKey, JSON.stringify(meta), {
        httpMetadata: { contentType: 'application/json' },
      });
    }
  } catch (e) {
    console.warn('[initChatSessionR2] R2 meta write failed', e?.message ?? e);
  }

  if (env.DB && conversationId && tenantId) {
    try {
      await env.DB.prepare(
        `UPDATE agentsam_chat_sessions
         SET r2_meta_key = ?, r2_messages_key = ?, updated_at = unixepoch()
         WHERE conversation_id = ? AND tenant_id = ?`,
      )
        .bind(metaKey, messagesKey, conversationId, tenantId)
        .run();
    } catch (e) {
      console.warn('[initChatSessionR2] D1 key backfill failed', e?.message ?? e);
    }
  }

  return { ok: true, metaKey, messagesKey };
}

/**
 * Append a turn to messages.jsonl in R2 (get → append → put).
 * Increments message_count and token accumulators on the D1 row.
 *
 * @param {any} env
 * @param {string} conversationId
 * @param {{
 *   role: 'user'|'assistant'|'tool',
 *   content: string,
 *   id?: string|null,
 *   turn_id?: string|null,
 *   status?: string,
 *   error?: string|null,
 *   model_key?: string|null,
 *   tokens_in?: number,
 *   tokens_out?: number,
 *   tool_calls?: unknown,
 * }} turn
 * @returns {Promise<{ ok: boolean, id?: string|null }>}
 */
export async function appendChatMessage(env, conversationId, turn) {
  const convId = String(conversationId || '').trim();
  if (!convId) return { ok: false };

  const doResult = await appendChatMessageToDo(env, convId, turn);
  if (!doResult.ok) {
    console.warn('[appendChatMessage] DO write failed', doResult.reason);
    return { ok: false };
  }

  if (env.DB) {
    const bumpCount =
      turn.role === 'user' ||
      (turn.role === 'assistant' && String(turn.status || 'complete') === 'complete');
    if (bumpCount) {
      env.DB.prepare(
        `UPDATE agentsam_chat_sessions
         SET message_count = COALESCE(message_count, 0) + 1,
             updated_at    = unixepoch()
         WHERE conversation_id = ?`,
      )
        .bind(convId)
        .run()
        .catch((e) => console.warn('[appendChatMessage] D1 count update failed', e?.message ?? e));
    }
  }

  return { ok: true, id: doResult.id ?? null };
}

/**
 * Persist turn lifecycle on agentsam_chat_sessions (requires migration 749).
 * Values: in_progress | completed | failed | interrupted | done_no_token
 *
 * @param {any} env
 * @param {string|null|undefined} conversationId
 * @param {string} status
 * @param {string|null} [error]
 * @param {{ assistantMessageId?: string|null, output_tokens?: number|null, content?: string|null }} [opts]
 */
export async function markChatTurnStatus(env, conversationId, status, error = null, opts = {}) {
  const convId = String(conversationId || '').trim();
  const st = String(status || '').trim();
  if (!convId || !st) return { ok: false };

  const assistantMessageId =
    opts.assistantMessageId != null ? String(opts.assistantMessageId).trim() : '';
  if (assistantMessageId && env?.AGENT_SESSION && st !== 'in_progress') {
    const patch = {
      status: mapChatTurnStatusToMessageStatus(st),
      error: error != null ? String(error).slice(0, 500) : null,
    };
    if (opts.output_tokens != null) patch.output_tokens = Number(opts.output_tokens) || 0;
    if (typeof opts.content === 'string') patch.content = opts.content;
    patchChatMessageInDo(env, convId, assistantMessageId, patch).catch((e) =>
      console.warn('[markChatTurnStatus] DO patch failed', e?.message ?? e),
    );
  }

  if (!env?.DB) return { ok: false };
  try {
    await env.DB.prepare(
      `UPDATE agentsam_chat_sessions
       SET last_turn_status = ?,
           last_turn_error = ?,
           last_turn_at = unixepoch(),
           updated_at = unixepoch()
       WHERE conversation_id = ?`,
    )
      .bind(st, error != null ? String(error).slice(0, 500) : null, convId)
      .run();
    return { ok: true };
  } catch (e) {
    console.warn('[markChatTurnStatus]', e?.message ?? e);
    return { ok: false };
  }
}

/**
 * Compact long chat sessions: write digest.md to R2 cold tier, update D1 markers.
 * Called after append when token estimate exceeds threshold.
 *
 * @param {any} env
 * @param {string} conversationId
 * @returns {Promise<{ ok: boolean, reason?: string, digest_key?: string }>}
 */
export async function maybeCompactChatSession(env, conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || !env?.DB) return { ok: false, reason: 'missing_db' };

  const messages = await getChatMessages(env, convId);
  const tokenEst = estimateMessagesTokens(messages);
  if (tokenEst < CHAT_COMPACT_TOKEN_THRESHOLD) {
    return { ok: false, reason: 'below_threshold', token_est: tokenEst };
  }

  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT user_id, workspace_id, tenant_id, r2_meta_key, digest_count
         FROM agentsam_chat_sessions WHERE conversation_id = ? LIMIT 1`,
    )
      .bind(convId)
      .first();
  } catch (e) {
    console.warn('[maybeCompactChatSession] D1 lookup failed', e?.message ?? e);
    return { ok: false, reason: 'd1_lookup_failed' };
  }

  if (!row?.user_id || !row?.workspace_id) {
    return { ok: false, reason: 'session_not_found' };
  }

  const prefix = chatSessionR2Prefix({
    userId: row.user_id,
    workspaceId: row.workspace_id,
    conversationId: convId,
  });
  const digestKey = `${prefix}/digest.md`;
  const digestBody = buildChatDigestText(messages);

  const written = await writeR2Text(env, digestKey, digestBody, 'text/markdown');
  if (!written) return { ok: false, reason: 'r2_write_failed' };

  try {
    await env.DB.prepare(
      `UPDATE agentsam_chat_sessions
       SET latest_digest_r2_key = ?,
           digest_count = COALESCE(digest_count, 0) + 1,
           last_compacted_at = unixepoch(),
           updated_at = unixepoch()
       WHERE conversation_id = ?`,
    )
      .bind(digestKey, convId)
      .run();
  } catch (e) {
    console.warn('[maybeCompactChatSession] D1 update failed', e?.message ?? e);
  }

  try {
    const { maybeSummarizeSessionAfterCompaction } = await import('./agentsam-session-summarize.js');
    await maybeSummarizeSessionAfterCompaction(env, {
      sessionId: convId,
      messageCount: messages.length,
      tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
    });
  } catch (e) {
    console.warn('[maybeCompactChatSession] summarize-session', e?.message ?? e);
  }

  return { ok: true, digest_key: digestKey, token_est: tokenEst };
}

/**
 * Fetch and parse messages.jsonl from R2.
 * Returns an array of turn objects in chronological order.
 *
 * @param {any} env
 * @param {string} conversationId
 * @returns {Promise<Array<{ role: string, content: string, ts: string, model_key: string|null, tokens_in: number, tokens_out: number }>>}
 */
function chatMessagesLookEmpty(rows) {
  if (!Array.isArray(rows) || !rows.length) return true;
  return rows.every((m) => {
    const c = String(m?.content ?? '').trim();
    return !c || c === '(empty)' || c === 'Loading conversation…';
  });
}

export async function getChatMessages(env, conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return [];

  // DO is hot path, but empty stubs (e.g. image turns that never wrote markdown)
  // must not block R2 fallback — that is why refresh showed "(empty)".
  const fromDo = await getChatMessagesFromDo(env, convId);
  if (fromDo?.length && !chatMessagesLookEmpty(fromDo)) return fromDo;

  let messagesKey = null;
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT r2_messages_key, user_id, workspace_id FROM agentsam_chat_sessions
         WHERE conversation_id = ? LIMIT 1`,
      )
        .bind(convId)
        .first();
      messagesKey = row?.r2_messages_key ?? null;
      if (!messagesKey && row?.user_id && row?.workspace_id) {
        const prefix = chatSessionR2Prefix({
          userId: row.user_id,
          workspaceId: row.workspace_id,
          conversationId: convId,
        });
        messagesKey = `${prefix}/messages.jsonl`;
      }
    } catch (e) {
      console.warn('[getChatMessages] D1 key lookup failed', e?.message ?? e);
    }
  }

  if (!messagesKey) return [];

  const bucket = env.AUTORAG_BUCKET ?? env.R2 ?? null;
  if (!bucket) return [];

  try {
    const obj = await bucket.get(messagesKey);
    if (!obj) return [];
    const raw = await obj.text();
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('[getChatMessages] R2 fetch failed', e?.message ?? e);
    return [];
  }
}

/**
 * Non-blocking INSERT OR IGNORE for first message on a conversation.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   conversationId?: string|null,
 *   tenantId?: string|null,
 *   userId?: string|null,
 *   workspaceId?: string|null,
 *   message?: string|null,
 *   modelKey?: string|null,
 *   activeFileEnvelope?: { github_repo?: string|null }|null,
 *   body?: Record<string, unknown>|null,
 *   projectRef?: string|null,
 *   projectExplicit?: boolean,
 * }} input
 */
export function scheduleChatSessionTitleInsert(env, ctx, input) {
  const conversationId =
    input.conversationId != null ? String(input.conversationId).trim() : '';
  const tenantId = input.tenantId != null ? String(input.tenantId).trim() : '';
  const userId = input.userId != null ? String(input.userId).trim() : '';
  const message = input.message != null ? String(input.message).trim() : '';

  if (!env?.DB || !conversationId || !tenantId || !userId || !message) return;

  const workspaceId = input.workspaceId != null ? String(input.workspaceId).trim() : null;
  const modelKey = input.modelKey != null ? String(input.modelKey).trim().slice(0, 200) : null;
  const title = deriveChatSessionTitle(message);

  const work = (async () => {
    try {
      const githubRepo = await resolveGithubRepoForChatSession(env, {
        workspaceId,
        activeFileEnvelope: input.activeFileEnvelope ?? null,
        body: input.body ?? null,
      });

      const projectRef =
        Object.prototype.hasOwnProperty.call(input, 'projectRef')
          ? String(input.projectRef || '').trim() || null
          : parseSessionProjectIdFromChatBody(input.body ?? null);
      const resolvedProjectId = projectRef
        ? await resolveChatProjectId(env, projectRef, workspaceId)
        : null;

      const ins = await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_chat_sessions (
           conversation_id, tenant_id, user_id, workspace_id, title, github_repo, model_key,
           project_id, message_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`,
      )
        .bind(
          conversationId,
          tenantId,
          userId,
          workspaceId,
          title,
          githubRepo,
          modelKey,
          resolvedProjectId,
        )
        .run();

      const inserted = Number(ins?.meta?.changes ?? ins?.changes ?? 0) > 0;

      // Fire R2 init for new sessions — non-blocking
      if (inserted && workspaceId) {
        initChatSessionR2(env, {
          conversationId,
          userId,
          workspaceId,
          tenantId,
          title,
          modelKey,
          githubRepo,
        }).catch((e) => console.warn('[scheduleChatSessionTitleInsert] initChatSessionR2', e?.message ?? e));
      }

      if (inserted) return;

      await env.DB.prepare(
        `UPDATE agentsam_chat_sessions
         SET updated_at = unixepoch(),
             message_count = COALESCE(message_count, 0) + 1,
             model_key = COALESCE(?, model_key),
             github_repo = COALESCE(?, github_repo),
             project_id = CASE WHEN ? = 1 THEN ? ELSE COALESCE(project_id, ?) END
         WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?`,
      )
        .bind(
          modelKey,
          githubRepo,
          input.projectExplicit === true ? 1 : 0,
          resolvedProjectId,
          resolvedProjectId,
          conversationId,
          userId,
          tenantId,
        )
        .run();
    } catch (e) {
      console.warn('[agentsam_chat_sessions] title insert', e?.message ?? e);
    }
  })();

  if (ctx?.waitUntil) ctx.waitUntil(work);
  else void work;
}

/**
 * Pin the workspace's last active conversation (resume spine).
 * Remote D1 has uidx_agentsam_workspace_state_workspace ON workspace_id —
 * ON CONFLICT(workspace_id) is valid for real product workspaces / agent sessions.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ conversationId?: string|null, workspaceId?: string|null }} input
 */
export function scheduleWorkspaceStateConversationUpdate(env, ctx, input) {
  const conversationId =
    input.conversationId != null ? String(input.conversationId).trim() : '';
  const workspaceId = input.workspaceId != null ? String(input.workspaceId).trim() : '';
  if (!env?.DB || !conversationId || !workspaceId) return;

  const work = (async () => {
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_workspace_state (
           id, workspace_id, conversation_id, workspace_type, created_at, updated_at
         ) VALUES ('wss_' || lower(hex(randomblob(8))), ?, ?, 'ide', unixepoch(), unixepoch())
         ON CONFLICT(workspace_id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           updated_at = unixepoch()`,
      )
        .bind(workspaceId, conversationId)
        .run();
    } catch (e) {
      try {
        await env.DB.prepare(
          `UPDATE agentsam_workspace_state
           SET conversation_id = ?, updated_at = unixepoch()
           WHERE workspace_id = ?`,
        )
          .bind(conversationId, workspaceId)
          .run();
      } catch (e2) {
        console.warn('[agentsam_workspace_state] conversation_id', e2?.message ?? e2);
      }
    }
  })();

  if (ctx?.waitUntil) ctx.waitUntil(work);
  else void work;
}

/**
 * List real chat threads for nav/history (agentsam_chat_sessions SSOT — not raw agent_run rows).
 * @param {any} env
 * @param {{ userId: string, tenantId: string, limit?: number, includeArchived?: boolean, projectId?: string|null, workspaceId?: string|null }} input
 */
export async function listUserChatSessions(env, input) {
  if (!env?.DB) return [];
  const userId = String(input.userId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  if (!userId || !tenantId) return [];
  const lim = Math.min(Math.max(Number(input.limit) || 40, 1), 200);
  const archivedClause = input.includeArchived ? '' : 'AND COALESCE(cs.is_archived, 0) = 0';

  let projectClause = '';
  /** @type {string[]} */
  const projectBinds = [];
  const projectRef = input.projectId != null ? String(input.projectId).trim() : '';
  if (projectRef) {
    const { wpId, projectsId } = await expandChatProjectRefs(env, projectRef, input.workspaceId || null);
    const ids = [...new Set([wpId, projectsId, projectRef].filter(Boolean))];
    if (ids.length === 1) {
      projectClause = 'AND cs.project_id = ?';
      projectBinds.push(ids[0]);
    } else if (ids.length > 1) {
      projectClause = `AND cs.project_id IN (${ids.map(() => '?').join(', ')})`;
      projectBinds.push(...ids);
    }
  }

  try {
    const res = await withD1Retry(() =>
      env.DB.prepare(
      `SELECT cs.conversation_id AS id,
              cs.conversation_id,
              cs.title,
              cs.title AS name,
              cs.github_repo,
              cs.model_key,
              cs.workspace_id,
              cs.is_starred,
              cs.project_id,
              cs.message_count,
              cs.total_tokens_out,
              cs.last_turn_status,
              cs.last_turn_error,
              cs.created_at AS started_at,
              cs.updated_at,
              wp.name AS project_name,
              (SELECT COUNT(*)
               FROM agentsam_artifacts aa
               WHERE aa.user_id = cs.user_id
                 AND (aa.source_session_id = cs.conversation_id
                      OR aa.source_run_id IN (
                        SELECT r.id FROM agentsam_agent_run r
                        WHERE r.conversation_id = cs.conversation_id AND r.user_id = cs.user_id
                      ))
              ) AS artifact_count
       FROM agentsam_chat_sessions cs
       LEFT JOIN workspace_projects wp ON wp.id = cs.project_id
         OR json_extract(wp.metadata_json, '$.projects_table_id') = cs.project_id
       WHERE cs.user_id = ? AND cs.tenant_id = ?
         ${archivedClause}
         ${projectClause}
       ORDER BY cs.is_starred DESC, cs.updated_at DESC
       LIMIT ?`,
    )
      .bind(userId, tenantId, ...projectBinds, lim)
      .all(),
    );
    const rows = res?.results || [];
    return rows.map((r) => ({
      ...r,
      message_count: Number(r.message_count) || 1,
      is_starred: Number(r.is_starred) === 1,
      has_artifacts: Number(r.artifact_count) > 0,
      artifact_count: Number(r.artifact_count) || 0,
      session_type: 'chat',
      status: 'active',
    }));
  } catch (e) {
    console.warn('[listUserChatSessions]', e?.message ?? e);
    if (isD1OverloadError(e)) return [];
    try {
      const res = await env.DB.prepare(
        `SELECT cs.conversation_id AS id,
                cs.conversation_id,
                cs.title,
                cs.title AS name,
                cs.github_repo,
                cs.model_key,
                cs.workspace_id,
                cs.created_at AS started_at,
                cs.updated_at,
                0 AS is_starred,
                NULL AS project_id,
                1 AS message_count,
                NULL AS project_name,
                0 AS artifact_count
         FROM agentsam_chat_sessions cs
         WHERE cs.user_id = ? AND cs.tenant_id = ?
         ORDER BY cs.updated_at DESC
         LIMIT ?`,
      )
        .bind(userId, tenantId, lim)
        .all();
      const rows = res?.results || [];
      return rows.map((r) => ({
        ...r,
        message_count: Number(r.message_count) || 1,
        is_starred: false,
        has_artifacts: false,
        artifact_count: 0,
        session_type: 'chat',
        status: 'active',
      }));
    } catch (e2) {
      console.warn('[listUserChatSessions] fallback', e2?.message ?? e2);
      return [];
    }
  }
}

/**
 * @param {any} env
 * @param {{ conversationId: string, userId: string, tenantId: string, patch: Record<string, unknown> }} input
 */
export async function patchUserChatSession(env, input) {
  if (!env?.DB) return { ok: false, error: 'DB not configured' };
  const conversationId = String(input.conversationId || '').trim();
  const userId = String(input.userId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
  if (!conversationId || !userId || !tenantId) return { ok: false, error: 'missing_context' };

  const sets = [];
  const binds = [];

  if (typeof patch.title === 'string' && patch.title.trim()) {
    sets.push('title = ?');
    binds.push(patch.title.trim().slice(0, 200));
  }
  if (patch.is_starred === true || patch.is_starred === 1 || patch.is_starred === '1') {
    sets.push('is_starred = 1');
  } else if (patch.is_starred === false || patch.is_starred === 0 || patch.is_starred === '0') {
    sets.push('is_starred = 0');
  }
  if (patch.is_archived === true || patch.is_archived === 1 || patch.is_archived === '1') {
    const del = await deleteUserChatSession(env, { conversationId, userId, tenantId });
    if (!del.ok) return del;
    return { ok: true, deleted: true };
  }
  if (patch.is_archived === false || patch.is_archived === 0 || patch.is_archived === '0') {
    sets.push('is_archived = 0');
  }
  if (patch.project_id === null || patch.project_id === '') {
    sets.push('project_id = NULL');
  } else if (typeof patch.project_id === 'string' && patch.project_id.trim()) {
    const resolved = await resolveChatProjectId(env, patch.project_id.trim(), patch.workspace_id || null);
    sets.push('project_id = ?');
    binds.push(resolved || patch.project_id.trim());
  }

  if (!sets.length) return { ok: false, error: 'no_changes' };
  sets.push('updated_at = unixepoch()');
  binds.push(conversationId, userId, tenantId);

  try {
    const r = await env.DB.prepare(
      `UPDATE agentsam_chat_sessions SET ${sets.join(', ')}
       WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?`,
    )
      .bind(...binds)
      .run();
    let changed = Number(r.meta?.changes ?? r.changes ?? 0);
    if (!changed && typeof patch.project_id === 'string' && patch.project_id.trim()) {
      const resolvedProjectId = await resolveChatProjectId(
        env,
        patch.project_id.trim(),
        patch.workspace_id || null,
      );
      const title =
        typeof patch.title === 'string' && patch.title.trim()
          ? patch.title.trim().slice(0, 200)
          : 'Chat';
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_chat_sessions (
           conversation_id, tenant_id, user_id, workspace_id, title, project_id,
           message_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`,
      )
        .bind(
          conversationId,
          tenantId,
          userId,
          patch.workspace_id != null ? String(patch.workspace_id).trim() || null : null,
          title,
          resolvedProjectId || patch.project_id.trim(),
        )
        .run();
      const r2 = await env.DB.prepare(
        `UPDATE agentsam_chat_sessions SET ${sets.join(', ')}
         WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?`,
      )
        .bind(...binds)
        .run();
      changed = Number(r2.meta?.changes ?? r2.changes ?? 0);
    }
    if (!changed) return { ok: false, error: 'not_found' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'patch_failed' };
  }
}

/**
 * Hard-delete a chat session: D1 row + best-effort R2 message/meta/digest objects.
 * @param {any} env
 * @param {{ conversationId: string, userId: string, tenantId: string }} input
 */
export async function deleteUserChatSession(env, input) {
  if (!env?.DB) return { ok: false, error: 'DB not configured' };
  const conversationId = String(input.conversationId || '').trim();
  const userId = String(input.userId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  if (!conversationId || !userId || !tenantId) return { ok: false, error: 'missing_context' };

  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT r2_messages_key, r2_meta_key, latest_digest_r2_key
       FROM agentsam_chat_sessions
       WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?
       LIMIT 1`,
    )
      .bind(conversationId, userId, tenantId)
      .first();
  } catch (e) {
    return { ok: false, error: e?.message || 'lookup_failed' };
  }
  if (!row) return { ok: false, error: 'not_found' };

  const bucket = env.AUTORAG_BUCKET ?? env.R2 ?? null;
  if (bucket) {
    const keys = [
      row.r2_messages_key,
      row.r2_meta_key,
      row.latest_digest_r2_key,
    ]
      .map((k) => (k != null ? String(k).trim() : ''))
      .filter(Boolean);
    for (const key of keys) {
      try {
        await bucket.delete(key);
      } catch {
        /* best-effort */
      }
    }
  }

  void wipeChatSessionDo(env, conversationId).catch((e) =>
    console.warn('[deleteUserChatSession] do_wipe', e?.message ?? e),
  );

  try {
    const r = await env.DB.prepare(
      `DELETE FROM agentsam_chat_sessions
       WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?`,
    )
      .bind(conversationId, userId, tenantId)
      .run();
    const changed = Number(r.meta?.changes ?? r.changes ?? 0);
    if (!changed) return { ok: false, error: 'not_found' };
    await env.DB.prepare(
      `UPDATE agentsam_agent_run
       SET status = 'cancelled', conversation_id = NULL, completed_at = COALESCE(completed_at, datetime('now'))
       WHERE conversation_id = ? AND user_id = ?`,
    )
      .bind(conversationId, userId)
      .run()
      .catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'delete_failed' };
  }
}
