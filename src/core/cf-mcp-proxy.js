/**
 * Cloudflare Bindings MCP proxy — account-level CF ops via connected user OAuth.
 * URL: https://bindings.mcp.cloudflare.com/mcp (streamable HTTP)
 *
 * Internal lanes (env.DB, R2 object CRUD, Vectorize) stay for gaps CF MCP does not cover.
 */

import { IAM_D1_DATABASE_ID } from './d1-graphql-analytics.js';
import { logDataPlaneSecurityEvent } from './data-plane-access-guard.js';
import { isPlatformOperator, resolveOperatorAuthUserRow } from './operator-identity.js';

export const CF_BINDINGS_MCP_URL = 'https://bindings.mcp.cloudflare.com/mcp';
export const CF_BINDINGS_MCP_SERVER_KEY = 'cloudflare-bindings';

/** SSOT: same id as wrangler / IAM_D1_DATABASE_ID — re-export for catalog tests. */
export const PLATFORM_D1_DATABASE_ID = IAM_D1_DATABASE_ID;

const D1_REMOTE_TOOLS_REQUIRING_OWNERSHIP = new Set([
  'd1_database_query',
  'd1_database_get',
  'd1_database_delete',
]);

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** @param {string|null|undefined} databaseId */
export function isPlatformD1DatabaseId(databaseId) {
  const id = trim(databaseId).toLowerCase();
  return id !== '' && id === IAM_D1_DATABASE_ID.toLowerCase();
}

/**
 * List D1 databases visible to a Cloudflare OAuth/API token (all accounts on token).
 * @param {string} token
 * @returns {Promise<Array<{ database_id: string, database_name: string, account_id: string }>>}
 */
export async function listOAuthAccountD1Catalog(token) {
  const bearer = trim(token);
  if (!bearer) return [];
  const { cfApi } = await import('./customer-cloudflare-dispatch.js');
  const accounts = await cfApi(bearer, '/accounts');
  /** @type {Array<{ database_id: string, database_name: string, account_id: string }>} */
  const out = [];
  const seen = new Set();
  for (const acct of Array.isArray(accounts) ? accounts : []) {
    const accountId = trim(acct?.id);
    if (!accountId) continue;
    let databases = [];
    try {
      databases = await cfApi(
        bearer,
        `/accounts/${encodeURIComponent(accountId)}/d1/database`,
      );
    } catch {
      continue;
    }
    for (const db of Array.isArray(databases) ? databases : []) {
      const databaseId = trim(db?.uuid || db?.id);
      if (!databaseId) continue;
      const key = databaseId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        database_id: databaseId,
        database_name: trim(db?.name) || databaseId,
        account_id: accountId,
      });
    }
  }
  return out;
}

/**
 * @param {any} env
 * @param {unknown} authUser
 */
async function resolveCallerIsPlatformOperator(env, authUser) {
  const row = await resolveOperatorAuthUserRow(env, authUser);
  return isPlatformOperator(env, row);
}

/**
 * Operator: unscoped (audited). Non-operator: database must belong to caller OAuth account;
 * platform business D1 id is always rejected.
 *
 * @param {any} env
 * @param {string|null|undefined} userId
 * @param {string|null|undefined} databaseId
 * @param {unknown} [authUser]
 */
export async function assertCallerOwnsDatabaseId(env, userId, databaseId, authUser = null) {
  const dbId = trim(databaseId);
  if (!dbId) {
    return {
      ok: false,
      error: 'database_id_required',
      user_message: 'Pass database_id for this D1 operation, or list databases first.',
    };
  }

  const uid = trim(userId);
  if (!uid) {
    return {
      ok: false,
      error: 'user_oauth_required',
      user_message: 'Sign in before using Cloudflare D1 tools.',
    };
  }

  const operator = await resolveCallerIsPlatformOperator(env, authUser);
  if (operator) {
    logDataPlaneSecurityEvent('platform_operator_d1_access', {
      user_id: uid,
      database_id: dbId,
      auth_scope: 'platform_operator',
    });
    return { ok: true, auth_scope: 'platform_operator' };
  }

  if (isPlatformD1DatabaseId(dbId)) {
    logDataPlaneSecurityEvent('platform_d1_denied_non_operator', {
      user_id: uid,
      database_id: dbId,
    });
    return {
      ok: false,
      error: 'platform_d1_denied',
      user_message:
        'IAM platform D1 is operator-only. Connect your Cloudflare account and use a database from your account.',
    };
  }

  const { getOAuthToken } = await import('./user-oauth-token.js');
  const oauth = await getOAuthToken(env, uid, 'cloudflare');
  if (!oauth) {
    return {
      ok: false,
      error: 'cloudflare_not_connected',
      reauth_required: true,
      user_message: 'Connect Cloudflare in Integrations before using D1 tools.',
    };
  }

  const catalog = await listOAuthAccountD1Catalog(oauth);
  const match = catalog.find((e) => e.database_id.toLowerCase() === dbId.toLowerCase());
  if (!match) {
    logDataPlaneSecurityEvent('d1_database_not_in_caller_account', {
      user_id: uid,
      database_id: dbId,
      auth_scope: 'user_account',
    });
    return {
      ok: false,
      error: 'database_id_not_in_account',
      user_message:
        'That D1 database is not in your connected Cloudflare account. List your databases and pick a valid database_id.',
    };
  }

  return {
    ok: true,
    auth_scope: 'user_account',
    account_id: match.account_id,
    database_id: match.database_id,
    token: oauth,
  };
}

