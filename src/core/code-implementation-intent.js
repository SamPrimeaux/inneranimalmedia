/**
 * Shared heuristics: repo / file implementation work vs live browser inspection.
 * Used by capability-router, tool-capability-filter, and agent workflow preflight.
 */

/** Tools Agent Sam should prefer when implementing or editing code in-repo. */
export const CODE_IMPLEMENTATION_TOOL_NAMES = [
  'fs_search_files',
  'workspace_search',
  'workspace_grep',
  'workspace_read_file',
  'r2_read',
  'r2_write',
  'github_file',
  'github_repos',
  'github_create_file',
  'github_update_file',
  'github_create_branch',
  'github_create_pr',
  'terminal_run',
  'terminal_execute',
  'd1_query',
  'd1_write',
];

/**
 * User wants to build, patch, or wire code — not merely inspect a live page in BrowserView.
 * @param {unknown} message
 */
export function isCodeImplementationIntent(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;

  if (messageExplicitlyRequestsBrowserInspection(m)) return false;

  return (
    /\b(implement|refactor|patch|scaffold|wire\s+(up|in)|add\s+route|create\s+(the\s+)?files?)\b/i.test(m) ||
    /\b(build|ship|deliver)\b.{0,40}\b(dashboard|component|page|module|feature|migration|repo)\b/i.test(m) ||
    /\b(dashboard\/[\w/-]+|components\/|migrations\/|app\.tsx|index\.tsx|\.tsx\b|\.jsx\b|\.ts\b|\.js\b)\b/i.test(m) ||
    /\b(monaco|github_file|r2_write|terminal_run|terminal_execute|workspace_read_file)\b/i.test(m) ||
    /\b(spend_alerts|finance_budgets|finance\.js|overview-bundle)\b/i.test(m) ||
    (/\b(edit|fix|update)\b/i.test(m) &&
      /\b(file|files|route|component|handler|migration|sql)\b/i.test(m))
  );
}

/**
 * True when the user explicitly wants BrowserView / capture / screenshot — not code-only "dashboard" mentions.
 * @param {unknown} message
 */
export function messageExplicitlyRequestsBrowserInspection(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;

  if (
    /\bopen\s+(the\s+)?browser\b/i.test(m) ||
    /\bdebug\s+this\s+site\b/i.test(m) ||
    /\bcapture\s+(the\s+)?page\b/i.test(m) ||
    /\b(screenshot|screen\s*grab)\b/i.test(m) ||
    /\bnavigate\s+to\s+https?:\/\//i.test(m) ||
    /\binspect\s+https?:\/\//i.test(m) ||
    /\b(check|inspect)\s+(the\s+)?(console|network|dom)\b/i.test(m)
  ) {
    return true;
  }

  if (
    /\b(inspect|debug)\b/i.test(m) &&
    /\b(url|site|page|dom|console|network)\b/i.test(m) &&
    !/\b(route|component|migration|\.tsx|\.jsx|app\.tsx|components\/|migrations\/)\b/i.test(m)
  ) {
    return true;
  }

  return false;
}

/**
 * @param {unknown} toolName
 */
export function isCodeImplementationToolName(toolName) {
  const n = String(toolName || '').trim().toLowerCase();
  if (!n) return false;
  if (CODE_IMPLEMENTATION_TOOL_NAMES.includes(n)) return true;
  if (n.startsWith('github_')) return true;
  if (n.startsWith('r2_')) return true;
  if (n === 'terminal_run' || n === 'terminal_execute' || n === 'run_command' || n === 'bash') {
    return true;
  }
  if (
    n === 'fs_search_files' ||
    n === 'workspace_search' ||
    n === 'workspace_grep' ||
    n === 'workspace_read_file' ||
    n.startsWith('workspace_')
  ) {
    return true;
  }
  if (n.startsWith('d1_')) return true;
  return false;
}
