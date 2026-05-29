/**
 * Scoped resolution for agentsam_mcp_tools — matches user, person, tenant, workspace, or workspace_scope JSON.
 */

/** @typedef {{ userId?: string|null, tenantId?: string|null, workspaceId?: string|null, personUuid?: string|null }} McpRuntimeScope */

function trimOrEmpty(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * Single tool row: prefers workspace match, then tenant, then sort_priority / recency.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {McpRuntimeScope} runtimeCtx
 * @param {string} toolIdentifier tool_key or tool_name
 */
export async function selectAgentsamMcpToolRow(db, runtimeCtx, toolIdentifier) {
  const name = String(toolIdentifier || '').trim();
  if (!name || !db) return null;

  const userId = trimOrEmpty(runtimeCtx?.userId);
  const personUuid = trimOrEmpty(runtimeCtx?.personUuid);
  const tenantId = trimOrEmpty(runtimeCtx?.tenantId);
  const workspaceId = trimOrEmpty(runtimeCtx?.workspaceId);

  const sql = `
SELECT *
FROM agentsam_mcp_tools
WHERE COALESCE(enabled, 0) = 1
  AND COALESCE(is_active, 0) = 1
  AND COALESCE(is_degraded, 0) = 0
  AND (
    (?1 != '' AND user_id = ?1)
    OR (?2 != '' AND person_uuid = ?2)
    OR (?3 != '' AND tenant_id = ?3)
    OR (?4 != '' AND workspace_id = ?4)
    OR (?5 != '' AND instr(COALESCE(workspace_scope, ''), ?5) > 0)
    OR (
      trim(COALESCE(user_id, '')) = ''
      AND trim(COALESCE(person_uuid, '')) = ''
      AND trim(COALESCE(tenant_id, '')) = ''
      AND trim(COALESCE(workspace_id, '')) = ''
    )
  )
  AND (
    tool_key = ?6
    OR tool_name = ?6
  )
ORDER BY
  CASE WHEN (?7 != '' AND workspace_id = ?7) THEN 0 ELSE 1 END,
  CASE WHEN (?8 != '' AND tenant_id = ?8) THEN 0 ELSE 1 END,
  CASE WHEN trim(COALESCE(workspace_id, '')) != '' THEN 0 ELSE 1 END,
  COALESCE(sort_priority, 50) ASC,
  created_at DESC
LIMIT 1`;

  try {
    return await db.prepare(sql)
      .bind(userId, personUuid, tenantId, workspaceId, workspaceId, name, workspaceId, tenantId)
      .first();
  } catch (e) {
    console.warn('[selectAgentsamMcpToolRow]', e?.message ?? e);
    return null;
  }
}

/**
 * Tool catalog slice for the chat agent (respects same scope OR block).
 */
/**
 * MCP tools bound to remote server_key values (e.g. cloudflare-docs from agentsam_prompt_routes.mcp_template).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {McpRuntimeScope} runtimeCtx
 * @param {string[]} serverKeys
 * @param {number} [limit]
 */
export async function listAgentsamMcpToolsForServerKeys(db, runtimeCtx, serverKeys, limit = 48) {
  const keys = [...new Set((serverKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  const lim = Math.max(1, Math.min(200, Number(limit) || 48));
  if (!db || !keys.length) return [];

  const userId = trimOrEmpty(runtimeCtx?.userId);
  const personUuid = trimOrEmpty(runtimeCtx?.personUuid);
  const tenantId = trimOrEmpty(runtimeCtx?.tenantId);
  const workspaceId = trimOrEmpty(runtimeCtx?.workspaceId);
  const placeholders = keys.map(() => '?').join(',');

  const sql = `
SELECT m.tool_name, m.tool_key, m.description, m.input_schema, m.tool_category,
       m.requires_approval, m.server_key, m.mcp_service_url, m.capability_key, m.risk_level,
       m.agentsam_tools_id, s.url AS server_url
FROM agentsam_mcp_tools m
LEFT JOIN agentsam_mcp_servers s
  ON s.server_key = m.server_key AND COALESCE(s.is_active, 1) = 1
WHERE COALESCE(m.enabled, 0) = 1
  AND COALESCE(m.is_active, 0) = 1
  AND COALESCE(m.is_degraded, 0) = 0
  AND m.server_key IN (${placeholders})
  AND (
    (?1 != '' AND m.user_id = ?1)
    OR (?2 != '' AND m.person_uuid = ?2)
    OR (?3 != '' AND m.tenant_id = ?3)
    OR (?4 != '' AND m.workspace_id = ?4)
    OR (?5 != '' AND instr(COALESCE(m.workspace_scope, ''), ?5) > 0)
    OR (
      trim(COALESCE(m.user_id, '')) = ''
      AND trim(COALESCE(m.person_uuid, '')) = ''
      AND trim(COALESCE(m.tenant_id, '')) = ''
      AND trim(COALESCE(m.workspace_id, '')) = ''
    )
  )
ORDER BY COALESCE(m.sort_priority, 50) ASC, m.tool_name ASC
LIMIT ?6`;

  try {
    const { results } = await db
      .prepare(sql)
      .bind(userId, personUuid, tenantId, workspaceId, workspaceId, ...keys, lim)
      .all();
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[listAgentsamMcpToolsForServerKeys]', e?.message ?? e);
    return [];
  }
}

export async function selectAgentsamMcpToolsList(db, runtimeCtx, limit = 20) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 20));
  if (!db) return [];

  const userId = trimOrEmpty(runtimeCtx?.userId);
  const personUuid = trimOrEmpty(runtimeCtx?.personUuid);
  const tenantId = trimOrEmpty(runtimeCtx?.tenantId);
  const workspaceId = trimOrEmpty(runtimeCtx?.workspaceId);

  const sql = `
SELECT tool_name, description, input_schema, tool_category, requires_approval
FROM agentsam_mcp_tools
WHERE COALESCE(enabled, 0) = 1
  AND COALESCE(is_active, 0) = 1
  AND COALESCE(is_degraded, 0) = 0
  AND (
    (?1 != '' AND user_id = ?1)
    OR (?2 != '' AND person_uuid = ?2)
    OR (?3 != '' AND tenant_id = ?3)
    OR (?4 != '' AND workspace_id = ?4)
    OR (?5 != '' AND instr(COALESCE(workspace_scope, ''), ?5) > 0)
    OR (
      trim(COALESCE(user_id, '')) = ''
      AND trim(COALESCE(person_uuid, '')) = ''
      AND trim(COALESCE(tenant_id, '')) = ''
      AND trim(COALESCE(workspace_id, '')) = ''
    )
  )
ORDER BY tool_name ASC
LIMIT ?6`;

  try {
    const { results } = await db.prepare(sql)
      .bind(userId, personUuid, tenantId, workspaceId, workspaceId, lim)
      .all();
    return Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn('[selectAgentsamMcpToolsList]', e?.message ?? e);
    return [];
  }
}
