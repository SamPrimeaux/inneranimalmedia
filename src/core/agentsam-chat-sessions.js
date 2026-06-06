/**
 * agentsam_chat_sessions — conversation titling metadata (display layer).
 * INSERT OR IGNORE on first chat message; never overwrites existing titles.
 */
import { getWorkspaceGithubRepo } from './agentsam-workspace.js';

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

      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_chat_sessions (
           conversation_id, tenant_id, user_id, workspace_id, title, github_repo, model_key,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
      )
        .bind(
          conversationId,
          tenantId,
          userId,
          workspaceId,
          title,
          githubRepo,
          modelKey,
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
 * Remote D1 has uidx_agentsam_workspace_state_workspace ON workspace_id — ON CONFLICT is valid.
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