/**
 * A tool routes through CF Bindings MCP only when explicitly opted in via:
 *   - server_key = 'cloudflare-bindings', OR
 *   - mcp_service_url contains 'bindings.mcp.cloudflare.com', OR
 *   - auth_source = 'user_oauth_cloudflare', OR
 *   - dispatch_target = 'mcp_proxy' AND an explicit remote_tool in handler_config
 *
 * provider=cloudflare alone is NOT sufficient — that flag predates CF MCP and
 * is set on all internal CF tools (D1, KV, R2 internal lanes). Without an
 * explicit remote_tool in handler_config, we never route to Bindings MCP.
 *
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} config
 */
export function isCfMcpCatalogTool(row, config) {
  const serverKey = trim(row?.server_key || config?.server_key);
  const mcpUrl = trim(row?.mcp_service_url || config?.mcp_service_url);
  const authSource = trim(config?.auth_source).toLowerCase();
  const dispatchTarget = trim(row?.dispatch_target || config?.dispatch_target).toLowerCase();
  const explicitRemoteTool = trim(config?.remote_tool);

  if (serverKey === CF_BINDINGS_MCP_SERVER_KEY) return true;
  if (mcpUrl.includes('bindings.mcp.cloudflare.com')) return true;
  if (authSource === 'user_oauth_cloudflare') return true;
  if (dispatchTarget === 'mcp_proxy' && explicitRemoteTool) return true;

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
 * @returns {{ route: 'none'|'mcp_only'|'mcp_first', remoteTool: string, mcpRow: Record<string, unknown> }|null}\n */
export function resolveCfMcpCatalogRoute(row, config) {
  if (!isCfMcpCatalogTool(row, config)) return null;

  const dispatchTarget = trim(row?.dispatch_target || config?.dispatch_target || 'internal').toLowerCase();
  const handlerType = trim(row?.handler_type).toLowerCase();
  const remoteTool = resolveCfMcpRemoteToolName(config, {});
  if (!remoteTool) return null;

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

  const operator = await resolveCallerIsPlatformOperator(env, ctx?.authUser);
  if (operator) {
    const platformToken = trim(env?.CLOUDFLARE_API_TOKEN);
    if (platformToken) {
      return { ok: true, token: platformToken, source: 'platform_operator' };
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
 * Platform D1 default applies only for platform_operator callers.
 *
 * @param {string} remoteTool
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} config
 * @param {any} env
 * @param {{ isPlatformOperator?: boolean }} [scope]
 */
export function mapAgentsamParamsToCfMcp(remoteTool, params, config, env, scope = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const rt = trim(remoteTool);
  const operator = scope.isPlatformOperator === true;
  const defaultDb = operator
    ? trim(config?.default_database_id) ||
      trim(env?.PLATFORM_D1_DATABASE_ID) ||
      IAM_D1_DATABASE_ID
    : '';

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
 * Resolve CF MCP bearer, map params, and enforce D1 database ownership before tools/call.
 *
 * @param {any} env
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null, authUser?: unknown }} ctx
 * @param {string} remoteTool
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} config
 */
export async function prepareCfMcpCloudflareCall(env, ctx, remoteTool, params, config) {
  const tok = await resolveCfMcpBearerToken(env, ctx);
  if (!tok.ok || !tok.token) {
    return {
      ok: false,
      error: tok.error || 'cloudflare_not_connected',
      reauth_required: tok.reauth_required === true,
      user_message: tok.user_message,
    };
  }

  const operator = await resolveCallerIsPlatformOperator(env, ctx?.authUser);
  const mapped = mapAgentsamParamsToCfMcp(remoteTool, params, config, env, {
    isPlatformOperator: operator,
  });
  const rt = trim(remoteTool);

  if (D1_REMOTE_TOOLS_REQUIRING_OWNERSHIP.has(rt)) {
    const dbId = trim(mapped.database_id);
    if (!dbId) {
      return {
        ok: false,
        error: 'database_id_required',
        user_message: operator
          ? 'Pass database_id or omit only when listing databases first.'
          : 'Pass database_id from your Cloudflare account (list databases first).',
      };
    }
    const owned = await assertCallerOwnsDatabaseId(env, ctx?.userId, dbId, ctx?.authUser);
    if (!owned.ok) {
      return {
        ok: false,
        error: owned.error,
        reauth_required: owned.reauth_required === true,
        user_message: owned.user_message,
      };
    }
  }

  return { ok: true, token: tok.token, params: mapped, token_source: tok.source };
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
