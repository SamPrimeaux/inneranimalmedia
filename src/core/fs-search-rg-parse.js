/**
 * Pure ripgrep JSON helpers (unit-testable without PTY/auth imports).
 */

export const FS_SEARCH_MAX_MATCHES = 50;
export const FS_SEARCH_MAX_OUTPUT_BYTES = 64_000;
export const FS_SEARCH_MAX_QUERY_LEN = 400;
export const FS_SEARCH_PTY_REPO_DIR = 'inneranimalmedia';

/**
 * @param {string} value
 */
export function escapeShellSingleQuoted(value) {
  return `'${String(value || '').replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * @param {string} cmd
 */
export function isSafeRgSearchCommand(cmd) {
  const c = String(cmd || '').trim();
  if (!c || c.length > 12_000) return false;
  if (/[\r\n;|`$<>]/.test(c) || /\|/.test(c)) return false;
  if (/(?<![&])&(?![&])/.test(c)) return false;
  if (!/^cd inneranimalmedia && rg --json\b/.test(c)) return false;
  return true;
}

/**
 * @param {string} query
 * @param {string} [pathArg]
 * @param {{ maxCount?: number }} [opts]
 */
export function buildRgSearchCommand(query, pathArg = '.', opts = {}) {
  const q = String(query || '').trim().slice(0, FS_SEARCH_MAX_QUERY_LEN);
  if (!q) return null;
  const maxCount = Math.min(50, Math.max(1, Number(opts.maxCount) || FS_SEARCH_MAX_MATCHES));
  const sub = String(pathArg || '.').trim() || '.';
  if (sub.includes('..') || /^[\/~]/.test(sub)) return null;
  return `cd ${FS_SEARCH_PTY_REPO_DIR} && rg --json --max-count ${maxCount} --max-columns 200 --glob '!.git/*' -e ${escapeShellSingleQuoted(q)} ${escapeShellSingleQuoted(sub)}`;
}

/**
 * @param {string} stdout
 */
export function parseRgJsonMatches(stdout) {
  const matches = [];
  let bytes = 0;
  for (const line of String(stdout || '').split('\n')) {
    if (!line.trim() || bytes > FS_SEARCH_MAX_OUTPUT_BYTES) break;
    bytes += line.length;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.type !== 'match' || !row.data?.path?.text) continue;
    const path = row.data.path.text;
    const lineNo = row.data.line_number;
    const text = (row.data.lines?.text || '').trim();
    matches.push({
      path,
      line: lineNo,
      text: text.slice(0, 500),
    });
    if (matches.length >= FS_SEARCH_MAX_MATCHES) break;
  }
  return matches;
}
