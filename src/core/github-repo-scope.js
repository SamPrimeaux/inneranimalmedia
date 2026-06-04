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
 * Resolve repo for github_* tool calls — never return another user's default org repo.
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
  const tenantId = trim(input.tenantId);
  const workspaceId = trim(input.workspaceId);
  const requested = trim(input.requestedRepo);

  if (!userId) {
    return { repo: null, blocked: true, reason: 'user_id_required' };
  }

  const [workspaceRepo, userLogin] = await Promise.all([
    tenantId && workspaceId ? fetchWorkspaceGithubRepo(env, tenantId, workspaceId) : null,
    fetchUserGithubLogin(env, userId),
  ]);

  const workspaceOwner = workspaceRepo ? parseRepoOwner(workspaceRepo) : '';
  const requestedOwner = requested ? parseRepoOwner(requested) : '';
  const userOwner = userLogin ? userLogin.toLowerCase() : '';

  const ownerAllowed = (owner) => {
    if (!owner) return false;
    if (userOwner && owner === userOwner) return true;
    if (workspaceOwner && owner === workspaceOwner) return true;
    return false;
  };

  if (requested) {
    if (!ownerAllowed(requestedOwner)) {
      if (workspaceRepo && ownerAllowed(workspaceOwner)) {
        return { repo: workspaceRepo, reason: 'requested_repo_not_allowed_used_workspace_default' };
      }
      if (userOwner) {
        return { repo: null, blocked: true, reason: `repo_not_in_user_scope:${requested}` };
      }
      return { repo: null, blocked: true, reason: 'repo_owner_mismatch' };
    }
    return { repo: requested };
  }

  if (workspaceRepo) {
    if (!userOwner || ownerAllowed(workspaceOwner)) {
      return { repo: workspaceRepo };
    }
    return { repo: null, reason: 'workspace_repo_owner_mismatch' };
  }

  return { repo: null, reason: 'no_repo_context' };
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
