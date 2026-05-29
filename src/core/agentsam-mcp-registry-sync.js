/**
 * Keep agentsam_mcp_tools mirror rows aligned with agentsam_tools (SSOT).
 * New tool/capability changes should UPDATE agentsam_tools; call sync after admin writes.
 */

import { loadAgentsamToolRow } from './agentsam-tools-catalog.js';

function trim(v) {
  if (v == null) return '';
  return String(v).trim();
}

async function resolveMirrorUserId(db) {
  if (!db) return null;
  try {
    const row = await db
      .prepare(
        `SELECT user_id FROM agentsam_mcp_tools
         WHERE trim(COALESCE(user_id, '')) != ''
         LIMIT 1`,
      )
      .first();
    return trim(row?.user_id) || null;
  } catch {
    return null;
  }
}

/**
 * Upsert one mirror row from agentsam_tools (by tool_key / tool_name).
 * @param {any} env
 * @param {string} toolIdentifier
 * @returns {Promise<{ ok: boolean, tool_key?: string, error?: string }>}
 */
export async function syncAgentsamMcpToolMirrorFromCatalog(env, toolIdentifier) {
  const catalog = await loadAgentsamToolRow(env, toolIdentifier);
  if (!catalog) {
    return { ok: false, error: `agentsam_tools not found: ${toolIdentifier}` };
  }
  if (!env?.DB) return { ok: false, error: 'DB binding missing' };

  const toolKey = trim(catalog.tool_key || catalog.tool_name);
  const userId = await resolveMirrorUserId(env.DB);
  if (!userId) {
    return { ok: false, error: 'no platform user_id on agentsam_mcp_tools for mirror sync' };
  }

  const id = `amt_${toolKey}`;
  const sql = `
INSERT INTO agentsam_mcp_tools (
  id, user_id, tool_key, tool_name, display_name, tool_category,
  mcp_service_url, description, input_schema, handler_type, handler_config,
  modes_json, risk_level, requires_approval, enabled, is_active,
  workspace_scope, routing_scope, agentsam_tools_id, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
ON CONFLICT(user_id, tool_key) DO UPDATE SET
  tool_name = excluded.tool_name,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  mcp_service_url = excluded.mcp_service_url,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  modes_json = excluded.modes_json,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  enabled = excluded.enabled,
  is_active = excluded.is_active,
  workspace_scope = excluded.workspace_scope,
  agentsam_tools_id = excluded.agentsam_tools_id,
  updated_at = unixepoch()`;

  try {
    await env.DB.prepare(sql)
      .bind(
        id,
        userId,
        toolKey,
        trim(catalog.tool_name) || toolKey,
        trim(catalog.display_name) || toolKey,
        trim(catalog.tool_category) || 'agent',
        trim(catalog.mcp_service_url) || 'https://mcp.inneranimalmedia.com/mcp',
        trim(catalog.description) || '',
        typeof catalog.input_schema === 'string'
          ? catalog.input_schema
          : JSON.stringify(catalog.input_schema || {}),
        trim(catalog.handler_type) || 'builtin',
        typeof catalog.handler_config === 'string'
          ? catalog.handler_config
          : JSON.stringify(catalog.handler_config || {}),
        typeof catalog.modes_json === 'string'
          ? catalog.modes_json
          : JSON.stringify(catalog.modes_json || ['auto', 'agent', 'debug']),
        trim(catalog.risk_level) || 'low',
        Number(catalog.requires_approval) === 1 ? 1 : 0,
        1,
        Number(catalog.is_active ?? 1) === 1 ? 1 : 0,
        typeof catalog.workspace_scope === 'string'
          ? catalog.workspace_scope
          : JSON.stringify(catalog.workspace_scope || ['*']),
        'workspace',
        trim(catalog.id) || null,
      )
      .run();
    return { ok: true, tool_key: toolKey };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Apply catalog field updates to agentsam_tools and mirror row.
 * @param {any} env
 * @param {string} toolIdentifier
 * @param {Record<string, unknown>} patch
 */
export async function patchAgentsamToolCatalogAndMirror(env, toolIdentifier, patch) {
  const row = await loadAgentsamToolRow(env, toolIdentifier);
  if (!row) return { ok: false, error: 'Tool not found in agentsam_tools' };
  if (!env?.DB) return { ok: false, error: 'DB binding missing' };

  const sets = [];
  const binds = [];
  const allowed = [
    'tool_category',
    'mcp_service_url',
    'description',
    'input_schema',
    'requires_approval',
    'handler_config',
    'handler_type',
    'risk_level',
    'modes_json',
    'is_active',
    'is_degraded',
  ];

  for (const col of allowed) {
    if (patch[col] == null) continue;
    let val = patch[col];
    if (col === 'input_schema' || col === 'handler_config' || col === 'modes_json') {
      val = typeof val === 'string' ? val : JSON.stringify(val);
    }
    if (col === 'requires_approval' || col === 'is_active' || col === 'is_degraded') {
      const n = Number(val);
      val = Number.isFinite(n) ? n : val ? 1 : 0;
    }
    sets.push(`${col} = ?`);
    binds.push(val);
  }

  if (!sets.length) return { ok: false, error: 'No allowed fields to update' };

  sets.push('updated_at = unixepoch()');
  const key = trim(row.tool_key || row.tool_name);
  binds.push(key, key, key);

  await env.DB.prepare(
    `UPDATE agentsam_tools SET ${sets.join(', ')}
     WHERE tool_key = ? OR tool_name = ? OR tool_code = ?`,
  )
    .bind(...binds)
    .run();

  const sync = await syncAgentsamMcpToolMirrorFromCatalog(env, key);
  const updated = await loadAgentsamToolRow(env, key);
  return { ok: true, tool: updated, mirror: sync };
}
