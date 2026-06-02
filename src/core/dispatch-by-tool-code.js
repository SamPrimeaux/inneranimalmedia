/**
 * Catalog dispatch: agentsam_tools row → resolveCredential → catalog-tool-executor.
 * No hardcoded tool names; no runBuiltinTool fallback.
 */
import { parseHandlerConfig, resolveCredential } from './resolve-credential.js';
import { executeCatalogTool } from './catalog-tool-executor.js';
import {
  loadAgentsamToolRow,
  validateHandlerConfigForExecution,
} from './agentsam-tools-catalog.js';
import { resolveIntegrationUserId } from './integration-user-id.js';

function parseInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

/**
 * @param {any} env
 * @param {string} toolCodeOrKey — tool_code, tool_key, tool_name, or display_name
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext — workspaceId, tenantId, userId required for user creds
 */
export async function dispatchByToolCode(env, toolCodeOrKey, input, runContext = {}) {
  const row = await loadAgentsamToolRow(env, toolCodeOrKey);
  if (!row) {
    return { ok: false, error: `agentsam_tools not found: ${toolCodeOrKey}` };
  }

  const config = parseHandlerConfig(row.handler_config);
  const configCheck = validateHandlerConfigForExecution(row, config);
  if (!configCheck.ok) {
    return { ok: false, error: configCheck.error, tool_key: row.tool_key };
  }

  const workspaceId = runContext.workspaceId ?? runContext.workspace_id ?? null;
  const tenantId = runContext.tenantId ?? runContext.tenant_id ?? null;
  let userId = runContext.userId ?? runContext.user_id ?? null;
  if (userId) {
    const canonicalUserId = await resolveIntegrationUserId(env, { id: String(userId) });
    if (canonicalUserId) userId = canonicalUserId;
  }

  let credentials = { auth_source: 'none', value: null };
  if (config.auth_source) {
    try {
      credentials = await resolveCredential(env, workspaceId, tenantId, config, {
        userId,
        authUser: runContext.authUser ?? runContext.user ?? null,
        account_identifier: config.account_identifier,
        isInternalAgent: runContext.isInternalAgent !== false,
        isOperatorCall:
          runContext.isOperatorCall === true ||
          runContext.is_operator_call === true,
        mcpBearer: runContext.mcpBearer ?? runContext.mcp_bearer ?? null,
      });
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e), tool_key: row.tool_key };
    }
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

/**
 * Adapter-friendly wrapper — returns tool output or { error } (no runBuiltinTool).
 * @param {any} env
 * @param {string} toolKey
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 */
export async function dispatchCatalogToolResult(env, toolKey, input, runContext = {}) {
  const out = await dispatchByToolCode(env, toolKey, input, runContext);
  if (out?.ok === false) {
    return { error: out.error ?? 'dispatch_failed' };
  }
  return out.result ?? out;
}
