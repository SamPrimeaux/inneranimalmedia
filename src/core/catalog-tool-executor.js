/**
 * Execute agentsam_tools rows by handler_type + handler_config only.
 * No hardcoded tool_key / tool_name branches.
 *
 * Credential resolution: ./resolve-credential.js (resolveCredential).
 */
import { resolveCredential, parseHandlerConfig, normalizeAuthSource } from './resolve-credential.js';
export { resolveCredential, parseHandlerConfig, normalizeAuthSource };
import { handlers as dbToolHandlers } from '../tools/db.js';
import { handlers as storageHandlers } from '../tools/builtin/storage.js';
import { handlers as aiOpsHandlers } from '../tools/builtin/ai-ops.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { scheduleMirrorToolCallEventToSupabase } from './hyperdrive-write.js';
import { resolveMcpServerForTool } from './mcp-servers.js';
import { executeOpenWebCatalogDispatch, isOpenWebCatalogConfig } from './open-web-catalog-dispatch.js';
import { authUserIsSuperadmin } from './auth.js';
import {
  assertOwnerPlatformR2Bucket,
  isPlatformOwner,
  ownerHasPlatformR2Transport,
  resolveRegisteredR2BucketName,
  resolveToolRunAuthUser,
} from './platform-owner-r2-access.js';
import { mergeR2S3EnvFromUserStorage } from './user-storage-r2-credentials.js';
import { invokeR2DeleteHttp } from '../tools/builtin/r2-http-catalog.js';
import {
  extractToolExecUsage as extractUsageMetrics,
  shouldSkipCatalogToolCallLog,
} from './tool-exec-telemetry.js';
import {
  executeR2CatalogOperation,
  executeR2ListCatalogOperation,
  isR2ListLikeOperation,
  normalizeR2CatalogOperation,
} from '../tools/builtin/r2-object-crud.js';
import { getR2Binding, resolveR2BucketName } from '../api/r2-api.js';
import {
  catalogOperationIsSemanticSearch,
  catalogOperationRequiresSql,
  resolveCatalogDataPlaneOperation,
  resolveCatalogDataPlaneProvider,
  resolveCustomerSupabaseDataPlane,
} from './catalog-data-plane-operation.js';
import {
  resolveRepoRootForHost,
  vmWorkspaceCdCommandFromSettings,
  vmWorkspaceRootFromSettings,
} from './host-workspace-paths.js';
import {
  resolveTerminalExecRouting,
  terminalToolPrefersGcpLane,
} from './terminal-routing-policy.js';

function parseInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

/** Resolve deploy shell command from workspace_settings.settings_json using handler_config.command_source. */
function resolveWorkspaceDeployCommand(settingsJson, commandSource) {
  let parsed = settingsJson;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return '';
    }
  }
  if (!parsed || typeof parsed !== 'object') return '';

  const src = String(commandSource || 'workspace_settings.deploy_command').trim();
  if (src.startsWith('workspace_settings.')) {
    const key = src.slice('workspace_settings.'.length);
    const specific = String(parsed[key] ?? '').trim();
    if (specific) return specific;
  }
  return String(parsed.deploy_command || '').trim();
}

/**
 * Prefix workspace deploy/build commands so PTY and tunnel exec run in the repo root.
 * @param {string|object|null} settingsJson
 * @param {string} command
 * @param {{ gcpExec?: boolean }} [opts]
 */
export function wrapWorkspaceShellCommand(settingsJson, command, opts = {}) {
  const cmd = String(command || '').trim();
  if (!cmd) return cmd;

  let parsed = settingsJson;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return cmd;
    }
  }
  if (!parsed || typeof parsed !== 'object') return cmd;

  if (/^\s*cd\s+/i.test(cmd)) return cmd;

  const gcpExec = opts.gcpExec === true;
  if (gcpExec) {
    const vmRoot = String(parsed.vm_workspace_root || parsed.repo?.vm_path || '').trim();
    const root = vmRoot || '/home/samprimeaux/inneranimalmedia';
    if (root && cmd.includes(root)) return cmd;
    return `cd ${root} && ${cmd}`;
  }

  const root = String(parsed.workspace_root || '').trim();
  if (root && cmd.includes(root)) return cmd;

  const cdPrefix = String(parsed.workspace_cd_command || '').trim();
  if (cdPrefix) {
    if (/&&\s*$/.test(cdPrefix)) return `${cdPrefix} ${cmd}`;
    if (cdPrefix.includes('&&')) return `${cdPrefix} && ${cmd}`;
    return `${cdPrefix} && ${cmd}`;
  }
  if (root) return `cd ${root} && ${cmd}`;
  return cmd;
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableSortValue(value[key])]),
    );
  }
  return value;
}

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeJsonString(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return fallback;
  }
}

function summarizeOutput(output) {
  const text =
    output?.content?.[0]?.text ??
    output?.text ??
    output?.message ??
    output?.error ??
    safeJsonString(output, '');
  return String(text || '').slice(0, 1000) || null;
}

/** Parse wrangler-style D1 hints when the model omits sql. */
function parseD1DatabaseHint(params) {
  const p = params && typeof params === 'object' ? params : {};
  const directId = String(p.database_id || p.databaseId || '').trim();
  const directName = String(p.database_name || p.databaseName || '').trim();
  if (directId || directName) {
    return { database_id: directId || null, database_name: directName || null, binding: null };
  }
  let raw = p.d1_databases;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/database_id["'\s:]+\s*["']?([0-9a-f-]{36})/i);
      if (m?.[1]) {
        const nameM = String(p.d1_databases || raw).match(/database_name["'\s:]+\s*["']?([^"',\]]+)/i);
        return {
          database_id: m[1],
          database_name: nameM?.[1]?.trim() || null,
          binding: null,
        };
      }
    }
  }
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
    return {
      database_id: String(raw[0].database_id || '').trim() || null,
      database_name: String(raw[0].database_name || '').trim() || null,
      binding: String(raw[0].binding || '').trim() || null,
    };
  }
  return null;
}

async function runCatalogD1SchemaIntrospect(env, d1Ctx, params) {
  const { resolveWorkspaceD1Execution, executeWorkspaceD1Query } = await import(
    './workspace-d1-execution.js'
  );
  const resolved = await resolveWorkspaceD1Execution(env, d1Ctx);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      user_message: resolved.user_message,
    };
  }
  if (resolved.mode === 'remote') {
    const tbl = params.table != null ? String(params.table).trim() : '';
    const sql = tbl
      ? `PRAGMA table_info(${tbl})`
      : `SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC LIMIT 500`;
    const out = await executeWorkspaceD1Query(env, d1Ctx, sql);
    return out.ok
      ? {
          ok: true,
          body: {
            ...(tbl ? { table: tbl, columns: out.rows } : { objects: out.rows }),
            database_id: resolved.database_id ?? null,
            mode: out.mode ?? resolved.mode,
          },
        }
      : { ok: false, error: out.error, user_message: out.user_message };
  }
  const out = await dbToolHandlers.d1_schema_introspect(params, env);
  return out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
}

/** Cloudflare lane: D1 query/write/migrate (handler_type cf; legacy d1 alias). */
function isCatalogCfD1Operation(toolKey, config) {
  const key = String(toolKey || '').trim();
  if (/^agentsam_d1_/i.test(key)) return true;
  const resource = String(config?.resource || '').toLowerCase();
  if (resource === 'd1') return true;
  const op = String(config?.operation || '').toLowerCase();
  return op.startsWith('d1.') || op === 'd1';
}

function normalizeCatalogCfD1Op(config, toolKey) {
  let op = String(config?.operation || '').toLowerCase();
  if (op.startsWith('d1.')) op = op.slice(3);
  if (op === 'd1') op = 'query';
  if (!op) {
    const key = String(toolKey || '').toLowerCase();
    if (key.includes('write')) return 'write';
    if (key.includes('migrate')) return 'migrate';
    return 'query';
  }
  return op;
}

/**
 * Inline D1 SQL from handler_config.sql (handler_type agent).
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
function compileCatalogInlineAgentSql(config, params, runContext) {
  let sql = String(config.sql || '').trim();
  if (!sql) return null;
  const binds = [];
  const ws = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();

  sql = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, name) => {
    if (name === 'workspace_id' && config.bind_workspace) {
      binds.push(ws);
      return '?';
    }
    const val = params?.[name] ?? runContext?.[name];
    if (val !== undefined && val !== null) {
      binds.push(val);
      return '?';
    }
    return match;
  });
  return { sql, params: binds };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
async function executeCatalogInlineAgentSql(env, config, params, runContext) {
  const compiled = compileCatalogInlineAgentSql(config, params, runContext);
  if (!compiled?.sql) {
    return { ok: false, error: 'inline agent tool requires handler_config.sql' };
  }
  const { executeWorkspaceD1Query } = await import('./workspace-d1-execution.js');
  const authUser = runContext.authUser ?? runContext.user ?? null;
  const d1Ctx = {
    user_id: runContext.userId ?? runContext.user_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    authUser,
  };
  const out = await executeWorkspaceD1Query(env, d1Ctx, compiled.sql, compiled.params);
  return out.ok
    ? { ok: true, body: { rows: out.rows || [], count: (out.rows || []).length } }
    : { ok: false, error: out.error, user_message: out.user_message };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row agentsam_tools row (dispatch_target, handler_config)
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
async function executeCatalogCfD1(env, row, config, params, runContext) {
  const toolKey = String(
    runContext.agentsam_tool_key ?? row?.tool_key ?? params.tool_key ?? '',
  ).trim();
  const cfRouteRow = {
    ...row,
    tool_key: toolKey,
    handler_type: row?.handler_type || 'cf',
    dispatch_target: row?.dispatch_target ?? config?.dispatch_target,
    handler_config: row?.handler_config ?? config,
  };
  const { resolveCfMcpCatalogRoute, normalizeCfMcpToolResultBody } = await import('./cf-mcp-proxy.js');
  const cfRoute = resolveCfMcpCatalogRoute(cfRouteRow, config);
  if (cfRoute) {
    const mcpOut = await executeMcpCatalogRow(env, cfRoute.mcpRow, params, runContext);
    if (mcpOut.ok) {
      return { ok: true, body: normalizeCfMcpToolResultBody(mcpOut.body) };
    }
    if (cfRoute.route === 'mcp_only') {
      return {
        ok: false,
        error: mcpOut.error,
        user_message: mcpOut.body?.user_message,
        body: mcpOut.body,
      };
    }
  }

  const { executeWorkspaceD1Query } = await import(
    './workspace-d1-execution.js'
  );
  const authUser = runContext.authUser ?? runContext.user ?? null;
  const d1Ctx = {
    user_id: runContext.userId ?? runContext.user_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    authUser,
  };

  const op = normalizeCatalogCfD1Op(config, toolKey);
  try {
    if (op === 'introspect' || op === 'schema') {
      return runCatalogD1SchemaIntrospect(env, d1Ctx, params);
    }

    const sql = String(params.sql || params.query || '').trim();
    const d1Hint = parseD1DatabaseHint(params);
    if (!sql) {
      if (params.table != null && String(params.table).trim() !== '') {
        return runCatalogD1SchemaIntrospect(env, d1Ctx, params);
      }
      if (d1Hint?.database_id || d1Hint?.database_name || op === 'query') {
        return runCatalogD1SchemaIntrospect(env, d1Ctx, params);
      }
      return {
        ok: false,
        error: `cf d1 tool requires sql in input (operation=${op})`,
        user_message:
          'Pass sql for a query, or omit sql (or pass database_id / d1_databases) to list tables and schema.',
      };
    }

    if (op === 'execute' || op === 'write' || op === 'migrate') {
      const { executeWorkspaceD1Write } = await import('./workspace-d1-execution.js');
      const writeOut = await executeWorkspaceD1Write(env, d1Ctx, sql, params.params);
      if (!writeOut.ok) {
        return {
          ok: false,
          error: writeOut.error || 'access_denied',
          user_message: writeOut.user_message,
        };
      }
      return {
        ok: true,
        body: {
          ...(writeOut.body && typeof writeOut.body === 'object' ? writeOut.body : { result: writeOut.body }),
          data_plane: writeOut.mode,
          meta: writeOut.meta ?? {},
        },
      };
    }

    const out = await executeWorkspaceD1Query(env, d1Ctx, sql, params.params);
    return out.ok
      ? { ok: true, body: { rows: out.rows, data_plane: out.mode, meta: out.meta ?? {} } }
      : { ok: false, error: out.error, user_message: out.user_message };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function writeTelemetryError(env, runContext, source, error) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_error_log
         (workspace_id, tenant_id, session_id, error_type, error_message, source, created_at)
       VALUES (?,?,?,?,?,?,unixepoch())`,
    )
      .bind(
        String(runContext?.workspaceId ?? runContext?.workspace_id ?? 'unknown').trim() || 'unknown',
        String(runContext?.tenantId ?? runContext?.tenant_id ?? 'system').trim() || 'system',
        runContext?.conversationId ?? runContext?.conversation_id ?? runContext?.sessionId ?? runContext?.session_id ?? null,
        'db_write_failure',
        String(error?.message || error || 'telemetry_failed').slice(0, 1000),
        source,
      )
      .run();
  } catch (_) {}
}

async function insertToolCallLog(env, payload, runContext) {
  const stmt = await env.DB.prepare(
    `INSERT INTO agentsam_tool_call_log
      (tenant_id, workspace_id, user_id, agent_run_id,
       tool_name, tool_key, handler_key, capability_key,
       agentsam_tools_id, routing_arm_id, conversation_id,
       status, input_json, output_json,
       input_summary, output_summary,
       input_tokens, output_tokens,
       input_cost_usd, output_cost_usd, cost_usd,
       duration_ms, timed_out, tool_category,
       agent_id, source_tool)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      payload.tenantId,
      payload.workspaceId,
      payload.userId,
      payload.agentRunId,
      payload.toolName,
      payload.toolKey,
      payload.handlerKey,
      payload.capabilityKey,
      payload.agentsamToolsId,
      payload.routingArmId,
      payload.conversationId,
      payload.status,
      payload.inputJson,
      payload.outputJson,
      payload.inputSummary,
      payload.outputSummary,
      payload.inputTokens,
      payload.outputTokens,
      payload.inputCostUsd,
      payload.outputCostUsd,
      payload.totalCostUsd,
      payload.durationMs,
      payload.timedOut ? 1 : 0,
      payload.toolCategory,
      payload.agentId,
      payload.sourceTool,
    )
    .run();
  return String(stmt?.meta?.last_row_id ?? stmt?.lastRowId ?? '') || null;
}

function bindingBucket(env, bindingName) {
  const key = String(bindingName || 'DB').trim();
  if (key === 'ASSETS' || key === 'DASHBOARD') return env.ASSETS;
  if (key === 'AI') return env.AI;
  return env[key] ?? env.DB;
}

/**
 * Resolve the remote MCP JSON-RPC tool name (may differ from agentsam_tools.tool_key).
 * @param {Record<string, unknown>} mcpRow
 * @param {Record<string, unknown>} config
 */
