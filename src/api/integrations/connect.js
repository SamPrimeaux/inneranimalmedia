/**
 * Integration connect / disconnect routes under /api/integrations/:slug/*
 */
import { jsonResponse, fallbackSystemTenantId } from '../../core/auth.js';
import { handleOAuthApi } from '../oauth.js';

function tenantIdFromAuth(authUser, env) {
  return (
    (authUser?.tenant_id && String(authUser.tenant_id).trim()) ||
    (env?.TENANT_ID && String(env.TENANT_ID).trim()) ||
    fallbackSystemTenantId(env)
  );
}

function normalizeSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** Maps integration_catalog.slug (hyphen or underscore) to /api/oauth/:provider/start */
function oauthStartPathForSlug(slugRaw) {
  const s = normalizeSlug(slugRaw).replace(/-/g, '_');
  if (s === 'github') return 'github';
  if (
    ['google_drive', 'google_gmail', 'google_calendar', 'gmail', 'google_ai'].includes(s)
  ) {
    return 'google';
  }
  if (s === 'cloudflare' || s === 'cloudflare_oauth') return 'cloudflare';
  if (s === 'supabase_oauth' || s === 'supabase') return 'supabase';
  return null;
}

function apiKeyOAuthPathForSlug(slug) {
  const s = normalizeSlug(slug).replace(/-/g, '_');
  const map = {
    anthropic: 'anthropic',
    openai: 'openai',
    google_ai: 'google_ai',
    resend: 'resend',
    cursor: 'cursor',
    supabase: 'supabase',
  };
  return map[s] || null;
}

function parseJsonArr(raw) {
  if (raw == null || raw === '') return [];
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j.map(String) : [];
  } catch {
    return [];
  }
}

/** Query: scope, scopes, scopes[], scopes[0], ... */
function collectScopesFromUrl(url) {
  const out = new Set();
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'scope' || k === 'scopes' || k.startsWith('scopes[')) {
      for (const part of String(v).split(/[\s,]+/)) {
        const t = part.trim();
        if (t) out.add(t);
      }
    }
  }
  return [...out];
}

function validateScopesAgainstCatalog(requested, defaultScopes, available) {
  const chosen = requested.length ? requested : defaultScopes;
  if (!available.length) return { ok: true, scopes: chosen };
  for (const s of chosen) {
    if (!available.includes(s)) return { ok: false, error: `Scope not allowed: ${s}` };
  }
  return { ok: true, scopes: chosen };
}

