/**
 * filesystem.write — PTY workspace write (mirrors fs-read-file.js; no /api/fs/* loopback).
 */
import { escapeShellSingleQuoted } from './fs-search-rg-parse.js';
import { FS_SEARCH_PTY_REPO_DIR } from './fs-search-rg-parse.js';

export const FS_WRITE_MAX_BYTES = 512_000;

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * @param {string} relPath
 * @param {string} contentBase64
 * @param {string} [repoDir]
 */
export function buildPtyWriteFileCommand(relPath, contentBase64, repoDir = FS_SEARCH_PTY_REPO_DIR) {
  const raw = String(relPath || '').trim();
  if (!raw || /\.\./.test(raw) || /^[~\/]/.test(raw)) return null;
  const p = raw.replace(/^\.?\//, '');
  if (!p || p.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  if (!/^[a-zA-Z0-9_./-]+$/.test(p)) return null;
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR || '.').trim() || '.';
  if (dir !== '.' && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(dir)) return null;
  const b64 = String(contentBase64 || '').trim();
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const escapedPath = escapeShellSingleQuoted(p);
  const escapedB64 = escapeShellSingleQuoted(b64);
  const body = `echo ${escapedB64} | base64 -d > ${escapedPath}`;
  if (dir === '.') return body;
  return `cd ${escapeShellSingleQuoted(dir)} && ${body}`;
}

/**
 * @param {string} cmd
 * @param {string} [repoDir]
 */
export function isSafePtyWriteFileCommand(cmd, repoDir = FS_SEARCH_PTY_REPO_DIR) {
  const c = String(cmd || '').trim();
  if (!c || c.length > 3200) return false;
  // Required pipe for base64 decode — strip it before metachar checks.
  if (!c.includes(' | base64 -d > ')) return false;
  const withoutRequiredPipe = c.replace(' | base64 -d > ', ' ___B64OUT___ ');
  if (/[\r\n;|`$<>]/.test(withoutRequiredPipe)) return false;
  if (/(?<![&])&(?![&])/.test(withoutRequiredPipe)) return false;
  const dir = String(repoDir || FS_SEARCH_PTY_REPO_DIR || '.').trim() || '.';
  if (dir === '.') {
    return c.startsWith('echo ');
  }
  const prefix = `cd ${escapeShellSingleQuoted(dir)} && echo `;
  return c.startsWith(prefix);
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeFsWriteFile(env, params, runContext = {}) {
  const relPath = String(params.path ?? params.file_path ?? params.file ?? '').trim();
  const content =
    params.content != null
      ? String(params.content)
      : params.proposed_content != null
        ? String(params.proposed_content)
        : '';
  if (!relPath) {
    return { error: 'path required', lane: 'workspace_write', tool: 'fs_write_file' };
  }
  if (params.content == null && params.proposed_content == null) {
    return { error: 'content required', lane: 'workspace_write', tool: 'fs_write_file' };
  }
  const byteLen = new TextEncoder().encode(content).length;
  if (byteLen > FS_WRITE_MAX_BYTES) {
    return {
      error: 'content_too_large',
      max_bytes: FS_WRITE_MAX_BYTES,
      lane: 'workspace_write',
    };
  }

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
    return { error: 'user_id and workspace_id required', lane: 'workspace_write' };
  }

  const request = runContext.request ?? params.request ?? null;
  if (!request) {
    return {
      error: 'request_context_required_for_pty_write',
      lane: 'workspace_write',
      hint: 'fs_write_file must run inside an authenticated /api/agent/chat turn',
    };
  }

  if (relPath.startsWith('/')) {
    return {
      error: 'absolute_path_write_not_supported',
      lane: 'workspace_write',
      hint: 'Use workspace-relative paths; save via Monaco for absolute host paths',
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
    return { error: 'workspace_repo_root_unavailable', lane: 'workspace_write' };
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

  const contentBase64 = utf8ToBase64(content);
  const command = buildPtyWriteFileCommand(relPath, contentBase64, repoDir);
  if (!command || !isSafePtyWriteFileCommand(command, repoDir)) {
    return { error: 'unsafe_or_invalid_path', lane: 'workspace_write', path: relPath };
  }

  const started = Date.now();
  let exitCode = 1;
  let output = '';
  try {
    const { runTerminalCommand } = await import('./terminal.js');
    const res = await runTerminalCommand(env, request, command, runContext.sessionId ?? null, {
      execution_mode: 'pty',
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
      cwd: repo.workspaceRoot,
    });
    output = String(res?.output || '');
    exitCode = Number(res?.exitCode ?? 0);
  } catch (e) {
    return {
      error: String(e?.message || e).slice(0, 500),
      lane: 'workspace_pty_write',
      path: relPath,
      repo_root: repo.repoRoot,
      workspace_root: repo.workspaceRoot,
    };
  }

  const durationMs = Math.max(0, Date.now() - started);
  if (exitCode !== 0) {
    return {
      error: 'pty_write_failed',
      lane: 'workspace_pty_write',
      path: relPath,
      exit_code: exitCode,
      output: output.slice(0, 800),
      duration_ms: durationMs,
    };
  }

  return {
    success: true,
    lane: 'workspace_pty_write',
    tool: 'fs_write_file',
    path: relPath,
    bytes_written: byteLen,
    exit_code: exitCode,
    duration_ms: durationMs,
    repo_root: repo.repoRoot,
    workspace_root: repo.workspaceRoot,
  };
}
