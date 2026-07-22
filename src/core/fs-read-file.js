/**
 * workspace_read spine — prefer dashboard buffer, then scoped PTY (host or VM).
 *
 * Data plane priority:
 * 1. active_file_content in runContext (local Mac / Monaco — no VM clone)
 * 2. Absolute path on PTY host (user machine workspace_root)
 * 3. GitHub API via agentsam_github_read when PTY path unavailable
 */
import { escapeShellSingleQuoted } from './fs-search-rg-parse.js';
import { FS_SEARCH_PTY_REPO_DIR } from './fs-search-rg-parse.js';

export const FS_READ_MAX_BYTES = 512_000;

/**
 * @param {string} relPath
 * @param {string} [repoDir]
 */
export function buildPtyReadFileCommand(relPath, repoDir = FS_SEARCH_PTY_REPO_DIR) {
  const raw = String(relPath || '').trim();
  if (!raw || /\.\./.test(raw) || /^[~\/]/.test(raw)) return null;
  const p = raw.replace(/^\.?\//, '');
  if (!p || p.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  if (!/^[a-zA-Z0-9_./-]+$/.test(p)) return null;
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR || '.').trim() || '.';
  // "." = PTY cwd is already the repo (control-plane sets workspace/vm root).
  if (dir !== '.' && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(dir)) return null;
  const escapedPath = escapeShellSingleQuoted(p);
  if (dir === '.') {
    // No nested cd — avoids `cd: inneranimalmedia: No such file or directory`.
    return `head -c ${FS_READ_MAX_BYTES} -- ${escapedPath}`;
  }
  const escapedDir = escapeShellSingleQuoted(dir);
  return `cd ${escapedDir} && head -c ${FS_READ_MAX_BYTES} -- ${escapedPath}`;
}

/**
 * Read via absolute path on the PTY host (operator Mac layout — not VM clone dir).
 * @param {string} absPath
 */
export function buildPtyReadAbsoluteCommand(absPath) {
  const p = String(absPath || '').trim();
  if (!p || /\.\./.test(p) || !p.startsWith('/')) return null;
  if (!/^\/[a-zA-Z0-9_./-]+$/.test(p)) return null;
  return `head -c ${FS_READ_MAX_BYTES} -- ${escapeShellSingleQuoted(p)}`;
}

/**
 * @param {string} cmd
 * @param {string} [repoDir]
 */
export function isSafePtyReadFileCommand(cmd, repoDir = FS_SEARCH_PTY_REPO_DIR) {
  const c = String(cmd || '').trim();
  if (!c) return false;
  if (c.startsWith('head -c ')) {
    return !/[\r\n;|`$<>|&]/.test(c) && c.length < 2400;
  }
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR || '.').trim() || '.';
  if (!c || c.length > 2400) return false;
  if (/[\r\n;|`$<>]/.test(c) || /\|/.test(c)) return false;
  if (/(?<![&])&(?![&])/.test(c)) return false;
  const prefix = `cd ${escapeShellSingleQuoted(dir)} && head -c ${FS_READ_MAX_BYTES} -- `;
  return c.startsWith(prefix);
}

/**
 * @param {Record<string, unknown>} runContext
 * @param {string} requestedPath
 */
function readFromActiveFileEnvelope(runContext, requestedPath) {
  const envelope =
    runContext.activeFileEnvelope ??
    runContext.active_file_envelope ??
    runContext.resolvedContext?.active_file_envelope ??
    null;
  if (!envelope || typeof envelope !== 'object') return null;
  const content = envelope.content != null ? String(envelope.content) : '';
  if (!content.trim()) return null;
  const req = String(requestedPath || '').trim();
  const candidates = [
    envelope.workspace_path,
    envelope.path,
    envelope.raw_path,
    envelope.github_path,
  ]
    .map((x) => (x != null ? String(x).trim() : ''))
    .filter(Boolean);
  if (!candidates.length) return null;
  const norm = (s) => s.replace(/\\/g, '/').replace(/^\.?\//, '');
  const reqN = norm(req);
  const match = candidates.some((c) => {
    const cn = norm(c);
    return cn === reqN || cn.endsWith(`/${reqN}`) || reqN.endsWith(cn);
  });
  if (!match) return null;
  return {
    success: true,
    lane: 'workspace_buffer',
    tool: 'fs_read_file',
    path: requestedPath,
    content: content.slice(0, FS_READ_MAX_BYTES),
    truncated: content.length > FS_READ_MAX_BYTES,
    source: 'active_file_envelope',
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeFsReadFile(env, params, runContext = {}) {
  const relPath = String(params.path ?? params.file_path ?? params.file ?? '').trim();
  if (!relPath) {
    return { error: 'path required', lane: 'workspace_read', tool: 'fs_read_file' };
  }

  const bufferHit = readFromActiveFileEnvelope(runContext, relPath);
  if (bufferHit) return bufferHit;

  const userId = String(
    runContext.userId ?? runContext.user_id ?? params.user_id ?? params.session?.user_id ?? '',
  ).trim();
  const workspaceId = String(
    runContext.workspaceId ?? runContext.workspace_id ?? params.workspace_id ?? '',
  ).trim();
  const tenantId = String(
    runContext.tenantId ?? runContext.tenant_id ?? params.tenant_id ?? '',
  ).trim();

  if (!userId || !workspaceId) {
    return { error: 'user_id and workspace_id required', lane: 'workspace_read' };
  }

  const request = runContext.request ?? params.request ?? null;
  if (!request) {
    return {
      error: 'request_context_required_for_pty_read',
      lane: 'workspace_read',
      hint: 'fs_read_file must run inside an authenticated /api/agent/chat turn',
    };
  }

  const isAbsolute = relPath.startsWith('/');
  let command = null;
  let execCwd = null;
  let lane = 'workspace_pty_local';
  let repoMeta = {};
  /** @type {{ command: string, execCwd: string|null, lane: string, repoMeta: Record<string, unknown> }[]} */
  let attemptList = [];

  if (isAbsolute) {
    command = buildPtyReadAbsoluteCommand(relPath);
    if (!command) {
      return { error: 'unsafe_or_invalid_path', lane: 'workspace_read', path: relPath };
    }
    lane = 'workspace_pty_host_absolute';
    execCwd = null;
    attemptList = [{ command, execCwd, lane, repoMeta }];
  } else {
    const { resolveMoviemodeRepoRootForSession, loadWorkspaceSettingsJson } = await import(
      './pty-workspace-paths.js'
    );
    const { gcpRemoteExecCwd } = await import('./host-workspace-paths.js');
    const repo = await resolveMoviemodeRepoRootForSession(env, {
      tenantId,
      userId,
      workspaceId,
    });
    if (!repo?.workspaceRoot) {
      return { error: 'workspace_repo_root_unavailable', lane: 'workspace_read' };
    }
    const settings = await loadWorkspaceSettingsJson(env, workspaceId);
    // Prefer absolute path on the exec host — avoids nested `cd <basename>` entirely.
    // Try VM root first (platform_vm), then Mac workspace_root (user_hosted_tunnel).
    const vmRoot = gcpRemoteExecCwd(settings, { allowOperatorFallback: true });
    const absBases = [];
    for (const cand of [vmRoot, repo.workspaceRoot]) {
      const n = String(cand || '')
        .trim()
        .replace(/\/+$/, '');
      if (n.startsWith('/') && !absBases.includes(n)) absBases.push(n);
    }
    const relSafe = relPath.replace(/^\.?\//, '');
    if (relSafe && !/\.\./.test(relSafe)) {
      for (const absBase of absBases) {
        const absCmd = buildPtyReadAbsoluteCommand(`${absBase}/${relSafe}`);
        if (absCmd && isSafePtyReadFileCommand(absCmd, '.')) {
          attemptList.push({
            command: absCmd,
            execCwd: null,
            lane: 'workspace_pty_absolute',
            repoMeta: {
              repo_root: repo.repoRoot,
              repo_dir: '.',
              workspace_root: repo.workspaceRoot,
              abs_base: absBase,
              fs_read_build: 'v3_abs',
            },
          });
        }
      }
    }
    // Relative head at PTY cwd (already the repo). Never cd into basename.
    const relCmd = buildPtyReadFileCommand(relPath, '.');
    if (relCmd && isSafePtyReadFileCommand(relCmd, '.')) {
      attemptList.push({
        command: relCmd,
        execCwd: repo.workspaceRoot,
        lane: 'workspace_pty_local',
        repoMeta: {
          repo_root: repo.repoRoot,
          repo_dir: '.',
          workspace_root: repo.workspaceRoot,
          fs_read_build: 'v3_rel',
        },
      });
    }
    if (!attemptList.length) {
      return { error: 'unsafe_or_invalid_path', lane: 'workspace_read', path: relPath };
    }
    command = attemptList[0].command;
    execCwd = attemptList[0].execCwd;
    lane = attemptList[0].lane;
    repoMeta = attemptList[0].repoMeta;
  }

  const started = Date.now();
  let output = '';
  let exitCode = 1;
  let nestedCdFailed = false;

  try {
    const { runTerminalCommand } = await import('./terminal.js');
    const { pinPtyLaneFromExecResult, ptyExecOptsForFs, resolvePinnedPtyLane } = await import(
      './fs-pty-lane-pin.js'
    );
    for (const attempt of attemptList) {
      command = attempt.command;
      execCwd = attempt.execCwd;
      lane = attempt.lane;
      repoMeta = attempt.repoMeta || {};
      try {
        const res = await runTerminalCommand(
          env,
          request,
          command,
          runContext.sessionId ?? null,
          await ptyExecOptsForFs(env, runContext, {
            workspace_id: workspaceId,
            tenant_id: tenantId,
            user_id: userId,
            cwd: execCwd,
            tool_name: 'fs_read_file',
          }),
        );
        output = String(res?.output || '');
        exitCode = Number(res?.exitCode ?? res?.exit_code ?? 0);
        await pinPtyLaneFromExecResult(env, runContext, res);
        const pinned = await resolvePinnedPtyLane(env, runContext);
        if (pinned?.connection_id) {
          repoMeta = { ...repoMeta, connection_id: pinned.connection_id };
        } else if (res?.targetId) {
          repoMeta = { ...repoMeta, connection_id: res.targetId };
        }
      } catch (e) {
        output = String(e?.message || e).slice(0, 500);
        exitCode = 1;
      }
      nestedCdFailed = /cd: .*: No such file or directory/i.test(output);
      const ptyOk =
        exitCode === 0 && !nestedCdFailed && !/No such file or directory/i.test(output);
      if (ptyOk) {
        return {
          success: true,
          lane,
          tool: 'fs_read_file',
          path: relPath,
          content: output,
          exit_code: exitCode,
          truncated: output.length >= FS_READ_MAX_BYTES - 16,
          duration_ms: Math.max(0, Date.now() - started),
          ...repoMeta,
        };
      }
    }
  } catch (e) {
    output = String(e?.message || e).slice(0, 500);
    exitCode = 1;
  }

  const durationMs = Math.max(0, Date.now() - started);

  // GitHub Contents API fallback — authoritative for the connected repo when PTY fails.
  const ghFallback = await tryGithubFileFallback(env, params, runContext, relPath, {
    userId,
    workspaceId,
  });
  if (ghFallback) {
    return {
      ...ghFallback,
      duration_ms: durationMs + (Number(ghFallback.duration_ms) || 0),
      pty_error: nestedCdFailed ? 'pty_nested_cd_failed' : 'pty_read_failed',
      pty_output: output.slice(0, 500),
      ...repoMeta,
    };
  }

  return {
    success: false,
    error: nestedCdFailed
      ? 'pty_nested_cd_failed'
      : /no such file or directory/i.test(output)
        ? 'file_not_found'
        : 'pty_read_failed',
    lane,
    path: relPath,
    content: output.slice(0, 4000),
    exit_code: nestedCdFailed && exitCode === 0 ? 1 : exitCode,
    duration_ms: durationMs,
    ...repoMeta,
    hint: nestedCdFailed
      ? 'PTY cwd is already the repo — use absolute vm_workspace_root or GitHub read'
      : /no such file or directory/i.test(output)
        ? 'File does not exist on the selected lane (not necessarily a dead tunnel)'
        : isAbsolute
          ? 'PTY host must reach this absolute path (Mac: localpty.inneranimalmedia.com / samsmac tunnel)'
          : 'Clone repo under PTY workspace, reconnect local folder to monorepo root, or use agentsam_github_read',
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 * @param {string} relPath
 * @param {{ userId: string, workspaceId: string }} ids
 */
async function tryGithubFileFallback(env, params, runContext, relPath, ids) {
  try {
    let repo = String(
      params.repo ||
        params.github_repo ||
        runContext.github_repo ||
        runContext.selectedGithubRepoContext?.full_name ||
        runContext.github_repo_context?.full_name ||
        '',
    ).trim();
    if (!repo && ids.workspaceId) {
      const { loadWorkspaceSettingsJson } = await import('./pty-workspace-paths.js');
      const settings = await loadWorkspaceSettingsJson(env, ids.workspaceId);
      repo = String(
        settings?.github_repo || settings?.default_github_repo || settings?.repo?.full_name || '',
      ).trim();
    }
    // Platform workspace default when settings omit github_repo.
    if (!repo && ids.workspaceId === 'ws_inneranimalmedia') {
      repo = 'SamPrimeaux/inneranimalmedia';
    }
    if (!repo || !ids.userId) return null;
    const { handlers } = await import('../tools/builtin/github-worker.js');
    const t0 = Date.now();
    const out = await handlers.github_get_file(
      {
        user_id: ids.userId,
        repo,
        path: String(relPath || '').replace(/^\.?\//, ''),
      },
      env,
    );
    if (out?.success === false || out?.error) return null;
    const text =
      out?.text != null
        ? String(out.text)
        : out?.content != null
          ? String(out.content)
          : '';
    if (!text) return null;
    return {
      success: true,
      lane: 'github_contents',
      tool: 'fs_read_file',
      path: relPath,
      repo,
      content: text.slice(0, FS_READ_MAX_BYTES),
      truncated: text.length > FS_READ_MAX_BYTES,
      exit_code: 0,
      duration_ms: Math.max(0, Date.now() - t0),
      fs_read_build: 'v3_github',
    };
  } catch {
    return null;
  }
}
