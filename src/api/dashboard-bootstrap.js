/**
 * GET /api/dashboard/bootstrap — single authenticated round-trip for dashboard mount.
 * L1 envelope only: session, workspaces, status bar, theme, client config.
 * Agent domain (policy, models) → L2 endpoints under /api/agent/* and /api/settings/*.
 */
import { jsonResponse, authContextToLegacyUser, syncSessionWorkspaceId } from '../core/auth.js';
import { buildCanonicalAuthMe } from './auth-me.js';
import { fetchSandboxRuntimeSummary } from './sandbox-api.js';
import { gitStatusFromWorkspaceMetadata } from '../core/workspace-git-meta.js';
import { pingTunnelHealth } from '../core/status-bar-runtime.js';
import { resolveDashboardBootstrapTheme } from '../core/cms-theme-bootstrap-payload.js';
import { buildOperationalIdentitySnapshot } from '../core/operational-identity.js';

/** @type {readonly string[]} */
export const DASHBOARD_BOOTSTRAP_L1_KEYS = Object.freeze([
  'ok',
  'fetched_at',
  'me',
  'workspaces',
  'identity',
  'status',
  'theme',
  'client',
  '_meta',
]);

/**
 * @param {Request} request
 * @param {any} env
 * @param {import('../core/auth.js').AuthContext} authCtx
 */
export async function handleDashboardBootstrap(request, env, authCtx) {
  if (request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authUser = authContextToLegacyUser(authCtx);
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userId = String(authUser.id);

  const identitySnapshot = await buildOperationalIdentitySnapshot(env, authCtx);
  const workspaceId = identitySnapshot.workspace_id;

  const sessionWs =
    authCtx?.sessionRaw?.workspace_id != null
      ? String(authCtx.sessionRaw.workspace_id).trim()
      : null;
  if (
    workspaceId &&
    sessionWs &&
    sessionWs !== workspaceId &&
    authCtx?.sessionId &&
    authCtx?.authType === 'session'
  ) {
    try {
      await syncSessionWorkspaceId(env, request, userId, workspaceId);
      if (env?.DB) {
        await env.DB.prepare(
          `UPDATE auth_users SET active_workspace_id = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(workspaceId, userId)
          .run()
          .catch(() => null);
      }
    } catch (e) {
      console.warn('[dashboard/bootstrap] session workspace sync', e?.message ?? e);
    }
  }

  const supabaseUrl = env?.SUPABASE_URL != null ? String(env.SUPABASE_URL).trim().replace(/\/$/, '') : '';
  const supabaseAnonKey =
    env?.SUPABASE_ANON_KEY != null ? String(env.SUPABASE_ANON_KEY).trim() : '';

  const [
    meSettled,
    workspaceRowsSettled,
    notificationsSettled,
    gitSettled,
    problemsSettled,
    tunnelSettled,
    sandboxSettled,
    themeSettled,
  ] = await Promise.allSettled([
    buildCanonicalAuthMe(env, request, {
      ...authUser,
      active_workspace_id: workspaceId,
      workspace_id: workspaceId,
      capabilities: identitySnapshot.capabilities,
    }),

    env?.DB
      ? env.DB.prepare(
          `SELECT w.id, w.name, w.handle AS slug, w.status, w.github_repo,
                  w.database_studio_name
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
            WHERE wm.user_id = ?
              AND COALESCE(wm.is_active, 1) = 1
            ORDER BY wm.joined_at ASC`,
        )
          .bind(userId)
          .all()
          .then((r) => r.results || [])
          .catch(() => [])
      : Promise.resolve([]),

    env?.DB
      ? env.DB.prepare(
          `SELECT id, title, type, message, created_at
             FROM agent_notifications
            WHERE user_id = ? AND read_at IS NULL
            ORDER BY created_at DESC LIMIT 20`,
        )
          .bind(userId)
          .all()
          .then((r) => r.results || [])
          .catch(() => [])
      : Promise.resolve([]),

    env?.DB
      ? env.DB.prepare(
          `SELECT metadata_json FROM agentsam_workspace WHERE tenant_id = ? LIMIT 1`,
        )
          .bind(authUser.tenant_id || '')
          .first()
          .then((ws) => {
            try {
              const meta = JSON.parse(ws?.metadata_json || '{}');
              return gitStatusFromWorkspaceMetadata(meta);
            } catch {
              return { branch: null, repo_full_name: null, git_hash: null };
            }
          })
          .catch(() => ({ branch: null, repo_full_name: null, git_hash: null }))
      : Promise.resolve({ branch: null, repo_full_name: null, git_hash: null }),

    env?.DB
      ? env.DB.prepare(
          `SELECT id, error_message, path, created_at
             FROM worker_analytics_errors
            ORDER BY created_at DESC LIMIT 8`,
        )
          .all()
          .then((r) => r.results || [])
          .catch(() => [])
      : Promise.resolve([]),

    pingTunnelHealth(env).catch(() => ({ healthy: false, status: 'unknown' })),

    fetchSandboxRuntimeSummary(env),

    resolveDashboardBootstrapTheme(env, authUser, workspaceId).catch(() => null),
  ]);

  const me = meSettled.status === 'fulfilled' ? meSettled.value : null;
  const workspaceRows = workspaceRowsSettled.status === 'fulfilled' ? workspaceRowsSettled.value : [];
  const notifications =
    notificationsSettled.status === 'fulfilled' ? notificationsSettled.value : [];
  const git = gitSettled.status === 'fulfilled' ? gitSettled.value : null;
  const problems = problemsSettled.status === 'fulfilled' ? problemsSettled.value : [];
  const tunnel = tunnelSettled.status === 'fulfilled' ? tunnelSettled.value : null;
  const sandbox = sandboxSettled.status === 'fulfilled' ? sandboxSettled.value : null;
  const theme = themeSettled.status === 'fulfilled' ? themeSettled.value : null;

  const terminal = identitySnapshot.terminal;
  const parallelQueries = 7;

  const gitWithRepo =
    git && identitySnapshot.github_repo && !git.repo_full_name
      ? { ...git, repo_full_name: identitySnapshot.github_repo }
      : git;

  return jsonResponse({
    ok: true,
    fetched_at: Date.now(),
    me,
    identity: {
      workspace_id: workspaceId,
      tenant_id: identitySnapshot.tenant_id,
      github_repo: identitySnapshot.github_repo,
      capabilities: identitySnapshot.capabilities,
    },
    workspaces: {
      data: workspaceRows,
      current: workspaceId,
      current_source: workspaceId ? 'operational_identity.workspace_id' : null,
    },
    status: {
      health: { status: 'ok', worker: 'inneranimalmedia' },
      sandbox: sandbox || { ok: false },
      notifications,
      git: gitWithRepo,
      problems: {
        worker_errors: problems,
        mcp_tool_errors: [],
        audit_failures: [],
        checked_at: new Date().toISOString(),
      },
      tunnel,
      terminal,
    },
    theme,
    client:
      supabaseUrl && supabaseAnonKey
        ? { supabaseUrl, supabaseAnonKey, supabase_url: supabaseUrl, supabase_anon_key: supabaseAnonKey }
        : null,
    _meta: {
      l1_version: 3,
      parallel_queries: parallelQueries,
      l2_excluded: ['agent_policy', 'agent_models', 'default_model'],
    },
  });
}
