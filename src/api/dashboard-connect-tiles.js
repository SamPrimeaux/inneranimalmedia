/**
 * Unified connect tiles for /dashboard/home and /dashboard/settings/workspace.
 * Reads integration_registry + integration_catalog; derives live OAuth status from tokens.
 */
import { jsonResponse, fetchAuthUserTenantId, fallbackSystemTenantId } from '../core/auth.js';
import { resolveIntegrationUserId } from '../core/integration-user-id.js';
import { catalogSlugForRegistry } from '../core/integration-slug-aliases.js';

async function resolveTenantIdOrFetch(env, authUser) {
  if (authUser?.tenant_id && String(authUser.tenant_id).trim()) {
    return String(authUser.tenant_id).trim();
  }
  if (authUser?.id && env?.DB) {
    const tid = await fetchAuthUserTenantId(env, authUser.id);
    if (tid) return tid;
  }
  if (env?.TENANT_ID) return String(env.TENANT_ID).trim();
  return fallbackSystemTenantId(env);
}

function connectSlugForProvider(providerKey) {
  const pk = String(providerKey || '').toLowerCase();
  if (pk === 'cloudflare_oauth') return 'cloudflare';
  if (pk === 'supabase_oauth') return 'supabase';
  return pk;
}

function connectPathForSlug(slug) {
  const s = String(slug || '').toLowerCase();
  if (s === 'cloudflare') return '/api/integrations/cloudflare/connect';
  if (s === 'github') return '/api/integrations/github/connect';
  if (s === 'google_drive') return '/api/integrations/google_drive/connect';
  if (s === 'supabase') return '/api/integrations/supabase/connect';
  return `/api/integrations/${encodeURIComponent(s)}/connect`;
}

async function loadRegistryRows(db, tenantId, surface) {
  const flagCol = surface === 'workspace' ? 'show_on_workspace' : 'show_on_home';
  const sqlWithFlags = `
    SELECT r.*,
           c.name AS catalog_name,
           c.slug AS catalog_slug,
           c.category AS catalog_category,
           c.icon_slug,
           c.auth_type AS catalog_auth_type,
           c.sort_order AS catalog_sort_order
    FROM integration_registry r
    LEFT JOIN integration_catalog c ON c.slug = CASE r.provider_key
      WHEN 'cloudflare_oauth' THEN 'cloudflare'
      WHEN 'supabase_oauth' THEN 'supabase'
      ELSE r.provider_key
    END
    WHERE r.tenant_id = ?
      AND COALESCE(r.is_enabled, 1) = 1
      AND COALESCE(r.${flagCol}, 0) = 1
    ORDER BY COALESCE(r.sort_order, c.sort_order, 50) ASC, r.display_name ASC`;

  const sqlFallback = `
    SELECT r.*,
           c.name AS catalog_name,
           c.slug AS catalog_slug,
           c.category AS catalog_category,
           c.icon_slug,
           c.auth_type AS catalog_auth_type,
           c.sort_order AS catalog_sort_order
    FROM integration_registry r
    LEFT JOIN integration_catalog c ON c.slug = CASE r.provider_key
      WHEN 'cloudflare_oauth' THEN 'cloudflare'
      WHEN 'supabase_oauth' THEN 'supabase'
      ELSE r.provider_key
    END
    WHERE r.tenant_id = ?
      AND COALESCE(r.is_enabled, 1) = 1
      AND lower(r.provider_key) IN (
        'github', 'cloudflare_oauth', 'google_drive', 'supabase_oauth',
        'openai', 'anthropic', 'resend', 'cloudflare_r2', 'local_tunnel', 'google_ai'
      )
    ORDER BY COALESCE(r.sort_order, c.sort_order, 50) ASC, r.display_name ASC`;

  try {
    const { results } = await db.prepare(sqlWithFlags).bind(tenantId).all();
    return results || [];
  } catch {
    const { results } = await db.prepare(sqlFallback).bind(tenantId).all();
    let rows = results || [];
    if (surface === 'home') {
      rows = rows.filter((r) =>
        ['github', 'cloudflare_oauth', 'google_drive', 'supabase_oauth'].includes(
          String(r.provider_key || '').toLowerCase(),
        ),
      );
    }
    return rows;
  }
}

async function tokenProviders(db, userId, tenantId) {
  const tok = new Set();
  const byok = new Set();
  if (!userId || !db) return { tok, byok };
  try {
    const tr = await db
      .prepare(`SELECT DISTINCT lower(provider) AS p FROM user_oauth_tokens WHERE user_id = ?`)
      .bind(userId)
      .all();
    for (const r of tr.results || []) {
      if (r?.p) tok.add(String(r.p).toLowerCase());
    }
  } catch {
    /* */
  }
  try {
    const kr = await db
      .prepare(
        `SELECT DISTINCT lower(provider) AS p FROM user_api_keys
         WHERE tenant_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1`,
      )
      .bind(tenantId, userId)
      .all();
    for (const r of kr.results || []) {
      if (r?.p) {
        byok.add(String(r.p).toLowerCase());
        if (String(r.p).toLowerCase() === 'google') byok.add('google_ai');
      }
    }
  } catch {
    /* */
  }
  return { tok, byok };
}

