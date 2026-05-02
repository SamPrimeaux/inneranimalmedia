/**
 * Settings-scoped integration APIs: /api/settings/integrations/*
 */
import { jsonResponse, fetchAuthUserTenantId, fallbackSystemTenantId } from '../core/auth.js';
import { handleIntegrationsRequest } from './integrations.js';

function resolveTenantId(env, authUser) {
  if (authUser?.tenant_id && String(authUser.tenant_id).trim()) {
    return String(authUser.tenant_id).trim();
  }
  return null;
}

async function resolveTenantIdOrFetch(env, authUser) {
  let tid = resolveTenantId(env, authUser);
  if (tid) return tid;
  if (authUser?.id && env?.DB) {
    tid = await fetchAuthUserTenantId(env, authUser.id);
    if (tid) return tid;
  }
  if (env?.TENANT_ID) return String(env.TENANT_ID).trim();
  return fallbackSystemTenantId(env);
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function legacyMapForUser(DB, userEmail) {
  const map = new Map();
  if (!DB || !userEmail) return map;
  const candidates = [
    'SELECT LOWER(provider_key) AS k, is_connected, last_used FROM user_integrations WHERE LOWER(COALESCE(user_email, email, user_id)) = LOWER(?)',
    'SELECT LOWER(provider) AS k, is_connected, last_used FROM user_integrations WHERE LOWER(COALESCE(user_email, email, user_id)) = LOWER(?)',
  ];
  for (const sql of candidates) {
    try {
      const { results } = await DB.prepare(sql).bind(userEmail).all();
      for (const r of results || []) {
        if (r?.k) map.set(String(r.k), r);
      }
      if (map.size) return map;
    } catch {
      /* try next */
    }
  }
  return map;
}

async function getConnectedIntegrations(env, authUser) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const email = String(authUser.email || authUser.id || '').trim();

  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT r.*,
              c.id AS catalog_row_id,
              c.name AS catalog_name,
              c.slug AS catalog_slug,
              c.category AS catalog_category,
              c.auth_type AS catalog_auth_type,
              c.oauth_authorize_url,
              c.oauth_scopes_default,
              c.oauth_scopes_available,
              c.api_key_label,
              c.api_key_placeholder,
              c.docs_url,
              c.icon_slug,
              c.description AS catalog_description,
              c.sort_order AS catalog_sort_order,
              c.is_active AS catalog_is_active
       FROM integration_registry r
       LEFT JOIN integration_catalog c ON c.slug = r.provider_key
       WHERE r.tenant_id = ?
         AND COALESCE(r.is_enabled, 1) = 1
       ORDER BY COALESCE(r.sort_order, 50) ASC, r.display_name ASC`,
    )
      .bind(tenantId)
      .all();
    rows = res?.results || [];
  } catch (e) {
    console.warn('[settings-integrations] connected query failed', e?.message || e);
    return jsonResponse({ error: e?.message ?? String(e), items: [] }, 500);
  }

  const legacy = await legacyMapForUser(env.DB, email);
  const items = rows.map((row) => {
    const slug = String(row.provider_key || '').toLowerCase();
    const leg = legacy.get(slug) || legacy.get(String(row.catalog_slug || '').toLowerCase());
    const catalog =
      row.catalog_row_id || row.catalog_slug
        ? {
            id: row.catalog_row_id,
            name: row.catalog_name || row.display_name,
            slug: row.catalog_slug || row.provider_key,
            category: row.catalog_category || row.category,
            auth_type: row.catalog_auth_type || row.auth_type,
            oauth_authorize_url: row.oauth_authorize_url,
            oauth_scopes_default: parseJson(row.oauth_scopes_default, []),
            oauth_scopes_available: parseJson(row.oauth_scopes_available, []),
            api_key_label: row.api_key_label,
            api_key_placeholder: row.api_key_placeholder,
            docs_url: row.docs_url,
            icon_slug: row.icon_slug,
            description: row.catalog_description,
            sort_order: row.catalog_sort_order,
            is_active: row.catalog_is_active,
          }
        : null;

    const connection = {
      id: row.id,
      tenant_id: row.tenant_id,
      provider_key: row.provider_key,
      display_name: row.display_name,
      category: row.category,
      auth_type: row.auth_type,
      status: row.status,
      scopes_json: parseJson(row.scopes_json, []),
      config_json: parseJson(row.config_json, {}),
      account_display: row.account_display,
      secret_binding_name: row.secret_binding_name,
      last_sync_at: row.last_sync_at,
      last_health_check_at: row.last_health_check_at,
      last_health_latency_ms: row.last_health_latency_ms,
      last_health_status: row.last_health_status,
      is_enabled: row.is_enabled,
      sort_order: row.sort_order,
      updated_at: row.updated_at,
    };

    return {
      catalog,
      connection,
      legacy: leg
        ? { is_connected: leg.is_connected, last_used: leg.last_used }
        : null,
      iam_hosted:
        String(row.catalog_category || '').toLowerCase() === 'iam_hosted' ||
        ['agentsam', 'autodidact'].includes(slug),
    };
  });

  return jsonResponse({
    tenant_id: tenantId,
    items,
    connected_slugs: items.map((i) => String(i.connection?.provider_key || '').toLowerCase()).filter(Boolean),
  });
}

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pingCustomEndpoint(endpointUrl, bearerToken) {
  const base = endpointUrl.replace(/\/$/, '');
  const candidates = [`${base}/health`, `${base}/`, base];
  const headers = { Accept: 'application/json, text/plain, */*' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  let lastErr = 'Unreachable';
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { method: 'GET', headers, signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (res.ok || res.status === 401 || res.status === 405) {
        return { ok: true, status: res.status, url };
      }
      lastErr = `${res.status} ${res.statusText}`;
    } catch (e) {
      lastErr = e?.message || String(e);
    }
  }
  return { ok: false, error: lastErr };
}

async function saveCustomMcp(env, authUser, request) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const body = await request.json().catch(() => ({}));
  const display_name = String(body.display_name || '').trim();
  let endpoint_url = String(body.endpoint_url || '').trim();
  const auth_type = String(body.auth_type || 'none').toLowerCase();
  const bearer_token = String(body.bearer_token || '').trim();

  if (!display_name) return jsonResponse({ error: 'display_name required' }, 400);
  if (!endpoint_url.startsWith('https://')) {
    return jsonResponse({ error: 'endpoint_url must start with https://' }, 400);
  }
  if (auth_type === 'bearer' && !bearer_token) {
    return jsonResponse({ error: 'bearer_token required for bearer auth' }, 400);
  }

  const ping = await pingCustomEndpoint(endpoint_url, auth_type === 'bearer' ? bearer_token : '');
  if (!ping.ok) {
    return jsonResponse({ error: `Endpoint did not respond: ${ping.error}` }, 400);
  }

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser.email || authUser.id || '').trim();
  const slug = `custom_mcp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const mcpId = `mcp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    await env.DB.prepare(
      `INSERT INTO mcp_services (id, service_name, endpoint_url, service_type, is_active, health_status)
       VALUES (?, ?, ?, 'custom_mcp', 1, 'unverified')`,
    )
      .bind(mcpId, display_name, endpoint_url)
      .run();
  } catch (e) {
    console.warn('[settings-integrations] mcp_services insert', e?.message || e);
    return jsonResponse({ error: 'Could not save MCP service' }, 500);
  }

  if (auth_type === 'bearer' && bearer_token) {
    const preview = bearer_token.length <= 4 ? '****' : `••••${bearer_token.slice(-4)}`;
    const hash = await sha256Hex(bearer_token);
    const uakId = `uak_${crypto.randomUUID()}`;
    try {
      await env.DB.prepare(
        `INSERT INTO user_api_keys (id, tenant_id, user_id, provider, key_name, key_preview, key_hash, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(uakId, tenantId, userId, slug, 'bearer', preview, hash)
        .run();
    } catch (e) {
      console.warn('[settings-integrations] user_api_keys insert', e?.message || e);
    }
  }

  const rid = `int_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO integration_registry
        (id, tenant_id, provider_key, display_name, category, auth_type, status, scopes_json, config_json, account_display, sort_order)
       VALUES (?, ?, ?, ?, 'other', ?, 'connected', '[]', ?, ?, 200)`,
    )
      .bind(
        rid,
        tenantId,
        slug,
        display_name,
        auth_type === 'oauth' ? 'oauth2' : auth_type === 'bearer' ? 'api_key' : 'none',
        JSON.stringify({ mcp_service_id: mcpId, endpoint_url, auth_type }),
        display_name,
      )
      .run();
  } catch (e) {
    console.warn('[settings-integrations] integration_registry insert', e?.message || e);
    return jsonResponse({ error: 'Could not save integration registry row' }, 500);
  }

  return jsonResponse({
    ok: true,
    provider_key: slug,
    mcp_service_id: mcpId,
  });
}

