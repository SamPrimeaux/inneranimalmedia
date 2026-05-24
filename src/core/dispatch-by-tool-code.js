/**
 * Catalog dispatch: agentsam_tools row → resolveCredential → catalog-tool-executor.
 * No hardcoded tool names; no runBuiltinTool fallback.
 */
import { parseHandlerConfig, resolveCredential } from './resolve-credential.js';
import { executeCatalogTool } from './catalog-tool-executor.js';

function parseInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

/**
 * @param {any} env
 * @param {string} toolCodeOrKey
 */
async function loadAgentsamToolRow(env, toolCodeOrKey) {
  const key = String(toolCodeOrKey || '').trim();
  if (!env?.DB || !key) return null;
  return env.DB.prepare(
    `SELECT id, tool_key, tool_code, tool_name, handler_type, handler_config, handler_key,
            linked_mcp_tool_id, mcp_service_url, is_active
     FROM agentsam_tools
     WHERE COALESCE(is_active, 1) = 1
       AND (tool_code = ? OR tool_key = ? OR tool_name = ?)
     LIMIT 1`,
  )
    .bind(key, key, key)
    .first();
}

/**
 * @param {any} env
 * @param {string} toolCodeOrKey — tool_code, tool_key, or tool_name
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext — workspaceId, tenantId, userId required for user creds
 */
export async function dispatchByToolCode(env, toolCodeOrKey, input, runContext = {}) {
  const row = await loadAgentsamToolRow(env, toolCodeOrKey);
  if (!row) {
    return { ok: false, error: `agentsam_tools not found: ${toolCodeOrKey}` };
  }

  const config = parseHandlerConfig(row.handler_config);
  const workspaceId = runContext.workspaceId ?? runContext.workspace_id ?? null;
  const tenantId = runContext.tenantId ?? runContext.tenant_id ?? null;
  const userId = runContext.userId ?? runContext.user_id ?? null;

  let credentials;
  try {
    credentials = await resolveCredential(env, workspaceId, tenantId, config, {
      userId,
      account_identifier: config.account_identifier,
    });
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e), tool_key: row.tool_key };
  }

  const enrichedContext = {
    ...runContext,
    credentials,
    agentsam_tool_id: row.id,
    agentsam_tool_key: row.tool_key,
    handler_type: row.handler_type,
  };

  const out = await executeCatalogTool(
    env,
    row,
    config,
    {
      ...parseInput(input),
      workspace_id: workspaceId,
      tenant_id: tenantId,
      user_id: userId,
    },
    enrichedContext,
    credentials,
  );

  if (!out.ok) {
    return {
      ok: false,
      error: out.error,
      tool_key: row.tool_key,
      auth_source: credentials.auth_source,
      status: out.status,
      body: out.body,
    };
  }

  return {
    ok: true,
    tool_key: row.tool_key,
    auth_source: credentials.auth_source,
    status: out.status,
    result: out.body,
  };
}