function trimMcpValue(v) {
  if (v == null) return '';
  return String(v).trim();
}

function resolveMcpRemoteToolName(mcpRow, config) {
  const remote = trimMcpValue(config?.remote_tool || config?.operation);
  if (remote) return remote;
  const toolName = trimMcpValue(mcpRow.tool_name || mcpRow.tool_key);
  if (/^agentsam_(gh_|github_mcp_|gmail_mcp_)/i.test(toolName)) return '';
  return toolName;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} mcpRow
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeMcpCatalogRow(env, mcpRow, params, runContext) {
  const config = parseHandlerConfig(mcpRow.handler_config);
  const toolKey = trimMcpValue(mcpRow.tool_key || mcpRow.tool_name);
  let mcpCallName = resolveMcpRemoteToolName(mcpRow, config) || toolKey;
  const tenantId = trimMcpValue(runContext.tenantId ?? runContext.tenant_id);
  const userId = trimMcpValue(runContext.userId ?? runContext.user_id);
  const workspaceId = trimMcpValue(runContext.workspaceId ?? runContext.workspace_id);
  const toolForResolve = {
    ...mcpRow,
    server_key: mcpRow.server_key || config.server_key,
    mcp_service_url: mcpRow.mcp_service_url || config.mcp_service_url,
    handler_config: mcpRow.handler_config,
  };
  const { url, serverRow } = await resolveMcpServerForTool(env, {
    tenantId,
    workspaceId,
  }, toolForResolve);

  if (url) {
    const headers = { 'Content-Type': 'application/json' };
    const authType = String(serverRow?.auth_type || '').toLowerCase();
    const authSource = String(config.auth_source || '').toLowerCase();
    const provider = String(config.provider || '').toLowerCase();
    const needsGithubUserToken =
      authType === 'user_oauth_github' ||
      authSource === 'user_oauth_github' ||
      (authSource === 'user_oauth_tokens' && provider === 'github');
    const needsGmailUserToken =
      authType === 'user_oauth_gmail' ||
      authSource === 'user_oauth_gmail' ||
      (authSource === 'user_oauth_tokens' &&
        (provider === 'google_gmail' || provider === 'gmail')) ||
      String(url || '').includes('gmailmcp.googleapis.com');
    const serverKey = trimMcpValue(serverRow?.server_key || toolForResolve.server_key || config.server_key);
    const needsCloudflareUserToken =
      authType === 'user_oauth_cloudflare' ||
      (authSource === 'user_oauth_tokens' && provider === 'cloudflare') ||
      serverKey === 'cloudflare-bindings' ||
      String(url || '').includes('bindings.mcp.cloudflare.com');

    if (needsGithubUserToken) {
      if (!userId) {
        return {
          ok: false,
          error: 'user_oauth_required',
          failed_tool: toolKey,
          body: { user_message: 'This GitHub tool requires an authenticated user session.' },
        };
      }
      const { getUserGithubToken } = await import('../integrations/github.js');
      const account = trimMcpValue(
        params.account_identifier ?? params.account ?? params.provider_account_id,
      );
      const gh = await getUserGithubToken(env, userId, account);
      const accessToken = gh?.token ? String(gh.token).trim() : '';
      if (!accessToken) {
        return {
          ok: false,
          error: 'github_not_connected',
          failed_tool: toolKey,
          reauth_required: true,
          body: { user_message: 'Connect GitHub in Integrations before using GitHub MCP tools.' },
        };
      }
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (needsGmailUserToken) {
      if (!userId) {
        return {
          ok: false,
          error: 'user_oauth_required',
          failed_tool: toolKey,
          body: {
            user_message: 'This Gmail tool requires an authenticated user session.',
            connect_url: '/api/integrations/gmail/connect?return_to=/dashboard/settings/integrations',
          },
        };
      }
      const { getGmailTokenRowForUser } = await import('./gmail-user-tokens.js');
      const { resolveOAuthAccessToken } = await import('../api/oauth.js');
      const account = trimMcpValue(
        params.account_identifier ?? params.account ?? params.provider_account_id,
      );
      const authUser = {
        id: userId,
        email: trimMcpValue(runContext?.userEmail ?? runContext?.email),
      };
      const gmailRow = await getGmailTokenRowForUser(env, authUser, account || null);
      let accessToken = gmailRow ? await resolveOAuthAccessToken(env, gmailRow) : '';
      accessToken = accessToken ? String(accessToken).trim() : '';
      if (!accessToken && gmailRow) {
        const { getIntegrationOAuthRow } = await import('./user-oauth-token.js');
        const refreshed = await getIntegrationOAuthRow(env, userId, 'google_gmail', account);
        accessToken = refreshed?.access_token ? String(refreshed.access_token).trim() : '';
      }
      if (!accessToken) {
        return {
          ok: false,
          error: 'gmail_not_connected',
          failed_tool: toolKey,
          reauth_required: true,
          body: {
            user_message: 'Connect Gmail in Integrations before using Gmail MCP tools.',
            connect_url: '/api/integrations/gmail/connect?return_to=/dashboard/settings/integrations',
          },
        };
      }
      headers.Authorization = `Bearer ${accessToken}`;
      headers.Accept = 'application/json, text/event-stream';
    } else if (needsCloudflareUserToken) {
      const { prepareCfMcpCloudflareCall, resolveCfMcpRemoteToolName } = await import('./cf-mcp-proxy.js');
      mcpCallName = resolveCfMcpRemoteToolName(config, params) || mcpCallName;
      const prepared = await prepareCfMcpCloudflareCall(
        env,
        {
          userId,
          workspaceId,
          tenantId,
          authUser: runContext?.authUser ?? runContext?.user ?? null,
        },
        mcpCallName,
        params,
        config,
      );
      if (!prepared.ok || !prepared.token) {
        return {
          ok: false,
          error: prepared.error || 'cloudflare_not_connected',
          failed_tool: toolKey,
          reauth_required: prepared.reauth_required === true,
          body: { user_message: prepared.user_message || 'Connect Cloudflare in Integrations.' },
        };
      }
      headers.Authorization = `Bearer ${prepared.token}`;
      params = prepared.params;
    } else {
      const mcpToken = env?.MCP_AUTH_TOKEN != null ? String(env.MCP_AUTH_TOKEN).trim() : '';
      const internalSecret = env?.INTERNAL_API_SECRET != null ? String(env.INTERNAL_API_SECRET).trim() : '';
      const bridgeKey = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
      if (mcpToken) {
        headers.Authorization = `Bearer ${mcpToken}`;
      } else if (internalSecret) {
        headers.Authorization = `Bearer ${internalSecret}`;
        headers['X-Internal-Secret'] = internalSecret;
      } else if (bridgeKey) {
        headers['X-Bridge-Key'] = bridgeKey;
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: mcpCallName, arguments: params },
      }),
    }).catch((e) => ({ ok: false, status: 0, _err: e }));

    if (!res?.ok) {
      const status = res?.status ?? 0;
      if (status === 401 && needsGithubUserToken) {
        return {
          ok: false,
          error: 'github_reauth_required',
          failed_tool: toolKey,
          reauth_required: true,
          body: { user_message: 'GitHub token expired or was revoked. Reconnect GitHub in Integrations.' },
        };
      }
      if (status === 401 && needsGmailUserToken) {
        return {
          ok: false,
          error: 'gmail_reauth_required',
          failed_tool: toolKey,
          reauth_required: true,
          body: {
            user_message: 'Gmail token expired or was revoked. Reconnect Gmail in Integrations.',
            connect_url: '/api/integrations/gmail/connect?return_to=/dashboard/settings/integrations',
          },
        };
      }
      if (status === 401 && needsCloudflareUserToken) {
        return {
          ok: false,
          error: 'cloudflare_reauth_required',
          failed_tool: toolKey,
          reauth_required: true,
          body: {
            user_message:
              'Cloudflare OAuth token expired or was revoked. Reconnect Cloudflare Developer Platform in Integrations.',
          },
        };
      }
      if (
        status === 401 &&
        /memory/i.test(toolKey) &&
        tenantId &&
        userId &&
        workspaceId
      ) {
        const { recordMcpMemoryAuthFailure } = await import('./agentsam-private-memory.js');
        const attemptedKey = String(
          params?.key ?? params?.memory_key ?? params?.memoryKey ?? 'unknown',
        );
        const fail = await recordMcpMemoryAuthFailure(env, {
          tenantId,
          workspaceId,
          userId,
          toolName: toolKey,
          attemptedKey,
          ctx: runContext,
        });
        return {
          ok: false,
          error: fail.error ?? 'reauth_required',
          failed_tool: fail.failed_tool ?? toolKey,
          attempted_key: fail.attempted_key,
          manual_fallback: fail.manual_fallback,
          reauth_required: true,
          body: fail,
        };
      }
      return {
        ok: false,
        error: `mcp HTTP ${status}: ${res?._err?.message ?? mcpCallName}`,
        failed_tool: toolKey,
        reauth_required: status === 401,
      };
    }
    const body = await res.json().catch(() => ({}));
    if (needsCloudflareUserToken) {
      const { normalizeCfMcpToolResultBody } = await import('./cf-mcp-proxy.js');
      return { ok: true, body: normalizeCfMcpToolResultBody(body) };
    }
    return { ok: true, body };
  }

  return {
    ok: false,
    error: `mcp tool ${toolKey}: no mcp_service_url or server row`,
  };
}

