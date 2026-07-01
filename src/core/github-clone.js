/**
 * GitHub clone — run git clone on the healthy PTY lane, persist workspace_root.
 */
import { getUserGithubToken } from '../integrations/github.js';
import { getSelectedTerminalConnection, runTerminalCommand } from './terminal.js';
import {
  connectionUsesGcpRepoLayout,
  IAM_GCP_OPERATOR_REPO,
} from './host-workspace-paths.js';
import { loadWorkspaceRootFromSettings, loadWorkspaceSettingsJson } from './pty-workspace-paths.js';
import { resolveTerminalWorkspaceId } from './bootstrap.js';
import { resolvePtyTenantIdForUser } from './pty-workspace-paths.js';
import { getAuthUser } from './auth.js';
import {
  parseGithubCloneRef,
  buildGithubCloneShell,
  parseCloneShellResult,
  resolveGithubCloneParentDir,
} from './github-clone-parse.js';

export {
  parseGithubCloneRef,
  buildGithubCloneShell,
  parseCloneShellResult,
  resolveGithubCloneParentDir,
} from './github-clone-parse.js';

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} repoSlug
 * @param {string} repoPath
 */
export async function persistGithubCloneWorkspace(env, workspaceId, repoSlug, repoPath) {
  const wid = String(workspaceId || '').trim();
  const slug = String(repoSlug || '').trim();
  const path = String(repoPath || '').trim();
  if (!env?.DB || !wid || !slug || !path) return;

  await env.DB.prepare(
    `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
     VALUES (?, json_object('workspace_root', ?, 'github_repo', ?), unixepoch())
     ON CONFLICT(workspace_id) DO UPDATE SET
       settings_json = json_set(
         json_set(COALESCE(workspace_settings.settings_json, '{}'), '$.workspace_root', ?),
         '$.github_repo', ?
       ),
       updated_at = unixepoch()`,
  )
    .bind(wid, path, slug, path, slug)
    .run()
    .catch(() => null);

  await env.DB.prepare(
    `UPDATE workspaces SET github_repo = ?, updated_at = unixepoch() WHERE id = ?`,
  )
    .bind(slug, wid)
    .run()
    .catch(() => null);

  await env.DB.prepare(
    `UPDATE mcp_workspace_tokens
     SET repo_path = ?, updated_at = unixepoch()
     WHERE workspace_id = ? AND COALESCE(is_active, 1) = 1`,
  )
    .bind(path, wid)
    .run()
    .catch(() => null);
}

/**
 * @param {any} env
 * @param {Request} request
 * @param {{ repo?: string, workspace_id?: string|null, lane?: string|null }} body
 */
export async function cloneGithubRepository(env, request, body = {}) {
  const authUser = await getAuthUser(request, env);
  if (!authUser?.id) return { ok: false, error: 'unauthorized', status: 401 };

  const repoSlug = parseGithubCloneRef(body.repo || body.url || body.github_repo || '');
  if (!repoSlug) return { ok: false, error: 'invalid_github_ref', status: 400 };

  const tw = await resolveTerminalWorkspaceId(env, request, authUser, body.workspace_id);
  if (tw.error || !tw.workspaceId) {
    return { ok: false, error: tw.error || 'workspace_required', status: 400 };
  }
  const workspaceId = String(tw.workspaceId).trim();
  const userId = String(authUser.id).trim();
  let tenantId = await resolvePtyTenantIdForUser(env, authUser, userId);
  tenantId = tenantId != null ? String(tenantId).trim() : '';

  const tokenResult = await getUserGithubToken(env, userId);
  const token = tokenResult?.token ? String(tokenResult.token).trim() : '';

  const laneHint = String(body.lane || body.target_type || 'auto').trim().toLowerCase();
  const targetType =
    laneHint === 'local' || laneHint === 'user_hosted_tunnel'
      ? 'user_hosted_tunnel'
      : laneHint === 'remote' || laneHint === 'platform_vm'
        ? 'platform_vm'
        : 'auto';

  const sel = await getSelectedTerminalConnection(env.DB, {
    userId,
    workspaceId,
    tenantId: tenantId || null,
    targetType,
    healthAware: true,
  });

  const connection = sel?.connection;
  if (!connection?.id) {
    return {
      ok: false,
      error: sel?.error || 'terminal_unavailable',
      status: 503,
      body: { user_message: 'Connect a terminal lane (Local or Cloud) before cloning.' },
    };
  }

  const isGcp = connectionUsesGcpRepoLayout(connection);
  const settings = await loadWorkspaceSettingsJson(env, workspaceId);
  const existingRoot =
    settings?.workspace_root != null ? String(settings.workspace_root).trim() : await loadWorkspaceRootFromSettings(env, workspaceId);
  const workspacesRoot = sel?.health?.probe?.workspaces_root || null;
  const parentDir = resolveGithubCloneParentDir(isGcp, workspacesRoot, existingRoot);

  const shell = buildGithubCloneShell({ repoSlug, parentDir, token });
  const toolName = isGcp ? 'agentsam_terminal_remote' : 'agentsam_terminal_local';

  let output = '';
  let exitCode = 1;
  try {
    const run = await runTerminalCommand(env, request, shell, null, {
      execution_mode: 'pty',
      workspace_id: workspaceId,
      target_id: String(connection.id),
      target_type: String(connection.target_type || ''),
      tool_name: toolName,
    });
    output = run.output || '';
    exitCode = run.exitCode ?? 0;
  } catch (e) {
    return {
      ok: false,
      error: 'terminal_exec_failed',
      status: 500,
      detail: String(e?.message || e).slice(0, 500),
    };
  }

  const parsed = parseCloneShellResult(output);
  if (!parsed.ok) {
    const status =
      parsed.error === 'path_exists' ? 409 : parsed.error === 'github_auth_failed' ? 401 : 502;
    return {
      ok: false,
      error: parsed.error,
      status,
      detail: parsed.detail,
      repo_path: parsed.repoPath,
      exit_code: exitCode,
      lane: isGcp ? 'platform_vm' : 'user_hosted_tunnel',
    };
  }

  const repoPath = parsed.repoPath;
  await persistGithubCloneWorkspace(env, workspaceId, repoSlug, repoPath);

  return {
    ok: true,
    status: 200,
    github_repo: repoSlug,
    repo_path: repoPath,
    workspace_id: workspaceId,
    lane: isGcp ? 'platform_vm' : 'user_hosted_tunnel',
    parent_dir: parentDir,
    operator_repo: isGcp ? IAM_GCP_OPERATOR_REPO : null,
  };
}
