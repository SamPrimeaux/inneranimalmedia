/**
 * Execute agentsam_tools rows by handler_type + handler_config only.
 * No hardcoded tool_key / tool_name branches.
 */
import { d1_query, d1_write } from './d1.js';
import { handlers as dbToolHandlers } from '../tools/db.js';
import { handlers as termHandlers } from '../tools/terminal.js';
import { handlers as storageHandlers } from '../tools/builtin/storage.js';
import { handlers as aiOpsHandlers } from '../tools/builtin/ai-ops.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { resolveMcpServerForTool } from './mcp-servers.js';

function parseInput(input) {
  if (input == null) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return { ...input };
  return { value: input };
}

function bindingBucket(env, bindingName) {
  const key = String(bindingName || 'DB').trim();
  if (key === 'ASSETS' || key === 'DASHBOARD') return env.DASHBOARD || env.ASSETS;
  if (key === 'AI') return env.AI;
  return env[key] ?? env.DB;
}

/**
 * @param {any} env
 * @param {string | null | undefined} linkedId
 * @param {string | null | undefined} toolKey
 */
async function loadMcpToolRow(env, linkedId, toolKey) {
  if (!env?.DB) return null;
  if (linkedId) {
    const byId = await env.DB.prepare(
      `SELECT * FROM agentsam_mcp_tools WHERE id = ? AND COALESCE(is_active,1)=1 AND COALESCE(enabled,1)=1 LIMIT 1`,
    )
      .bind(String(linkedId).trim())
      .first();
    if (byId) return byId;
  }
  const key = String(toolKey || '').trim();
  if (!key) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_mcp_tools
     WHERE COALESCE(is_active,1)=1 AND COALESCE(enabled,1)=1
       AND (tool_key = ? OR tool_name = ? OR capability_key = ?)
     LIMIT 1`,
  )
    .bind(key, key, key)
    .first();
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} mcpRow
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} runContext
 */
export async function executeMcpCatalogRow(env, mcpRow, params, runContext) {
  const toolName = String(mcpRow.tool_key || mcpRow.tool_name || '').trim();
  const { url } = await resolveMcpServerForTool(env, {
    tenantId: runContext.tenantId ?? runContext.tenant_id,
    workspaceId: runContext.workspaceId ?? runContext.workspace_id,
  }, mcpRow);

  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: params },
      }),
    }).catch((e) => ({ ok: false, status: 0, _err: e }));

    if (!res?.ok) {
      return {
        ok: false,
        error: `mcp HTTP ${res?.status ?? 0}: ${res?._err?.message ?? toolName}`,
      };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: true, body };
  }

  return {
    ok: false,
    error: `mcp tool ${toolName}: no mcp_service_url or server row`,
  };
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
  const handlerType = String(row.handler_type || '').toLowerCase();
  const params = {
    ...parseInput(input),
    workspace_id: runContext.workspaceId ?? runContext.workspace_id,
    tenant_id: runContext.tenantId ?? runContext.tenant_id,
    user_id: runContext.userId ?? runContext.user_id,
  };

  switch (handlerType) {
    case 'd1': {
      const op = String(config.operation || 'query').toLowerCase();
      const sql = String(params.sql || params.query || '').trim();
      if (!sql) {
        return { ok: false, error: `d1 tool requires sql in input (operation=${op})` };
      }
      try {
        if (op === 'execute' || op === 'write') {
          const out = await d1_write({ sql, params: params.params }, env);
          return { ok: true, body: out };
        }
        if (op === 'introspect' || op === 'schema') {
          const out = await dbToolHandlers.d1_schema_introspect(params, env);
          if (out?.error) return { ok: false, error: String(out.error) };
          return { ok: true, body: out };
        }
        const rows = await d1_query({ sql, params: params.params }, env);
        return { ok: true, body: { rows } };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    }

    case 'hyperdrive':
    case 'supabase': {
      if (!isHyperdriveUsable(env)) {
        return { ok: false, error: 'Hyperdrive binding unavailable' };
      }
      const sql = String(params.sql || params.query || '').trim();
      if (!sql) return { ok: false, error: 'hyperdrive/supabase tool requires sql in input' };
      const out = await runHyperdriveQuery(env, sql, Array.isArray(params.params) ? params.params : []);
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, body: { rows: out.rows } };
    }

    case 'terminal': {
      const cmd = String(params.command || params.cmd || config.command_template || '').trim();
      if (!cmd) return { ok: false, error: 'terminal tool requires command in input' };
      const out = await termHandlers.run_command(
        { command: cmd, session_id: params.session_id },
        env,
      );
      if (out?.error) return { ok: false, error: String(out.error) };
      return { ok: true, body: out };
    }

    case 'r2': {
      const op = String(config.operation || config.r2_operation || 'write').toLowerCase();
      const fn =
        storageHandlers[`r2_${op}`] ||
        storageHandlers[op] ||
        storageHandlers.r2_write;
      if (typeof fn !== 'function') {
        return { ok: false, error: `r2 operation not supported: ${op}` };
      }
      const bucket = bindingBucket(env, config.binding);
      const out = await fn({ ...params, bucket }, env);
      if (out?.error) return { ok: false, error: String(out.error) };
      return { ok: true, body: out };
    }

    case 'ai': {
      const op = String(config.operation || config.ai_operation || 'complete').toLowerCase();
      const fnKey = op === 'embed' ? 'ai_embed' : op === 'compare' ? 'ai_compare' : 'ai_complete';
      const fn = aiOpsHandlers[fnKey];
      if (typeof fn !== 'function') {
        return { ok: false, error: `ai operation not supported: ${op}` };
      }
      const out = await fn(params, env);
      if (out?.error) return { ok: false, error: String(out.error) };
      return { ok: true, body: out };
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
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 500)}`, status: res.status, body: json };
      }
      return { ok: true, status: res.status, body: json };
    }

    case 'github': {
      if (!credentials?.value) {
        return { ok: false, error: 'github tool requires resolved credential' };
      }
      const apiBase = String(config.api_base || 'https://api.github.com').replace(/\/$/, '');
      let path = String(config.endpoint || '/');
      const repo = String(config.repo || params.repo || '');
      if (repo.includes('/')) {
        const [owner, name] = repo.split('/');
        path = path.replace('{owner}', owner).replace('{repo}', name);
      }
      path = path.replace('{path}', encodeURIComponent(String(params.path || params.file_path || '')));
      const url = `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
      const method = String(config.method || 'GET').toUpperCase();
      const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'InnerAnimalMedia-AgentSam',
        Authorization: `Bearer ${credentials.value}`,
      };
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = JSON.stringify(params.body ?? params);
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(url, init);
      const text = await res.text().catch(() => '');
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 8000) };
      }
      if (!res.ok) {
        return { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 500)}`, status: res.status, body: json };
      }
      return { ok: true, status: res.status, body: json };
    }

    case 'mybrowser': {
      const toolName = String(row.tool_key || row.tool_name || '').trim();
      const { handlers: webHandlers } = await import('../tools/builtin/web.js');
      const fn = webHandlers[toolName];
      if (typeof fn !== 'function') {
        return { ok: false, error: `mybrowser handler not registered for tool_key=${toolName}` };
      }
      const out = await fn(params, env);
      if (out?.error) return { ok: false, error: String(out.error) };
      return { ok: true, body: out };
    }

    case 'mcp':
    case 'browser_agentic':
    case 'proxy':
    case 'workspace.reader': {
      const op = String(config.operation || '').toLowerCase();
      if (
        handlerType === 'workspace.reader' ||
        ['read', 'list', 'grep', 'write', 'search'].includes(op)
      ) {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const fsOp = op === 'write' || op === 'put' ? 'write_file' : 'read_file';
        const fn = fsHandlers[fsOp];
        if (typeof fn !== 'function') {
          return { ok: false, error: `filesystem operation not available: ${fsOp}` };
        }
        const out = await fn(params, env, runContext);
        if (out?.error) return { ok: false, error: String(out.error) };
        return { ok: true, body: out };
      }

      const moduleKey = String(config.module || config.executor_module || '').toLowerCase();
      if (moduleKey === 'memory' || moduleKey === 'tools/memory.js') {
        const { handlers: memoryHandlers } = await import('../tools/memory.js');
        const memKey = String(config.handler || row.tool_key || '').trim();
        const fn = memoryHandlers[memKey];
        if (typeof fn !== 'function') {
          return { ok: false, error: `memory handler not registered: ${memKey}` };
        }
        const out = await fn(params, env, runContext);
        if (out?.error) return { ok: false, error: String(out.error) };
        return { ok: true, body: out };
      }
      if (moduleKey === 'context' || String(config.executor || '').includes('context')) {
        const { handlers: contextHandlers } = await import('../tools/builtin/context.js');
        const ctxKey = String(config.handler || config.tool_name || row.tool_key || '').trim();
        const fn = contextHandlers[ctxKey];
        if (typeof fn !== 'function') {
          return { ok: false, error: `context handler not registered: ${ctxKey}` };
        }
        const out = await fn(params, env);
        if (out?.error) return { ok: false, error: String(out.error) };
        return { ok: true, body: out };
      }

      const mcpUrl = String(row.mcp_service_url || config.mcp_service_url || '').trim();
      if (mcpUrl) {
        const syntheticRow = {
          tool_key: row.tool_key,
          tool_name: row.tool_name || row.tool_key,
          mcp_service_url: mcpUrl,
        };
        return executeMcpCatalogRow(env, syntheticRow, params, runContext);
      }

      if (String(config.binding || '').toLowerCase() === 'internal') {
        return {
          ok: false,
          error: `internal binding tool_key=${row.tool_key} requires handler_config.module or mcp_service_url`,
        };
      }

      return {
        ok: false,
        error: `handler_config not routable for tool_key=${row.tool_key} (need operation+filesystem, module, or mcp_service_url)`,
      };
    }

    case 'filesystem': {
      const op = String(config.operation || 'read').toLowerCase();
      if (op === 'write' || op === 'put') {
        const { handlers: fsHandlers } = await import('../tools/fs.js');
        const out = await fsHandlers.write_file?.(params, env, runContext);
        if (out?.error) return { ok: false, error: String(out.error) };
        return { ok: true, body: out };
      }
      const { handlers: fsHandlers } = await import('../tools/fs.js');
      const out = await fsHandlers.read_file?.(params, env, runContext);
      if (out?.error) return { ok: false, error: String(out.error) };
      return { ok: true, body: out };
    }

    default:
      return {
        ok: false,
        error: `unsupported agentsam_tools.handler_type=${handlerType} (configure handler_config or add executor)`,
      };
  }
}
