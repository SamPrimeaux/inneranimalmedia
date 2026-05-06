/**
 * agentsam_user_policy + allowlist enforcement for MCP and builtins.
 *
 * Empty allowlist when require_allowlist_for_mcp=1:
 * Treat registered agentsam_mcp_tools rows for this tenant/workspace/user scope
 * as the effective allowlist (workspace-owned tool registrations). Builtins that are not
 * MCP-backed are governed by mode policy only, not the MCP allowlist table.
 */

const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

function riskRank(level) {
  const k = String(level || 'low').toLowerCase();
  return RISK_ORDER[k] ?? 1;
}

/** Builtins that remain callable when require_allowlist_for_mcp is on (read-only / platform meta). */
export const BUILTIN_SAFE_WITH_REQUIRE_ALLOWLIST = new Set([
  'd1_query',
  'platform_info',
  'telemetry_health',
  'knowledge_search',
  'rag_search',
]);

export const DEFAULT_USER_POLICY = {
  auto_run_mode: 'allowlist',
  mcp_tools_protection: 1,
  file_deletion_protection: 1,
  external_file_protection: 1,
  require_allowlist_for_mcp: 0,
  tool_risk_level_max: 'high',
  allow_subagent_spawn: 1,
  max_tool_chain_depth: 15,
  max_spawn_depth: 2,
  max_cost_per_call_usd: null,
  max_cost_per_session_usd: null,
  legacy_terminal_tool: 1,
};

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} workspaceId
 */
export async function loadAgentSamUserPolicy(env, userId, workspaceId = '') {
  if (!env?.DB || !userId) return { ...DEFAULT_USER_POLICY };
  const uid = String(userId).trim();
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const fullSql = `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection,
              COALESCE(require_allowlist_for_mcp, 0) AS require_allowlist_for_mcp,
              COALESCE(tool_risk_level_max, 'high') AS tool_risk_level_max,
              COALESCE(allow_subagent_spawn, 1) AS allow_subagent_spawn,
              COALESCE(max_tool_chain_depth, 15) AS max_tool_chain_depth,
              COALESCE(max_spawn_depth, 2) AS max_spawn_depth,
              max_cost_per_call_usd, max_cost_per_session_usd,
              COALESCE(legacy_terminal_tool, 1) AS legacy_terminal_tool
       FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`;
  const legacySql = `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection
       FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`;
  try {
    const row = await env.DB.prepare(fullSql).bind(uid, ws).first();
    if (!row) return { ...DEFAULT_USER_POLICY };
    return { ...DEFAULT_USER_POLICY, ...row };
  } catch (_) {
    try {
      const row = await env.DB.prepare(legacySql).bind(uid, ws).first();
      if (!row) return { ...DEFAULT_USER_POLICY };
      return { ...DEFAULT_USER_POLICY, ...row };
    } catch {
      return { ...DEFAULT_USER_POLICY };
    }
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ userId?: string, workspaceId?: string }} scope
 * @param {string} toolName
 * @returns {Promise<boolean>}
 */
export async function isToolOnMcpAllowlistTable(db, scope, toolName) {
  const name = String(toolName || '').trim();
  const uid = scope?.userId != null ? String(scope.userId).trim() : '';
  const ws = scope?.workspaceId != null ? String(scope.workspaceId).trim() : '';
  if (!db || !name || !uid || !ws) return false;
  try {
    const hit = await db.prepare(
      `SELECT 1 FROM agentsam_mcp_allowlist WHERE user_id = ? AND workspace_id = ? AND tool_key = ? LIMIT 1`,
    )
      .bind(uid, ws, name)
      .first();
    return !!hit;
  } catch (_) {
    return false;
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ userId?: string, workspaceId?: string }} scope
 */
export async function mcpAllowlistRowCount(db, scope) {
  const uid = scope?.userId != null ? String(scope.userId).trim() : '';
  const ws = scope?.workspaceId != null ? String(scope.workspaceId).trim() : '';
  if (!db || !uid || !ws) return 0;
  try {
    const r = await db.prepare(
      `SELECT COUNT(*) AS c FROM agentsam_mcp_allowlist WHERE user_id = ? AND workspace_id = ?`,
    )
      .bind(uid, ws)
      .first();
    return Number(r?.c || 0) || 0;
  } catch (_) {
    return 0;
  }
}

/**
 * When require_allowlist_for_mcp is on: tool must appear on agentsam_mcp_allowlist OR
 * be a registered scoped agentsam_mcp_tools row (enabled).
 */
export async function isToolAllowedByAllowlist(env, policy, scope, toolName, mcpRow) {
  if (!policy || Number(policy.require_allowlist_for_mcp || 0) !== 1) return { allowed: true, reason: null };
  const name = String(toolName || '').trim();
  if (!name) return { allowed: false, reason: 'missing_tool' };

  const onTable = await isToolOnMcpAllowlistTable(env?.DB, scope, name);
  if (onTable) return { allowed: true, reason: 'mcp_allowlist_table' };

  const n = await mcpAllowlistRowCount(env?.DB, scope);
  if (n === 0 && mcpRow && Number(mcpRow.enabled ?? 0) === 1) {
    return { allowed: true, reason: 'workspace_mcp_registry_fallback' };
  }

  if (mcpRow && Number(mcpRow.enabled ?? 0) === 1) {
    return { allowed: true, reason: 'scoped_mcp_tool_row' };
  }

  return { allowed: false, reason: 'mcp_allowlist_enforced' };
}

export function isToolAllowedByPolicyRisk(policy, inferredRisk) {
  const max = riskRank(policy?.tool_risk_level_max || 'high');
  const r = riskRank(inferredRisk);
  return r <= max;
}

export function requiresApprovalForTool(row, policyRiskOk, modeRequiresApproval) {
  if (!policyRiskOk) return true;
  if (Number(row?.requires_approval || 0) === 1) return true;
  if (modeRequiresApproval) return true;
  return false;
}

export function isSubagentToolName(toolName) {
  const t = String(toolName || '').toLowerCase();
  return t === 'agentsam_run_agent' || t.startsWith('agentsam_spawn') || t.includes('subagent');
}
