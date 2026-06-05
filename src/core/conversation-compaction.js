/**
 * Model-aware conversation compaction for Agent Sam chat spine.
 * Uses r2-context-store (AUTORAG_BUCKET), D1 digests, compaction_events, docs lane.
 */

import { writeContextToR2, readContextFromR2 } from './r2-context-store.js';
import { sha256Hex } from './cms-theme-hashing.js';
import { dispatchComplete } from './provider.js';
import { writeToLane } from './rag-lanes.js';
import { scheduleCompactionEvent } from './agentsam-ops-ledger.js';
import { bumpPromptCacheOnCompaction } from './prompt-cache-economics.js';
import { pragmaTableInfo } from './retention.js';

export const COMPACTION_SUMMARY_MODEL = 'gpt-4.1-mini';
export const COMPACTION_EMBED_MODEL = 'text-embedding-3-large';
export const COMPACTION_EMBED_DIMS = 1536;

export const COMPACTION_THRESHOLDS = {
  agentic: 65000,
  rag_heavy: 45000,
  conversational: 100000,
  default: 70000,
};

export const COMPACTION_MESSAGES_TO_RETAIN = 6;

const COMPACTION_SYSTEM = `You are a technical context compactor. Summarize the conversation below.
Preserve exactly: all technical decisions made, file names and paths,
migration numbers applied, errors and their resolutions, action items,
model or routing changes, hard constraints stated by the user.
Output plain prose. No markdown. No headers. No bullet points.
Stay under 800 tokens.`;

/**
 * @param {unknown[]} messages
 * @param {string[]} [activeTools]
 */
export function detectSessionType(messages, activeTools) {
  const arr = Array.isArray(messages) ? messages : [];
  const hasToolCalls = arr.some(
    (m) =>
      (m && typeof m === 'object' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) ||
      m?.role === 'tool',
  );
  const tools = Array.isArray(activeTools) ? activeTools.map((t) => String(t)) : [];
  const hasTerminal = tools.some((t) => t.includes('agentsam_terminal') || t.includes('terminal_local'));
  const hasRagChunks = arr.some(
    (m) =>
      String(m?.content ?? '').includes('[retrieved]') ||
      m?.role === 'tool' ||
      String(m?.content ?? '').includes('Semantic Context'),
  );
  if (hasTerminal || (hasToolCalls && arr.length > 10)) return 'agentic';
  if (hasRagChunks) return 'rag_heavy';
  if (!hasToolCalls) return 'conversational';
  return 'default';
}

function estimateTokensFromMessages(messages) {
  const text = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m?.content ?? ''))
    .join('');
  return Math.max(0, Math.ceil(text.length / 4));
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      role: String(m.role || 'user'),
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    }));
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {unknown[]} messages
 */
export async function hydrateMessagesWithPriorDigest(env, conversationId, messages) {
  const out = normalizeMessages(messages);
  if (!env?.DB || !conversationId) return out;

  try {
    const cols = await pragmaTableInfo(env.DB, 'agentsam_context_digest');
    if (!cols.has('digest_text')) return out;

    const orderCol = cols.has('created_at')
      ? 'created_at DESC'
      : cols.has('created_at_unix')
        ? 'created_at_unix DESC'
        : 'rowid DESC';

    const row = await env.DB.prepare(
      `SELECT digest_text FROM agentsam_context_digest
       WHERE session_id = ?
       ORDER BY ${orderCol}
       LIMIT 1`,
    )
      .bind(String(conversationId))
      .first()
      .catch(() => null);

    const r2Key = row?.digest_text != null ? String(row.digest_text).trim() : '';
    if (!r2Key || !r2Key.startsWith('context/')) return out;

    console.log('[compaction]', 'prior_digest_read', { key: r2Key });
    const priorSummary = await readContextFromR2(env, r2Key);
    if (!priorSummary) return out;

    return [{ role: 'system', content: `[Prior context summary]\n${priorSummary}` }, ...out];
  } catch (e) {
    console.warn('[compaction] prior_digest', e?.message ?? e);
    return out;
  }
}