const MEMORY_CATALOG_OPS = new Set([
  'memory_write',
  'memory_search',
  'memory_read',
  'memory_delete',
  'memory_list',
  'memory_resolve',
]);

const MEMORY_CATALOG_OP_ALIASES = {
  search: 'memory_search',
  write: 'memory_write',
  upsert: 'memory_write',
  save: 'memory_write',
  read: 'memory_read',
  get: 'memory_read',
  delete: 'memory_delete',
  list: 'memory_list',
  resolve: 'memory_resolve',
  close: 'memory_resolve',
};

/**
 * Resolve memory catalog operation from handler_config + tool input.
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {string} toolKey
 */
function resolveMemoryCatalogOperation(config, params, toolKey) {
  const raw = String(params.operation ?? params.op ?? config.operation ?? '')
    .toLowerCase()
    .trim();
  if (MEMORY_CATALOG_OPS.has(raw)) return raw;

  const manageOps = new Set(['memory.manage', 'memory_manager', 'memory_manage', 'manage']);
  let sub = raw;
  if (manageOps.has(raw) || (toolKey === 'agentsam_memory_manager' && !raw)) {
    sub = String(
      params.sub_operation ?? params.action ?? params.mode ?? '',
    )
      .toLowerCase()
      .trim();
    if (!sub && (params.query != null || params.q != null)) sub = 'search';
    if (!sub && (params.key || params.memory_key) && (params.value || params.content)) {
      sub = 'write';
    }
    if (!sub && params.keys) sub = 'read';
    if (!sub && (params.key || params.memory_key) && params.resolved === true) sub = 'resolve';
    if (!sub && (params.key || params.keys) && (params.resolve === true || params.action === 'resolve')) {
      sub = 'resolve';
    }
  }

  if (MEMORY_CATALOG_OPS.has(sub)) return sub;
  if (MEMORY_CATALOG_OP_ALIASES[sub]) return MEMORY_CATALOG_OP_ALIASES[sub];
  if (MEMORY_CATALOG_OP_ALIASES[raw]) return MEMORY_CATALOG_OP_ALIASES[raw];
  return sub || raw;
}

/**
 * Dispatch agentsam_tools.handler_type=memory (and memory.manage config).
 * @param {any} env
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 * @param {string} toolKey
 */
