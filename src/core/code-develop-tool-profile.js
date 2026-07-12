/**
 * Code / develop tool profile — narrow compile set for repo + PTY work.
 * Avoids dumping all oauth_visible tools (~100) into agent context.
 *
 * Soft route pins (agent_code from editor) do NOT force this profile for chat/plan asks.
 */
import { codeContextIntent } from './ask-evidence-tools.js';
import { resolveCatalogDispatchToolKey } from './catalog-tool-key-resolve.js';

/** Classified task types that should use the develop tool profile. */
export const CODE_DEVELOP_TASK_TYPES = new Set([
  'code',
  'code_implementation',
  'terminal_execution',
  'deploy',
  'cms_edit',
  'debug',
  'tool_use',
  'sql_d1_generation',
  'implementation',
  'feature',
  'refactor',
]);

/** Soft UI route keys — only activate develop profile with a develop task or mutate intent. */
export const CODE_DEVELOP_SOFT_ROUTE_KEYS = new Set([
  'agent_code',
  'agent_frontend',
  'workspace_editor',
]);

/** Hard route keys — always imply develop tooling. */
export const CODE_DEVELOP_ROUTE_KEYS = new Set([
  'agent_terminal',
  'agent_debug',
  'terminal_execution',
]);

/** Chat/plan/ask — never force develop solely from soft editor route. */
const NON_DEVELOP_TASK_TYPES = new Set([
  'chat',
  'ask',
  'plan',
  'summary',
  'image_generation',
  'mail_triage',
  'simple_ask_greeting',
  'project_qna_fast',
]);

/**
 * Canonical active catalog keys (aliases resolved; inactive legacy names omitted).
 */
export const CODE_DEVELOP_CORE_PINNED_TOOLS = Object.freeze([
  'fs_read_file',
  'fs_write_file',
  'fs_search_files',
  'fs_edit_file',
  'agentsam_terminal_sandbox',
  'agentsam_d1_query',
  'agentsam_memory_manager',
  'agentsam_github_read',
  'agentsam_github_tree',
  'agentsam_github_read_many',
  'agentsam_github_patch',
  'agentsam_github_search',
  'agentsam_github_write',
  'pty_git_status',
]);

/**
 * @param {string} message
 */
export function isCodeMutateIntent(message) {
  const t = String(message || '');
  if (!t.trim()) return false;
  return (
    /\b(fix|patch|edit|implement|refactor|migrate|deploy|write\s+file|create\s+file|fs_write|commit|pr\b|pull\s+request)\b/i.test(
      t,
    ) &&
    (codeContextIntent(t) ||
      /\b(repo|codebase|src\/|dashboard\/|migrations\/|\.js\b|\.tsx\b|worker|pty|terminal)\b/i.test(t))
  );
}

/**
 * @param {{
 *   taskType?: string|null,
 *   routeKey?: string|null,
 *   routeKeyPin?: string|null,
 *   mode?: string|null,
 *   message?: string|null,
 * }} ctx
 */
export function shouldUseCodeDevelopToolProfile(ctx) {
  const tt = String(ctx.taskType || '').trim().toLowerCase();
  const rk = String(ctx.routeKey || ctx.routeKeyPin || '').trim().toLowerCase();
  const mode = String(ctx.mode || 'agent').trim().toLowerCase();
  const message = String(ctx.message || '');

  if (CODE_DEVELOP_TASK_TYPES.has(tt)) return true;
  if (CODE_DEVELOP_ROUTE_KEYS.has(rk)) return true;

  // Soft editor route: only when message is mutate/code work — not architecture chat.
  if (CODE_DEVELOP_SOFT_ROUTE_KEYS.has(rk)) {
    if (NON_DEVELOP_TASK_TYPES.has(tt) && !isCodeMutateIntent(message) && !codeContextIntent(message)) {
      return false;
    }
    if (isCodeMutateIntent(message) || codeContextIntent(message)) return true;
    if (CODE_DEVELOP_TASK_TYPES.has(tt)) return true;
    return false;
  }

  if ((mode === 'agent' || mode === 'debug' || mode === 'multitask') && isCodeMutateIntent(message)) {
    return true;
  }
  if ((mode === 'agent' || mode === 'debug' || mode === 'multitask') && codeContextIntent(message)) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId?: string|null, isSuperadmin?: boolean }} scope
 * @param {{
 *   maxTools: number,
 *   taskType?: string|null,
 *   modeSlug?: string|null,
 *   message?: string|null,
 *   routeToolRequirements?: import('./agentsam-route-tool-resolver.js').RouteToolRequirements|null,
 * }} opts
 */
