/**
 * Status bar runtime contracts — live GitHub / PTY / tunnel probes (no deployments table).
 */
import { resolveTerminalWorkspaceId } from './bootstrap.js';
import { fetchAuthUserTenantId } from './auth.js';
import { userCanAccessWorkspace } from './cms-theme-resolve.js';
import { resolveGitHubToken } from './github-token.js';
import { getWorkspaceGithubRepo } from './agentsam-workspace.js';
import { persistUserGitActiveBranch, readUserGitActiveBranch } from './workspace-user-prefs.js';

const GH_HEADERS_BASE = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'inneranimalmedia-status-bar/1.0',
};

async function resolveAuthTenantId(env, authUser) {
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  const uid = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!uid || !env?.DB) return '';
  let tid = await fetchAuthUserTenantId(env, uid).catch(() => null);
  if (!tid && authUser?.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email).catch(() => null);
  }
  return tid != null ? String(tid).trim() : '';
}

/**
 * Resolve github_repo for the authenticated user's active workspace (tenant-scoped).
 * @returns {Promise<{ repo?: string, workspace_id?: string, tenant_id?: string, error?: string, status?: number }>}
 */
export async function fetchWorkspaceGithubRepo(env, authUser, request, url) {
  if (!env?.DB) return { error: 'DB not configured', status: 503 };

  const tw = await resolveTerminalWorkspaceId(
    env,
    request,
    authUser,
    url.searchParams.get('workspace_id'),
  );
  if (!tw.workspaceId) {
    const code = tw.error === 'Forbidden' ? 403 : 400;
    return { error: tw.error || 'workspace_missing', status: code };
  }

  const tenantId = await resolveAuthTenantId(env, authUser);
  if (!tenantId) return { error: 'tenant_missing', status: 403 };

  const repo = (await getWorkspaceGithubRepo(env, tw.workspaceId)) || '';
  if (!repo || !repo.includes('/')) {
    return {
      error: 'no_github_repo',
      workspace_id: tw.workspaceId,
      status: 200,
    };
  }

  return { repo, workspace_id: tw.workspaceId, tenant_id: tenantId };
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {Promise<string|null>}
 */
export async function readUserWorkspaceActiveBranch(env, userId, workspaceId) {
  return readUserGitActiveBranch(env, userId, workspaceId);
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} branch
 */
export async function persistUserWorkspaceActiveBranch(env, userId, workspaceId, branch) {
  return persistUserGitActiveBranch(env, userId, workspaceId, branch);
}

async function githubBranchExists(repoSlug, branch, token) {
  const enc = encodeURIComponent(String(branch || '').trim());
  if (!enc || !repoSlug || !token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repoSlug}/branches/${enc}`, {
      headers: { ...GH_HEADERS_BASE, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Compare tracking branch (default) vs active branch for status-bar sync arrows.
 * @param {string} repoSlug
 * @param {string} token
 * @param {string} base
 * @param {string} head
 */
async function fetchGithubBranchCompare(repoSlug, token, base, head) {
  const b = String(base || '').trim();
  const h = String(head || '').trim();
  if (!repoSlug || !token || !b || !h) return { ahead_by: null, behind_by: null };
  if (b === h) return { ahead_by: 0, behind_by: 0 };
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoSlug}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`,
      { headers: { ...GH_HEADERS_BASE, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { ahead_by: null, behind_by: null };
    const j = await res.json().catch(() => ({}));
    return {
      ahead_by: typeof j.ahead_by === 'number' ? j.ahead_by : null,
      behind_by: typeof j.behind_by === 'number' ? j.behind_by : null,
    };
  } catch {
    return { ahead_by: null, behind_by: null };
  }
}

/**
 * Resolve display branch: user preference (D1) when valid on GitHub, else repo default_branch.
 * @param {any} env
 * @param {{ id?: string }} authUser
 * @param {{ repo: string, workspace_id: string }} repoCtx
 * @param {string} token
 * @param {string} defaultBranch
 */
export async function resolveWorkspaceGitBranch(env, authUser, repoCtx, token, defaultBranch) {
  const userId = authUser?.id != null ? String(authUser.id).trim() : '';
  const workspaceId = repoCtx?.workspace_id != null ? String(repoCtx.workspace_id).trim() : '';
  const repoSlug = String(repoCtx?.repo || '').replace('https://github.com/', '').trim();
  const fallback = defaultBranch != null && String(defaultBranch).trim() !== ''
    ? String(defaultBranch).trim()
    : 'main';

  const persisted = userId && workspaceId
    ? await readUserWorkspaceActiveBranch(env, userId, workspaceId)
    : null;

  if (persisted && (await githubBranchExists(repoSlug, persisted, token))) {
    return {
      branch: persisted,
      default_branch: fallback,
      active_branch: persisted,
      branch_source: 'user',
    };
  }

  return {
    branch: fallback,
    default_branch: fallback,
    active_branch: persisted,
    branch_source: 'default',
  };
}

/**
 * POST body: { branch, workspace_id? } — persist per-user active branch for workspace repo.
 */
export async function setUserWorkspaceActiveBranch(env, authUser, request, body) {
  if (!env?.DB) return { error: 'DB not configured', status: 503 };
  const userId = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!userId) return { error: 'Unauthorized', status: 401 };

  const branch = body?.branch != null ? String(body.branch).trim() : '';
  if (!branch) return { error: 'branch required', status: 400 };

  const url = new URL(request.url);
  const explicitWs = body?.workspace_id != null ? String(body.workspace_id).trim() : '';
  const tw = await resolveTerminalWorkspaceId(
    env,
    request,
    authUser,
    explicitWs || url.searchParams.get('workspace_id'),
  );
  if (!tw.workspaceId) {
    return { error: tw.error || 'workspace_missing', status: tw.error === 'Forbidden' ? 403 : 400 };
  }
  if (!(await userCanAccessWorkspace(env, authUser, tw.workspaceId))) {
    return { error: 'Forbidden', status: 403 };
  }

  const scopedUrl = new URL(request.url);
  scopedUrl.searchParams.set('workspace_id', tw.workspaceId);
  const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, scopedUrl);
  if (repoCtx.error === 'no_github_repo') {
    return { error: 'no_github_repo', workspace_id: tw.workspaceId, status: 400 };
  }
  if (repoCtx.error) {
    return { error: repoCtx.error, status: repoCtx.status || 500 };
  }

  const owner = repoCtx.repo.split('/')[0];
  const { token, error, status } = await resolveGitHubToken(authUser, env, owner);
  if (error) return { error, status: status || 401 };

  const repoSlug = repoCtx.repo.replace('https://github.com/', '');
  if (!(await githubBranchExists(repoSlug, branch, token))) {
    return { error: 'branch_not_found', branch, repo: repoCtx.repo, status: 404 };
  }

  await persistUserWorkspaceActiveBranch(env, userId, tw.workspaceId, branch);
  return {
    ok: true,
    branch,
    workspace_id: tw.workspaceId,
    repo: repoCtx.repo,
    branch_source: 'user',
  };
}

