/**
 * PTY per-user workspace paths — same layout as iam-pty (/workspace/{tenant_id}/{user_id}/…).
 * MovieMode Remotion renders run inside {workspaceRoot}/inneranimalmedia (no per-user Worker secrets).
 */
import { assertWorkspaceTokenForPty } from './workspace-tokens.js';
import { runTerminalCommandViaHttpExec } from './terminal.js';

export const PTY_REPO_DIRNAME = 'inneranimalmedia';
const REMOTION_INSTALL_CMD =
  'npm install --save-dev remotion @remotion/renderer @remotion/bundler @remotion/player';

/** Platform PTY mount (iam-pty `IAM_WORKSPACES_ROOT`); not a per-customer secret. */
export function ptyWorkspacesRootFromEnv(env) {
  const r = env?.IAM_WORKSPACES_ROOT != null ? String(env.IAM_WORKSPACES_ROOT).trim() : '';
  return r || '/workspace';
}

/**
 * Resolve tenant for PTY isolation from the authenticated user — never from workspace lookup.
 * Prefers auth_users.active_tenant_id, then tenant_id.
 * @param {any} env
 * @param {{ id?: string, active_tenant_id?: string|null, tenant_id?: string|null } | null | undefined} authUser
 * @param {string} [userId]
 * @returns {Promise<string | null>}
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
 * Isolated PTY cwd root for one user: /workspace/tenant_…/au_…
 * @param {any} env
 * @param {{ tenantId: string, userId: string }} ctx
 */
export function buildPtyUserWorkspaceRoot(env, { tenantId, userId }) {
  const tid = String(tenantId || '').trim();
  const uid = String(userId || '').trim();
  if (!tid || !uid) return null;
  const base = ptyWorkspacesRootFromEnv(env).replace(/\/+$/, '');
  return `${base}/${tid}/${uid}`;
}

/**
 * PTY session working directory — always /workspace/{tenant_id}/{user_id}/
 * @param {any} env
 * @param {{ tenantId: string, userId: string }} ctx
 * @returns {string | null}
 */
export function buildPtySessionWorkingDir(env, { tenantId, userId }) {
  const root = buildPtyUserWorkspaceRoot(env, { tenantId, userId });
  if (!root) return null;
  return `${root}/`;
}

/**
 * Resolve PTY cwd from connection target + cwd_strategy.
 * @param {any} env
 * @param {{ connection?: Record<string, unknown> | null, tenantId: string, userId: string }} ctx
 * @returns {{ cwd: string | null, strategy: string }}
 */
export function resolveTerminalCwd(env, { connection = null, tenantId, userId }) {
  const targetType = String(connection?.target_type || 'platform_vm').trim();
  const strategy = String(connection?.cwd_strategy || 'platform_workspace').trim() || 'platform_workspace';
  const platform = String(connection?.platform || 'linux').trim().toLowerCase();
  const isWindows = platform === 'windows' || platform === 'win32';

  if (strategy === 'custom') {
    return { cwd: null, strategy, unsupported: true };
  }

  if (targetType === 'platform_vm' || strategy === 'platform_workspace') {
    const cwd = buildPtySessionWorkingDir(env, { tenantId, userId });
    return { cwd, strategy: strategy === 'custom' ? 'platform_workspace' : strategy };
  }

  if (targetType === 'user_hosted_tunnel') {
    if (strategy === 'user_home' || strategy === 'host_default') {
      return { cwd: null, strategy };
    }
    if (strategy === 'platform_workspace' && !isWindows) {
      const cwd = buildPtySessionWorkingDir(env, { tenantId, userId });
      return { cwd, strategy };
    }
    return { cwd: null, strategy };
  }

  const cwd = buildPtySessionWorkingDir(env, { tenantId, userId });
  return { cwd, strategy };
}

/**
 * @param {string|null|undefined} candidate
 * @param {string|null|undefined} workspaceRoot
 */
export function deriveMoviemodeRepoRootFromCandidate(candidate, workspaceRoot) {
  const c = String(candidate || '').trim().replace(/\/+$/, '');
  const ws = String(workspaceRoot || '').trim().replace(/\/+$/, '');
  if (!c) return ws ? `${ws}/${PTY_REPO_DIRNAME}` : null;
  if (c.endsWith(`/${PTY_REPO_DIRNAME}`)) return c;
  if (ws && c === ws) return `${ws}/${PTY_REPO_DIRNAME}`;
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
 * Resolve Remotion repo root for MovieMode export (same rules as terminal PTY cwd).
 * @param {any} env
 * @param {{ tenantId: string, userId: string, workspaceId: string }} ctx
 * @returns {Promise<{ repoRoot: string, workspaceRoot: string, source: string } | null>}
 */
export async function resolveMoviemodeRepoRootForSession(env, { tenantId, userId, workspaceId }) {
  const wid = String(workspaceId || '').trim();
  const uid = String(userId || '').trim();
  let tid = String(tenantId || '').trim();
  if (!tid && uid) {
    tid = String((await resolvePtyTenantIdForUser(env, null, uid)) || '').trim();
  }
  if (!tid || !uid || !wid) return null;

  const workspaceRoot = buildPtyUserWorkspaceRoot(env, { tenantId: tid, userId: uid });
  if (!workspaceRoot) return null;

  const candidates = [];

  const tok = await assertWorkspaceTokenForPty(env, wid, tid);
  if (tok.ok && tok.repo_path) candidates.push({ path: tok.repo_path, source: 'mcp_workspace_tokens.repo_path' });

  const sessionCwd = await loadActiveTerminalSessionCwd(env, uid, wid);
  if (sessionCwd) candidates.push({ path: sessionCwd, source: 'terminal_sessions.cwd' });

  candidates.push({ path: workspaceRoot, source: 'pty_workspace_layout' });

  for (const c of candidates) {
    const repoRoot = deriveMoviemodeRepoRootFromCandidate(c.path, workspaceRoot);
    if (repoRoot) return { repoRoot, workspaceRoot, source: c.source };
  }

  return {
    repoRoot: `${workspaceRoot}/${PTY_REPO_DIRNAME}`,
    workspaceRoot,
    source: 'pty_workspace_layout',
  };
}

/**
 * @param {any} env
 * @param {{ command: string, cwd?: string|null, timeout_ms?: number }} opts
 */
export async function execOnPtyHost(env, { command, cwd = null, timeout_ms = 120_000 }) {
  const payload = { command, stream: false, timeout_ms };
  const wd = cwd != null ? String(cwd).trim() : '';
  if (wd) payload.cwd = wd;

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
          headers: { 'Content-Type': 'application/json' },
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
      message: 'Could not resolve PTY workspace for export',
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
        'GitHub repo not found in your PTY workspace. Clone or sync inneranimalmedia into the workspace shown in Terminal, then retry export.',
      uiHint: 'clone_repo_into_workspace',
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

export { REMOTION_INSTALL_CMD };