export async function compileCodeDevelopToolRows(env, scope, opts) {
  const maxTools = Math.max(1, Math.min(32, Number(opts.maxTools) || 20));
  const { listAgentsamToolsByKeys, mapCatalogRowsToAgentTools } = await import(
    './agentsam-tools-catalog.js'
  );
  const { mapCatalogRowsToMcpParityAgentTools } = await import('./in-app-mcp-oauth-parity.js');

  const resolvedPins = [
    ...new Set(
      CODE_DEVELOP_CORE_PINNED_TOOLS.map((k) => resolveCatalogDispatchToolKey(k) || k).filter(Boolean),
    ),
  ];

  const rawPinned = await listAgentsamToolsByKeys(env, new Set(resolvedPins.map((k) => k.toLowerCase())), {
    workspaceId: scope.workspaceId,
    limit: Math.max(resolvedPins.length, maxTools),
  });

  const byKey = new Map();
  for (const r of rawPinned || []) {
    const kn = String(r.tool_name || r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kn) byKey.set(kn, r);
    const kk = String(r.tool_key || '')
      .trim()
      .toLowerCase();
    if (kk) byKey.set(kk, r);
  }

  const orderedCatalog = [];
  const seenKeys = new Set();
  for (const key of resolvedPins) {
    const row = byKey.get(String(key).trim().toLowerCase());
    if (!row) continue;
    const id = String(row.tool_name || row.tool_key || '')
      .trim()
      .toLowerCase();
    if (!id || seenKeys.has(id)) continue;
    seenKeys.add(id);
    orderedCatalog.push(row);
  }

  let rows = mapCatalogRowsToMcpParityAgentTools(orderedCatalog);
  if (!rows.length) {
    rows = mapCatalogRowsToAgentTools(orderedCatalog);
  }

  const seen = new Set(
    rows.map((r) => String(r.name || r.tool_key || r.tool_name || '').trim().toLowerCase()).filter(Boolean),
  );

  const taskType = String(opts.taskType || 'code').trim().toLowerCase() || 'code';
  const developReq =
    opts.routeToolRequirements ||
    ({
      route_key: taskType,
      task_type: taskType,
      allowed_lanes: ['develop', 'inspect', 'terminal', 'operate', 'research'],
      required_capabilities: [],
      optional_capabilities: [
        'workspace_read_file',
        'workspace_search',
        'terminal_execute',
        'github_file',
        'github.read',
        'd1_query',
      ],
      blocked_capabilities: [],
      max_tools: maxTools,
      approval_policy: null,
      source: 'code_develop_profile',
    });

  if (rows.length < maxTools && env?.DB && scope.userId && scope.workspaceId) {
    const { selectAgentsamToolsForAgentChat } = await import('./agentsam-tools-catalog.js');
    const det = await selectAgentsamToolsForAgentChat(
      env.DB,
      { userId: scope.userId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      {
        allowlistKeys: null,
        routeToolRequirements: developReq,
        message: String(opts.message || ''),
        taskType,
        modeSlug: String(opts.modeSlug || 'agent'),
        catalogLimit: Math.min(64, maxTools * 4),
        outputLimit: maxTools,
      },
    );
    for (const r of det.rows || []) {
      if (rows.length >= maxTools) break;
      const n = String(r.name || r.tool_key || r.tool_name || '').trim().toLowerCase();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      rows.push(r);
    }
  }

  rows = rows.slice(0, maxTools);
  const missingPinned = resolvedPins.filter((k) => !seen.has(String(k).trim().toLowerCase()));

  return {
    rows,
    missingPinned,
    pinned_count: orderedCatalog.length,
    total: rows.length,
  };
}
