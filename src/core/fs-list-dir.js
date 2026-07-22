/**
 * filesystem.list — PTY workspace directory listing (no /api/fs/* loopback).
 */
import { escapeShellSingleQuoted } from './fs-search-rg-parse.js';
import { FS_SEARCH_PTY_REPO_DIR } from './fs-search-rg-parse.js';

/**
 * @param {string} relPath
 * @param {boolean} recursive
 * @param {string} [repoDir]
 */
export function buildPtyListDirCommand(relPath, recursive = false, repoDir = FS_SEARCH_PTY_REPO_DIR) {
  const raw = String(relPath || '.').trim() || '.';
  if (/\.\./.test(raw)) return null;
  const p = raw === '.' ? '.' : raw.replace(/^\.?\//, '');
  if (p !== '.' && !/^[a-zA-Z0-9_./-]+$/.test(p)) return null;
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR || '.').trim() || '.';
  if (dir !== '.' && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(dir)) return null;
  const escapedPath = escapeShellSingleQuoted(p);
  const body = recursive
    ? `find ${escapedPath} -mindepth 1 -maxdepth 4 -print 2>/dev/null | head -n 500`
    : `ls -la ${escapedPath} 2>/dev/null | head -n 200`;
  if (dir === '.') return body;
  return `cd ${escapeShellSingleQuoted(dir)} && ${body}`;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeFsListDir(env, params, runContext = {}) {
  const relPath = String(params.path ?? params.directory ?? '.').trim() || '.';
  const recursive = params.recursive === true || params.recursive === 1 || params.recursive === '1';

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
    return { error: 'user_id and workspace_id required', lane: 'workspace_list' };
  }

  const request = runContext.request ?? params.request ?? null;
  if (!request) {
    return {
      error: 'request_context_required_for_pty_list',
      lane: 'workspace_list',
    };
  }

  const { resolveMoviemodeRepoRootForSession, safePtyRepoDirName } = await import(
    './pty-workspace-paths.js'
  );
  const repo = await resolveMoviemodeRepoRootForSession(env, {
    tenantId,
    userId,
    workspaceId,
  });
  if (!repo?.workspaceRoot) {
    return { error: 'workspace_repo_root_unavailable', lane: 'workspace_list' };
  }
  const repoDirRaw =
    params.repo_dir != null && String(params.repo_dir).trim()
      ? safePtyRepoDirName(String(params.repo_dir).trim(), repo.workspaceRoot)
      : safePtyRepoDirName(repo.repoRoot, repo.workspaceRoot);
  const wsTail =
    String(repo.workspaceRoot || '')
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || '';
  const repoDir =
    !repoDirRaw || repoDirRaw === wsTail || repoDirRaw === 'inneranimalmedia' ? '.' : repoDirRaw;

  const command = buildPtyListDirCommand(relPath, recursive, repoDir);
  if (!command) {
    return { error: 'unsafe_or_invalid_path', lane: 'workspace_list', path: relPath };
  }

  let output = '';
  let exitCode = 1;
  let connectionId = null;
  try {
    const { runTerminalCommand } = await import('./terminal.js');
    const { pinPtyLaneFromExecResult, ptyExecOptsForFs, resolvePinnedPtyLane } = await import(
      './fs-pty-lane-pin.js'
    );
    const res = await runTerminalCommand(
      env,
      request,
      command,
      runContext.sessionId ?? null,
      await ptyExecOptsForFs(env, runContext, {
        workspace_id: workspaceId,
        tenant_id: tenantId,
        user_id: userId,
        cwd: repo.workspaceRoot,
        tool_name: 'fs_list_dir',
      }),
    );
    output = String(res?.output || '');
    exitCode = Number(res?.exitCode ?? 0);
    await pinPtyLaneFromExecResult(env, runContext, res);
    connectionId =
      (await resolvePinnedPtyLane(env, runContext))?.connection_id || res?.targetId || null;
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 500), lane: 'workspace_list', path: relPath };
  }

  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    success: exitCode === 0 || lines.length > 0,
    lane: 'workspace_pty_list',
    tool: 'filesystem.list',
    path: relPath,
    recursive,
    entries: lines,
    raw: output.slice(0, 16_000),
    exit_code: exitCode,
    repo_root: repo.repoRoot,
    workspace_root: repo.workspaceRoot,
    connection_id: connectionId,
  };
}
