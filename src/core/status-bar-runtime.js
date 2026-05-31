/**
 * Status bar runtime contracts — live GitHub / PTY / tunnel probes (no deployments table).
 */
import { resolveTerminalWorkspaceId } from './bootstrap.js';
import { fetchAuthUserTenantId } from './auth.js';
import { resolveGitHubToken } from './github-token.js';

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

  const row = await env.DB.prepare(
    `SELECT github_repo FROM workspaces WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(tw.workspaceId, tenantId)
    .first()
    .catch(() => null);

  const repo = row?.github_repo != null ? String(row.github_repo).trim() : '';
  if (!repo || !repo.includes('/')) {
    return {
      error: 'no_github_repo',
      workspace_id: tw.workspaceId,
      status: 404,
    };
  }

  return { repo, workspace_id: tw.workspaceId, tenant_id: tenantId };
}

const GH_HEADERS_BASE = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'inneranimalmedia-status-bar/1.0',
};

/**
 * Live GitHub repo metadata for status bar (branch + repo from GET /repos/{owner}/{repo}).
 */
export async function fetchGitStatusFromGitHub(env, authUser, request, url) {
  const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, url);
  if (repoCtx.error) return repoCtx;

  const owner = repoCtx.repo.split('/')[0];
  const { token, error, status } = await resolveGitHubToken(authUser, env, owner);
  if (error) return { error, status: status || 401 };

  const ghRes = await fetch(`https://api.github.com/repos/${repoCtx.repo}`, {
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

  return {
    branch: gh?.default_branch != null ? String(gh.default_branch) : 'main',
    repo: fullName,
    repo_full_name: fullName,
    workspace_id: repoCtx.workspace_id,
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
