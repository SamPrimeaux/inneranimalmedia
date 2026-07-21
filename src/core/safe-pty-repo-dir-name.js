/**
 * Relative folder name to `cd` into from PTY `workspaceRoot`.
 * When workspace_root already IS the repo root, return "." — never re-cd into the
 * basename (that yields …/inneranimalmedia/inneranimalmedia and breaks Mac PTY).
 * @param {string|null|undefined} repoRoot
 * @param {string|null|undefined} workspaceRoot
 */
export function safePtyRepoDirName(repoRoot, workspaceRoot) {
  const root = String(repoRoot || '').trim().replace(/\/+$/, '');
  const ws = String(workspaceRoot || '').trim().replace(/\/+$/, '');
  if (!root) return '.';
  if (ws && root === ws) return '.';
  // Bare basename that already matches the workspace folder name (injected repo_dir).
  const wsTail = ws.split(/[/\\]/).filter(Boolean).pop() || '';
  if (ws && !root.includes('/') && !root.includes('\\') && root === wsTail) return '.';
  if (ws && root.startsWith(`${ws}/`)) {
    const rel = root.slice(ws.length + 1);
    const first = rel.split(/[/\\]/).filter(Boolean)[0];
    if (first && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(first)) return first;
  }
  let name = root.split(/[/\\]/).filter(Boolean).pop() || '.';
  if (name === '.' || name === '..') return '.';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(name)) return '.';
  return name;
}