async function readWorkspaceGitCache(env, workspaceId) {
  if (!env?.DB || !workspaceId) return null;
  const row = await env.DB.prepare(
    `SELECT checkpoint_sha, checkpoint_label, updated_at, last_agent_action
     FROM agentsam_workspace_state
     WHERE workspace_id = ?
     LIMIT 1`,
  )
    .bind(workspaceId)
    .first()
    .catch(() => null);
  return row || null;
}

/**
 * Agent git status bar — live GitHub when token/repo available; D1 cache otherwise. Never 404.
 */
export async function fetchAgentGitStatus(env, authUser, request, url) {
  const tw = await resolveTerminalWorkspaceId(
    env,
    request,
    authUser,
    url.searchParams.get('workspace_id'),
  );
  const workspaceId = tw.workspaceId || null;
  if (!workspaceId) {
    return {
      status: 'no_workspace',
      branch: null,
      repo: null,
      repo_full_name: null,
      workspace_id: null,
      dirty: false,
    };
  }

  const cached = await readWorkspaceGitCache(env, workspaceId);
  const branchFromCache =
    cached?.checkpoint_label != null && String(cached.checkpoint_label).trim() !== ''
      ? String(cached.checkpoint_label).trim()
      : 'main';
  const lastUpdated = cached?.updated_at != null ? Number(cached.updated_at) : null;

  const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, url);
  if (repoCtx.error === 'no_github_repo') {
    return {
      status: 'no_repo',
      branch: branchFromCache,
      repo: null,
      repo_full_name: null,
      workspace_id: workspaceId,
      dirty: false,
      last_updated: lastUpdated,
      checkpoint_sha: cached?.checkpoint_sha ?? null,
    };
  }
  if (repoCtx.error) {
    return {
      status: 'cached',
      branch: branchFromCache,
      repo: repoCtx.repo ?? null,
      repo_full_name: repoCtx.repo ?? null,
      workspace_id: workspaceId,
      dirty: false,
      last_updated: lastUpdated,
      checkpoint_sha: cached?.checkpoint_sha ?? null,
      detail: repoCtx.error,
    };
  }

  const owner = repoCtx.repo.split('/')[0];
  const { token, error } = await resolveGitHubToken(authUser, env, owner);
  if (error || !token) {
    return {
      status: 'cached',
      branch: branchFromCache,
      repo: repoCtx.repo,
      repo_full_name: repoCtx.repo,
      workspace_id: workspaceId,
      dirty: false,
      last_updated: lastUpdated,
      checkpoint_sha: cached?.checkpoint_sha ?? null,
    };
  }

  const live = await fetchGitStatusFromGitHub(env, authUser, request, url);
  if (live.error) {
    return {
      status: 'cached',
      branch: branchFromCache,
      repo: repoCtx.repo,
      repo_full_name: repoCtx.repo,
      workspace_id: workspaceId,
      dirty: false,
      last_updated: lastUpdated,
      checkpoint_sha: cached?.checkpoint_sha ?? null,
      detail: live.error,
    };
  }

  return {
    status: 'live',
    branch: live.branch,
    default_branch: live.default_branch ?? live.branch,
    active_branch: live.active_branch ?? null,
    branch_source: live.branch_source ?? 'default',
    repo: live.repo,
    repo_full_name: live.repo_full_name,
    workspace_id: live.workspace_id || workspaceId,
    dirty: false,
    last_updated: lastUpdated,
    checkpoint_sha: cached?.checkpoint_sha ?? null,
    ahead_by: live.ahead_by ?? null,
    behind_by: live.behind_by ?? null,
    tracking_branch: live.tracking_branch ?? live.default_branch ?? live.branch,
  };
}

