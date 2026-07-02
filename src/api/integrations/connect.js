/**
 * Integration connect / disconnect routes under /api/integrations/:slug/*
 */
import { jsonResponse, fallbackSystemTenantId } from '../../core/auth.js';
import {
  upsertIntegrationByokKey,
  revokeIntegrationByokKey,
  normalizeIntegrationSlug,
} from '../../core/integration-byok-sync.js';
import { resolveIntegrationUserId } from '../../core/integration-user-id.js';
import { upsertOauthToken } from '../oauth.js';
import { validateProviderKey, normalizeApiKeySecret } from '../../core/secret-validators.js';

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
const MCP_OAUTH_REDIRECT =
  'https://mcp.inneranimalmedia.com/api/oauth/authorize?client_id=iam_mcp_inneranimalmedia';

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

/** Legacy catalog aliases → real GitHub OAuth scope names. */
const GITHUB_OAUTH_SCOPE_ALIASES = {
  'user:read': 'read:user',
  'user:read:email': 'user:email',
  'repo:read': 'repo',
  user: 'read:user',
};

function normalizeGithubOAuthScope(scope) {
  const s = String(scope || '').trim();
  if (!s) return '';
  return GITHUB_OAUTH_SCOPE_ALIASES[s] || s;
}

function normalizeGithubOAuthScopes(scopes) {
  const out = [];
  const seen = new Set();
  for (const raw of scopes || []) {
    const s = normalizeGithubOAuthScope(raw);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function githubOAuthScopeSets(defaults, available, requested) {
  const canonicalAvailable = normalizeGithubOAuthScopes([
    ...(available || []),
    ...(defaults || []),
    ...(requested || []),
    'repo',
    'read:user',
    'user:email',
    'read:org',
    'workflow',
    'public_repo',
  ]);
  return {
    defaults: normalizeGithubOAuthScopes(defaults),
    available: canonicalAvailable,
    requested: normalizeGithubOAuthScopes(requested),
  };
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

/** Allowed tunnel bases: https + *.trycloudflare.com or *.inneranimalmedia.com */
function parseAndValidateTunnelUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'tunnel_url required' };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'invalid_tunnel_url' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'invalid_tunnel_url' };
  const host = u.hostname.toLowerCase();
  const okHost =
    host.endsWith('.trycloudflare.com') ||
    host.endsWith('.inneranimalmedia.com') ||
    host === 'inneranimalmedia.com';
  if (!okHost) return { ok: false, error: 'invalid_tunnel_url' };
  let base = u.origin;
  if (u.pathname && u.pathname !== '/') {
    base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  }
  return { ok: true, base, displayHost: host };
}

/** Bearer for IAM PTY /health (must match iam-pty; worker secret, never stored in config_json). */
function ptyBearerForTunnelHealth(env) {
  const a = typeof env.PTY_AUTH_TOKEN === 'string' ? env.PTY_AUTH_TOKEN.trim() : '';
  if (a) return a;
  const b = typeof env.TERMINAL_SECRET === 'string' ? env.TERMINAL_SECRET.trim() : '';
  return b || '';
}

/**
 * POST /api/integrations/local_tunnel/connect — body { tunnel_url }.
 * Persists integration_registry with config_json; status connected; auth_type none (DB CHECK has no 'manual').
 */
