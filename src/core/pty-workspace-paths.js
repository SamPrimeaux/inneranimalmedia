/**
 * Terminal cwd resolution — workspace_settings.workspace_root (local) or operator repo (GCP remote).
 * GCP iam-tunnel: git clone at /home/samprimeaux/inneranimalmedia (agentsam user); ExecOS at /home/samprimeaux/ExecOS.
 */
import { assertWorkspaceTokenForPty } from './workspace-tokens.js';
import { runTerminalCommandViaHttpExec } from './terminal.js';
import {
  connectionUsesGcpRepoLayout,
  gcpRemoteExecCwd,
  IAM_GCP_EXECOS_HOME,
  IAM_GCP_OPERATOR_REPO,
  normalizeExecCwdForConnection,
  resolveRepoRootForHost,
  vmWorkspaceRootFromSettings,
} from './host-workspace-paths.js';
import { safePtyRepoDirName } from './safe-pty-repo-dir-name.js';

export { safePtyRepoDirName };

/** @deprecated Derive repo folder name from path tail — not a fixed platform repo name */
export const PTY_REPO_DIRNAME = 'inneranimalmedia';

const REMOTION_INSTALL_CMD =
  'npm install --save-dev remotion @remotion/renderer @remotion/bundler @remotion/player';

/**
 * @deprecated Removed — no tenant filesystem roots on infrastructure.
 */
export function ptyWorkspacesRootFromEnv(_env) {
  return null;
}

/**
 * @deprecated Removed — no /workspace/{tenant}/{user}/ layout.
 */
export function buildPtyUserWorkspaceRoot(_env, _ctx) {
  return null;
}

/**
 * @deprecated Use resolveTerminalCwd with workspaceId — sync stub returns null.
 */
export function buildPtySessionWorkingDir(_env, _ctx) {
  return null;
}

/**
 * @param {any} env
 * @param {{ id?: string, active_tenant_id?: string|null, tenant_id?: string|null } | null | undefined} authUser
 * @param {string} [userId]
 */
export async function resolvePtyTenantIdForUser(env, authUser, userId) {
  const fromUser =
    String(authUser?.active_tenant_id || '').trim() || String(authUser?.tenant_id || '').trim();
  if (fromUser) return fromUser;

  const uid = String(authUser?.id || userId || '').trim();
  if (!env?.DB || !uid) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(active_tenant_id), ''), NULLIF(TRIM(tenant_id), '')) AS tid
       FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    const tid = row?.tid != null ? String(row.tid).trim() : '';
    return tid || null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadWorkspaceRootFromSettings(env, workspaceId) {
  const wid = String(workspaceId || '').trim();
  if (!wid || !env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
    )
      .bind(wid)
      .first();
    if (!row?.settings_json) return null;
    const parsed = JSON.parse(String(row.settings_json));
    const root = typeof parsed?.workspace_root === 'string' ? parsed.workspace_root.trim() : '';
    return root || null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadWorkspaceSettingsJson(env, workspaceId) {
  const wid = String(workspaceId || '').trim();
  if (!wid || !env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
    )
      .bind(wid)
      .first();
    if (!row?.settings_json) return null;
    return JSON.parse(String(row.settings_json));
  } catch {
    return null;
  }
}

/**
 * Cwd resolution:
 * - user_hosted_tunnel / Mac local: workspace_settings.workspace_root
 * - platform_vm / GCP remote: IAM_GCP_OPERATOR_REPO (git clone on iam-tunnel)
 *
 * @param {any} env
 * @param {{ connection?: Record<string, unknown> | null, tenantId: string, userId: string, workspaceId?: string | null }} ctx
 */
