/**
 * DB-driven capability tool names (image / video / email families).
 * Registry: agentsam_mcp_tools.intent_category_tags + workspace/global scope.
 */

/**
 * @param {unknown} env
 * @param {string|null|undefined} workspaceId
 * @param {string} mode
 * @param {string} intentCategoryTag
 * @returns {Promise<string[]>}
 */
export async function getCapabilityTools(env, workspaceId, mode, intentCategoryTag) {
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!env?.DB || !ws) return [];
  const modeSlug = String(mode || 'agent').trim();
  const tag = String(intentCategoryTag || '').trim();
  if (!tag) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT tool_name
       FROM agentsam_mcp_tools
       WHERE intent_category_tags = ?
         AND (workspace_id = ? OR workspace_id IS NULL)
         AND is_active = 1
         AND enabled = 1
         AND modes_json LIKE ?`,
    )
      .bind(tag, ws, `%${modeSlug}%`)
      .all();
    return (results || []).map((r) => String(r.tool_name || '').trim()).filter(Boolean);
  } catch (e) {
    console.warn('[capability-tools] getCapabilityTools', e?.message ?? e);
    return [];
  }
}
