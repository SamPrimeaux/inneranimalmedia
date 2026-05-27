/**
 * OAuth MCP tools/list — resolve allowlisted keys to agentsam_tools catalog rows.
 */
import { inputSchemaFromAgentsamToolRow } from './agentsam-tools-catalog.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} publicKey — OAuth allowlist / token key (e.g. agentsam_memory_search)
 */
async function resolveOAuthCatalogToolRow(db, publicKey) {
  const k = trim(publicKey).toLowerCase();
  if (!k || !db) return null;

  let row = await db
    .prepare(
      `SELECT tool_key, tool_name, display_name, description, input_schema, handler_type, handler_config, risk_level
         FROM agentsam_tools
        WHERE COALESCE(is_active, 1) = 1
          AND COALESCE(is_degraded, 0) = 0
          AND lower(tool_key) = ?
        LIMIT 1`,
    )
    .bind(k)
    .first();

  if (row) return row;

  const alias = await db
    .prepare(
      `SELECT match_value FROM agentsam_capability_aliases
        WHERE lower(abstract_capability) = ?
          AND match_kind = 'tool_key'
          AND COALESCE(is_active, 1) = 1
        ORDER BY priority ASC
        LIMIT 1`,
    )
    .bind(k)
    .first();

  const handlerKey = trim(alias?.match_value).toLowerCase();
  if (!handlerKey) return null;

  row = await db
    .prepare(
      `SELECT tool_key, tool_name, display_name, description, input_schema, handler_type, handler_config, risk_level
         FROM agentsam_tools
        WHERE COALESCE(is_active, 1) = 1
          AND COALESCE(is_degraded, 0) = 0
          AND lower(tool_key) = ?
        LIMIT 1`,
    )
    .bind(handlerKey)
    .first();

  return row ?? null;
}

/**
 * Build tools/list for OAuth sessions (ChatGPT). Uses agentsam_tools + canonical input schemas.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} tokenAllowedTools
 * @param {string} oauthClientId
 */
export async function buildOAuthToolsList(db, tokenAllowedTools, oauthClientId) {
  if (!Array.isArray(tokenAllowedTools) || tokenAllowedTools.length === 0) {
    return [];
  }

  const { results: catalogRows } = await db
    .prepare(
      `SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
        WHERE client_id = ? AND COALESCE(is_active, 1) = 1`,
    )
    .bind(oauthClientId)
    .all();

  const catalogSet = new Set((catalogRows || []).map((r) => String(r.tool_key || '').toLowerCase()));
  const eligible = tokenAllowedTools.filter((key) => catalogSet.has(String(key || '').toLowerCase()));
  if (!eligible.length) return [];

  const settled = await Promise.allSettled(
    eligible.map((key) => resolveOAuthCatalogToolRow(db, key)),
  );

  const tools = [];
  for (let i = 0; i < settled.length; i++) {
    const { status, value } = settled[i];
    if (status !== 'fulfilled' || !value) continue;

    const row = value;
    const mcpName = trim(eligible[i]) || trim(row.tool_key);
    if (!mcpName) continue;

    const inputSchema = inputSchemaFromAgentsamToolRow(row);
    delete inputSchema.required;

    tools.push({
      name: mcpName,
      description: [trim(row.display_name), trim(row.description), trim(row.tool_name)]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 4000) || mcpName,
      inputSchema,
      ...(row.risk_level && row.risk_level !== 'low'
        ? { annotations: { riskLevel: row.risk_level } }
        : {}),
    });
  }

  return tools;
}