async function insertConversationContextDigest(env, fields) {
  const cols = await pragmaTableInfo(env.DB, 'agentsam_context_digest');
  if (!cols.has('digest_text') || !cols.has('workspace_id')) return;

  const sourceHash = fields.sourceHash;
  const digestHash = await sha256Hex(
    `${fields.workspaceId}:conversation:${fields.sessionId}:${sourceHash}`,
  );
  const id = `cd_${digestHash.slice(0, 16)}`;

  const row = {
    id,
    workspace_id: fields.workspaceId,
    session_id: fields.sessionId,
    digest_type: 'conversation',
    source_hash: sourceHash,
    digest_hash: digestHash,
    digest_text: fields.r2Key,
    raw_size_bytes: fields.rawSizeBytes,
    reduced_size_bytes: fields.reducedSizeBytes,
    token_count: fields.tokenCount,
    generation_model: fields.generationModel,
    namespace: fields.workspaceId,
  };

  const insertCols = Object.keys(row).filter((k) => cols.has(k));
  if (!insertCols.length) return;

  const placeholders = insertCols.map((c) =>
    ['created_at', 'updated_at'].includes(c) ? "datetime('now')" : '?',
  );
  const binds = insertCols
    .filter((c) => !['created_at', 'updated_at'].includes(c))
    .map((c) => row[c]);

  const updates = insertCols
    .filter((c) => !['id', 'digest_hash'].includes(c))
    .map((c) =>
      ['created_at', 'updated_at'].includes(c) ? `${c} = datetime('now')` : `${c} = excluded.${c}`,
    );

  const sql = cols.has('digest_hash')
    ? `INSERT INTO agentsam_context_digest (${insertCols.join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT(digest_hash) DO UPDATE SET ${updates.join(', ')}`
    : `INSERT INTO agentsam_context_digest (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`;

  await env.DB.prepare(sql)
    .bind(...binds)
    .run();
  console.log('[compaction]', 'agentsam_context_digest', {
    table: 'agentsam_context_digest',
    session_id: fields.sessionId,
  });
}

async function scheduleCompactionSideEffects(env, ctx, fields) {
  scheduleCompactionEvent(env, ctx, {
    tenantId: fields.tenantId,
    workspaceId: fields.workspaceId,
    userId: fields.userId,
    sessionId: fields.sessionId,
    provider: 'openai',
    modelKey: COMPACTION_SUMMARY_MODEL,
    tokensBefore: fields.tokensBefore,
    tokensAfter: fields.tokensAfter,
    compactionStrategy: 'summarize',
    metadata: {
      compaction_type: 'conversation',
      compaction_scope: 'session',
      source_kind: 'd1',
      source_table: 'agentsam_chat_sessions',
      report_artifact_url: fields.r2Key,
      status: 'completed',
    },
  });
  console.log('[compaction]', 'agentsam_compaction_events', {
    table: 'agentsam_compaction_events',
    scope: 'conversation',
  });
}

async function indexCompactionSummary(env, ctx, { workspaceId, conversationId, r2Key, summaryText }) {
  const p = writeToLane(env, 'docs', {
    workspace_id_d1: workspaceId,
    source_ref: conversationId,
    source_type: 'compaction_digest',
    title: `Compaction digest ${conversationId}`,
    content: summaryText,
    metadata: {
      source_path: r2Key,
      conversation_id: conversationId,
      embedding_model: COMPACTION_EMBED_MODEL,
      embedding_dims: COMPACTION_EMBED_DIMS,
    },
  }).catch((e) => {
    console.warn('[compaction] docs_lane', e?.message ?? e);
    return { ok: false };
  });

  if (ctx?.waitUntil) ctx.waitUntil(p);
  else await p;

  console.log('[compaction]', 'agentsam_documents_oai3large_1536', {
    table: 'agentsam_documents_oai3large_1536',
    conversation_id: conversationId,
  });
  console.log('[compaction]', 'vectorize_documents', {
    binding: 'AGENTSAM_VECTORIZE_DOCUMENTS',
    conversation_id: conversationId,
  });
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   messages: unknown[],
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string|null,
 *   conversationId: string,
 *   activeTools?: string[],
 *   systemPromptCacheHash?: string|null,
 * }} params
 */
