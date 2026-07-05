/**
 * Cloudflare Bindings MCP proxy — account-level CF ops via connected user OAuth.
 * URL: https://bindings.mcp.cloudflare.com/mcp (streamable HTTP)
 *
 * Internal lanes (env.DB, R2 object CRUD, Vectorize) stay for gaps CF MCP does not cover.
 */

export const CF_BINDINGS_MCP_URL = 'https://bindings.mcp.cloudflare.com/mcp';
export const CF_BINDINGS_MCP_SERVER_KEY = 'cloudflare-bindings';

/** Platform D1 (inneranimalmedia-business) — wrangler.production.toml */
export const PLATFORM_D1_DATABASE_ID = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} config
 */
export function isCfMcpCatalogTool(row, config) {
  const serverKey = trim(row?.server_key || config?.server_key);
  const mcpUrl = trim(row?.mcp_service_url || config?.mcp_service_url);
  const provider = trim(config?.provider).toLowerCase();
  const authSource = trim(config?.auth_source).toLowerCase();
  const dispatchTarget = trim(row?.dispatch_target || config?.dispatch_target).toLowerCase();
  const remoteTool = trim(config?.remote_tool || config?.operation);
  if (serverKey === CF_BINDINGS_MCP_SERVER_KEY) return true;
  if (mcpUrl.includes('bindings.mcp.cloudflare.com')) return true;
  if (provider === 'cloudflare' && remoteTool) return true;
  if (authSource === 'user_oauth_cloudflare') return true;
  if ((dispatchTarget === 'mcp_proxy' || dispatchTarget === 'both') && remoteTool) return true;
  return false;
}

export function resolveCfMcpRemoteToolName(config, params = {}) {
  const explicit = trim(config?.remote_tool);
  if (explicit) return explicit;

  const op = trim(config?.operation || params?.operation || params?.op).toLowerCase();
  if (op === 'd1.query' || op === 'query') return 'd1_database_query';
  if (op === 'd1.write' || op === 'write') return 'd1_database_query';
  if (op === 'd1.databases' || op === 'd1.list') return 'd1_databases_list';
  if (op === 'workers.list') return 'workers_list';
  if (op === 'workers.get') return 'workers_get_worker';
  if (op === 'r2.list' || op === 'r2.buckets') return 'r2_buckets_list';
  if (op === 'kv.list') return 'kv_namespaces_list';

  const base = trim(config?.operation);
  if (base === 'r2_buckets_list') {
    const sub = trim(params?.operation || params?.op).toLowerCase();
    if (sub === 'get') return 'r2_bucket_get';
    if (sub === 'create') return 'r2_bucket_create';
  }
  return base;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} config
 * @returns {{ route: 'none'|'mcp_only'|'mcp_first', remoteTool: string, mcpRow: Record<string, unknown> }|null}
 */
export function resolveCfMcpCatalogRoute(row, config) {
  if (!isCfMcpCatalogTool(row, config)) return null;

  const dispatchTarget = trim(row?.dispatch_target || config?.dispatch_target || 'internal').toLowerCase();
  const handlerType = trim(row?.handler_type).toLowerCase();
  const remoteTool = resolveCfMcpRemoteToolName(config, {});
  if (!remoteTool || /^d1\./i.test(remoteTool)) return null;

  if (dispatchTarget === 'internal' && handlerType !== 'mcp') return null;

  const route =
    dispatchTarget === 'mcp_proxy' || handlerType === 'mcp'
      ? 'mcp_only'
      : dispatchTarget === 'both'
        ? 'mcp_first'
        : 'none';

  if (route === 'none') return null;

  return {
    route,
    remoteTool,
    mcpRow: {
      tool_key: row.tool_key,
      tool_name: row.tool_name || row.tool_key,
      handler_config: JSON.stringify({
        ...(typeof config === 'object' && config ? config : {}),
        remote_tool: remoteTool,
        server_key: trim(row.server_key || config?.server_key) || CF_BINDINGS_MCP_SERVER_KEY,
      }),
      mcp_service_url: trim(row.mcp_service_url || config.mcp_service_url) || CF_BINDINGS_MCP_URL,
      server_key: trim(row.server_key || config.server_key) || CF_BINDINGS_MCP_SERVER_KEY,
    },
  };
}

/**
 * @param {any} env
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null, authUser?: unknown }} ctx
 */
