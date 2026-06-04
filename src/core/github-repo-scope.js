/**
 * Per-user / per-workspace GitHub repo scoping for Agent Sam tools.
 * Prevents cross-tenant repo bleed (e.g. Connor must not read SamPrimeaux/inneranimalmedia).
 */
import { getUserGithubToken } from '../integrations/github.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseRepoOwner(repo) {
  const s = trim(repo);
  if (!s.includes('/')) return '';
  return s.split('/')[0].toLowerCase();
}

/**
 * @param {any} env
 * @param {string} tenantId
 * @param {string} workspaceId
 */
export async function fetchWorkspaceGithubRepo(env, tenantId, workspaceId) {
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return null;
  const row = await env.DB.prepare(
    `SELECT github_repo FROM workspaces WHERE id = ? LIMIT 1`,
  )
    .bind(wid)
    .first()
    .catch(() => null);
  const repo = row?.github_repo != null ? trim(row.github_repo) : '';
  return repo.includes('/') ? repo : null;
}

/**
 * @param {any} env
 * @param {string} userId
 */
export async function fetchUserGithubLogin(env, userId) {
  const uid = trim(userId);
  if (!uid) return null;
  try {
    const row = await getUserGithubToken(env, uid, '');
    const login = trim(row?.account_identifier);
    return login || null;
  } catch {
    return null;
  }
}

/**
 * System prompt line — locks the model to the connected GitHub user's namespace.
 * @param {any} env
 * @param {string} userId
 */
export async function buildGithubScopeSystemPromptLine(env, userId) {
  const login = await fetchUserGithubLogin(env, userId);
  if (!login) {
    return (
      'GitHub: account not connected for this user. Connect GitHub in Integrations before using github_* tools. ' +
      'Do not guess repository names.'
    );
  }
  return (
    `GitHub scope (enforced): only repositories owned by \`${login}\` (prefix \`${login}/\`). ` +
    `Never use SamPrimeaux/* or any other GitHub owner. ` +
    `Discover repos with agentsam_github_repo_list; do not invent paths under another user's org.`
  );
}

/**
 * Resolve repo for github_* tool calls — only the authenticated GitHub user's owner namespace.
 * @param {any} env
 * @param {{
 *   userId: string,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   requestedRepo?: string|null,
 * }} input
 * @returns {Promise<{ repo: string|null, reason?: string, blocked?: boolean }>}
 */
export async function resolveGithubRepoForToolCall(env, input) {
  const userId = trim(input.userId);
  const workspaceId = trim(input.workspaceId);
  const requested = trim(input.requestedRepo);

  if (!userId) {
    return { repo: null, blocked: true, reason: 'user_id_required' };
  }

  const [workspaceRepo, userLogin] = await Promise.all([
    workspaceId ? fetchWorkspaceGithubRepo(env, input.tenantId, workspaceId) : null,
    fetchUserGithubLogin(env, userId),
  ]);

  const userOwner = userLogin ? userLogin.toLowerCase() : '';
  if (!userOwner) {
    return {
      repo: null,
      blocked: true,
      reason: 'github_not_connected',
    };
  }

  const repoOwnedByUser = (repo) => {
    const owner = parseRepoOwner(repo);
    return !!(owner && owner === userOwner);
  };

  if (requested) {
    if (repoOwnedByUser(requested)) {
      return { repo: requested };
    }
    return {
      repo: null,
      blocked: true,
      reason: `repo_not_in_user_scope:${requested}`,
    };
  }

  if (workspaceRepo && repoOwnedByUser(workspaceRepo)) {
    return { repo: workspaceRepo };
  }

  return { repo: null, reason: 'no_repo_context_use_github_repo_list' };
}

/**
 * Sanitize client-selected repo context for chat (github_repo_context).
 * @param {any} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId?: string|null, clientRepo?: string|null }} input
 */
export async function sanitizeGithubRepoContextForChat(env, input) {
  const clientRepo = trim(input.clientRepo);
  if (!clientRepo) return null;
  const resolved = await resolveGithubRepoForToolCall(env, {
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestedRepo: clientRepo,
  });
  if (resolved.blocked || !resolved.repo) return null;
  return resolved.repo;
}
