/**
 * mcp-tool-resolve.js  — B+ resolve logic
 * =========================================
 * Drop this file into src/core/ (or wherever mcp-tool-resolve.js lives).
 *
 * B+ flow:
 *   1. token.allowed_tools  →  list of tool keys (from mcp_workspace_tokens)
 *   2. intersect with agentsam_mcp_oauth_tool_allowlist (OAuth catalog, ~27 active)
 *   3. for each surviving key, resolve ONE row from agentsam_mcp_tools
 *      matching display_name OR tool_key OR capability_aliases
 *   4. MCP tool name exposed to client = display_name (fallback: tool_key)
 *
 * What NOT to do:
 *   ✗  JOIN all 219 agentsam_mcp_allowlist rows (dashboard prefs, wrong table)
 *   ✗  Filter only by tool_key — misses run_agent→run, todo_create→todo_add, etc.
 *   ✗  Return raw token keys without resolving inputSchema from agentsam_mcp_tools
 */

// ── Resolve a single key → agentsam_mcp_tools row ──────────────────────────
/**
 * @param {D1Database} db
 * @param {string} key  — value from token.allowed_tools (e.g. 'agentsam_run')
 * @returns {Promise<{tool_key, display_name, description, input_schema}|null>}
 */
async function resolveMcpToolRow(db, key) {
  const k = (key || '').trim().toLowerCase();
  if (!k) return null;

  // Primary: match display_name or tool_key (case-insensitive)
  const row = await db
    .prepare(
      `SELECT tool_key, display_name, description, input_schema, risk_level
         FROM agentsam_mcp_tools
        WHERE COALESCE(is_active, 1) = 1
          AND COALESCE(enabled, 1) = 1
          AND (
            lower(display_name) = ?
            OR lower(tool_key)  = ?
            OR tool_key = (
              SELECT match_value
                FROM agentsam_capability_aliases
               WHERE lower(abstract_capability) = ?
                 AND match_kind = 'tool_key'
                 AND COALESCE(is_active, 1) = 1
               ORDER BY priority ASC
               LIMIT 1
            )
          )
        LIMIT 1`,
    )
    .bind(k, k, k)
    .first();

  return row ?? null;
}

// ── Build the tools/list response for an OAuth session ─────────────────────
/**
 * Call this from your tools/list MCP handler after resolveWorkspace().
 *
 * @param {D1Database} db
 * @param {string[]}   tokenAllowedTools  — from mcp_workspace_tokens.allowed_tools (parsed JSON)
 * @param {string}     oauthClientId      — e.g. 'iam_mcp_inneranimalmedia'
 * @returns {Promise<Array>}              — MCP-spec tool objects
 */
export async function buildOAuthToolsList(db, tokenAllowedTools, oauthClientId) {
  if (!Array.isArray(tokenAllowedTools) || tokenAllowedTools.length === 0) {
    return [];
  }

  // Step 1: pull OAuth catalog keys for this client (is_active only)
  const { results: catalogRows } = await db
    .prepare(
      `SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist
        WHERE client_id = ? AND COALESCE(is_active, 1) = 1`,
    )
    .bind(oauthClientId)
    .all();

  const catalogSet = new Set(catalogRows.map((r) => r.tool_key.toLowerCase()));

  // Step 2: intersect token keys with catalog
  const eligible = tokenAllowedTools.filter((k) => catalogSet.has(k.toLowerCase()));

  if (eligible.length === 0) return [];

  // Step 3: resolve each key → agentsam_mcp_tools row (parallel, capped)
  const settled = await Promise.allSettled(
    eligible.map((key) => resolveMcpToolRow(db, key)),
  );

  const tools = [];
  for (let i = 0; i < settled.length; i++) {
    const { status, value } = settled[i];
    if (status !== 'fulfilled' || !value) continue;

    const row = value;
    // MCP name = display_name (what the client sees); fallback to tool_key
    const mcpName = (row.display_name || row.tool_key || '').trim();
    if (!mcpName) continue;

    // Parse input_schema — column is TEXT JSON
    let inputSchema;
    try {
      inputSchema = JSON.parse(row.input_schema || '{}');
    } catch {
      inputSchema = {};
    }

    tools.push({
      name: mcpName,
      description: row.description || '',
      inputSchema: {
        type: 'object',
        ...inputSchema,
      },
      // Optional: expose risk_level as an annotation (MCP 2025-03 extension)
      ...(row.risk_level && row.risk_level !== 'low'
        ? { annotations: { riskLevel: row.risk_level } }
        : {}),
    });
  }

  return tools;
}

// ── Example: drop into your MCP request router ─────────────────────────────
//
// In src/api/mcp.js (or wherever you handle method === 'tools/list'):
//
//   import { buildOAuthToolsList } from '../core/mcp-tool-resolve.js';
//
//   case 'tools/list': {
//     const { token, workspaceId } = resolvedContext; // from resolveWorkspace()
//     const tokenTools = JSON.parse(token.allowed_tools ?? '[]');
//     const tools = await buildOAuthToolsList(
//       env.DB,
//       tokenTools,
//       'iam_mcp_inneranimalmedia',
//     );
//     return mcpResponse({ tools });
//   }
//
// For full bearer / Cursor sessions (non-OAuth), keep your existing path:
//   return all 97+ tools (no OAuth catalog filter).