export async function resolveTerminalCwd(env, { connection = null, tenantId, userId, workspaceId = null }) {
  const strategy = String(connection?.cwd_strategy || 'host_default').trim() || 'host_default';
  const forceGcp = connectionUsesGcpRepoLayout(connection);
  const wid = String(workspaceId || connection?.workspace_id || '').trim();
  const settings = wid ? await loadWorkspaceSettingsJson(env, wid) : null;

  if (strategy === 'custom') {
    return { cwd: null, strategy, unsupported: true };
  }

  if (forceGcp) {
    return { cwd: gcpRemoteExecCwd(settings), strategy: 'gcp_vm_workspace_root' };
  }

  if (wid) {
    const localRoot =
      settings && typeof settings.workspace_root === 'string'
        ? settings.workspace_root.trim()
        : '';
    if (localRoot) {
      return { cwd: localRoot, strategy: 'host_default' };
    }
    const fallback = await loadWorkspaceRootFromSettings(env, wid);
    if (fallback) {
      return { cwd: fallback, strategy: 'host_default' };
    }
  }

  if (strategy === 'user_home') {
    return { cwd: null, strategy };
  }

  // Legacy platform_workspace → no tenant path; null cwd (shell default)
  return { cwd: null, strategy: strategy === 'platform_workspace' ? 'host_default' : strategy };
}

/**
 * @param {string|null|undefined} candidate
 * @param {string|null|undefined} workspaceRoot
 */
export function deriveMoviemodeRepoRootFromCandidate(candidate, workspaceRoot) {
  const c = String(candidate || '').trim().replace(/[/\\]+$/, '');
  const ws = String(workspaceRoot || '').trim().replace(/[/\\]+$/, '');
  if (!c) return ws || null;
  if (ws && c === ws) return ws;
  return c;
}

async function loadActiveTerminalSessionCwd(env, userId, workspaceId) {
  if (!env?.DB || !userId || !workspaceId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT cwd FROM terminal_sessions
       WHERE user_id = ? AND workspace_id = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
      .bind(String(userId).trim(), String(workspaceId).trim())
      .first();
    const cwd = row?.cwd != null ? String(row.cwd).trim() : '';
    return cwd || null;
  } catch {
    return null;
  }
}

/**
 * MovieMode / Remotion export — user's local workspace_root from D1 (not VM clone).
 * @param {any} env
 * @param {{ tenantId: string, userId: string, workspaceId: string }} ctx
 */
export async function resolveMoviemodeRepoRootForSession(env, { tenantId, userId, workspaceId }) {
  const wid = String(workspaceId || '').trim();
  const uid = String(userId || '').trim();
  if (!uid || !wid) return null;

  const settings = await loadWorkspaceSettingsJson(env, wid);
  const workspaceRoot =
    (settings && typeof settings.workspace_root === 'string'
      ? settings.workspace_root.trim()
      : '') || (await loadWorkspaceRootFromSettings(env, wid));

  const candidates = [];

  // Prefer settings roots first — terminal_sessions.cwd is often the GCP twin
  // (/home/…/repo) while workspace_root is the Mac path (/Users/…/repo). Putting
  // session cwd first made safePtyRepoDirName emit `cd <basename>` against a cwd
  // that was already the repo.
  if (workspaceRoot) candidates.push({ path: workspaceRoot, source: 'workspace_settings.workspace_root' });
  const vmRoot =
    settings && typeof settings.vm_workspace_root === 'string'
      ? settings.vm_workspace_root.trim()
      : '';
  if (vmRoot) candidates.push({ path: vmRoot, source: 'workspace_settings.vm_workspace_root' });

  const tok = await assertWorkspaceTokenForPty(env, wid, tenantId);
  if (tok.ok && tok.repo_path) candidates.push({ path: tok.repo_path, source: 'mcp_workspace_tokens.repo_path' });

  const sessionCwd = await loadActiveTerminalSessionCwd(env, uid, wid);
  if (sessionCwd) candidates.push({ path: sessionCwd, source: 'terminal_sessions.cwd' });

  for (const c of candidates) {
    const repoRoot = deriveMoviemodeRepoRootFromCandidate(c.path, workspaceRoot);
    if (repoRoot) return { repoRoot, workspaceRoot: workspaceRoot || repoRoot, source: c.source };
  }

  return null;
}

/**
 * @param {any} env
 * @param {{ command: string, cwd?: string|null, timeout_ms?: number }} opts
 */
