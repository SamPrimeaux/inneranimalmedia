/**
 * Shared heuristics: repo / file implementation work vs live browser inspection.
 * Used by capability-router, tool-capability-filter, and agent workflow preflight.
 */
import { stripUserTextForIntent } from './active-file-envelope.js';

function stripForIntent(message) {
  return stripUserTextForIntent(message);
}

/**
 * Read-only explain/summarize/describe current file (Monaco buffer / active file) — no workflow.
 * @param {unknown} message
 */
export function isReadOnlyFileContextIntent(message) {
  const m = stripForIntent(message).toLowerCase();
  if (!m) return false;
  if (messageExplicitlyRequestsBrowserInspection(m)) return false;
  if (isReadOnlyRepoSearchIntent(message)) return false;

  const writeCue =
    /\b(edit|change|modify|patch|save|sync|persist|write|apply|refactor|implement|generate and persist|commit|deploy|update the file|scaffold|wire\s+(up|in)|fix and save)\b/i.test(
      m,
    );
  if (writeCue) return false;

  const readCue =
    /\b(describe|explain|summarize|summarise|what is|what does|what's|read|inspect|review|overview of|tell me about|walk me through)\b/i.test(
      m,
    );
  if (!readCue) return false;

  const fileCue =
    /\b(this\s+)?(file|readme|code|buffer|current file|active file)\b/i.test(m) ||
    /\b(the\s+)?readme\b/i.test(m) ||
    /\bin (the )?monaco\b/i.test(m) ||
    /\bmonaco\s+(file|buffer|editor)\b/i.test(m) ||
    /\bREADME\.md\b/i.test(m) ||
    /\b\.(md|tsx|jsx|ts|js|py|json|css)\b/i.test(m);

  return fileCue;
}

/**
 * Read-only repo/code lookup — direct tool loop (fs_search_files / rg), never Monaco workflow.
 * @param {unknown} message
 */
export function isReadOnlyRepoSearchIntent(message) {
  const m = stripForIntent(message).toLowerCase();
  if (!m) return false;
  if (messageExplicitlyRequestsBrowserInspection(m)) return false;

  const searchVerb =
    /\b(find|search|locate|grep|ripgrep|\brg\b|where is|which file|look for)\b/i.test(m) ||
    /\bshow (?:me )?(?:the )?file path\b/i.test(m);
  if (!searchVerb) return false;

  const writeWorkflow =
    /\b(implement|patch|apply patch|save|sync|persist|deploy|commit|create pr|refactor|scaffold|wire up|edit and save|update the file)\b/i.test(
      m,
    );
  if (writeWorkflow) return false;

  const repoScope =
    /\b(in (my )?repo|codebase|workspace|defined|function|class|import|route|symbol)\b/i.test(m) ||
    /\b(resolveModel|agentChatSseHandler|loadModeToolPolicy|search_web|fs_search)[\w]*/i.test(m);

  return repoScope || /\b(in (my )?repo|show (?:the )?file path)\b/i.test(m);
}

/**
 * User is on the workflows dashboard (registry / editor / run surfaces).
 * @param {unknown} dashboardRoute
 */
export function isWorkflowsDashboardRoute(dashboardRoute) {
  const r = dashboardRoute != null ? String(dashboardRoute).trim().toLowerCase() : '';
  return r === '/dashboard/workflows' || r.startsWith('/dashboard/workflows/');
}

/**
 * Agent chat may auto-start a registered workflow graph only when the user
 * explicitly asks for workflow execution or is on the workflows dashboard.
 * @param {unknown} message
 * @param {{ dashboardRoute?: unknown, dashboard_route?: unknown, workflowKey?: unknown, workflow_key?: unknown }} [opts]
 */
export function shouldAllowAgentChatWorkflowGraph(message, opts = {}) {
  if (requiresWorkflowExecutionIntent(message)) return true;
  const route =
    opts.dashboardRoute != null
      ? String(opts.dashboardRoute).trim()
      : opts.dashboard_route != null
        ? String(opts.dashboard_route).trim()
        : '';
  if (isWorkflowsDashboardRoute(route)) return true;
  const wfKey = opts.workflowKey ?? opts.workflow_key;
  if (wfKey != null && String(wfKey).trim()) return true;
  return false;
}

/**
 * Skip surface workflow preflight — use direct tools (lane router + catalog).
 * @param {unknown} message
 * @param {string} [requestedMode]
 * @param {{ dashboardRoute?: unknown, dashboard_route?: unknown }} [opts]
 */
export function shouldSkipSurfaceWorkflowPreflight(message, requestedMode = 'agent', opts = {}) {
  if (isReadOnlyRepoSearchIntent(message)) return true;
  if (isReadOnlyFileContextIntent(message)) return true;
  const mode = String(requestedMode || 'agent').toLowerCase();
  if (mode === 'plan') return false;
  if (requiresWorkflowExecutionIntent(message)) return false;
  if (!shouldAllowAgentChatWorkflowGraph(message, opts)) return true;
  return false;
}

/**
 * User explicitly wants a named workflow graph, not a direct tool call.
 * @param {unknown} message
 */
export function requiresWorkflowExecutionIntent(message) {
  const m = stripForIntent(message).toLowerCase();
  if (!m) return false;
  return (
    /\b(run|start|execute)\s+(the\s+)?([\w-]+\s+)?workflow\b/i.test(m) ||
    /\bexecute (the\s+)?plan\b/i.test(m) ||
    /\bmultitask workflow\b/i.test(m) ||
    /\b(run|start)\s+multitask\b/i.test(m)
  );
}

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
  const m = stripForIntent(message).toLowerCase();
  if (!m) return false;

  if (messageExplicitlyRequestsBrowserInspection(m)) return false;
  if (isReadOnlyRepoSearchIntent(message)) return false;
  if (isReadOnlyFileContextIntent(message)) return false;

  return (
    /\b(implement|refactor|patch|scaffold|wire\s+(up|in)|add\s+route|create\s+(the\s+)?files?)\b/i.test(m) ||
    /\b(build|ship|deliver)\b.{0,40}\b(dashboard|component|page|module|feature|migration|repo)\b/i.test(m) ||
    /\b(dashboard\/[\w/-]+|components\/|migrations\/|app\.tsx|index\.tsx|\.tsx\b|\.jsx\b|\.ts\b|\.js\b)\b/i.test(m) ||
    /\b(r2_write|github_create_file|github_update_file|terminal_run|terminal_execute)\b/i.test(m) ||
    (/\bmonaco\b/i.test(m) &&
      /\b(edit|change|modify|patch|save|sync|persist|write|apply|update)\b/i.test(m)) ||
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
