/**
 * Catalog dispatch: agentsam_tools row → resolveCredential → handler execution.
 * Handlers receive runContext.credentials; they must not read env for secrets directly.
 */
import { parseHandlerConfig, resolveCredential } from './resolve-credential.js';
import { runBuiltinTool, normalizeToolName } from '../tools/ai-dispatch.js';

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
    `SELECT id, tool_key, tool_code, tool_name, handler_type, handler_config, handler_key, is_active
     FROM agentsam_tools
     WHERE COALESCE(is_active, 1) = 1
       AND (tool_code = ? OR tool_key = ? OR tool_name = ?)
     LIMIT 1`,
  )
    .bind(key, key, key)
    .first();
}

/**
 * HTTP tools using resolved credential (never env in handler).
 * @param {Record<string, unknown>} config
 * @param {{ value?: string }} creds
 * @param {Record<string, unknown>} input
 */
async function executeHttpTool(config, creds, input) {
  const base = String(config.base_url || '').replace(/\/$/, '');
  const path = String(config.endpoint || config.path || '');
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = String(config.method || 'POST').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(config.headers && typeof config.headers === 'object' ? config.headers : {}),
  };
  if (creds?.value) {
    const authType = String(config.auth_type || 'bearer').toLowerCase();
    if (authType === 'bearer') headers.Authorization = `Bearer ${creds.value}`;
    else if (authType === 'token') headers.Authorization = `token ${creds.value}`;
  }
  const body =
    input.body != null
      ? typeof input.body === 'string'
        ? input.body
        : JSON.stringify(input.body)
      : method !== 'GET' && method !== 'HEAD'
        ? JSON.stringify(input)
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

/**
 * @param {Record<string, unknown>} config
 * @param {{ value?: string }} creds
 * @param {Record<string, unknown>} input
 */
async function executeGithubTool(config, creds, input) {
  const apiBase = String(config.api_base || 'https://api.github.com').replace(/\/$/, '');
  let path = String(config.endpoint || '/');
  const repo = String(config.repo || input.repo || '');
  if (repo.includes('/')) {
    const [owner, name] = repo.split('/');
    path = path.replace('{owner}', owner).replace('{repo}', name);
  }
  path = path.replace('{path}', encodeURIComponent(String(input.path || input.file_path || '')));
  path = path.replace('{pull_number}', String(input.pull_number ?? input.pr_number ?? ''));
  const url = `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = String(config.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'InnerAnimalMedia-AgentSam',
    Authorization: `Bearer ${creds.value}`,
  };
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(input.body ?? input);
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

  const params = {
    ...parseInput(input),
    workspace_id: workspaceId,
    tenant_id: tenantId,
    user_id: userId,
  };

  const handlerType = String(row.handler_type || '').toLowerCase();
  const toolName = normalizeToolName(row.tool_key || row.tool_name);

  if (handlerType === 'http') {
    const out = await executeHttpTool(config, credentials, params);
    return { ...out, tool_key: row.tool_key, auth_source: credentials.auth_source };
  }

  if (handlerType === 'github') {
    const out = await executeGithubTool(config, credentials, params);
    return { ...out, tool_key: row.tool_key, auth_source: credentials.auth_source };
  }

  const builtin = await runBuiltinTool(env, toolName, params, enrichedContext);
  if (builtin && typeof builtin === 'object' && builtin.error) {
    return { ok: false, ...builtin, tool_key: row.tool_key, auth_source: credentials.auth_source };
  }
  return {
    ok: true,
    tool_key: row.tool_key,
    auth_source: credentials.auth_source,
    result: builtin,
  };
}