async function listCustomMcp(env, authUser) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, provider_key, display_name, status, config_json, account_display, updated_at
       FROM integration_registry
       WHERE tenant_id = ?
         AND provider_key LIKE 'custom_mcp_%'
       ORDER BY updated_at DESC`,
    )
      .bind(tenantId)
      .all();
    return jsonResponse({ items: results || [] });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e), items: [] }, 500);
  }
}

/**
 * @returns {Promise<Response|null>}
 */
export async function handleSettingsIntegrationsApi(request, env, ctx, authUser, url, pathLower, method) {
  if (!pathLower.startsWith('/api/settings/integrations')) return null;

  if (pathLower === '/api/settings/integrations/connected' && method === 'GET') {
    return getConnectedIntegrations(env, authUser);
  }

  const testMatch = pathLower.match(/^\/api\/settings\/integrations\/([^/]+)\/test$/);
  if (testMatch && method === 'POST') {
    const slug = decodeURIComponent(testMatch[1] || '').trim();
    if (!slug) return jsonResponse({ error: 'slug required' }, 400);
    const innerUrl = new URL(request.url);
    innerUrl.pathname = `/api/integrations/${encodeURIComponent(slug)}/test`;
    const inner = new Request(innerUrl.toString(), {
      method: 'POST',
      headers: request.headers,
    });
    return handleIntegrationsRequest(inner, env, ctx, authUser);
  }

  if (pathLower === '/api/settings/integrations/custom-mcp' && method === 'POST') {
    return saveCustomMcp(env, authUser, request);
  }

  if (pathLower === '/api/settings/integrations/custom' && method === 'GET') {
    return listCustomMcp(env, authUser);
  }

  return null;
}
