/**
 * Active file envelope — UI Monaco/GitHub/R2/Drive fields → agent context + tool defaults.
 */

function pickFirst(...vals) {
  for (const v of vals) {
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/**
 * @param {unknown} body
 */
export function parseActiveFileEnvelope(body) {
  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
  const source = pickFirst(b.active_file_source, b.activeFileSource).toLowerCase();
  const r2Bucket = pickFirst(b.active_file_r2_bucket, b.r2_bucket);
  const r2Key = pickFirst(b.active_file_r2_key, b.r2_key);
  const githubRepo = pickFirst(b.active_file_github_repo, b.github_repo);
  const githubPath = pickFirst(b.active_file_github_path, b.github_path);
  const githubBranch = pickFirst(b.active_file_github_branch, b.github_branch, 'main');
  const driveFileId = pickFirst(b.active_file_drive_id, b.drive_file_id);
  const workspacePath = pickFirst(b.active_file_workspace_path, b.workspace_path, b.active_file_path, b.path);
  const rawPath = pickFirst(b.active_file_path, b.path);

  const has = source || r2Key || githubPath || driveFileId || workspacePath || rawPath;
  if (!has) return null;

  return {
    source: source || 'unknown',
    path: workspacePath || githubPath || r2Key || rawPath,
    r2_bucket: r2Bucket || null,
    r2_key: r2Key || null,
    github_repo: githubRepo || null,
    github_path: githubPath || null,
    github_branch: githubBranch || null,
    drive_file_id: driveFileId || null,
    workspace_path: workspacePath || null,
    raw_path: rawPath || null,
  };
}

/**
 * @param {unknown} v
 */
function pick(v) {
  const s = v != null ? String(v).trim() : '';
  return s || null;
}

/**
 * @param {ReturnType<typeof parseActiveFileEnvelope>} envelope
 */
/**
 * User message only — strip dashboard-injected blocks before intent heuristics.
 * Ignores on-demand context ("save", "r2_write", "github_file", etc.) and active-file envelope.
 * @param {unknown} message
 */
export function stripUserTextForIntent(message) {
  let raw = String(message || '').split(/\r?\n\r?\n--- On-demand context/i)[0] ?? '';
  const idx = raw.indexOf('[Active file envelope');
  if (idx >= 0) raw = raw.slice(0, idx);
  return raw.trim();
}

/** @deprecated Prefer stripUserTextForIntent — same implementation. */
export function stripActiveFileEnvelopeForIntent(message) {
  return stripUserTextForIntent(message);
}

export function formatActiveFileForAgent(envelope) {
  if (!envelope) return null;
  const lines = [
    '[Active file envelope — editor selection. Prefer this path for read or grep scope unless the user names another file.]',
    `source: ${envelope.source}`,
    `path: ${envelope.path || '(none)'}`,
  ];
  if (envelope.github_repo) lines.push(`github_repo: ${envelope.github_repo}`);
  if (envelope.github_path) lines.push(`github_path: ${envelope.github_path}`);
  if (envelope.r2_key) lines.push(`r2_key: ${envelope.r2_key}`);
  if (envelope.workspace_path) lines.push(`workspace_path: ${envelope.workspace_path}`);
  return lines.join('\n');
}

/**
 * @param {ReturnType<typeof parseActiveFileEnvelope>} envelope
 * @param {Record<string, unknown>} runContext
 */
export function mergeActiveFileIntoRunContext(envelope, runContext = {}) {
  if (!envelope) return runContext;
  return {
    ...runContext,
    activeFile: envelope,
    active_file_envelope: envelope,
  };
}

/**
 * Default fs_search_files path scoped to active file directory when applicable.
 * @param {ReturnType<typeof parseActiveFileEnvelope>} envelope
 */
export function defaultSearchPathFromActiveFile(envelope) {
  if (!envelope?.path) return '.';
  const p = String(envelope.path).replace(/\\/g, '/');
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return '.';
  return p.slice(0, idx) || '.';
}
