/**
 * Purge soft-archived chat sessions — hard-delete D1 + R2 + DO via deleteUserChatSession.
 */
import { deleteUserChatSession } from './agentsam-chat-sessions.js';

export const PURGE_ARCHIVED_CHAT_CONFIRM = 'PURGE_ARCHIVED_CHAT_SESSIONS';

/**
 * @param {any} env
 * @param {{ dryRun?: boolean, limit?: number }} [opts]
 */
export async function purgeArchivedChatSessions(env, opts = {}) {
  if (!env?.DB) return { ok: false, error: 'DB not configured' };

  const dryRun = opts.dryRun !== false;
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);

  const { results } = await env.DB.prepare(
    `SELECT conversation_id, user_id, tenant_id, title, updated_at
     FROM agentsam_chat_sessions
     WHERE COALESCE(is_archived, 0) = 1
     ORDER BY updated_at ASC
     LIMIT ?`,
  ).bind(limit).all().catch(() => ({ results: [] }));

  const rows = results || [];
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      count: rows.length,
      sessions: rows.map((r) => ({
        conversation_id: r.conversation_id,
        user_id: r.user_id,
        tenant_id: r.tenant_id,
        title: r.title,
        updated_at: r.updated_at,
      })),
    };
  }

  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const row of rows) {
    const out = await deleteUserChatSession(env, {
      conversationId: String(row.conversation_id || '').trim(),
      userId: String(row.user_id || '').trim(),
      tenantId: String(row.tenant_id || '').trim(),
    });
    if (out.ok) {
      deleted += 1;
    } else {
      failed += 1;
      errors.push({
        conversation_id: row.conversation_id,
        error: out.error || 'delete_failed',
      });
    }
  }

  return {
    ok: true,
    dry_run: false,
    total: rows.length,
    deleted,
    failed,
    errors,
  };
}
