/**
 * POST /api/internal/chat-sessions/purge-archived — INTERNAL_API_SECRET only.
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { purgeArchivedChatSessions, PURGE_ARCHIVED_CHAT_CONFIRM } from '../core/chat-session-purge.js';

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleChatSessionPurgeArchivedInternal(request, env) {
  if (request.method.toUpperCase() !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!env?.DB) {
    return jsonResponse({ ok: false, error: 'Database not configured' }, 503);
  }

  const body = await request.json().catch(() => ({}));
  if (String(body?.confirm || '') !== PURGE_ARCHIVED_CHAT_CONFIRM) {
    return jsonResponse({ ok: false, error: 'confirm_required', expected: PURGE_ARCHIVED_CHAT_CONFIRM }, 400);
  }

  const out = await purgeArchivedChatSessions(env, {
    dryRun: body?.dry_run !== false,
    limit: body?.limit,
  });

  if (!out.ok) return jsonResponse({ ok: false, ...out }, 400);
  return jsonResponse({ ok: true, ...out });
}
