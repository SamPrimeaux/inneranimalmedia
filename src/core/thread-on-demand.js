/**
 * On-demand thread /compact and /summarize — chat slash commands + message intercept.
 * /compact → conversation compaction (R2 digest, D1, docs lane).
 * /summarize → Supabase summarize-thread edge (session_summaries); non-blocking, never throws.
 */

import { pragmaTableInfo } from './retention.js';
import {
  forceCompactConversationMessages,
  normalizeMessagesForCompaction,
} from './conversation-compaction.js';
import { summarizeThreadOnDemand } from './summarize-thread.js';

const THREAD_SLASH_RE = /^\/(compact|summarize)\s*$/i;

/**
 * @param {string} message
 * @returns {'compact'|'summarize'|null}
 */
export function parseThreadSlashCommand(message) {
  const m = String(message || '').trim().match(THREAD_SLASH_RE);
  if (!m) return null;
  return m[1].toLowerCase() === 'summarize' ? 'summarize' : 'compact';
}

/**
 * @param {any} env
 * @param {string} conversationId
 * @param {unknown[]} [fallbackMessages]
 */
export async function loadConversationMessages(env, conversationId, fallbackMessages) {
  const fromClient = normalizeMessagesForCompaction(fallbackMessages);
  if (fromClient.length) return fromClient;

  const cid = String(conversationId || '').trim();
  if (!env?.DB || !cid) return [];

  const cols = await pragmaTableInfo(env.DB, 'agent_messages');
  if (!cols.has('conversation_id') || !cols.has('content')) return [];

  const orderCol = cols.has('created_at') ? 'created_at ASC' : 'rowid ASC';
  const { results = [] } = await env.DB.prepare(
    `SELECT role, content FROM agent_messages
     WHERE conversation_id = ?
     ORDER BY ${orderCol}
     LIMIT 200`,
  )
    .bind(cid)
    .all()
    .catch(() => ({ results: [] }));

  return normalizeMessagesForCompaction(results);
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   action: 'compact'|'summarize',
 *   userId: string,
 *   workspaceId: string,
 *   tenantId?: string|null,
 *   conversationId: string,
 *   agentRunId?: string|null,
 *   messages?: unknown[],
 *   systemPromptCacheHash?: string|null,
 * }} opts
 */
export async function runThreadActionOnDemand(env, ctx, opts) {
  const action = opts.action === 'summarize' ? 'summarize' : 'compact';
  const userId = String(opts.userId || '').trim();
  const workspaceId = String(opts.workspaceId || '').trim();
  const conversationId = String(opts.conversationId || '').trim();

  if (!userId || !workspaceId || !conversationId) {
    return {
      ok: false,
      action,
      error: 'missing_identity_or_conversation',
      user_message: 'Could not run thread action: workspace or conversation context is missing.',
    };
  }

  const messages = await loadConversationMessages(env, conversationId, opts.messages);
  if (!messages.length) {
    return {
      ok: false,
      action,
      error: 'no_messages',
      user_message:
        'No messages found for this thread. Send at least one message in chat, then try again.',
    };
  }

  if (action === 'compact') {
    try {
      const out = await forceCompactConversationMessages(env, ctx, {
        messages,
        userId,
        workspaceId,
        tenantId: opts.tenantId ?? null,
        conversationId,
        agentRunId: opts.agentRunId ?? null,
        systemPromptCacheHash: opts.systemPromptCacheHash ?? null,
        activeTools: [],
      });

      if (!out.compacted) {
        const reason =
          messages.length < 2
            ? 'Need at least 2 messages to compact.'
            : 'Compaction produced no summary (try again after more conversation).';
        return {
          ok: false,
          action,
          error: 'compaction_skipped',
          reason: out.reason,
          user_message: reason,
          message_count: messages.length,
          estimated_tokens: out.estimated,
        };
      }

      const preview = out.summaryPreview || '';
      return {
        ok: true,
        action,
        compacted: true,
        r2_key: out.r2Key ?? null,
        tokens_before: out.estimated,
        tokens_after: out.tokensAfter,
        message_count: messages.length,
        user_message: `Thread compacted. ~${out.estimated ?? 0} → ~${out.tokensAfter ?? 0} tokens. Last ${out.retained ?? 6} turns kept.${preview ? `\n\n${preview}` : ''}`,
        messages: out.messages,
      };
    } catch (e) {
      console.warn('[thread-on-demand] compact', e?.message ?? e);
      return {
        ok: false,
        action,
        error: String(e?.message || e),
        user_message: `Compaction failed: ${String(e?.message || e).slice(0, 200)}`,
      };
    }
  }

  try {
    const sum = await summarizeThreadOnDemand(env, {
      sessionId: conversationId,
      tenantId: opts.tenantId ?? null,
      workspaceId,
      messageCount: messages.length,
      force: true,
    });

    if (!sum.invoked) {
      return {
        ok: false,
        action,
        error: sum.reason || 'summarize_skipped',
        user_message:
          sum.reason === 'supabase_not_configured'
            ? 'Thread summarize requires Supabase (summarize-thread edge function). Compaction (/compact) still works on-platform.'
            : `Summarize skipped: ${sum.reason || 'unknown'}.`,
      };
    }

    return {
      ok: sum.ok !== false,
      action,
      invoked: true,
      summarize: sum,
      message_count: messages.length,
      user_message: sum.ok
        ? `Thread summary queued (${messages.length} messages). Long-term recall will update via session_summaries.`
        : `Summarize request failed: ${String(sum.result?.error || sum.error || 'edge_error').slice(0, 200)}`,
    };
  } catch (e) {
    console.warn('[thread-on-demand] summarize', e?.message ?? e);
    return {
      ok: false,
      action,
      error: String(e?.message || e),
      user_message: `Summarize failed: ${String(e?.message || e).slice(0, 200)}`,
    };
  }
}

/**
 * in_app command dispatch entry (agentsam_commands.tool_key).
 * @param {any} env
 * @param {any} ctx
 * @param {string} toolKey
 * @param {Record<string, unknown>} args
 * @param {Record<string, unknown>} runContext
 */
export async function dispatchInAppThreadCommand(env, ctx, toolKey, args, runContext) {
  const key = String(toolKey || '').trim().toLowerCase();
  const action = key === 'thread.summarize' || key.endsWith('.summarize') ? 'summarize' : 'compact';
  return runThreadActionOnDemand(env, ctx, {
    action,
    userId: String(runContext?.userId ?? runContext?.user_id ?? '').trim(),
    workspaceId: String(runContext?.workspaceId ?? runContext?.workspace_id ?? '').trim(),
    tenantId: runContext?.tenantId ?? runContext?.tenant_id ?? null,
    conversationId: String(
      runContext?.conversationId ??
        runContext?.sessionId ??
        runContext?.session_id ??
        args?.conversation_id ??
        args?.session_id ??
        '',
    ).trim(),
    agentRunId: runContext?.agentRunId ?? runContext?.agent_run_id ?? args?.agent_run_id ?? null,
    messages: Array.isArray(args?.messages) ? args.messages : undefined,
    systemPromptCacheHash: args?.system_prompt_cache_hash ?? null,
  });
}