/**
 * Live GitHub repo metadata for status bar (branch + repo from GET /repos/{owner}/{repo}).
 */
export async function fetchGitStatusFromGitHub(env, authUser, request, url) {
  const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, url);
  if (repoCtx.error) return repoCtx;

  const owner = repoCtx.repo.split('/')[0];
  const { token, error, status } = await resolveGitHubToken(authUser, env, owner);
  if (error) return { error, status: status || 401 };

  const repoSlug = repoCtx.repo.replace('https://github.com/', '');
  const ghRes = await fetch(`https://api.github.com/repos/${repoSlug}`, {
    headers: { ...GH_HEADERS_BASE, Authorization: `Bearer ${token}` },
  });

  if (!ghRes.ok) {
    const detail = await ghRes.text().catch(() => '');
    return {
      error: 'github_api',
      status: ghRes.status >= 400 && ghRes.status < 500 ? ghRes.status : 502,
      detail: detail.slice(0, 300),
      workspace_id: repoCtx.workspace_id,
    };
  }

  const gh = await ghRes.json().catch(() => ({}));
  const fullName =
    gh?.full_name != null && String(gh.full_name).trim() !== ''
      ? String(gh.full_name).trim()
      : repoCtx.repo;
  const defaultBranch = gh?.default_branch != null ? String(gh.default_branch) : 'main';
  const resolved = await resolveWorkspaceGitBranch(env, authUser, repoCtx, token, defaultBranch);
  const compare = await fetchGithubBranchCompare(repoSlug, token, defaultBranch, resolved.branch);

  return {
    branch: resolved.branch,
    default_branch: resolved.default_branch,
    active_branch: resolved.active_branch,
    branch_source: resolved.branch_source,
    repo: fullName,
    repo_full_name: fullName,
    workspace_id: repoCtx.workspace_id,
    ahead_by: compare.ahead_by,
    behind_by: compare.behind_by,
    tracking_branch: defaultBranch,
  };
}

/**
 * Live PTY backend probe via env.PTY_SERVICE (no D1).
 * @returns {Promise<{ status: 'connected' | 'disconnected' }>}
 */
export async function pingPtyServiceHealth(env) {
  if (!env?.PTY_SERVICE) return { status: 'disconnected' };
  const paths = ['/health', 'http://localhost/health', 'http://localhost:3099/health'];
  for (const path of paths) {
    try {
      const target = path.startsWith('http') ? path : `http://localhost${path}`;
      const res = await env.PTY_SERVICE.fetch(new Request(target, { method: 'GET' }));
      if (res.ok) return { status: 'connected' };
    } catch {
      /* try next path */
    }
  }
  return { status: 'disconnected' };
}

/**
 * Tunnel health — fetch TERMINAL_WS_URL/health when configured; else derive from PTY (binary).
 * @returns {Promise<{ healthy: boolean, status: 'connected' | 'disconnected' }>}
 */
export async function pingTunnelHealth(env) {
  const wsUrl = String(env?.TERMINAL_WS_URL || '').trim().replace(/\/$/, '');
  if (wsUrl) {
    try {
      const res = await fetch(`${wsUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { healthy: true, status: 'connected' };
    } catch {
      /* fall through — PTY-derived binary */
    }
  }

  const pty = await pingPtyServiceHealth(env);
  const up = pty.status === 'connected';
  return { healthy: up, status: up ? 'connected' : 'disconnected' };
}
