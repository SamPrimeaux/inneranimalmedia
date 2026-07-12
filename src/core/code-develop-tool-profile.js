/**
 * Code / develop tool profile — narrow compile set for repo + PTY work.
 * Avoids dumping all oauth_visible tools (~100) into agent context.
 */
import { codeContextIntent } from './ask-evidence-tools.js';

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

/** Dashboard / prompt route keys that imply develop tooling. */
export const CODE_DEVELOP_ROUTE_KEYS = new Set([
  'agent_code',
  'agent_terminal',
  'agent_frontend',
  'agent_debug',
  'terminal_execution',
  'workspace_editor',
]);

/**
 * Always-included tools for develop turns (order preserved; missing catalog rows skipped).
 * Call-time OAuth allowlist still applies at execution.
 */
export const CODE_DEVELOP_CORE_PINNED_TOOLS = Object.freeze([
  'fs_read_file',
  'fs_write_file',
  'fs_search_files',
  'fs_edit_file',
  'terminal_execute',
  'terminal_run',
  'agentsam_terminal_sandbox',
  'agentsam_d1_query',
  'agentsam_memory_manager',
  'agentsam_github_read',
  'agentsam_github_tree',
  'agentsam_github_read_many',
  'agentsam_github_patch',
  'agentsam_github_search_code',
  'agentsam_github_write',
  'agentsam_github_create_file',
  'agentsam_github_update_file',
  'git_status',
]);

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
  const { fetchAgentsamToolRowsByName } = await import('./agent-tool-loader.js');
  const { mapCatalogRowsToMcpParityAgentTools } = await import('./in-app-mcp-oauth-parity.js');
  const { selectAgentsamToolsForAgentChat } = await import('./agentsam-tools-catalog.js');

  const pinnedRows = await fetchAgentsamToolRowsByName(env, [...CODE_DEVELOP_CORE_PINNED_TOOLS]);
  const byName = new Map(
    (pinnedRows || []).map((r) => [String(r.tool_name || r.name || '').trim().toLowerCase(), r]),
  );
  const orderedCatalog = [];
  for (const key of CODE_DEVELOP_CORE_PINNED_TOOLS) {
    const row = byName.get(String(key).trim().toLowerCase());
    if (row) orderedCatalog.push(row);
  }

  let rows = mapCatalogRowsToMcpParityAgentTools(orderedCatalog);
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
  const missingPinned = CODE_DEVELOP_CORE_PINNED_TOOLS.filter(
    (k) => !seen.has(String(k).trim().toLowerCase()),
  );

  return {
    rows,
    missingPinned,
    pinned_count: orderedCatalog.length,
    total: rows.length,
  };
}