async function executeMemoryCatalogDispatch(env, config, params, runContext, toolKey) {
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim();
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim();
  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const op = resolveMemoryCatalogOperation(config, params, toolKey);

  if (!op || !MEMORY_CATALOG_OPS.has(op)) {
    return {
      ok: false,
      error: `memory operation required (search|write|read|delete|list|resolve); got=${op || '(empty)'}`,
    };
  }

  const memCtx = {
    tenantId,
    userId,
    workspaceId: workspaceId || undefined,
    agentId: runContext.agentId ?? runContext.agent_id,
    sessionId: runContext.sessionId ?? runContext.session_id,
  };

  if (op === 'memory_list') {
    if (workspaceId) {
      const { searchPrivateAgentsamMemory } = await import('./agentsam-private-memory.js');
      const out = await searchPrivateAgentsamMemory(env, {
        tenantId,
        workspaceId,
        userId,
        memoryType: params.memory_type ?? params.memoryType,
        limit: params.limit ?? 50,
      });
      if (out?.error) return { ok: false, error: String(out.error) };
      return {
        ok: true,
        body: {
          results: out.results ?? [],
          count: out.results?.length ?? 0,
          tier: out.tier,
        },
      };
    }
    const { memorySearch } = await import('../tools/memory.js');
    const out = await memorySearch({ ...params, limit: params.limit ?? 50 }, env, memCtx);
    return out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
  }

  const { handlers: memoryHandlers } = await import('../tools/memory.js');
  const fn = memoryHandlers[op];
  if (typeof fn !== 'function') {
    return { ok: false, error: `memory handler not registered: ${op}` };
  }

  let memParams = params;
  if (op === 'memory_write') {
    const { resolveManagedMemoryType } = await import('./mcp-memory-type-compat.js');
    const resolved = resolveManagedMemoryType(params);
    memParams = {
      ...params,
      key: params.key ?? params.memory_key ?? params.memoryKey,
      value: params.value ?? params.content ?? params.body,
      memory_type: resolved.memory_type,
      tags: resolved.tags?.length ? resolved.tags : params.tags,
      source: params.source ?? `catalog:${toolKey}`,
    };
  }
  if (op === 'memory_search') {
    const { DEFAULT_MEMORY_SEARCH_QUERY } = await import('./mcp-memory-search-schema.js');
    memParams = {
      ...params,
      query: params.query ?? params.q ?? (params.top_k ? DEFAULT_MEMORY_SEARCH_QUERY : ''),
      limit: params.limit ?? params.top_k ?? 20,
    };
  }

  const out = await fn(memParams, env, memCtx);
  return out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row agentsam_tools
 * @param {Record<string, unknown>} config parsed handler_config
 * @param {unknown} input
 * @param {Record<string, unknown>} runContext
 * @param {{ value?: string, auth_source?: string }} credentials
 */
export async function executeCatalogTool(env, row, config, input, runContext, credentials) {
  const rawInput = parseInput(input);
  let handlerType = String(row.handler_type || '').toLowerCase();
  let execConfig = { ...config };
  const params = {
    ...rawInput,
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    user_id: runContext.userId ?? runContext.user_id,
  };
  const toolKey = String(row.tool_key || row.tool_name || '').trim();
  const toolName = String(row.tool_name || row.tool_key || '').trim();

  if (
    toolKey === 'agentsam_container_exec' ||
    String(config.target_type || '').toLowerCase() === 'my_container'
  ) {
    handlerType = 'container';
  }

  if (
    toolKey === 'knowledge_search' ||
    ((handlerType === 'hyperdrive' || handlerType === 'supabase') &&
      String(execConfig.dispatcher || '').toLowerCase().includes('semantic'))
  ) {
    handlerType = 'ai';
    execConfig = {
      ...execConfig,
      dispatcher: 'legacy_unified_rag',
      legacy_unified_rag: true,
    };
  }
  config = execConfig;

  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const tenantId = String(runContext.tenantId ?? runContext.tenant_id ?? '').trim() || null;
  const userId = String(runContext.userId ?? runContext.user_id ?? '').trim() || null;
  const agentRunId =
    runContext.agentRunId ?? runContext.agent_run_id ?? null;
  const routingArmId =
    runContext.routingArmId ?? runContext.routing_arm_id ?? null;
  const agentId =
    String(runContext.agentId ?? runContext.agent_id ?? '').trim() || null;
  const sourceTool =
    String(runContext.sourceTool ?? runContext.source_tool ?? '').trim() || null;
  const conversationId =
    runContext.conversationId ??
    runContext.conversation_id ??
    runContext.sessionId ??
    runContext.session_id ??
    null;
  const { buildAgentsamToolCacheKey, isToolCacheEligible } = await import('./tool-cache-key.js');
  const cacheEligible = isToolCacheEligible(toolKey);
  const { cacheKey, inputHash } = cacheEligible
    ? await buildAgentsamToolCacheKey(toolKey, rawInput)
    : { cacheKey: null, inputHash: null };

  if (env?.DB && toolKey && cacheKey && workspaceId && cacheEligible) {
    try {
      const cached = await env.DB.prepare(
        `SELECT output_json, id FROM agentsam_tool_cache
         WHERE cache_key = ?
           AND workspace_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))
         LIMIT 1`,
      )
        .bind(cacheKey, workspaceId)
        .first();
      if (cached?.output_json) {
        try {
          await env.DB.prepare(
            `UPDATE agentsam_tool_cache SET
               hit_count = hit_count + 1,
               last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?`,
          )
            .bind(cached.id)
            .run();
        } catch (e) {
          await writeTelemetryError(env, runContext, 'agentsam_tool_cache.update', e);
        }

        const cachedBody = JSON.parse(String(cached.output_json));
        const usage = extractUsageMetrics(cachedBody, params.model ?? config.default_model ?? null, config.default_provider ?? null);
        // TELEMETRY-001: when agent-tool-loop set skipToolCallLog, loop owns agentsam_tool_call_log.
        if (!shouldSkipCatalogToolCallLog(runContext)) {
          try {
            await insertToolCallLog(
              env,
              {
                tenantId,
                workspaceId,
                userId,
                agentRunId,
                toolName,
                toolKey,
                handlerKey: row.handler_key ?? null,
                capabilityKey: row.capability_key ?? null,
                agentsamToolsId: row.id ?? null,
                routingArmId,
                conversationId,
                status: 'success',
                inputJson: safeJsonString(rawInput),
                outputJson: safeJsonString(cachedBody),
                inputSummary: 'cache_hit',
                outputSummary: summarizeOutput(cachedBody),
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                inputCostUsd: usage.inputCostUsd,
                outputCostUsd: usage.outputCostUsd,
                totalCostUsd: usage.totalCostUsd,
                durationMs: 0,
                timedOut: false,
                toolCategory: row.tool_category ?? null,
                agentId,
                sourceTool,
              },
              runContext,
            );
          } catch (e) {
            await writeTelemetryError(env, runContext, 'agentsam_tool_call_log.cache_hit', e);
          }
        }
        return { ok: true, body: cachedBody };
      }
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_tool_cache.lookup', e);
    }
  }

  const started = Date.now();
  let result = null;

  const finalizeTelemetry = async (success, output, errorMessage = null) => {
    if (!env?.DB) return;
    const durationMs = Math.max(0, Date.now() - started);
    const timedOut = false;
    const usage = extractUsageMetrics(
      output,
      params.model ?? config.default_model ?? null,
      config.default_provider ?? null,
    );
    const outputJson = safeJsonString(output);
    const outputSummary = summarizeOutput(output);
    let toolCallLogId = null;

    // TELEMETRY-001 Layer 2 — contract: agent-tool-loop sets runContext.skipToolCallLog=true
    // before dispatchToolCallWithBudget so this INSERT is skipped; loop owns the ledger row.
    if (!shouldSkipCatalogToolCallLog(runContext)) {
      try {
        toolCallLogId = await insertToolCallLog(
          env,
          {
            tenantId,
            workspaceId,
            userId,
            agentRunId,
            toolName,
            toolKey,
            handlerKey: row.handler_key ?? null,
            capabilityKey: row.capability_key ?? null,
            agentsamToolsId: row.id ?? null,
            routingArmId,
            conversationId,
            status: success ? 'success' : 'error',
            inputJson: safeJsonString(rawInput),
            outputJson,
            inputSummary: null,
            outputSummary,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            inputCostUsd: usage.inputCostUsd,
            outputCostUsd: usage.outputCostUsd,
            totalCostUsd: usage.totalCostUsd,
            durationMs,
            timedOut,
            toolCategory: row.tool_category ?? null,
            agentId,
            sourceTool,
          },
          runContext,
        );
      } catch (e) {
        await writeTelemetryError(env, runContext, 'agentsam_tool_call_log', e);
      }
    }

    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_tool_chain
          (tenant_id, workspace_id, user_id, agent_run_id,
           tool_name, tool_id, routing_arm_id, conversation_id,
           parent_chain_id, depth,
           tool_status, input_json, result_json,
           error_message, input_tokens, output_tokens,
           cost_usd, duration_ms, timed_out)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          tenantId,
          workspaceId,
          userId,
          agentRunId,
          toolName,
          row.id ?? null,
          routingArmId,
          conversationId,
          runContext.parentChainId ?? runContext.parent_chain_id ?? null,
          Number(runContext.chainDepth ?? runContext.depth ?? 0) || 0,
          success ? 'completed' : 'failed',
          safeJsonString(rawInput),
          outputJson,
          errorMessage ?? null,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalCostUsd,
          durationMs,
          timedOut ? 1 : 0,
        )
        .run();
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_tool_chain', e);
    }

    if (success && cacheEligible && config.cacheable !== false && cacheKey && inputHash && workspaceId) {
      try {
        const ttlSeconds = row?.token_budget_per_call ? 300 : 60;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO agentsam_tool_cache
            (workspace_id, tenant_id, tool_key, tool_category,
             cache_key, input_hash,
             input_json, output_json, output_summary,
             token_savings_estimate, execution_ms,
             model_used, provider,
             cache_strategy, expires_at,
             source_type, source_identifier)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ttl',
             strftime('%Y-%m-%dT%H:%M:%fZ','now', '+' || ? || ' seconds'),
             'tool_call_log', ?)`,
        )
          .bind(
            workspaceId,
            tenantId,
            toolKey,
            row.tool_category ?? null,
            cacheKey,
            inputHash,
            safeJsonString(rawInput),
            outputJson,
            outputSummary,
            usage.inputTokens + usage.outputTokens,
            durationMs,
            usage.modelUsed ?? null,
            usage.provider ?? null,
            ttlSeconds,
            toolCallLogId,
          )
          .run();
      } catch (e) {
        await writeTelemetryError(env, runContext, 'agentsam_tool_cache', e);
      }
    }

    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_performance_eto_events
          (id, tenant_id, workspace_id, user_id,
           source_table, source_id,
           agent_run_id, tool_call_id, routing_arm_id,
           task_type, model_key, provider,
           input_tokens, output_tokens, cost_usd, latency_ms,
           success, failure, timed_out,
           is_training_eligible, reward_score,
           alpha_delta, beta_delta, evidence_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
        .bind(
          `pete_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
          tenantId,
          workspaceId,
          userId,
          'agentsam_tool_call_log',
          toolCallLogId,
          agentRunId,
          toolCallLogId,
          routingArmId,
          runContext.taskType ?? runContext.task_type ?? 'tool_call',
          usage.modelUsed ?? null,
          usage.provider ?? null,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalCostUsd,
          durationMs,
          success ? 1 : 0,
          success ? 0 : 1,
          timedOut ? 1 : 0,
          usage.inputTokens > 0 || usage.outputTokens > 0 ? 1 : 0,
          success ? 1.0 : 0.0,
          success ? 0.1 : 0.0,
          success ? 0.0 : 0.1,
          safeJsonString({ toolKey, handlerType, durationMs }),
        )
        .run();
    } catch (e) {
      await writeTelemetryError(env, runContext, 'agentsam_performance_eto_events', e);
    }

    try {
      scheduleMirrorToolCallEventToSupabase(env, runContext.ctx ?? null, {
        workspace_id: workspaceId,
        run_id:
          runContext.supabase_run_id ??
          runContext.workflow_run_id ??
          runContext.supabaseRunId ??
          null,
        tool_key: toolKey,
        tool_name: toolName,
        tool_category: row.tool_category ?? null,
        status: success ? 'completed' : 'failed',
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: usage.totalCostUsd,
        duration_ms: durationMs,
      });
    } catch (_) {}

    if (success && toolKey) {
      const bumpTools = env.DB.prepare(
        `UPDATE agentsam_tools
         SET use_count = COALESCE(use_count, 0) + 1,
             last_used_at = datetime('now'),
             updated_at = datetime('now')
         WHERE tool_key = ? AND COALESCE(is_active, 1) = 1`,
      )
        .bind(toolKey)
        .run()
        .catch(() => {});
      const wu = runContext?.ctx;
      if (wu && typeof wu.waitUntil === 'function') {
        wu.waitUntil(bumpTools);
      } else {
        await bumpTools;
      }
    }
  };

  {
    const { resolveCfMcpCatalogRoute } = await import('./cf-mcp-proxy.js');
    const cfRoute = resolveCfMcpCatalogRoute(row, config);
    if (cfRoute) {
      const mcpResult = await executeMcpCatalogRow(env, cfRoute.mcpRow, params, runContext);
      if (cfRoute.route === 'mcp_only' || mcpResult?.ok === true) {
        await finalizeTelemetry(
          mcpResult?.ok === true,
          mcpResult?.body ?? mcpResult,
          mcpResult?.ok === true ? null : mcpResult?.error || null,
        );
        return mcpResult;
      }
    }
  }

  switch (handlerType) {
    case 'd1':
    case 'cf': {
      if (handlerType === 'd1' || isCatalogCfD1Operation(toolKey, config)) {
        result = await executeCatalogCfD1(env, row, config, params, {
          ...runContext,
          agentsam_tool_key: toolKey,
        });
        break;
      }
      if (handlerType === 'd1') {
        result = {
          ok: false,
          error:
            'handler_type d1 is deprecated; use handler_type=cf with operation d1.query|d1.write|d1.migrate',
        };
        break;
      }

      const cfOp = String(config.operation || '').toLowerCase();
      const r2ToolKeys = new Set(['agentsam_r2_get', 'agentsam_r2_put', 'agentsam_r2_delete']);
      if (
        r2ToolKeys.has(toolKey) ||
        String(config.resource || '').toLowerCase() === 'r2' ||
        cfOp.startsWith('r2.')
      ) {
        const r2Row = { ...row, handler_type: 'r2' };
        return executeCatalogTool(env, r2Row, config, params, runContext, credentials);
      }

      if (
        cfOp.startsWith('vectorize.') ||
        String(config.resource || '').toLowerCase() === 'vectorize' ||
        toolKey === 'agentsam_cf_vectorize'
      ) {
        const { handleCfVectorizeManage } = await import('../handlers/cf/vectorize.js');
        const vectorOpRaw =
          params?.operation ?? params?.op ?? (cfOp.startsWith('vectorize.') ? cfOp.slice('vectorize.'.length) : '');
        const vectorOp = String(vectorOpRaw || 'query').trim().toLowerCase();
        result = await handleCfVectorizeManage(
          env,
          { ...params, operation: vectorOp },
          { workspaceId, tenantId, userId },
        );
        break;
      }

      if (
        cfOp === 'kv.manage' ||
        toolKey === 'agentsam_kv_manage' ||
        String(config.resource || '').toLowerCase() === 'kv'
      ) {
        const { handleCfKvManage } = await import('../handlers/cf/kv.js');
        const kvOut = await handleCfKvManage(
          env,
          params,
          { workspaceId, tenantId, userId },
          credentials,
        );
        result = kvOut?.ok === false
          ? { ok: false, error: String(kvOut.error || 'kv_manage_failed'), body: kvOut }
          : { ok: true, body: kvOut };
        break;
      }

      const httpRow = { ...row, handler_type: 'http' };
      return executeCatalogTool(env, httpRow, config, params, runContext, credentials);
    }

    case 'hyperdrive':
    case 'supabase': {
      const dispatchOperation = resolveCatalogDataPlaneOperation(config, toolKey);
      const requestedProvider = resolveCatalogDataPlaneProvider(config);

      if (
        toolKey === 'knowledge_search' ||
        catalogOperationIsSemanticSearch(dispatchOperation) ||
        String(execConfig.dispatcher || '').toLowerCase().includes('semantic')
      ) {
        const { legacyUnifiedRagSearch } = await import('../api/rag.js');
        const query = String(
          params.query || params.q || params.message || runContext.userMessage || '',
        ).trim();
        if (!query) {
          result = {
            ok: false,
            error: `${dispatchOperation || 'semantic_search'} requires query in input`,
          };
          break;
        }
        const out = await legacyUnifiedRagSearch(env, query, {
          topK: Number(params.top_k ?? params.topK ?? 8) || 8,
          tenantId,
          workspaceId,
          sessionId: conversationId,
          caller: `catalog_tool:${toolKey}`,
        });
        result = {
          ok: true,
          body: {
            matches: out.matches || [],
            results: out.results || [],
            count: out.count || 0,
            operation: dispatchOperation,
          },
        };
        break;
      }

      if (!catalogOperationRequiresSql(dispatchOperation)) {
        result = {
          ok: false,
          error: `unsupported catalog operation for sql dispatch: ${dispatchOperation}`,
        };
        break;
      }

      const sql = String(params.sql || '').trim();
      if (!sql) {
        result = {
          ok: false,
          error: `hyperdrive/supabase tool requires sql in input (operation=${dispatchOperation})`,
        };
        break;
      }

      const authUser = runContext.authUser ?? runContext.user ?? null;
      const { dispatchCustomerDataPlaneOperation } = await import('./customer-data-plane-dispatch.js');
      const customerPlane =
        resolveCustomerSupabaseDataPlane(toolKey, config) ||
        String(config.data_plane || '').trim() ||
        null;
      const projectRef = String(
        params.project_ref || params.projectRef || params.project_id || params.projectId || '',
      ).trim();
      const routed = await dispatchCustomerDataPlaneOperation(env, {
        operation: dispatchOperation,
        sql,
        message: sql,
        authUser,
        user_id: userId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        agent_run_id: agentRunId,
        approval_id: params.approval_id ?? params.approvalId ?? null,
        requested_provider: requestedProvider || (customerPlane === 'customer_supabase' ? 'supabase' : null),
        data_plane: customerPlane,
        project_ref: projectRef || null,
        project_id: projectRef || null,
      });
      if (!routed.ok) {
        result = {
          ok: false,
          error: routed.error || 'access_denied',
          reason: routed.reason,
          user_message: routed.user_message,
        };
        break;
      }
      result = {
        ok: true,
        body: {
          rows: routed.rows || [],
          data_plane: routed.data_plane,
          operation: dispatchOperation,
          read_only: routed.read_only === true,
          write_path: routed.write_path === true,
        },
      };
      break;
    }

    case 'container': {
      const { buildTerminalToolResponseBody } = await import('./mcp-terminal-contract.js');
      const { isOperatorOnlyTerminalTool, userIsPlatformOperator } = await import(
        './platform-operator-policy.js'
      );
      const { tryContainerExec } = await import('./my-container.js');

      if (isOperatorOnlyTerminalTool(toolKey)) {
        const op = await userIsPlatformOperator(env, runContext?.authUser, workspaceId);
        if (!op) {
          result = {
            ok: false,
            error: 'platform_operator_required',
            body: {
              user_message:
                'agentsam_container_exec is restricted to platform operators (cloud sandbox batch exec).',
            },
          };
          break;
        }
      }

      const cmd = String(params.command || params.cmd || '').trim();
      if (!cmd) {
        result = { ok: false, error: 'container tool requires command in input' };
        break;
      }

      const cwd = params.cwd != null ? String(params.cwd).trim() : '';
      const timeoutMs =
        params.timeout_ms != null
          ? Number(params.timeout_ms)
          : params.timeoutMs != null
            ? Number(params.timeoutMs)
            : undefined;

      const rawAuth = runContext.authUser ?? runContext.user ?? null;
      const authUser = rawAuth
        ? {
            ...rawAuth,
            id: rawAuth.id ?? rawAuth.user_id ?? userId,
            tenant_id: rawAuth.tenant_id ?? tenantId,
            workspace_id: rawAuth.workspace_id ?? workspaceId,
          }
        : userId
          ? { id: userId, tenant_id: tenantId, workspace_id: workspaceId }
          : null;

      const execOut = await tryContainerExec(env, {
        command: cmd,
        cwd: cwd || undefined,
        timeout_ms: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
        authUser,
      });

      if (!execOut?.ok) {
        result = {
          ok: false,
          error: execOut?.error || 'container_exec_failed',
          body: {
            lane: 'container',
            image: execOut?.image ?? null,
            command: cmd,
            stdout: execOut?.stdout ?? '',
            stderr: execOut?.stderr ?? '',
            exit_code: execOut?.exit_code ?? null,
            http_status: execOut?.http_status ?? null,
          },
        };
        break;
      }

      const body = buildTerminalToolResponseBody({
        explicitPath: cwd || '/tmp',
        executedCommand: cmd,
        stdout: String(execOut.stdout ?? ''),
        stderr: String(execOut.stderr ?? ''),
        exitCode: execOut.exit_code ?? 0,
        status: execOut.exit_code === 0 ? 'success' : 'error',
      });

      result = {
        ok: true,
        body: {
          ...body,
          lane: 'container',
          image: execOut.image ?? null,
        },
      };
      break;
    }

    case 'terminal': {
      const {
        assertTerminalLocalArgs,
        buildTerminalToolResponseBody,
        terminalRecoveryHints,
        wrapShellCommandWithPath,
      } = await import('./mcp-terminal-contract.js');
      const { isOperatorOnlyTerminalTool, userIsPlatformOperator } = await import(
        './platform-operator-policy.js'
      );

      if (isOperatorOnlyTerminalTool(toolKey)) {
        const op = await userIsPlatformOperator(env, runContext?.authUser, workspaceId);
        if (!op) {
          result = {
            ok: false,
            error: 'platform_operator_required',
            body: {
              user_message:
                toolKey === 'agentsam_terminal_remote'
                  ? 'agentsam_terminal_remote (GCP cloud desk) is restricted to platform operators. Use agentsam_terminal_local for your device or agentsam_terminal_sandbox for an isolated dev zone.'
                  : 'agentsam_container_exec is restricted to platform operators (use agentsam_terminal_sandbox when container dev zones are enabled).',
            },
          };
          break;
        }
      }

      if (toolKey === 'agentsam_terminal_local') {
        const { assertTerminalLocalArgs } = await import('./mcp-terminal-contract.js');
        const localArgErr = assertTerminalLocalArgs(params);
        if (localArgErr) {
          result = { ok: false, error: localArgErr };
          break;
        }
      }

      if (toolKey === 'agentsam_terminal_sandbox') {
        const { runMcpZoneSandboxCommand, normalizeMcpZoneSlug } = await import('./terminal-sandbox.js');
        const rawCmd = String(params.command || params.cmd || '').trim();
        if (!rawCmd) {
          result = { ok: false, error: 'terminal sandbox requires command in input' };
          break;
        }
        const zoneSlug = normalizeMcpZoneSlug(
          params.zone_slug ?? params.zoneSlug ?? runContext.mcp_panel_slug ?? runContext.mcpZoneSlug,
        );
        const sandboxTimeoutMs =
          params.timeout_ms != null
            ? Number(params.timeout_ms)
            : params.timeoutMs != null
              ? Number(params.timeoutMs)
              : undefined;
        const sb = await runMcpZoneSandboxCommand(env, runContext?.request, {
          command: rawCmd,
          zoneSlug,
          tenantId,
          userId,
          workspaceId,
          sessionId: runContext.sessionId ?? runContext.session_id ?? null,
          config,
          language: params.language,
          path: params.path,
          timeout_ms: Number.isFinite(sandboxTimeoutMs) ? sandboxTimeoutMs : undefined,
          authUser: runContext.authUser ?? runContext.user ?? null,
        });
        if (!sb.ok) {
          result = {
            ok: false,
            error: sb.error || 'sandbox execution failed',
            body: sb.body || {},
          };
          break;
        }
        if (runContext.mcp_panel_slug || params.zone_slug || params.zoneSlug) {
          const { recordMcpZonePatchSession, resolveMcpZoneConversationId } = await import(
            './mcp-zone-spine.js'
          );
          void recordMcpZonePatchSession(env, runContext.ctx ?? null, {
            zoneSlug,
            tenantId,
            workspaceId,
            agentRunId: agentRunId != null ? String(agentRunId) : null,
            conversationId:
              runContext.sessionId ??
              runContext.session_id ??
              resolveMcpZoneConversationId(zoneSlug, tenantId),
            modelKey: runContext.modelKey ?? runContext.model_key ?? null,
            taskFile: rawCmd.slice(0, 200),
            passed: sb.body?.exit_code === 0 ? 1 : 0,
            applied: sb.body?.exit_code === 0 ? 1 : 0,
            failReason: sb.body?.exit_code === 0 ? null : sb.error || 'sandbox_exit_nonzero',
          });
        }
        result = { ok: true, body: sb.body };
        break;
      }

      const rawCommand = String(params.command || params.cmd || config.command_template || '').trim();
      if (!rawCommand) {
        result = { ok: false, error: 'terminal tool requires command in input' };
        break;
      }
      const explicitPath =
        params.path != null
          ? String(params.path).trim()
          : params.cwd != null
            ? String(params.cwd).trim()
            : '';
      let settingsJson = null;
      let workspaceRoot = null;
      let parsedSettings = null;
      if (workspaceId && env?.DB) {
        const settingsRow = await env.DB.prepare(
          'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
        )
          .bind(workspaceId)
          .first()
          .catch(() => null);
        if (settingsRow?.settings_json) {
          settingsJson = settingsRow.settings_json;
          try {
            parsedSettings =
              typeof settingsJson === 'string' ? JSON.parse(settingsJson) : settingsJson;
            workspaceRoot = String(parsedSettings?.workspace_root || '').trim() || null;
          } catch (_) {
            workspaceRoot = null;
            parsedSettings = null;
          }
        }
      }
      const routing = resolveTerminalExecRouting({
        tool_key: toolKey,
        target_id: params.target_id,
        target_type: params.target_type,
        client_surface: runContext?.client_surface ?? runContext?.clientSurface ?? null,
        exec_lane: runContext?.exec_lane ?? runContext?.execLane ?? null,
        user_id: userId,
      });
      const remoteTargetId = routing.target_id || '';
      const gcpExec =
        terminalToolPrefersGcpLane(toolKey) ||
        routing.lane === 'gcp_primary' ||
        (remoteTargetId && /gcp|iam_tunnel|platform_vm/i.test(remoteTargetId));
      const responseWorkspaceRoot = gcpExec
        ? (await import('./host-workspace-paths.js')).IAM_GCP_OPERATOR_REPO
        : workspaceRoot;

      const { executeTerminalCatalogWithFallback } = await import('./terminal-exec-fallback.js');
      result = await executeTerminalCatalogWithFallback(env, {
        toolKey,
        rawCommand,
        params,
        runContext,
        config,
        workspaceId,
        userId,
        tenantId,
        agentRunId,
        explicitPath,
        settingsJson,
        parsedSettings,
        workspaceRoot,
        responseWorkspaceRoot,
      });
      break;
    }

    case 'r2': {
      const authUser = await resolveToolRunAuthUser(env, runContext);
      const op = normalizeR2CatalogOperation(config.operation || config.r2_operation || 'write');
      const authSource = String(config.auth_source || 'platform').toLowerCase();
      const isOwner = await isPlatformOwner(env, authUser);
      const listAll = params.list_all === true || params.listAll === true;
      const bucketParam = params.bucket != null ? String(params.bucket).trim() : '';
      const wantsBucketInventory =
        isR2ListLikeOperation(op) && (listAll || !bucketParam);

      if (isR2ListLikeOperation(op)) {
        if (authSource === 'platform' && !isOwner) {
          result = {
            ok: false,
            error: 'platform_r2_owner_only',
            body: {
              user_message:
                'IAM platform R2 bindings are owner-only. Connect your Cloudflare R2 API keys in Settings → Storage to use your buckets.',
            },
          };
          break;
        }

        const effectiveEnv = await mergeR2S3EnvFromUserStorage(env, authUser);
        if (authSource === 'customer' && !effectiveEnv.R2_ACCESS_KEY_ID && !getR2Binding(effectiveEnv, bucketParam)) {
          result = {
            ok: false,
            error: 'customer_r2_not_connected',
            body: {
              user_message:
                'Connect your Cloudflare R2 access key + secret in Settings → Storage before R2 list runs.',
            },
          };
          break;
        }

        if (wantsBucketInventory) {
          const out = await executeR2ListCatalogOperation(effectiveEnv, params, config, 'buckets');
          result = out?.ok === false
            ? { ok: false, error: String(out.error || 'r2_list_failed'), body: out }
            : { ok: true, body: out };
          break;
        }

        let bucket = bucketParam
          ? await resolveRegisteredR2BucketName(effectiveEnv, bucketParam)
          : '';
        if (!bucket && bucketParam) {
          bucket = resolveR2BucketName(effectiveEnv, bucketParam);
        }
        if (!bucket) {
          result = {
            ok: false,
            error: 'bucket_required',
            body: {
              user_message:
                'R2 object listing requires bucket (or omit bucket / set list_all=true to enumerate account buckets).',
            },
          };
          break;
        }

        if (authSource === 'platform' && isOwner) {
          const transport = await ownerHasPlatformR2Transport(effectiveEnv, authUser, bucket);
          if (!transport.ok) {
            result = {
              ok: false,
              error: 'platform_r2_transport_unavailable',
              body: { user_message: transport.user_message, bucket },
            };
            break;
          }
        }

        const out = await executeR2ListCatalogOperation(
          effectiveEnv,
          { ...params, bucket },
          config,
          'objects',
        );
        result = out?.ok === false
          ? { ok: false, error: String(out.error || 'r2_list_failed'), body: out }
          : { ok: true, body: out };
        break;
      }

      if (authSource === 'platform' && !isOwner) {
        result = {
          ok: false,
          error: 'platform_r2_owner_only',
          body: {
            user_message:
              'IAM platform R2 bindings are owner-only. Connect your Cloudflare R2 API keys in Settings → Storage to use your buckets.',
          },
        };
        break;
      }

      const bucketRaw =
        params.bucket != null
          ? String(params.bucket)
          : config.binding != null
            ? String(config.binding)
            : config.default_bucket != null
              ? String(config.default_bucket)
              : '';
      if (!bucketRaw.trim()) {
        result = {
          ok: false,
          error: 'bucket_required',
          body: {
            user_message:
              'R2 tools require an explicit bucket parameter registered in D1 (r2_bucket_list / r2_bucket_bindings / project_storage).',
          },
        };
        break;
      }
      let bucket = await resolveRegisteredR2BucketName(env, bucketRaw);
      const effectiveEnv = await mergeR2S3EnvFromUserStorage(env, authUser);
      const bucketCandidate = resolveR2BucketName(effectiveEnv, bucketRaw) || bucketRaw;

      if (authSource === 'platform' && isOwner) {
        const bucketCheck = await assertOwnerPlatformR2Bucket(env, bucket);
        if (bucketCheck.ok) {
          bucket = bucketCheck.bucket;
        } else {
          const transport = await ownerHasPlatformR2Transport(effectiveEnv, authUser, bucketCandidate);
          if (transport.ok) {
            bucket = bucketCandidate;
          } else {
            result = {
              ok: false,
              error: String(bucketCheck.error || 'platform_r2_bucket_not_registered'),
              body: {
                bucket: bucketCheck.bucket,
                allowed_preview: bucketCheck.allowed_preview,
                user_message: bucketCheck.user_message,
              },
            };
            break;
          }
        }
      }

      if (authSource === 'customer' && !effectiveEnv.R2_ACCESS_KEY_ID && !getR2Binding(effectiveEnv, bucket)) {
        result = {
          ok: false,
          error: 'customer_r2_not_connected',
          body: {
            user_message: 'Connect your Cloudflare R2 access key + secret in Settings → Storage before R2 tools run.',
          },
        };
        break;
      }

      if (authSource === 'platform' && isOwner) {
        const transport = await ownerHasPlatformR2Transport(effectiveEnv, authUser, bucket);
        if (!transport.ok) {
          result = {
            ok: false,
            error: 'platform_r2_transport_unavailable',
            body: { user_message: transport.user_message, bucket },
          };
          break;
        }
      }

      if (op === 'delete' && runContext?.request) {
        const key = String(params.key || params.object_key || params.path || '').trim();
        if (!key) {
          result = {
            ok: false,
            error: 'key_required',
            body: { user_message: 'r2_delete requires bucket and key.' },
          };
          break;
        }
        const httpOut = await invokeR2DeleteHttp(effectiveEnv, runContext, bucket, key);
        result = httpOut.ok
          ? { ok: true, body: httpOut.body }
          : {
              ok: false,
              error: String(httpOut.error || 'r2_delete_failed'),
              body: httpOut.body,
            };
        break;
      }

      const out = await executeR2CatalogOperation(
        effectiveEnv,
        { ...params, bucket },
        config,
        op,
      );
      result = out?.ok === false ? { ok: false, error: String(out.error || 'r2_failed'), body: out } : { ok: true, body: out };
      break;
    }

    case 'websearch': {
      result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
      break;
    }

    case 'ai': {
      if (isOpenWebCatalogConfig(config, toolKey)) {
        result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
        break;
      }
      const dispatcher = String(config.dispatcher || '').trim();
      if (dispatcher === 'search_web' || dispatcher === 'web_fetch') {
        result = await executeOpenWebCatalogDispatch(env, config, params, runContext, toolKey);
        break;
      }
      if (dispatcher === 'fs_search_files') {
        const { executeFsSearchFiles } = await import('./fs-search-files.js');
        const out = await executeFsSearchFiles(env, params, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (dispatcher === 'fs_read_file') {
        const { executeFsReadFile } = await import('./fs-read-file.js');
        const out = await executeFsReadFile(env, params, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (dispatcher === 'fs_write_file') {
        const { executeFsWriteFile } = await import('./fs-write-file.js');
        const out = await executeFsWriteFile(env, params, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (dispatcher === 'semantic_retrieval') {
        const { dispatchSemanticRetrieval } = await import('./semantic-retrieval-dispatch.js');
        const lane = String(
          config.semantic_lane || config.execution_lane || toolKey || '',
        ).trim();
        const query = String(params.query || params.q || '').trim();
        if (!query) {
          result = { ok: false, error: 'semantic_retrieval requires query' };
          break;
        }
        const out = await dispatchSemanticRetrieval(env, {
          lane,
          query,
          workspace_id: workspaceId,
          tenant_id: tenantId,
          user_id: userId,
          agent_run_id: agentRunId,
          top_k: Math.min(Math.max(Number(params.top_k ?? params.topK ?? 6) || 6, 1), 24),
        });
        result = { ok: out?.ok !== false, body: out };
        break;
      }
      if (dispatcher === 'database_assistant') {
        const { authUserIsSuperadmin } = await import('./auth.js');
        const authUser = runContext.authUser ?? runContext.user ?? null;
        const isOwner =
          authUserIsSuperadmin(authUser) ||
          String(authUser?.role || '').toLowerCase() === 'owner';
        const cfgPlane = String(config.data_plane || '').trim();
        if ((config.admin_only === true || config.admin_only === 1 || cfgPlane.startsWith('platform_')) && !isOwner) {
          result = {
            ok: false,
            error: 'access_denied',
            reason: 'platform_tool_owner_only',
          };
          break;
        }
      }
      if (dispatcher === 'database_assistant' || dispatcher === 'customer_data_plane') {
        const { dispatchCustomerDataPlaneOperation } = await import('./customer-data-plane-dispatch.js');
        const operation = String(
          params.operation || config.operation || 'inspect_schema',
        ).trim();
        const customerPlane = resolveCustomerSupabaseDataPlane(toolKey, config);
        const dataPlane =
          String(params.data_plane || config.data_plane || customerPlane || '').trim() || null;
        const projectRef = String(
          params.project_ref || params.projectRef || params.project_id || params.projectId || '',
        ).trim();
        const out = await dispatchCustomerDataPlaneOperation(env, {
          operation,
          message: params.message != null ? String(params.message) : '',
          requested_provider:
            params.provider ||
            config.provider ||
            (dataPlane === 'customer_supabase' ? 'supabase' : null),
          data_plane: dataPlane,
          authUser: runContext.authUser ?? runContext.user ?? null,
          user_id: userId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          schema: String(params.schema || config.schema || '').trim() || undefined,
          table: params.table != null ? String(params.table).trim() : '',
          sql: params.sql != null ? String(params.sql) : '',
          migration_sql: params.migration_sql != null ? String(params.migration_sql) : '',
          approval_id: params.approval_id ?? null,
          agent_run_id: agentRunId,
          project_ref: projectRef || null,
          project_id: projectRef || null,
        });
        result = { ok: out?.ok !== false, body: out };
        break;
      }
      if (dispatcher === 'legacy_unified_rag' || config.legacy_unified_rag === true) {
        const { legacyUnifiedRagSearch } = await import('../api/rag.js');
        const query = String(params.query || params.q || '').trim();
        if (!query) {
          result = { ok: false, error: 'legacy_unified_rag requires query' };
          break;
        }
        const out = await legacyUnifiedRagSearch(env, query, {
          topK: Number(params.top_k ?? params.topK ?? 8) || 8,
          tenantId,
          workspaceId,
          sessionId: conversationId,
          caller: `catalog_tool:${toolKey}`,
        });
        result = {
          ok: true,
          body: {
            legacy: true,
            matches: out.matches || [],
            results: out.results || [],
            count: out.count || 0,
          },
        };
        break;
      }
      const op = String(config.operation || config.ai_operation || 'complete').toLowerCase();
      const fnKey = op === 'embed' ? 'ai_embed' : op === 'compare' ? 'ai_compare' : 'ai_complete';
      const fn = aiOpsHandlers[fnKey];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `ai operation not supported: ${op}` };
        break;
      }
      const out = await fn(params, env);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'builtin': {
      const dispatcher = String(config.dispatcher || toolKey || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[dispatcher];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `builtin dispatcher not registered: ${dispatcher}` };
        break;
      }
      const out = await fn(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'http': {
      const base = String(config.base_url || '').replace(/\/$/, '');
      const path = String(config.endpoint || config.path || '');
      const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      const method = String(config.method || 'POST').toUpperCase();
      const headers = {
        'Content-Type': 'application/json',
        ...(config.headers && typeof config.headers === 'object' ? config.headers : {}),
      };
      if (credentials?.value) {
        const authType = String(config.auth_type || 'bearer').toLowerCase();
        if (authType === 'bearer') headers.Authorization = `Bearer ${credentials.value}`;
        else if (authType === 'token') headers.Authorization = `token ${credentials.value}`;
      }
      const body =
        params.body != null
          ? typeof params.body === 'string'
            ? params.body
            : JSON.stringify(params.body)
          : method !== 'GET' && method !== 'HEAD'
            ? JSON.stringify(params)
            : undefined;
      const res = await fetch(url, { method, headers, body });
      const text = await res.text().catch(() => '');
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 8000) };
      }
      if (!res.ok) {
        result = { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 500)}`, status: res.status, body: json };
        break;
      }
      result = { ok: true, status: res.status, body: json };
      break;
    }

    case 'github': {
      const { githubWriteOperationFromArgs } = await import('./mcp-github-write-schema.js');
      const opHint = githubWriteOperationFromArgs(params?.operation);
      const op = opHint || String(config.operation || '').toLowerCase();
      const { handlers: ghHandlers } = await import('../tools/builtin/github-worker.js');
      const opMap = {
        get_file: 'github_get_file',
        read_file: 'github_get_file',
        list_repos: 'github_repos',
        list_branches: 'github_list_branches',
        list_commits: 'github_list_commits',
        get_tree: 'github_get_tree',
        read_dir: 'github_read_dir',
        batch_read: 'github_batch_read',
        patch_file: 'github_patch_file',
        get_commit: 'github_get_commit',
        compare_commits: 'github_compare_commits',
        get_pr: 'github_get_pr',
        list_prs: 'github_list_prs',
        get_pr_diff: 'github_get_pr_diff',
        list_pr_files: 'github_list_pr_files',
        list_issues: 'github_list_issues',
        get_issue: 'github_get_issue',
        search_code: 'github_search_code',
        search: 'github_search_code',
        search_issues: 'github_search_issues_prs',
        list_workflow_runs: 'github_list_workflow_runs',
        get_workflow_run: 'github_get_workflow_run',
        list_workflow_jobs: 'github_list_workflow_jobs',
        get_job_logs: 'github_get_job_logs',
        get_commit_status: 'github_get_commit_status',
        check_permission: 'github_check_permission',
        update_file: 'github_update_file',
        create_file: 'github_create_file',
        upsert_file: 'github_upsert_file',
        delete_file: 'github_delete_file',
        create_pr: 'github_create_pr',
        update_pr: 'github_update_pr',
        merge_pr: 'github_merge_pr',
        create_comment: 'github_create_comment',
        create_issue: 'github_create_issue',
        update_issue: 'github_update_issue',
        close_issue: 'github_close_issue',
        search_issues_prs: 'github_search_issues_prs',
        create_branch: 'github_create_branch',
        delete_branch: 'github_delete_branch',
        set_commit_status: 'github_set_commit_status',
      };
      let handlerName = opMap[op] || null;
      if (!handlerName && toolKey === 'agentsam_github_write') handlerName = 'github_upsert_file';
      if (!handlerName && toolKey === 'agentsam_github_read') handlerName = 'github_get_file';
      if (
        !handlerName &&
        (toolKey === 'agentsam_github_read_many' || toolKey === 'agentsam_github_batch_read')
      ) {
        handlerName = 'github_batch_read';
      }
      if (!handlerName && toolKey === 'agentsam_github_patch') handlerName = 'github_patch_file';
      if (!handlerName && (toolKey === 'agentsam_github_pr' || toolKey === 'agentsam_github_pr_create')) {
        handlerName = 'github_create_pr';
      }
      if (!handlerName && toolKey === 'agentsam_github_repo_list') handlerName = 'github_repos';
      if (!handlerName && toolKey === 'agentsam_github_list_commits') handlerName = 'github_list_commits';
      // Issue tool: args.operation wins over handler_config (schema allows create|get|list|close|update).
      if (toolKey === 'agentsam_github_issue') {
        const issueOp = String(params?.operation || op || 'create').toLowerCase();
        if (issueOp === 'list' || issueOp === 'list_issues') handlerName = 'github_list_issues';
        else if (issueOp === 'get' || issueOp === 'get_issue') handlerName = 'github_get_issue';
        else if (issueOp === 'close' || issueOp === 'close_issue') handlerName = 'github_close_issue';
        else if (issueOp === 'update' || issueOp === 'update_issue') handlerName = 'github_update_issue';
        else handlerName = 'github_create_issue';
      }
      if (!handlerName && toolKey === 'github_file') handlerName = 'github_get_file';
      if (!handlerName && toolKey === 'github_update_file') handlerName = 'github_update_file';
      if (!handlerName && toolKey === 'github_create_file') handlerName = 'github_create_file';
      if (!handlerName && toolKey === 'github_repos') handlerName = 'github_repos';
      if (!handlerName && toolKey === 'github_create_pr') handlerName = 'github_create_pr';
      if (
        !handlerName &&
        (toolKey === 'agentsam_github_search' ||
          toolKey === 'agentsam_github_search_code' ||
          toolKey === 'github_search')
      ) {
        handlerName = 'github_search_code';
      }
      if (
        !handlerName &&
        (toolKey === 'agentsam_github_search_issues' ||
          toolKey === 'agentsam_github_search_issues_prs')
      ) {
        handlerName = 'github_search_issues_prs';
      }
      if (
        !handlerName &&
        (toolKey === 'agentsam_github_tree' || toolKey === 'agentsam_github_get_tree')
      ) {
        handlerName = 'github_get_tree';
      }
      if (!handlerName) {
        result = {
          ok: false,
          error: `unsupported_github_operation:${op || 'unknown'}`,
          body: { user_message: `GitHub operation "${op || 'unknown'}" is not configured for ${toolKey}.` },
        };
        break;
      }
      const fn = ghHandlers[handlerName];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `github_handler_missing:${handlerName}` };
        break;
      }
      const envelope = runContext.activeFileEnvelope || runContext.activeFile || null;
      const { applyActiveFileDefaultsToToolInput } = await import('./active-file-envelope.js');
      const ghParams = applyActiveFileDefaultsToToolInput(toolKey, params, envelope);
      if (!ghParams.repo) {
        ghParams.repo =
          ghParams.github_repo ||
          ghParams.active_file_github_repo ||
          params.github_repo ||
          params.active_file_github_repo ||
          runContext.selectedGithubRepoContext ||
          runContext.github_repo_context ||
          runContext.activeFileEnvelope?.github_repo ||
          null;
      }
      const { resolveGithubRepoForToolCall } = await import('./github-repo-scope.js');
      const repoScope = await resolveGithubRepoForToolCall(env, {
        userId: userId || String(ghParams.user_id || ''),
        tenantId,
        workspaceId,
        requestedRepo: ghParams.repo,
        isSuperadmin:
          runContext?.isSuperadmin === true ||
          runContext?.is_superadmin === true ||
          runContext?.isOperatorCall === true,
      });
      if (repoScope.blocked || !repoScope.repo) {
        const loginHint =
          repoScope.reason === 'github_not_connected'
            ? 'Connect GitHub in Integrations first.'
            : repoScope.reason === 'platform_repo_denied' ||
                String(ghParams.repo || '').toLowerCase().includes('inneranimalmedia')
              ? 'That repository belongs to the platform operator (SamPrimeaux/inneranimalmedia), not your GitHub account.'
              : 'Use agentsam_github_repo_list. Repo paths must use your GitHub username as owner (not SamPrimeaux/ unless that is your account).';
        result = {
          ok: false,
          error: repoScope.reason || 'github_repo_scope_denied',
          body: {
            user_message: `${loginHint} Requested: ${ghParams.repo || '(none)'}.`,
            requested_repo: ghParams.repo || null,
            allowed_owner_namespace: true,
          },
        };
        break;
      }
      if (repoScope.rewritten_from) {
        console.info(
          '[github-repo-scope] rewrote_repo',
          JSON.stringify({
            from: repoScope.rewritten_from,
            to: repoScope.repo,
            user_id: userId,
          }),
        );
      }
      ghParams.repo = repoScope.repo;
      let handlerNameResolved = handlerName;
      let opResolved = op;
      // Sync op label when tool-key fallbacks picked a handler without config.operation.
      if (handlerNameResolved === 'github_batch_read') opResolved = 'batch_read';
      if (handlerNameResolved === 'github_patch_file') opResolved = 'patch_file';
      if (handlerNameResolved === 'github_get_tree') opResolved = 'get_tree';
      if (handlerNameResolved === 'github_get_file') opResolved = 'get_file';
      if (handlerNameResolved === 'github_repos') opResolved = 'list_repos';
      if (handlerNameResolved === 'github_list_commits') opResolved = 'list_commits';
      if (handlerNameResolved === 'github_create_pr') opResolved = 'create_pr';
      if (handlerNameResolved === 'github_list_issues') opResolved = 'list_issues';
      if (handlerNameResolved === 'github_get_issue') opResolved = 'get_issue';
      if (handlerNameResolved === 'github_close_issue') opResolved = 'close_issue';
      if (handlerNameResolved === 'github_update_issue') opResolved = 'update_issue';
      if (handlerNameResolved === 'github_create_issue') opResolved = 'create_issue';
      if (handlerNameResolved === 'github_search_code') opResolved = 'search_code';
      if (
        (handlerNameResolved === 'github_get_file' || opResolved === 'get_file') &&
        !String(ghParams.path || '').trim() &&
        String(ghParams.repo || '').trim()
      ) {
        handlerNameResolved = 'github_get_tree';
        opResolved = 'get_tree';
        if (!String(ghParams.branch || ghParams.ref || '').trim()) {
          ghParams.branch = 'main';
        }
      }
      const fnResolved = ghHandlers[handlerNameResolved] || fn;
      const ghParamsWithMeta = {
        ...ghParams,
        user_id: userId || ghParams.user_id,
        tool: ghParams?.tool ?? toolKey,
        operation: ghParams?.operation ?? opResolved,
      };
      if (!String(ghParamsWithMeta.user_id || '').trim()) {
        result = {
          ok: false,
          error: 'user_id_required',
          body: {
            user_message: 'GitHub tools require an authenticated session.',
            missing: ['user_id'],
          },
        };
        break;
      }
      const out = await fnResolved(ghParamsWithMeta, env);

      if (out?.success === false || out?.error) {
        result = {
          ok: false,
          error: String(out?.error || out?.message || 'github_failed'),
          body: {
            ...out,
            user_message: out?.user_message || out?.message || null,
          },
        };
        break;
      }

      const normalize = () => {
        switch (opResolved) {
          case 'get_file': {
            return {
              ok: true,
              repo: out.repo ?? ghParamsWithMeta.repo ?? null,
              path: out.path ?? ghParamsWithMeta.path ?? null,
              sha: out.sha ?? null,
              size: out.size ?? null,
              encoding: out.encoding ?? 'base64',
              text: out.text ?? '',
            };
          }
          case 'list_repos':
            return { ok: true, repos: out.repos || [] };
          case 'list_branches':
            return { ok: true, branches: out.branches || [] };
          case 'list_commits':
            return {
              ok: true,
              repo: out.repo ?? ghParamsWithMeta.repo ?? null,
              ref: out.ref ?? ghParamsWithMeta.sha ?? ghParamsWithMeta.ref ?? ghParamsWithMeta.branch ?? null,
              commits: out.commits || [],
            };
          case 'get_tree': {
            const tree = out.tree || [];
            const sample = tree.slice(0, 200).map((e) => ({
              path: e.path,
              type: e.type,
              size: e.size ?? null,
            }));
            return {
              ok: true,
              repo: ghParamsWithMeta.repo ?? null,
              branch: out.branch ?? ghParamsWithMeta.branch ?? null,
              sha: out.sha ?? null,
              tree_count: tree.length,
              truncated: tree.length > 200,
              tree: sample,
            };
          }
          case 'read_dir':
            return { ok: true, repo: ghParamsWithMeta.repo ?? null, path: ghParamsWithMeta.path ?? null, entries: out.entries || [] };
          case 'batch_read':
            return {
              ok: true,
              files: out.files || [],
              truncated: out.truncated === true,
              hint: out.hint || null,
            };
          case 'patch_file': {
            const commitSha = out.commit?.sha ?? null;
            const sha = out.content?.sha ?? null;
            return {
              ok: true,
              path: ghParamsWithMeta.path ?? null,
              sha,
              commit_sha: commitSha,
              created: out.created === true,
            };
          }
          case 'get_commit': {
            const c = out.commit || {};
            return {
              ok: true,
              sha: c.sha ?? ghParamsWithMeta.sha ?? null,
              message: c.commit?.message ?? null,
              author: c.commit?.author?.name ?? c.author?.login ?? null,
              date: c.commit?.author?.date ?? null,
              files: c.files || [],
            };
          }
          case 'compare_commits': {
            const cmp = out.compare || {};
            return {
              ok: true,
              base: cmp.base_commit?.sha ?? ghParamsWithMeta.base ?? null,
              head: cmp.merge_base_commit?.sha ?? ghParamsWithMeta.head ?? null,
              diff_stat: {
                ahead_by: cmp.ahead_by ?? null,
                behind_by: cmp.behind_by ?? null,
                total_commits: cmp.total_commits ?? null,
                files: Array.isArray(cmp.files) ? cmp.files.length : null,
              },
              files: cmp.files || [],
            };
          }
          case 'get_pr': {
            const pr = out.pr || {};
            return {
              ok: true,
              number: pr.number ?? null,
              title: pr.title ?? null,
              state: pr.state ?? null,
              head: pr.head?.ref ?? null,
              base: pr.base?.ref ?? null,
              body: pr.body ?? null,
            };
          }
          case 'list_prs':
            return { ok: true, prs: out.prs || [] };
          case 'get_pr_diff':
            return { ok: true, number: Number(ghParamsWithMeta.pull_number) || null, diff: out.diff || '' };
          case 'list_pr_files':
            return { ok: true, number: Number(ghParamsWithMeta.pull_number) || null, files: out.files || [] };
          case 'list_issues':
            return { ok: true, issues: out.issues || [] };
          case 'get_issue': {
            const issue = out.issue || {};
            return {
              ok: true,
              number: issue.number ?? null,
              title: issue.title ?? null,
              state: issue.state ?? null,
              body: issue.body ?? null,
              labels: (issue.labels || []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
            };
          }
          case 'search_code':
            return { ok: true, items: out.results?.items || [] };
          case 'search_issues':
          case 'search_issues_prs':
            return { ok: true, items: out.results?.items || [] };
          case 'list_workflow_runs':
            return { ok: true, runs: out.runs || [] };
          case 'get_workflow_run':
            return { ok: true, run: out.run || null };
          case 'list_workflow_jobs':
            return { ok: true, jobs: out.jobs || [] };
          case 'get_job_logs':
            return { ok: true, log: out.log || '' };
          case 'get_commit_status': {
            const s = out.status || {};
            return { ok: true, state: s.state ?? null, statuses: s.statuses || [] };
          }
          case 'check_permission':
            return { ok: true, permission: out.permission || 'none' };
          case 'create_file': {
            const commitSha = out.commit?.sha ?? null;
            const sha = out.content?.sha ?? null;
            return { ok: true, path: ghParamsWithMeta.path ?? null, sha, commit_sha: commitSha };
          }
          case 'update_file': {
            const commitSha = out.commit?.sha ?? null;
            const sha = out.content?.sha ?? null;
            return { ok: true, path: ghParamsWithMeta.path ?? null, sha, commit_sha: commitSha };
          }
          case 'delete_file': {
            const commitSha = out.commit?.sha ?? null;
            return { ok: true, path: ghParamsWithMeta.path ?? null, commit_sha: commitSha };
          }
          case 'create_branch': {
            const sha = out.ref?.object?.sha ?? null;
            const branch = out.ref?.ref ? String(out.ref.ref).replace(/^refs\/heads\//, '') : ghParamsWithMeta.name ?? null;
            return { ok: true, branch, sha };
          }
          case 'delete_branch':
            return { ok: true };
          case 'create_pr':
            return { ok: true, number: out.number ?? null, url: out.html_url ?? null };
          case 'update_pr':
            return {
              ok: true,
              number:
                out.pr?.number ??
                (() => {
                  const n = Number(ghParamsWithMeta.pull_number);
                  return Number.isFinite(n) && n > 0 ? n : null;
                })(),
            };
          case 'merge_pr':
            return { ok: true, result: out.result ?? null };
          case 'create_comment':
            return { ok: true, id: out.comment?.id ?? null };
          case 'create_issue':
            return { ok: true, number: out.issue?.number ?? null, url: out.issue?.html_url ?? null };
          case 'update_issue':
            return {
              ok: true,
              number:
                out.issue?.number ??
                (() => {
                  const n = Number(ghParamsWithMeta.issue_number);
                  return Number.isFinite(n) && n > 0 ? n : null;
                })(),
            };
          case 'close_issue':
            return {
              ok: true,
              number:
                out.issue?.number ??
                (() => {
                  const n = Number(ghParamsWithMeta.issue_number);
                  return Number.isFinite(n) && n > 0 ? n : null;
                })(),
            };
          case 'set_commit_status': {
            const st = out.status || {};
            return { ok: true, state: st.state ?? ghParamsWithMeta.state ?? null };
          }
          default:
            return { ok: true, body: out };
        }
      };
      result = normalize();
      break;
    }

    case 'mybrowser':
    case 'browser': {
      const toolName = String(row.tool_key || row.tool_name || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[toolName];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `browser handler not registered for tool_key=${toolName}` };
        break;
      }
      const out = await fn(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'cms': {
      const handlerKey = String(config.handler || row.handler_key || row.tool_key || toolKey || '').trim();
      const { handlers: cmsHandlers } = await import('../tools/builtin/cms.js');
      const fn = cmsHandlers[handlerKey] || cmsHandlers[row.tool_key] || cmsHandlers[row.tool_name];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `cms handler not registered: ${handlerKey}` };
        break;
      }
      const out = await fn(params, env, { ...runContext, executionCtx: runContext.ctx });
      result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
      break;
    }

    case 'deploy': {
      const commandSource = String(config.command_source || 'workspace_settings.deploy_command').trim();
      const preferHook =
        commandSource === 'workers_build_hook' ||
        config.prefer_build_hook === true ||
        config.prefer_build_hook === 'true';

      if (preferHook || commandSource !== 'workspace_settings.deploy_command') {
        const { postWorkersDeployHook, redactDeployHookUrl } = await import('./workers-deploy-hook.js');
        const hook = await postWorkersDeployHook(env, { workspaceId });
        if (hook.error !== 'deploy_hook_url not configured') {
          const buildUuid = hook.json?.result?.build_uuid ?? hook.json?.build_uuid ?? null;
          result = hook.ok
            ? {
                ok: true,
                body: {
                  method: 'workers_build_hook',
                  workspace_id: workspaceId,
                  build_uuid: buildUuid,
                  deploy_hook_url_redacted: redactDeployHookUrl(hook.deploy_hook_url),
                  deploy_hook_source: hook.source ?? null,
                  http_status: hook.status,
                  cloudflare: hook.json ?? null,
                },
              }
            : {
                ok: false,
                error: hook.error || `Workers Builds hook HTTP ${hook.status}`,
                body: {
                  method: 'workers_build_hook',
                  workspace_id: workspaceId,
                  http_status: hook.status,
                  detail: hook.raw ?? null,
                },
              };
          break;
        }
        if (preferHook) {
          result = {
            ok: false,
            error: 'deploy_hook_url not configured',
            body: {
              action: 'Set agentsam_workspace.metadata_json.deploy_hook_url or AGENT_SAM_DEPLOY_HOOK_URL',
              workspace_id: workspaceId || 'unknown',
              tool_key: toolKey,
            },
          };
          break;
        }
      }

      let deployCommand = '';
      let settingsJson = null;
      if (workspaceId && env?.DB) {
        const settingsRow = await env.DB.prepare(
          'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
        )
          .bind(workspaceId)
          .first()
          .catch(() => null);
        if (settingsRow?.settings_json) {
          settingsJson = settingsRow.settings_json;
          deployCommand = resolveWorkspaceDeployCommand(settingsJson, commandSource);
        }
      }

      if (!deployCommand) {
        const { postWorkersDeployHook, redactDeployHookUrl } = await import('./workers-deploy-hook.js');
        const hook = await postWorkersDeployHook(env, { workspaceId });
        if (hook.error !== 'deploy_hook_url not configured') {
          const buildUuid = hook.json?.result?.build_uuid ?? hook.json?.build_uuid ?? null;
          result = hook.ok
            ? {
                ok: true,
                body: {
                  method: 'workers_build_hook',
                  workspace_id: workspaceId,
                  build_uuid: buildUuid,
                  deploy_hook_url_redacted: redactDeployHookUrl(hook.deploy_hook_url),
                  deploy_hook_source: hook.source ?? null,
                },
              }
            : {
                ok: false,
                error: hook.error || `Workers Builds hook HTTP ${hook.status}`,
                body: { method: 'workers_build_hook', workspace_id: workspaceId },
              };
          break;
        }
        const settingsKey = commandSource.startsWith('workspace_settings.')
          ? commandSource.slice('workspace_settings.'.length)
          : 'deploy_command';
        result = {
          ok: false,
          error: `${settingsKey} not configured for this workspace`,
          body: {
            action: `Set workspace_settings.settings_json.${settingsKey}, workspace deploy_hook_url, or AGENT_SAM_DEPLOY_HOOK_URL before deploying.`,
            workspace_id: workspaceId || 'unknown',
            command_source: commandSource,
            tool_key: toolKey,
          },
        };
        break;
      }
      const wrappedDeploy = wrapWorkspaceShellCommand(settingsJson, deployCommand);
      const termRow = { ...row, handler_type: 'terminal' };
      return executeCatalogTool(
        env,
        termRow,
        config,
        { ...params, command: wrappedDeploy },
        runContext,
        credentials,
      );
    }

    case 'git': {
      // D1-owned: handler_config.command_template (migration 839+). Do not invent
      // per-tool_key command maps here — missing template is a catalog bug.
      const gitCommand = String(
        params.command || params.cmd || config.command_template || '',
      ).trim();
      if (!gitCommand) {
        result = {
          ok: false,
          error: `git tool missing command_template in handler_config (tool_key=${toolKey})`,
          body: {
            tool_key: toolKey,
            hint: 'Set agentsam_tools.handler_config.command_template for this pty_git_* row.',
          },
        };
        break;
      }
      const termRow = { ...row, handler_type: 'terminal' };
      return executeCatalogTool(
        env,
        termRow,
        config,
        { ...params, command: gitCommand },
        runContext,
        credentials,
      );
    }

    case 'memory': {
      result = await executeMemoryCatalogDispatch(env, config, params, runContext, toolKey);
      break;
    }

    case 'mcp':
    case 'browser_agentic':
    case 'proxy':
    case 'workspace.reader': {
      const op = String(config.operation || '').toLowerCase();
      const memOps = new Set([
        'memory_write',
        'memory_search',
        'memory_read',
        'memory_delete',
      ]);
      if (memOps.has(op)) {
        const { handlers: memoryHandlers } = await import('../tools/memory.js');
        const fn = memoryHandlers[op];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `memory handler not registered: ${op}` };
          break;
        }
        const memCtx = {
          tenantId,
          userId,
          workspaceId,
          agentId: runContext.agentId ?? runContext.agent_id,
          sessionId: runContext.sessionId ?? runContext.session_id,
        };
        let memParams = params;
        if (op === 'memory_write') {
          const { resolveManagedMemoryType } = await import('./mcp-memory-type-compat.js');
          const resolved = resolveManagedMemoryType(params);
          memParams = {
            ...params,
            key: params.key ?? params.memory_key ?? params.memoryKey,
            value: params.value ?? params.content ?? params.body,
            memory_type: resolved.memory_type,
            tags: resolved.tags?.length ? resolved.tags : params.tags,
            source: params.source ?? `mcp:${toolKey}`,
          };
        }
        if (op === 'memory_search') {
          const { DEFAULT_MEMORY_SEARCH_QUERY } = await import('./mcp-memory-search-schema.js');
          memParams = {
            ...params,
            query:
              params.query ??
              params.q ??
              (params.top_k ? DEFAULT_MEMORY_SEARCH_QUERY : ''),
            limit: params.limit ?? params.top_k ?? 20,
          };
        }
        const out = await fn(memParams, env, memCtx);
        result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
        break;
      }
      if (
        handlerType === 'workspace.reader' ||
        ['read', 'list', 'grep', 'write', 'search'].includes(op)
      ) {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const fsOp = op === 'write' || op === 'put' ? 'write_file' : 'read_file';
        const fn = fsHandlers[fsOp];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `filesystem operation not available: ${fsOp}` };
          break;
        }
        const out = await fn(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }

      const moduleKey = String(config.module || config.executor_module || '').toLowerCase();
      if (moduleKey === 'memory' || moduleKey === 'tools/memory.js') {
        const { handlers: memoryHandlers } = await import('../tools/memory.js');
        const memKey = String(config.handler || row.tool_key || '').trim();
        const fn = memoryHandlers[memKey];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `memory handler not registered: ${memKey}` };
          break;
        }
        const out = await fn(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (moduleKey === 'context' || String(config.executor || '').includes('context')) {
        const { handlers: contextHandlers } = await import('../tools/builtin/context.js');
        const ctxKey = String(config.handler || config.tool_name || row.tool_key || '').trim();
        const fn = contextHandlers[ctxKey];
        if (typeof fn !== 'function') {
          result = { ok: false, error: `context handler not registered: ${ctxKey}` };
          break;
        }
        const out = await fn(params, env);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }

      const mcpUrl = String(row.mcp_service_url || config.mcp_service_url || '').trim();
      if (mcpUrl) {
        const syntheticRow = {
          tool_key: row.tool_key,
          tool_name: row.tool_name || row.tool_key,
          mcp_service_url: mcpUrl,
          handler_config: row.handler_config,
          server_key: config.server_key,
        };
        result = await executeMcpCatalogRow(env, syntheticRow, params, runContext);
        break;
      }

      if (String(config.binding || '').toLowerCase() === 'internal') {
        result = {
          ok: false,
          error: `internal binding tool_key=${row.tool_key} requires handler_config.module or mcp_service_url`,
        };
        break;
      }

      result = {
        ok: false,
        error: `handler_config not routable for tool_key=${row.tool_key} (need operation+filesystem, module, or mcp_service_url)`,
      };
      break;
    }

    case 'filesystem': {
      const op = String(config.operation || config.dispatcher || 'read').toLowerCase();
      if (op === 'write' || op === 'put' || op === 'fs_write_file') {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const out = await fsHandlers.write_file?.(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      if (op === 'list' || op === 'list_dir' || op === 'fs_list_dir') {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const out = await fsHandlers.list_dir?.(params, env, runContext);
        result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
        break;
      }
      const { executeFsReadFile } = await import('./fs-read-file.js');
      const readOut = await executeFsReadFile(env, params, runContext);
      if (!readOut?.error) {
        result = { ok: true, body: readOut };
        break;
      }
      const { handlers: fsHandlers } = await import('../tools/fs.js');
      const out = await fsHandlers.read_file?.(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error) } : { ok: true, body: out };
      break;
    }

    case 'agent': {
      if (String(config.sql || '').trim()) {
        result = await executeCatalogInlineAgentSql(env, config, params, runContext);
        break;
      }
      const moduleKey = String(config.module || config.executor_module || '').toLowerCase();
      if (moduleKey.includes('cms')) {
        const handlerKey = String(config.handler || row.handler_key || toolKey || '').trim();
        const { handlers: cmsHandlers } = await import('../tools/builtin/cms.js');
        const fn = cmsHandlers[handlerKey] || cmsHandlers[row.tool_key] || cmsHandlers[row.tool_name];
        if (typeof fn === 'function') {
          const out = await fn(params, env, { ...runContext, executionCtx: runContext.ctx });
          result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
          break;
        }
      }
      if (moduleKey.includes('gmail')) {
        const handlerKey = String(config.handler || row.handler_key || toolKey || '').trim();
        const { handlers: gmailHandlers } = await import('../tools/builtin/gmail.js');
        const fn = gmailHandlers[handlerKey] || gmailHandlers[row.tool_key] || gmailHandlers[row.tool_name];
        if (typeof fn === 'function') {
          const out = await fn(params, env, { ...runContext, executionCtx: runContext.ctx });
          result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
          break;
        }
      }
      if (moduleKey.includes('tickets')) {
        const handlerKey = String(config.handler || row.handler_key || toolKey || '').trim();
        const { handlers: ticketHandlers } = await import('../tools/builtin/tickets.js');
        const fn = ticketHandlers[handlerKey] || ticketHandlers[row.tool_key] || ticketHandlers[row.tool_name];
        if (typeof fn === 'function') {
          const out = await fn(params, env, { ...runContext, executionCtx: runContext.ctx });
          result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
          break;
        }
      }
      {
        const handlerKey = String(config.handler || row.handler_key || toolKey || '').trim();
        const { handlers: agentHandlers } = await import('../tools/builtin/agent.js');
        const fn = agentHandlers[handlerKey];
        if (typeof fn === 'function') {
          const out = await fn(params, env);
          result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
          break;
        }
      }
      result = {
        ok: false,
        error: `handler_type agent requires handler_config.sql or registered handler for tool_key=${row.tool_key}`,
      };
      break;
    }

    case 'media':
    case 'canvas': {
      const handlerKey = String(
        config.handler || row.handler_key || row.tool_key || row.tool_name || toolKey || '',
      ).trim();
      const { handlers: mediaHandlers } = await import('../tools/builtin/media.js');
      const fn = mediaHandlers[handlerKey];
      if (typeof fn !== 'function') {
        result = { ok: false, error: `media handler not registered: ${handlerKey}` };
        break;
      }
      const out = await fn(params, env, runContext);
      result = out?.error ? { ok: false, error: String(out.error), body: out } : { ok: true, body: out };
      break;
    }

    default:
      result = {
        ok: false,
        error: `unsupported agentsam_tools.handler_type=${handlerType} (configure handler_config or add executor)`,
      };
      break;
  }

  await finalizeTelemetry(result?.ok === true, result?.body ?? result, result?.ok === true ? null : result?.error || null);
  return result;
}
