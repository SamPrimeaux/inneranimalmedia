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

      const ins = await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_chat_sessions (
           conversation_id, tenant_id, user_id, workspace_id, title, github_repo, model_key,
           message_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`,
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

      const inserted = Number(ins?.meta?.changes ?? ins?.changes ?? 0) > 0;
      if (inserted) return;

      await env.DB.prepare(
        `UPDATE agentsam_chat_sessions
         SET updated_at = unixepoch(),
             message_count = COALESCE(message_count, 0) + 1,
             model_key = COALESCE(?, model_key),
             github_repo = COALESCE(?, github_repo)
         WHERE conversation_id = ? AND user_id = ? AND tenant_id = ?`,
      )
        .bind(modelKey, githubRepo, conversationId, userId, tenantId)
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

/**
 * List real chat threads for nav/history (agentsam_chat_sessions SSOT — not raw agent_run rows).
 * @param {any} env
 * @param {{ userId: string, tenantId: string, limit?: number, includeArchived?: boolean }} input
 */
export async function listUserChatSessions(env, input) {
  if (!env?.DB) return [];
  const userId = String(input.userId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  if (!userId || !tenantId) return [];
  const lim = Math.min(Math.max(Number(input.limit) || 40, 1), 100);
  const archivedClause = input.includeArchived ? '' : 'AND COALESCE(cs.is_archived, 0) = 0';

  try {
    const res = await env.DB.prepare(
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
       WHERE cs.user_id = ? AND cs.tenant_id = ?
         ${archivedClause}
       ORDER BY cs.is_starred DESC, cs.updated_at DESC
       LIMIT ?`,
    )
      .bind(userId, tenantId, lim)
      .all();
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
    sets.push('is_archived = 1');
  } else if (patch.is_archived === false || patch.is_archived === 0 || patch.is_archived === '0') {
    sets.push('is_archived = 0');
  }
  if (patch.project_id === null || patch.project_id === '') {
    sets.push('project_id = NULL');
  } else if (typeof patch.project_id === 'string' && patch.project_id.trim()) {
    sets.push('project_id = ?');
    binds.push(patch.project_id.trim());
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
    const changed = Number(r.meta?.changes ?? r.changes ?? 0);
    if (!changed) return { ok: false, error: 'not_found' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'patch_failed' };
  }
}
