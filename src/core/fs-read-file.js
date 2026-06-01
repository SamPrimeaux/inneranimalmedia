/**
 * workspace_read spine — prefer dashboard buffer, then scoped PTY (host or VM).
 *
 * Data plane priority:
 * 1. active_file_content in runContext (local Mac / Monaco — no VM clone)
 * 2. Absolute path on PTY host (operator hardware, e.g. /Users/you/.../inneranimalmedia)
 * 3. Per-user VM workspace: /workspace/{tenant}/{user}/{repoDir}/… (Connor isolation)
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
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(dir)) return null;
  const escapedPath = escapeShellSingleQuoted(p);
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
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR).trim();
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
  let lane = 'workspace_pty_vm';
  let repoMeta = {};

  if (isAbsolute) {
    command = buildPtyReadAbsoluteCommand(relPath);
    if (!command) {
      return { error: 'unsafe_or_invalid_path', lane: 'workspace_read', path: relPath };
    }
    lane = 'workspace_pty_host_absolute';
    execCwd = null;
  } else {
    const { resolveMoviemodeRepoRootForSession, safePtyRepoDirName } = await import(
      './pty-workspace-paths.js'
    );
    const repo = await resolveMoviemodeRepoRootForSession(env, {
      tenantId,
      userId,
      workspaceId,
    });
    if (!repo?.workspaceRoot) {
      return { error: 'workspace_repo_root_unavailable', lane: 'workspace_read' };
    }
    const repoDir =
      params.repo_dir != null && String(params.repo_dir).trim()
        ? safePtyRepoDirName(String(params.repo_dir).trim(), repo.workspaceRoot)
        : safePtyRepoDirName(repo.repoRoot, repo.workspaceRoot);
    command = buildPtyReadFileCommand(relPath, repoDir);
    if (!command || !isSafePtyReadFileCommand(command, repoDir)) {
      return { error: 'unsafe_or_invalid_path', lane: 'workspace_read', path: relPath };
    }
    execCwd = repo.workspaceRoot;
    repoMeta = {
      repo_root: repo.repoRoot,
      repo_dir: repoDir,
      workspace_root: repo.workspaceRoot,
    };
  }

  const started = Date.now();
  let output = '';
  let exitCode = 1;
  try {
    const { runTerminalCommand } = await import('./terminal.js');
    const res = await runTerminalCommand(env, request, command, runContext.sessionId ?? null, {
      execution_mode: 'pty',
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
      cwd: execCwd,
    });
    output = String(res?.output || '');
    exitCode = Number(res?.exitCode ?? 0);
  } catch (e) {
    return {
      error: String(e?.message || e).slice(0, 500),
      lane,
      path: relPath,
      ...repoMeta,
      hint: isAbsolute
        ? 'PTY host must reach this absolute path (tunnel iam-pty on your Mac)'
        : 'Clone or symlink repo under your PTY workspace, or open the file locally so buffer read works',
    };
  }

  const durationMs = Math.max(0, Date.now() - started);
  if (!output && exitCode !== 0) {
    return {
      error: 'pty_read_failed',
      lane,
      path: relPath,
      exit_code: exitCode,
      duration_ms: durationMs,
      ...repoMeta,
    };
  }

  return {
    success: true,
    lane,
    tool: 'fs_read_file',
    path: relPath,
    content: output,
    exit_code: exitCode,
    truncated: output.length >= FS_READ_MAX_BYTES - 16,
    duration_ms: durationMs,
    ...repoMeta,
  };
}