function deriveConnected(providerKey, rowStatus, tok, byok, env) {
  const pk = String(providerKey || '').toLowerCase();
  let status = String(rowStatus || 'disconnected').toLowerCase();
  if (pk === 'supabase_oauth' && (tok.has('supabase_management') || tok.has('supabase'))) {
    status = 'connected';
  } else if (pk === 'github' && tok.has('github')) status = 'connected';
  else if (pk === 'google_drive' && tok.has('google_drive')) status = 'connected';
  else if (pk === 'cloudflare_oauth' && tok.has('cloudflare')) status = 'connected';
  else if (['anthropic', 'openai', 'resend', 'google_ai', 'cursor'].includes(pk)) {
    if (tok.has(pk) || byok.has(pk)) status = 'connected';
  } else if (pk === 'cloudflare_r2' && env?.R2) status = 'available';
  else if (pk === 'local_tunnel' && status === 'connected') status = 'connected';
  return status;
}

export function mapConnectTileRow(row, tok, byok, env) {
  const providerKey = String(row.provider_key || '');
  const slug = connectSlugForProvider(providerKey);
  const status = deriveConnected(providerKey, row.status, tok, byok, env);
  const connected = status === 'connected' || status === 'available';
  let issue = null;
  const regStatus = String(row.status || '').toLowerCase();
  if (regStatus === 'auth_expired') issue = 'error';
  else if (String(providerKey).toLowerCase() === 'local_tunnel' && regStatus === 'degraded') {
    issue = 'warning';
  }

  return {
    id: String(row.id || providerKey),
    provider_key: providerKey,
    connect_slug: slug,
    catalog_slug: row.catalog_slug || catalogSlugForRegistry(providerKey),
    title: String(row.display_name || row.catalog_name || providerKey),
    icon_slug: row.icon_slug || catalogSlugForRegistry(providerKey),
    category: row.catalog_category || row.category || 'other',
    auth_type: row.catalog_auth_type || row.auth_type || 'oauth2',
    status,
    connected,
    issue,
    account_display: row.account_display ? String(row.account_display) : null,
    sort_order: Number(row.sort_order ?? row.catalog_sort_order) || 50,
    connect_url: connectPathForSlug(slug),
    settings_path: '/dashboard/settings/integrations',
    show_on_home: Number(row.show_on_home) === 1,
    show_on_workspace: Number(row.show_on_workspace) === 1,
  };
}

export async function loadConnectTiles(env, authUser, surface = 'home') {
  if (!env?.DB) return [];
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  if (!tenantId) return [];
  const userId = await resolveIntegrationUserId(env, authUser);
  const { tok, byok } = await tokenProviders(env.DB, userId, tenantId);
  const rows = await loadRegistryRows(env.DB, tenantId, surface);
  return rows.map((row) => mapConnectTileRow(row, tok, byok, env));
}

export async function handleConnectTilesApi(request, env, authUser, method) {
  if (!env?.DB) return jsonResponse({ ok: false, error: 'db_unavailable' }, 503);
  const url = new URL(request.url);
  const surface = url.searchParams.get('surface') === 'workspace' ? 'workspace' : 'home';
  const tenantId = await resolveTenantIdOrFetch(env, authUser);

  if (method === 'GET') {
    const tiles = await loadConnectTiles(env, authUser, surface);
    return jsonResponse({
      ok: true,
      surface,
      tiles,
      connected_slugs: tiles.filter((t) => t.connected).map((t) => t.connect_slug),
      updated_at: new Date().toISOString(),
    });
  }

  if (method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.tiles) ? body.tiles : [];
    if (!items.length) return jsonResponse({ ok: false, error: 'tiles_required' }, 400);
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      const providerKey = String(it.provider_key || '').trim();
      if (!providerKey) continue;
      const sortOrder = Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : (i + 1) * 10;
      const showHome = it.show_on_home === false || it.show_on_home === 0 ? 0 : 1;
      const showWs = it.show_on_workspace === false || it.show_on_workspace === 0 ? 0 : 1;
      try {
        await env.DB.prepare(
          `UPDATE integration_registry
           SET sort_order = ?, show_on_home = ?, show_on_workspace = ?, updated_at = datetime('now')
           WHERE tenant_id = ? AND provider_key = ?`,
        )
          .bind(sortOrder, showHome, showWs, tenantId, providerKey)
          .run();
      } catch {
        await env.DB.prepare(
          `UPDATE integration_registry SET sort_order = ?, updated_at = datetime('now')
           WHERE tenant_id = ? AND provider_key = ?`,
        )
          .bind(sortOrder, tenantId, providerKey)
          .run();
      }
    }
    const tiles = await loadConnectTiles(env, authUser, surface);
    return jsonResponse({ ok: true, surface, tiles });
  }

  return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
}