export async function execOnPtyHost(env, { command, cwd = null, timeout_ms = 120_000, userId = null }) {
  const payload = { command, stream: false, timeout_ms };
  let wd = cwd != null ? String(cwd).trim() : '';
  if (wd) {
    const { normalizeExecCwdForConnection } = await import('./host-workspace-paths.js');
    wd = normalizeExecCwdForConnection(wd, { platform: 'linux', target_type: 'platform_vm' }) || wd;
    payload.cwd = wd;
  }

  const execUrl = (() => {
    const raw = env?.PTY_EXEC_URL != null ? String(env.PTY_EXEC_URL).trim() : '';
    if (raw) return raw;
    const local = env?.PTY_EXEC_URL_LOCAL != null ? String(env.PTY_EXEC_URL_LOCAL).trim() : '';
    if (local) return local;
    const tunnel = env?.PTY_EXEC_URL_TUNNEL != null ? String(env.PTY_EXEC_URL_TUNNEL).trim() : '';
    if (tunnel) return tunnel;
    return 'http://localhost:3099/exec';
  })();

  if (env?.PTY_SERVICE) {
    try {
      const res = await env.PTY_SERVICE.fetch(
        new Request(execUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-IAM-Exec-Identity': 'agentsam',
            'X-IAM-Privileged-Target': 'conn_gcp_iam_tunnel',
            ...(userId ? { 'X-User-Id': String(userId).trim() } : {}),
          },
          body: JSON.stringify(payload),
        }),
      );
      const data = await res.json().catch(() => ({}));
      return {
        ok: res.ok,
        stdout: typeof data.stdout === 'string' ? data.stdout : '',
        stderr: typeof data.stderr === 'string' ? data.stderr : '',
        exit_code: Number.isFinite(Number(data.exit_code)) ? Number(data.exit_code) : res.ok ? 0 : 1,
      };
    } catch (e) {
      return { ok: false, stdout: '', stderr: String(e?.message || e), exit_code: 1 };
    }
  }

  const cmd = wd ? `cd ${JSON.stringify(wd)} && ${command}` : command;
  const fb = await runTerminalCommandViaHttpExec(env, cmd);
  return {
    ok: !!fb.ok,
    stdout: fb.ok ? fb.text || '' : '',
    stderr: fb.ok ? '' : fb.text || 'exec failed',
    exit_code: fb.exitCode ?? (fb.ok ? 0 : 1),
  };
}

/**
 * @param {any} env
 * @param {string} repoRoot
 */
export async function validateMoviemodeRepoOnPty(env, repoRoot, ctx = {}) {
  const root = String(repoRoot || '').trim();
  const uid = String(ctx?.userId || '').trim();
  if (!root || !uid) {
    return {
      ok: false,
      errorCode: 'workspace_context_missing',
      message: 'Could not resolve local workspace for export',
    };
  }

  const repoProbe = await execOnPtyHost(env, {
    cwd: root,
    command: 'test -f scripts/moviemode-remotion-render.mjs && test -f package.json && echo REPO_OK || echo REPO_MISSING',
    timeout_ms: 30_000,
  });
  const repoOut = `${repoProbe.stdout}\n${repoProbe.stderr}`;
  if (!repoOut.includes('REPO_OK')) {
    return {
      ok: false,
      errorCode: 'repo_not_found_in_workspace',
      expectedPath: root,
      message:
        'Repo not found at workspace_settings.workspace_root on your machine. Clone locally, then retry export.',
      uiHint: 'clone_repo_on_local_machine',
    };
  }

  const depProbe = await execOnPtyHost(env, {
    cwd: root,
    command:
      'test -f node_modules/@remotion/renderer/package.json && echo REMOTION_OK || echo REMOTION_MISSING',
    timeout_ms: 30_000,
  });
  const depOut = `${depProbe.stdout}\n${depProbe.stderr}`;
  if (!depOut.includes('REMOTION_OK')) {
    return {
      ok: false,
      errorCode: 'remotion_deps_missing',
      expectedPath: root,
      installCommand: REMOTION_INSTALL_CMD,
      message: `Remotion packages are not installed in ${root}. Run: ${REMOTION_INSTALL_CMD}`,
      uiHint: 'install_remotion_deps',
    };
  }

  return { ok: true, repoRoot: root };
}

export { REMOTION_INSTALL_CMD, IAM_GCP_EXECOS_HOME, IAM_GCP_OPERATOR_REPO, vmWorkspaceRootFromSettings, resolveRepoRootForHost, normalizeExecCwdForConnection };
