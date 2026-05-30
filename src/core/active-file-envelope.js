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

/** Extensions that must never autoroute to image generation when open in the editor. */
export const CODE_LIKE_ACTIVE_FILE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.json',
  '.md',
  '.sql',
  '.py',
]);

/**
 * @param {unknown} path
 */
export function activeFilePathLooksLikeCode(path) {
  const p = String(path || '')
    .toLowerCase()
    .split('?')[0]
    .split('#')[0];
  const dot = p.lastIndexOf('.');
  if (dot < 0) return false;
  return CODE_LIKE_ACTIVE_FILE_EXTENSIONS.has(p.slice(dot));
}

/**
 * Hard block: open code/config buffer → no image-generation lane or tools this turn.
 * @param {ReturnType<typeof parseActiveFileEnvelope>|null|undefined} envelope
 */
export function activeFileBlocksImageGeneration(envelope) {
  if (!envelope) return false;
  const path =
    envelope.path || envelope.github_path || envelope.workspace_path || envelope.raw_path || '';
  return activeFilePathLooksLikeCode(path);
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
  const content = pickFirst(b.active_file_content, b.activeFileContent);

  const has = source || r2Key || githubPath || driveFileId || workspacePath || rawPath;
  if (!has) return null;

  return {
    source: source || 'unknown',
    path: workspacePath || githubPath || r2Key || rawPath,
    content: content || null,
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

/**
 * Pull editor buffer text from dashboard on-demand context when FormData omits active_file_content.
 * @param {unknown} message
 */
export function extractOpenFileContentFromMessage(message) {
  const raw = String(message || '');
  const idx = raw.search(/\r?\n\r?\n--- On-demand context/i);
  if (idx < 0) return null;
  const block = raw.slice(idx);
  const openMatch = block.match(
    /### Open file \(editor\)\n[^\n]+\n\n([\s\S]*?)(?=\n\n### |\r?\n\r?\n---|$)/,
  );
  if (openMatch?.[1]) return openMatch[1].trim();
  const fileMatch = block.match(/### @file\n[^\n]+\n\n([\s\S]*?)(?=\n\n### |\r?\n\r?\n---|$)/);
  if (fileMatch?.[1]) return fileMatch[1].trim();
  return null;
}

export function formatActiveFileForAgent(envelope) {
  if (!envelope) return null;
  const path = envelope.path || envelope.github_path || envelope.workspace_path || '(none)';
  const content = envelope.content != null ? String(envelope.content) : '';
  if (content.trim()) {
    return `Active file: ${path}\n\`\`\`\n${content.slice(0, 48000)}\n\`\`\``;
  }
  const lines = [
    '[Active file envelope — editor selection. Prefer this path for read or grep scope unless the user names another file.]',
    `source: ${envelope.source}`,
    `path: ${path}`,
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