async function loadCatalogRow(env, slug) {
  if (!env?.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT * FROM integration_catalog WHERE LOWER(slug) = LOWER(?) LIMIT 1`,
    )
      .bind(slug)
      .first();
  } catch {
    return null;
  }
}

async function deleteOauthTokensForSlug(DB, userId, slug) {
  const s = normalizeSlug(String(slug || '')).replace(/-/g, '_');
  const providers = new Set();
  if (['google_drive', 'google_gmail', 'google_calendar', 'gmail', 'google_ai'].includes(s)) {
    providers.add('google_drive');
  } else if (s === 'github') {
    providers.add('github');
  } else if (s === 'cloudflare' || s === 'cloudflare_oauth') {
    providers.add('cloudflare');
  } else if (s === 'supabase_oauth' || s === 'supabase') {
    providers.add('supabase');
  } else {
    providers.add(s);
  }
  for (const p of providers) {
    try {
      await DB.prepare(`DELETE FROM user_oauth_tokens WHERE user_id = ? AND LOWER(provider) = LOWER(?)`)
        .bind(userId, p)
        .run();
    } catch (e) {
      console.warn('[integrations/connect] oauth delete', p, e?.message || e);
    }
  }
}

async function touchUserIntegrationsDisconnected(DB, userEmail, slug) {
  if (!userEmail) return;
  const attempts = [
    `UPDATE user_integrations SET is_connected = 0, updated_at = datetime('now') WHERE LOWER(COALESCE(user_email, email)) = LOWER(?) AND LOWER(provider_key) = LOWER(?)`,
    `UPDATE user_integrations SET is_connected = 0 WHERE LOWER(COALESCE(user_email, email)) = LOWER(?) AND LOWER(provider) = LOWER(?)`,
  ];
  for (const sql of attempts) {
    try {
      await DB.prepare(sql).bind(userEmail, slug).run();
      return;
    } catch {
      /* try next */
    }
  }
}

/**
 * @returns {Promise<Response|null>}
 */
export async function handleIntegrationsConnectRoutes(request, env, ctx, authUser, url, pathLower, method) {
  const origin = url.origin;
  const returnTo = encodeURIComponent('/dashboard/settings?section=Integrations');

  const connectMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/connect$/);
  if (connectMatch) {
    const slugRaw = decodeURIComponent(connectMatch[1] || '');
    const slug = normalizeSlug(slugRaw);

    const cat = await loadCatalogRow(env, slugRaw);
    if (cat) {
      const catSlug = String(cat.category || '').toLowerCase();
      if (catSlug === 'iam_hosted' || ['agentsam', 'autodidact'].includes(slug)) {
        return jsonResponse({ error: 'This integration is hosted for you and cannot be connected manually.' }, 400);
      }
    }

    if (method === 'GET') {
      const start = oauthStartPathForSlug(slugRaw);
      if (!start) {
        return jsonResponse(
          { error: 'OAuth start is not defined for this integration. Use API key flow or catalog wiring.' },
          400,
        );
      }

      let extra = '';
      const authType = String(cat?.auth_type || '').toLowerCase();
      if (cat && (authType === 'oauth' || authType === 'oauth_or_key')) {
        const available = parseJsonArr(cat.oauth_scopes_available);
        const defaults = parseJsonArr(cat.oauth_scopes_default);
        const requested = collectScopesFromUrl(url);
        const v = validateScopesAgainstCatalog(requested, defaults, available);
        if (!v.ok) return jsonResponse({ error: v.error || 'Invalid scopes' }, 400);
        if (v.scopes?.length) {
          extra = `&oauth_scopes=${encodeURIComponent(v.scopes.join(' '))}`;
        }
      }

      return Response.redirect(`${origin}/api/oauth/${start}/start?return_to=${returnTo}${extra}`, 302);
    }

    if (method === 'POST') {
      const bodyText = await request.text();
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
      if (!body.api_key || typeof body.api_key !== 'string') {
        return jsonResponse({ error: 'api_key required' }, 400);
      }
      const prov = apiKeyOAuthPathForSlug(slugRaw);
      if (!prov) {
        return jsonResponse({ error: 'API key connect is not supported for this integration.' }, 400);
      }
      const inner = new Request(`${origin}/api/oauth/apikey/${encodeURIComponent(prov)}`, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ api_key: body.api_key }),
      });
      return handleOAuthApi(inner, env, ctx);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const disconnectMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/disconnect$/);
  if (disconnectMatch && method === 'DELETE') {
    if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const slugRaw = decodeURIComponent(disconnectMatch[1] || '');
    const userId = authUser.email || authUser.id;
    const tenantId = tenantIdFromAuth(authUser, env);

    await deleteOauthTokensForSlug(env.DB, userId, slugRaw);

    try {
      await env.DB.prepare(
        `DELETE FROM user_api_keys WHERE tenant_id = ? AND user_id = ? AND LOWER(provider) = LOWER(?)`,
      )
        .bind(tenantId, userId, slugRaw)
        .run();
    } catch (e) {
      console.warn('[integrations/connect] user_api_keys delete', e?.message || e);
    }

    try {
      await env.DB.prepare(
        `UPDATE integration_registry SET status = 'disconnected', account_display = NULL, updated_at = datetime('now')
         WHERE tenant_id = ? AND LOWER(provider_key) = LOWER(?)`,
      )
        .bind(tenantId, slugRaw)
        .run();
    } catch (e) {
      console.warn('[integrations/connect] registry update', e?.message || e);
    }

    await touchUserIntegrationsDisconnected(env.DB, String(authUser.email || '').trim(), slugRaw);

    return jsonResponse({ disconnected: true, provider_key: slugRaw });
  }

  return null;
}
