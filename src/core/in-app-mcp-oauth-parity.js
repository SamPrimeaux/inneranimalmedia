/**
 * In-app Agent Sam ↔ MCP OAuth tool parity (Claude.ai / ChatGPT / Cursor).
 * Same agentsam_tools.oauth_visible catalog + iam_mcp_inneranimalmedia allowlist;
 * execution stays on main worker via dispatchByToolCode (never proxy through MCP host).
 */
import { MCP_CANONICAL_CLIENT_ID } from '../api/mcp-oauth-shared.js';
import {
  EXECUTABLE_HANDLER_TYPES,
  inputSchemaFromAgentsamToolRow,
  loadExecutableHandlerTypes,
  rowMatchesMode,
  rowMatchesWorkspaceScope,
  rowWithinRiskCap,
  validateHandlerConfigForExecution,
} from './agentsam-tools-catalog.js';
import { parseHandlerConfig } from './resolve-credential.js';
import { collectAllowlistToolKeysForScope } from './agent-policy.js';
export const IN_APP_MCP_PARITY_TOOL_LIMIT = 128;

const OPERATOR_ONLY_OAUTH_TOOLS = new Set(['agentsam_terminal_remote']);

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Live OAuth surface allowlist (same SSOT as MCP worker tools/call). */
export async function loadLiveOAuthToolAllowlistKeys(env, clientId = IN_APP_MCP_OAUTH_CLIENT_ID) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
       WHERE client_id = ?
         AND COALESCE(is_active, 1) = 1
       ORDER BY COALESCE(connector_priority, 50) ASC, tool_key ASC`,
    )
      .bind(trim(clientId) || IN_APP_MCP_OAUTH_CLIENT_ID)
      .all();
    return (results || [])
      .map((r) => trim(r?.tool_key).toLowerCase())
      .filter(Boolean);
  } catch (e) {
    console.warn('[in-app-mcp-oauth-parity] loadLiveOAuthToolAllowlistKeys', e?.message ?? e);
    return [];
  }
}

/**
 * Effective tool_key set for in-app agent chat (mirrors MCP OAuth superadmin / allowlist merge).
 * @param {any} env
 * @param {{ userId?: string, workspaceId?: string, tenantId?: string, personUuid?: string, isSuperadmin?: boolean }} scope
 */
export async function collectInAppOAuthMcpToolKeys(env, scope, opts = {}) {
  const liveKeys = await loadLiveOAuthToolAllowlistKeys(env);
  const liveSet = new Set(liveKeys);
  if (!liveSet.size) return liveSet;

  if (opts.isSuperadmin === true) {
    return liveSet;
  }

  const ws = trim(scope?.workspaceId);
  const uid = trim(scope?.userId);
  if (ws && uid) {
    try {
      const grant = await env.DB.prepare(
        `SELECT 1 FROM agentsam_mcp_oauth_user_client_allowlist
         WHERE user_id = ? AND workspace_id = ? AND COALESCE(is_active, 1) = 1
         LIMIT 1`,
      )
        .bind(uid, ws)
        .first();
      if (grant) {
        return liveSet;
      }
    } catch (_) {}
  }

  const workspaceAllow = await collectAllowlistToolKeysForScope(env?.DB, scope);
  if (!workspaceAllow.size) {
    return liveSet;
  }

  const merged = new Set();
  for (const k of liveSet) {
    if (workspaceAllow.has(k)) merged.add(k);
  }
  return merged.size ? merged : liveSet;
}

/** MCP OAuth public tool names use tool_key (not branded tool_name). */
export function mapCatalogRowsToMcpParityAgentTools(rows) {
  return (rows || []).map((r) => {
    const key = trim(r.tool_key) || trim(r.tool_name);
    const desc =
      [trim(r.display_name), trim(r.description), trim(r.tool_name)].filter(Boolean).join(' — ') ||
      key;
    return {
      name: key,
      description: desc.slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(r),
      tool_category: trim(r.tool_category) || 'builtin',
      requires_approval: Number(r.requires_approval || 0) === 1,
      tool_key: key,
      tool_name: trim(r.tool_name) || key,
      capability_key: trim(r.capability_key),
    };
  });
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ userId?: string, tenantId?: string, workspaceId?: string, personUuid?: string, isSuperadmin?: boolean }} runtimeCtx
 * @param {{ outputLimit?: number, modeSlug?: string, riskLevelMax?: string|null, isSuperadmin?: boolean }} opts
 */
export async function selectOAuthMcpParityToolsForAgentChat(db, runtimeCtx, opts = {}) {
  const env = { DB: db };
  const ws = trim(runtimeCtx?.workspaceId);
  const outputLimit = Math.max(
    1,
    Math.min(IN_APP_MCP_PARITY_TOOL_LIMIT, Number(opts.outputLimit) || IN_APP_MCP_PARITY_TOOL_LIMIT),
  );
  const isSuperadmin = opts.isSuperadmin === true || runtimeCtx?.isSuperadmin === true;

  if (!db || !ws) {
    return { rows: [], source: 'oauth_mcp_parity', tool_count: 0 };
  }

  const allowedKeys = await collectInAppOAuthMcpToolKeys(env, runtimeCtx, { isSuperadmin });
  if (!allowedKeys.size) {
    return { rows: [], source: 'oauth_mcp_parity', tool_count: 0 };
  }

  let catalogRows = [];
  try {
    const { results } = await db.prepare(
      `SELECT tool_key, tool_name, display_name, tool_category, description,
              input_schema, handler_config, capability_key, risk_level, requires_approval,
              modes_json, workspace_scope, handler_type, is_degraded, mcp_service_url, sort_priority
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND COALESCE(oauth_visible, 0) = 1
         AND (
           COALESCE(is_global, 1) = 1
           OR workspace_scope IS NULL
           OR trim(workspace_scope) IN ('', '[]')
           OR workspace_scope LIKE '%"*"%'
           OR workspace_scope LIKE ('%' || ? || '%')
         )
       ORDER BY COALESCE(sort_priority, 50) ASC, tool_key ASC`,
    )
      .bind(ws)
      .all();
    catalogRows = results || [];
  } catch (e) {
    console.warn('[in-app-mcp-oauth-parity] catalog query', e?.message ?? e);
    return { rows: [], source: 'oauth_mcp_parity', tool_count: 0 };
  }

  const executableTypes = await loadExecutableHandlerTypes(env);
  const out = [];
  for (const row of catalogRows) {
    const key = trim(row.tool_key).toLowerCase();
    if (!key || !allowedKeys.has(key)) continue;
    if (!isSuperadmin && OPERATOR_ONLY_OAUTH_TOOLS.has(key)) continue;
    if (!rowMatchesWorkspaceScope(row, ws)) continue;
    if (!rowMatchesMode(row, opts.modeSlug)) continue;
    if (!rowWithinRiskCap(row, opts.riskLevelMax)) continue;

    const cfg = parseHandlerConfig(row.handler_config);
    const v = validateHandlerConfigForExecution(row, cfg, executableTypes || EXECUTABLE_HANDLER_TYPES);
    if (!v.ok) {
      console.warn('[in-app-mcp-oauth-parity] skip_invalid', key, v.error);
      continue;
    }
    out.push(mapCatalogRowsToMcpParityAgentTools([row])[0]);
    if (out.length >= outputLimit) break;
  }

  console.info(
    '[in-app-mcp-oauth-parity] selected',
    JSON.stringify({
      workspace_id: ws,
      is_superadmin: isSuperadmin,
      allowlist_size: allowedKeys.size,
      oauth_visible_candidates: catalogRows.length,
      selected: out.length,
    }),
  );

  return { rows: out, source: 'oauth_mcp_parity', tool_count: out.length };
}

/**
 * Call-time gate: oauth_visible tool allowed when on live OAuth allowlist (in-app parity).
 * @param {any} env
 * @param {string} toolKey
 * @param {{ isSuperadmin?: boolean, userId?: string, workspaceId?: string, tenantId?: string, personUuid?: string }} scope
 */
export async function isOAuthMcpParityToolAllowed(env, toolKey, scope = {}) {
  const key = trim(toolKey).toLowerCase();
  if (!key || !env?.DB) return false;

  const row = await env.DB.prepare(
    `SELECT tool_key, oauth_visible, COALESCE(is_active, 1) AS is_active
     FROM agentsam_tools
     WHERE tool_key = ? OR tool_name = ?
     LIMIT 1`,
  )
    .bind(key, key)
    .first()
    .catch(() => null);

  if (!row || Number(row.is_active) !== 1 || Number(row.oauth_visible) !== 1) {
    return false;
  }

  const resolvedKey = trim(row.tool_key).toLowerCase() || key;
  if (!scope.isSuperadmin && OPERATOR_ONLY_OAUTH_TOOLS.has(resolvedKey)) {
    return false;
  }

  const allowed = await collectInAppOAuthMcpToolKeys(env, scope, {
    isSuperadmin: scope.isSuperadmin === true,
  });
  return allowed.has(resolvedKey);
}
