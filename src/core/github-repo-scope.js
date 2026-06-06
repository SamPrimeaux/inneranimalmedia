/**
 * Per-user / per-workspace GitHub repo scoping for Agent Sam tools.
 * Blocks platform operator repos (SamPrimeaux/inneranimalmedia) for other users.
 * Rewrites mistaken SamPrimeaux/<customer-repo> prefixes to the user's GitHub login.
 */
import { getUserGithubToken } from '../integrations/github.js';
import { getWorkspaceGithubRepo } from './agentsam-workspace.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Platform repos — never rewrite to another user's namespace; always deny cross-login access. */
const PLATFORM_REPO_SLUGS = new Set([
  'inneranimalmedia',
  'inneranimalmedia-mcp-server',
  'inneranimalmedia-agentsam-dashboard',
  'agentsam-cms-editor',
  'meauxcad',
]);

function parseRepoParts(repo) {
  const s = trim(repo);
  if (!s.includes('/')) {
    return { owner: '', slug: s };
  }
  const idx = s.indexOf('/');
  return {
    owner: s.slice(0, idx).trim().toLowerCase(),
    slug: s.slice(idx + 1).trim(),
  };
}

function fullRepo(ownerLogin, slug) {
  const o = trim(ownerLogin);
  const sl = trim(slug);
  if (!o || !sl) return null;
  return `${o}/${sl}`;
}

/**
 * @param {any} env
 * @param {string} tenantId
 * @param {string} workspaceId
 */
export async function fetchWorkspaceGithubRepo(env, tenantId, workspaceId) {
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return null;
  const repo = (await getWorkspaceGithubRepo(env, wid)) || '';
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
    `GitHub scope (enforced): your connected account is \`${login}\`. ` +
    `All repo paths must use \`${login}/<repo-name>\` (example: \`${login}/thermos-heat-and-air\`). ` +
    `Do not prefix customer repos with \`SamPrimeaux/\` — that org is the platform operator only (` +
    `\`SamPrimeaux/inneranimalmedia\`, etc.), not your personal repositories. ` +
    `Use agentsam_github_repo_list to list repos you own.`
  );
}

/**
 * Model often copies SamPrimeaux/ from platform docs when the user means their own repo slug.
 * @param {string} userLogin
 * @param {string} requested
 */
function rewriteMisattributedRepoOwner(userLogin, requested) {
  const login = trim(userLogin);
  if (!login) return null;
  const { owner, slug } = parseRepoParts(requested);
  if (!slug) return null;

  const slugLower = slug.toLowerCase();
  if (PLATFORM_REPO_SLUGS.has(slugLower)) {
    return null;
  }

  const loginLower = login.toLowerCase();
  if (owner === loginLower) {
    return fullRepo(login, slug);
  }

  if (!owner || owner === 'samprimeaux' || owner !== loginLower) {
    return fullRepo(login, slug);
  }

  return null;
}

/**
 * Resolve repo for github_* tool calls — user's GitHub login namespace only.
 * @param {any} env
 * @param {{
 *   userId: string,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   requestedRepo?: string|null,
 * }} input
 * @returns {Promise<{ repo: string|null, reason?: string, blocked?: boolean, rewritten_from?: string|null }>}
 */
export async function resolveGithubRepoForToolCall(env, input) {
  const userId = trim(input.userId);
  const workspaceId = trim(input.workspaceId);
  const requested = trim(input.requestedRepo);
  const isSuperadmin = input.isSuperadmin === true || input.is_superadmin === true;

  if (!userId) {
    return { repo: null, blocked: true, reason: 'user_id_required' };
  }

  if (requested && isSuperadmin) {
    const normalized = requested.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '');
    if (normalized.includes('/')) {
      return { repo: normalized, reason: 'superadmin_direct' };
    }
  }

  const [workspaceRepo, userLogin] = await Promise.all([
    workspaceId ? fetchWorkspaceGithubRepo(env, input.tenantId, workspaceId) : null,
    fetchUserGithubLogin(env, userId),
  ]);

  if (!userLogin) {
    return {
      repo: null,
      blocked: true,
      reason: 'github_not_connected',
    };
  }

  const userOwner = userLogin.toLowerCase();

  const acceptRepo = (repo, meta = {}) => {
    const full = trim(repo);
    if (!full || !full.includes('/')) return null;
    const owner = parseRepoParts(full).owner;
    if (owner !== userOwner) return null;
    return { repo: full, ...meta };
  };

  if (requested) {
    const direct = acceptRepo(requested);
    if (direct) return direct;

    const rewritten = rewriteMisattributedRepoOwner(userLogin, requested);
    if (rewritten) {
      const ok = acceptRepo(rewritten);
      if (ok) {
        return {
          ...ok,
          reason: 'rewrote_repo_owner_to_github_login',
          rewritten_from: requested,
        };
      }
    }

    const { slug } = parseRepoParts(requested);
    if (slug && PLATFORM_REPO_SLUGS.has(slug.toLowerCase())) {
      return {
        repo: null,
        blocked: true,
        reason: `platform_repo_denied:${requested}`,
      };
    }

    return {
      repo: null,
      blocked: true,
      reason: `repo_not_in_user_scope:${requested}`,
    };
  }

  if (workspaceRepo) {
    const ws = acceptRepo(workspaceRepo);
    if (ws) return ws;
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
