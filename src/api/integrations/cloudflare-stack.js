/**
 * CF Stack Wizard — enumerate D1 / Workers / Tunnels via user's Cloudflare OAuth token.
 */
import { jsonResponse } from '../../core/auth.js';
import { getIntegrationOAuthRow } from '../../core/user-oauth-token.js';
import { resolveIntegrationUserId } from '../../core/integration-user-id.js';
import { userCanAccessWorkspace } from '../../core/workspace-access.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function looksLikeCfAccountId(v) {
  const s = trim(v);
  return /^[a-f0-9]{32}$/i.test(s);
}

function parseJsonObject(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function cfFetch(token, url) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function getCfOAuthRow(env, authUser) {
  const userId = await resolveIntegrationUserId(env, authUser);
  if (!userId) return { userId: null, row: null, token: null };
  const row = await getIntegrationOAuthRow(env, userId, 'cloudflare', '');
  const token = row?.access_token ? String(row.access_token).trim() : null;
  return { userId, row, token };
}

async function resolveCfAccountId(token, row) {
  const fromIdentifier = trim(row?.account_identifier);
  if (looksLikeCfAccountId(fromIdentifier)) return fromIdentifier;

  const meta = parseJsonObject(row?.metadata_json);
  const fromMeta =
    trim(meta.cloudflare_account_id) ||
    trim(meta.account_id) ||
    trim(meta.cf_account_id);
  if (looksLikeCfAccountId(fromMeta)) return fromMeta;

  const data = await cfFetch(token, 'https://api.cloudflare.com/client/v4/accounts?per_page=50');
  const accounts = Array.isArray(data?.result) ? data.result : [];
  if (accounts.length === 1) return trim(accounts[0]?.id) || null;
  if (accounts.length > 1) return trim(accounts[0]?.id) || null;
  return null;
}

async function readWorkspaceSettingsJson(env, workspaceId) {
  const wid = trim(workspaceId);
  if (!wid || !env?.DB) return {};
  const row = await env.DB.prepare(
    `SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1`,
  )
    .bind(wid)
    .first()
    .catch(() => null);
  return parseJsonObject(row?.settings_json);
}

async function mergeWorkspaceSettingsJson(env, workspaceId, patch) {
  const wid = trim(workspaceId);
  if (!wid || !env?.DB) return {};
  const current = await readWorkspaceSettingsJson(env, wid);
  const next = { ...current, ...patch };
  const json = JSON.stringify(next);
  await env.DB.prepare(
    `INSERT INTO workspace_settings (workspace_id, settings_json, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(workspace_id) DO UPDATE SET
       settings_json = excluded.settings_json,
       updated_at = excluded.updated_at`,
  )
    .bind(wid, json)
    .run();
  return next;
}

/**
 * POST /api/integrations/cloudflare_oauth/stack/enumerate
 */
export async function handleCfStackEnumerate(env, authUser) {
  const { userId, row, token } = await getCfOAuthRow(env, authUser);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!token) return jsonResponse({ error: 'cloudflare_not_connected' }, 401);

  const accountId = await resolveCfAccountId(token, row);
  if (!accountId) return jsonResponse({ error: 'cloudflare_account_id_missing' }, 400);

  const [d1, workers, tunnels] = await Promise.all([
    cfFetch(
      token,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database?per_page=50`,
    ),
    cfFetch(
      token,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    ),
    cfFetch(
      token,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel?per_page=20`,
    ),
  ]);

  return jsonResponse({
    account_id: accountId,
    d1_databases: (d1?.result || []).map((db) => ({
      id: db.uuid || db.id,
      name: db.name,
    })),
    workers: (workers?.result || []).map((w) => ({ id: w.id, name: w.id })),
    tunnels: (tunnels?.result || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
    })),
  });
}

/**
 * POST /api/integrations/cloudflare_oauth/stack/save
 */
export async function handleCfStackSave(env, authUser, body) {
  const workspace_id = trim(body?.workspace_id);
  if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);

  const okWs = await userCanAccessWorkspace(env, authUser, workspace_id);
  if (!okWs) return jsonResponse({ error: 'Forbidden' }, 403);

  const { userId, row, token } = await getCfOAuthRow(env, authUser);
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!token) return jsonResponse({ error: 'cloudflare_not_connected' }, 401);

  const d1_database_id = trim(body?.d1_database_id);
  const worker_name = trim(body?.worker_name);
  const tunnel_id = trim(body?.tunnel_id);

  if (d1_database_id) {
    const accountId = await resolveCfAccountId(token, row);
    if (!accountId) return jsonResponse({ error: 'cloudflare_account_id_missing' }, 400);
    const check = await cfFetch(
      token,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${d1_database_id}`,
    );
    if (!check?.success) return jsonResponse({ error: 'd1_not_found' }, 400);
  }

  const current = await readWorkspaceSettingsJson(env, workspace_id);

  const updated = {
    ...current,
    ...(d1_database_id && { cf_d1_database_id: d1_database_id }),
    ...(body?.d1_database_name && { cf_d1_database_name: String(body.d1_database_name).trim() }),
    ...(worker_name && { cf_worker_name: worker_name }),
    ...(tunnel_id && { cf_tunnel_id: tunnel_id }),
    ...(body?.tunnel_name && { cf_tunnel_name: String(body.tunnel_name).trim() }),
    cf_stack_configured_at: Date.now(),
    cf_stack_configured_by: userId,
  };

  await mergeWorkspaceSettingsJson(env, workspace_id, updated);

  return jsonResponse({ ok: true, workspace_id, saved: Object.keys(updated) });
}