async function handleLocalTunnelConnect(env, authUser, body) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const tenantId = tenantIdFromAuth(authUser, env);
  if (!tenantId) return jsonResponse({ error: 'tenant_required' }, 400);

  const tunnelRaw = body?.tunnel_url ?? body?.tunnelUrl;
  const v = parseAndValidateTunnelUrl(tunnelRaw);
  if (!v.ok) return jsonResponse({ error: v.error || 'invalid_tunnel_url' }, 400);

  const ptyTok = ptyBearerForTunnelHealth(env);
  if (!ptyTok) {
    return jsonResponse({ error: 'pty_auth_not_configured' }, 503);
  }

  const healthUrl = `${v.base}/health`;
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${ptyTok}`,
      },
    });
  } catch (e) {
    const name = e?.name || '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      return jsonResponse({ error: 'tunnel_unreachable' }, 503);
    }
    return jsonResponse({ error: 'tunnel_unreachable' }, 503);
  }
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    return jsonResponse({ error: 'tunnel_unreachable' }, 503);
  }

  const now = Date.now();
  const configJson = JSON.stringify({
    tunnel_url: v.base,
    setup: 'manual_tunnel',
    config_schema: { tunnel_url: 'string' },
    last_verified_at: now,
  });
  const rowId = `int_lt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const preview = JSON.stringify({ tunnel_host: v.displayHost, ok: true }).slice(0, 500);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO integration_registry (
           id, tenant_id, provider_key, display_name, category, auth_type, status,
           config_json, account_display, sort_order, updated_at,
           last_health_check_at, last_health_status, last_health_latency_ms
         ) VALUES (?, ?, 'local_tunnel', 'Local Machine', 'deployment', 'none', 'connected',
           ?, ?, 35, datetime('now'), datetime('now'), 'ok', ?)
         ON CONFLICT(tenant_id, provider_key) DO UPDATE SET
           config_json = excluded.config_json,
           status = excluded.status,
           auth_type = excluded.auth_type,
           account_display = excluded.account_display,
           last_health_check_at = datetime('now'),
           last_health_status = 'ok',
           last_health_latency_ms = excluded.last_health_latency_ms,
           updated_at = datetime('now')`,
      ).bind(rowId, tenantId, configJson, v.displayHost, latencyMs),
      env.DB.prepare(
        `INSERT INTO integration_health_checks (tenant_id, provider_key, status, latency_ms, error_message, checked_by, response_preview)
         VALUES (?, ?, 'ok', ?, NULL, 'local_tunnel_connect', ?)`,
      ).bind(tenantId, 'local_tunnel', latencyMs, preview),
    ]);
  } catch (e) {
    console.warn('[integrations/connect] local_tunnel upsert', e?.message || e);
    return jsonResponse({ error: 'registry_write_failed' }, 500);
  }

  return jsonResponse({
    ok: true,
    provider_key: 'local_tunnel',
    tunnel_url: v.base,
    status: 'connected',
    last_verified_at: now,
  });
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
    providers.add('supabase_management');
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

async function handleGithubPatConnect(env, authUser, body) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const pat = normalizeApiKeySecret(body.api_key || body.token || '');
  if (!pat) {
    return jsonResponse({ error: 'api_key required (GitHub personal access token or fine-grained token)' }, 400);
  }

  const validation = await validateProviderKey('github', pat, env);
  if (!validation.ok) {
    const detail =
      validation.checks?.find((c) => c.status === 'fail')?.detail ||
      'Invalid GitHub token';
    return jsonResponse({ error: detail }, 400);
  }

  const userId = await resolveIntegrationUserId(env, authUser);
  if (!userId) return jsonResponse({ error: 'User id required' }, 400);
  const tenantId = tenantIdFromAuth(authUser, env);

  let login = 'github';
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'InnerAnimalMedia-GitHubConnect/1.0',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.login) login = String(data.login).trim();
  } catch {
    /* validation already passed */
  }

  await upsertOauthToken(
    env,
    {
      user_id: userId,
      tenant_id: tenantId,
      provider: 'github',
      access_token: pat,
      refresh_token: null,
      scope: typeof body.scope === 'string' && body.scope.trim() ? body.scope.trim() : 'repo',
      expires_at: null,
      account_identifier: login,
      account_email: authUser?.email ? String(authUser.email) : null,
      account_display: login,
      workspace_id:
        authUser?.active_workspace_id ||
        authUser?.default_workspace_id ||
        null,
      metadata_json: JSON.stringify({ auth_method: 'pat' }),
    },
    { skipRegistry: false },
  );

  try {
    await env.DB.prepare(
      `UPDATE integration_registry
       SET status = 'connected', account_display = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND LOWER(provider_key) = 'github'`,
    )
      .bind(login, tenantId)
      .run();
  } catch (e) {
    console.warn('[integrations/connect] github pat registry update', e?.message || e);
  }

  return jsonResponse({
    success: true,
    provider: 'github',
    account_display: login,
    auth_method: 'pat',
  });
}

/**
 * @returns {Promise<Response|null>}
 */
export async function handleIntegrationsConnectRoutes(request, env, ctx, authUser, url, pathLower, method) {
  const origin = url.origin;
  const returnToRaw = url.searchParams.get('return_to') || '';
  const safeReturn =
    returnToRaw.startsWith('/dashboard/') && !returnToRaw.startsWith('//') && !returnToRaw.includes(':')
      ? returnToRaw
      : '/dashboard/settings/integrations';
  const returnTo = encodeURIComponent(safeReturn);

  const connectMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/connect$/);
  if (connectMatch) {
    const slugRaw = decodeURIComponent(connectMatch[1] || '');
    const slug = normalizeSlug(slugRaw);
    const slugNorm = slug.replace(/-/g, '_');

    const cat = await loadCatalogRow(env, slugRaw);
    if (cat) {
      const catSlug = String(cat.category || '').toLowerCase();
      if (catSlug === 'iam_hosted' || ['agentsam', 'autodidact'].includes(slug)) {
        return jsonResponse({ error: 'This integration is hosted for you and cannot be connected manually.' }, 400);
      }
    }

    if (method === 'GET') {
      if (slugNorm === 'gmail') {
        const rt = encodeURIComponent(safeReturn);
        return Response.redirect(`${origin}/api/mail/gmail/start?return_to=${rt}`, 302);
      }
      if (
        slugNorm === 'custom_mcp' ||
        slugNorm === 'mcp' ||
        slugNorm === 'inneranimalmedia_mcp' ||
        slug === 'inneranimalmedia-mcp'
      ) {
        return Response.redirect(`${MCP_OAUTH_REDIRECT}&return_to=${returnTo}`, 302);
      }
      if (slugNorm === 'local_tunnel') {
        return jsonResponse(
          {
            manual_setup: true,
            type: 'manual_setup',
            message: 'POST JSON { tunnel_url } to this URL.',
            config_schema: { tunnel_url: 'string' },
            tunnel_rules: ['https://*.trycloudflare.com', 'https://*.inneranimalmedia.com', 'https://inneranimalmedia.com'],
          },
          200,
        );
      }
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
        let available = parseJsonArr(cat.oauth_scopes_available);
        let defaults = parseJsonArr(cat.oauth_scopes_default);
        let requested = collectScopesFromUrl(url);
        if (slugNorm === 'google_drive') {
          const manageScope = 'https://www.googleapis.com/auth/drive';
          if (!available.includes(manageScope)) available = [...available, manageScope];
        }
        if (slugNorm === 'github') {
          const gh = githubOAuthScopeSets(defaults, available, requested);
          defaults = gh.defaults;
          available = gh.available;
          requested = gh.requested;
        }
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
      if (slugNorm === 'local_tunnel') {
        return handleLocalTunnelConnect(env, authUser, body);
      }
      if (slugNorm === 'github') {
        return handleGithubPatConnect(env, authUser, body);
      }
      if (!body.api_key || typeof body.api_key !== 'string') {
        return jsonResponse({ error: 'api_key required' }, 400);
      }
      const prov = apiKeyOAuthPathForSlug(slugRaw);
      if (!prov) {
        return jsonResponse({ error: 'API key connect is not supported for this integration.' }, 400);
      }
      try {
        const result = await upsertIntegrationByokKey(env, authUser, slugRaw, body.api_key, {
          validate: true,
          triggeredBy: 'integrations_connect',
          source: 'integrations',
        });
        try {
          const { syncProviderModels } = await import('../integrations/model-sync.js');
          ctx?.waitUntil?.(
            syncProviderModels(env, prov, body.api_key, {
              tenantId: tenantIdFromAuth(authUser, env),
              createdBy: authUser.id || authUser.email || 'integrations_connect',
            }),
          );
        } catch {
          /* non-fatal */
        }
        return jsonResponse({
          success: true,
          provider: prov,
          account_display: result.account_display,
          api_key_id: result.api_key_id,
        });
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('Invalid') || msg.includes('validation')) {
          return jsonResponse({ success: false, provider: prov, error: msg }, 400);
        }
        return jsonResponse({ error: msg }, 500);
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const disconnectMatch = pathLower.match(/^\/api\/integrations\/([^/]+)\/disconnect$/);
  if (disconnectMatch && (method === 'DELETE' || method === 'POST')) {
    if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const slugRaw = decodeURIComponent(disconnectMatch[1] || '');
    const userId = await resolveIntegrationUserId(env, authUser);
    if (!userId) return jsonResponse({ error: 'User id required' }, 400);
    const tenantId = tenantIdFromAuth(authUser, env);

    await deleteOauthTokensForSlug(env.DB, userId, slugRaw);
    await revokeIntegrationByokKey(env, authUser, slugRaw);

    const slugNormDisconnect = normalizeIntegrationSlug(slugRaw);
    const registrySql =
      slugNormDisconnect === 'local_tunnel'
        ? `UPDATE integration_registry SET status = 'disconnected', config_json = '{}', account_display = NULL, updated_at = datetime('now')
           WHERE tenant_id = ? AND LOWER(provider_key) = LOWER(?)`
        : `UPDATE integration_registry SET status = 'disconnected', account_display = NULL, updated_at = datetime('now')
           WHERE tenant_id = ? AND LOWER(provider_key) = LOWER(?)`;
    try {
      await env.DB.prepare(registrySql).bind(tenantId, slugRaw).run();
    } catch (e) {
      console.warn('[integrations/connect] registry update', e?.message || e);
    }

    await touchUserIntegrationsDisconnected(env.DB, String(authUser.email || '').trim(), slugRaw);

    return jsonResponse({ disconnected: true, provider_key: slugRaw });
  }

  return null;
}
