/**
 * OAuth MCP × agentsam_user_policy / agentsam_mcp_allowlist intersection.
 * External clients: when require_allowlist_for_mcp = 1, only tools on BOTH
 * agentsam_mcp_oauth_tool_allowlist AND the user's personal allowlist apply.
 */
import {
  findMcpAllowlistMatch,
  isToolAllowedByPolicyRisk,
  loadAgentSamUserPolicy,
} from './agent-policy.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Strict allowlist for OAuth — no workspace registry fallback when user policy requires allowlist.
 * @param {any} env
 * @param {object} policy
 * @param {{ userId: string, workspaceId: string, tenantId?: string, personUuid?: string }} scope
 * @param {string} toolKey
 */
export async function isOAuthUserToolAllowed(env, policy, scope, toolKey) {
  const name = trim(toolKey);
  if (!name) return { allowed: false, reason: 'missing_tool' };

  if (!policy || Number(policy.require_allowlist_for_mcp || 0) !== 1) {
    return { allowed: true, reason: 'allowlist_not_required' };
  }

  const ws = trim(scope.workspaceId);
  const uid = trim(scope.userId);
  if (!ws || !uid) {
    return { allowed: false, reason: 'missing_actor_scope' };
  }

  const { matched, path } = await findMcpAllowlistMatch(env?.DB, scope, name);
  if (matched) return { allowed: true, reason: null, path };

  return { allowed: false, reason: 'tool not in user allowlist', path };
}

/**
 * Filter OAuth client catalog keys by user/workspace policy.
 * @param {any} env
 * @param {{ userId: string, workspaceId: string, tenantId?: string, personUuid?: string, clientId?: string }} scope
 * @param {string[]} oauthToolKeys
 * @returns {Promise<{ keys: string[], policy: object, requireAllowlist: boolean }>}
 */
export async function filterOAuthToolKeysForUser(env, scope, oauthToolKeys) {
  const keys = (oauthToolKeys || []).map((k) => trim(k)).filter(Boolean);
  const policy = await loadAgentSamUserPolicy(env, scope.userId, scope.workspaceId);
  const requireAllowlist = Number(policy.require_allowlist_for_mcp || 0) === 1;

  if (!requireAllowlist) {
    return { keys, policy, requireAllowlist: false };
  }

  const out = [];
  for (const toolKey of keys) {
    const allow = await isOAuthUserToolAllowed(env, policy, scope, toolKey);
    if (allow.allowed) out.push(toolKey);
  }
  return { keys: out, policy, requireAllowlist: true };
}

/**
 * Load tool risk from registry for policy risk cap at runtime (IAM paths).
 * @param {any} env
 * @param {string} toolKey
 */
export async function loadMcpToolRiskLevel(env, toolKey) {
  if (!env?.DB || !toolKey) return 'low';
  try {
    const row = await env.DB.prepare(
      `SELECT risk_level FROM agentsam_mcp_tools
        WHERE tool_key = ? AND COALESCE(is_active, 1) = 1
        LIMIT 1`,
    )
      .bind(trim(toolKey))
      .first();
    return trim(row?.risk_level) || 'low';
  } catch {
    return 'low';
  }
}

export function isToolRiskAllowedByPolicy(policy, riskLevel) {
  return isToolAllowedByPolicyRisk(policy, riskLevel);
}
