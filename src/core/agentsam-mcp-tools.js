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