export async function resolveCfMcpBearerToken(env, ctx) {
  const { getOAuthToken } = await import('./user-oauth-token.js');
  const userId = trim(ctx?.userId);
  if (!userId) {
    return {
      ok: false,
      error: 'user_oauth_required',
      user_message: 'Sign in and connect Cloudflare in Integrations before using CF MCP tools.',
    };
  }

  const oauth = await getOAuthToken(env, userId, 'cloudflare');
  if (oauth) {
    return { ok: true, token: oauth, source: 'user_oauth_cloudflare' };
  }

  const authUser = ctx?.authUser;
  const { userHasSuperadminRole } = await import('./resolve-credential.js');
  if (userHasSuperadminRole(authUser)) {
    const platformToken = trim(env?.CLOUDFLARE_API_TOKEN);
    if (platformToken) {
      return { ok: true, token: platformToken, source: 'platform_superadmin' };
    }
  }

  return {
    ok: false,
    error: 'cloudflare_not_connected',
    reauth_required: true,
    user_message:
      'Connect Cloudflare Developer Platform in Settings → Integrations (OAuth). Platform API token fallback unavailable.',
  };
}

/**
 * Map agentsam catalog params → Cloudflare Bindings MCP tool arguments.
 * @param {string} remoteTool
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} config
 * @param {any} env
 */
export function mapAgentsamParamsToCfMcp(remoteTool, params, config, env) {
  const p = params && typeof params === 'object' ? params : {};
  const rt = trim(remoteTool);
  const defaultDb =
    trim(config?.default_database_id) ||
    trim(env?.PLATFORM_D1_DATABASE_ID) ||
    PLATFORM_D1_DATABASE_ID;

  if (rt === 'd1_database_query') {
    return {
      database_id: trim(p.database_id || p.databaseId) || defaultDb,
      sql: trim(p.sql || p.query),
      params: Array.isArray(p.params) ? p.params : p.params ?? null,
    };
  }

  if (rt === 'd1_databases_list') {
    return {};
  }

  if (rt === 'd1_database_get') {
    return {
      database_id: trim(p.database_id || p.databaseId) || defaultDb,
    };
  }

  if (rt === 'workers_list') {
    return {};
  }

  if (rt === 'workers_get_worker') {
    return {
      script_name: trim(p.script_name || p.name || p.worker_name || p.scriptName),
    };
  }

  if (rt === 'workers_get_worker_code') {
    return {
      script_name: trim(p.script_name || p.name || p.worker_name || p.scriptName),
    };
  }

  if (rt === 'kv_namespaces_list') {
    return {};
  }

  if (rt === 'kv_namespace_get') {
    return { namespace_id: trim(p.namespace_id || p.namespaceId || p.id) };
  }

  if (rt === 'kv_namespace_create') {
    return { title: trim(p.title || p.name) };
  }

  if (rt === 'r2_buckets_list') {
    const op = trim(p.operation || p.op || 'list').toLowerCase();
    if (op === 'get') {
      return { name: trim(p.name || p.bucket || p.bucket_name) };
    }
    if (op === 'create') {
      return { name: trim(p.name || p.bucket || p.bucket_name) };
    }
    return {};
  }

  if (rt === 'r2_bucket_get') {
    return { name: trim(p.name || p.bucket || p.bucket_name) };
  }

  if (rt === 'r2_bucket_create') {
    return { name: trim(p.name || p.bucket || p.bucket_name) };
  }

  return p;
}

/**
 * Normalize JSON-RPC tools/call result from Cloudflare MCP into agent-friendly body.
 * @param {unknown} jsonRpcBody
 */
export function normalizeCfMcpToolResultBody(jsonRpcBody) {
  if (!jsonRpcBody || typeof jsonRpcBody !== 'object') return jsonRpcBody;
  const rpc = /** @type {Record<string, unknown>} */ (jsonRpcBody);
  if (rpc.error && typeof rpc.error === 'object') {
    const err = /** @type {Record<string, unknown>} */ (rpc.error);
    return {
      ok: false,
      error: trim(err.message) || 'cf_mcp_error',
      code: err.code ?? null,
    };
  }

  const result = rpc.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = /** @type {Record<string, unknown>} */ (result);
    if (r.structuredContent != null) return r.structuredContent;
    if (Array.isArray(r.content)) {
      const text = r.content
        .filter((c) => c && typeof c === 'object' && /** @type {any} */ (c).type === 'text')
        .map((c) => String(/** @type {any} */ (c).text || ''))
        .filter(Boolean)
        .join('\n');
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return { text, mcp_content: r.content };
        }
      }
      return r;
    }
    return r;
  }

  return rpc;
}