export async function compactConversationMessagesIfNeeded(env, ctx, params) {
  const userId = String(params.userId || '').trim();
  const workspaceId = String(params.workspaceId || '').trim();
  const conversationId = String(params.conversationId || '').trim();
  if (!userId || !workspaceId || !conversationId) {
    throw new Error('compaction requires authenticated userId and resolved workspaceId');
  }

  let messages = normalizeMessages(params.messages);
  messages = await hydrateMessagesWithPriorDigest(env, conversationId, messages);

  const sessionType = detectSessionType(messages, params.activeTools);
  const threshold = COMPACTION_THRESHOLDS[sessionType] ?? COMPACTION_THRESHOLDS.default;
  const estimated = estimateTokensFromMessages(messages);

  if (estimated <= threshold || messages.length <= COMPACTION_MESSAGES_TO_RETAIN + 1) {
    return { messages, compacted: false, estimated, sessionType, threshold };
  }

  const toCompact = messages.slice(0, -COMPACTION_MESSAGES_TO_RETAIN);
  const toRetain = messages.slice(-COMPACTION_MESSAGES_TO_RETAIN);

  let summaryText = '';
  try {
    const result = await dispatchComplete(env, {
      modelKey: COMPACTION_SUMMARY_MODEL,
      systemPrompt: COMPACTION_SYSTEM,
      messages: toCompact.map((m) => ({ role: m.role, content: m.content })),
      tools: [],
      userId,
      options: { reasoningEffort: 'none', verbosity: 'low', maxOutputTokens: 1200 },
    });
    summaryText =
      (typeof result?.text === 'string' && result.text) ||
      result?.choices?.[0]?.message?.content ||
      result?.output_text ||
      '';
    summaryText = String(summaryText).trim();
  } catch (e) {
    console.warn('[compaction] summary_model', e?.message ?? e);
    summaryText = toCompact
      .slice(-8)
      .map((m) => `${m.role}: ${String(m.content).slice(0, 400)}`)
      .join('\n')
      .slice(0, 3200);
  }

  if (!summaryText) {
    return { messages, compacted: false, estimated, sessionType, threshold };
  }

  const r2Key = await writeContextToR2(env, {
    userId,
    workspaceId,
    conversationId,
    type: 'digest',
    content: summaryText,
  });
  console.log('[compaction]', 'r2_write', { key: r2Key });

  const rawSize = toCompact.map((m) => m.content).join('').length;
  const reducedSize = summaryText.length;
  const tokensAfter =
    Math.ceil(summaryText.length / 4) + COMPACTION_MESSAGES_TO_RETAIN * 150;
  const sourceHash = await sha256Hex(toCompact.map((m) => m.content).join(''));

  const assembled = [
    { role: 'system', content: `[Prior context summary]\n${summaryText}` },
    ...toRetain,
  ];

  const sideEffects = async () => {
    try {
      await insertConversationContextDigest(env, {
        workspaceId,
        sessionId: conversationId,
        r2Key,
        sourceHash,
        rawSizeBytes: rawSize,
        reducedSizeBytes: reducedSize,
        tokenCount: Math.ceil(summaryText.length / 4),
        generationModel: COMPACTION_SUMMARY_MODEL,
      });
    } catch (e) {
      console.warn('[compaction] context_digest', e?.message ?? e);
    }
    try {
      await scheduleCompactionSideEffects(env, null, {
        tenantId: params.tenantId || 'system',
        workspaceId,
        userId,
        sessionId: conversationId,
        tokensBefore: estimated,
        tokensAfter,
        r2Key,
      });
    } catch (e) {
      console.warn('[compaction] compaction_event', e?.message ?? e);
    }
    try {
      await indexCompactionSummary(env, null, {
        workspaceId,
        conversationId,
        r2Key,
        summaryText,
      });
    } catch (e) {
      console.warn('[compaction] index_summary', e?.message ?? e);
    }
    if (params.systemPromptCacheHash) {
      try {
        await bumpPromptCacheOnCompaction(env, {
          tenantId: params.tenantId || 'system',
          cacheKeyHash: params.systemPromptCacheHash,
          tokensSaved: Math.max(0, estimated - tokensAfter),
        });
      } catch (e) {
        console.warn('[compaction] prompt_cache_bump', e?.message ?? e);
      }
    }
  };

  if (ctx?.waitUntil) ctx.waitUntil(sideEffects());
  else await sideEffects();

  return {
    messages: assembled,
    compacted: true,
    estimated,
    tokensAfter,
    sessionType,
    threshold,
    r2Key,
  };
}
