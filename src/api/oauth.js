/**
 * OAuth + API Key connection endpoints
 *
 * Pattern:
 *  - GET  /api/oauth/:provider/start    (auth required) -> { redirect_url }
 *  - GET  /api/oauth/:provider/callback (provider redirect) -> 302 back to return_to (default: Settings > Integrations)
 *  - POST /api/oauth/apikey/:provider   (auth required) -> validate + store encrypted
 *
 * Notes:
 *  - Uses SESSION_CACHE KV for state storage (10m TTL).
 *  - Persists tokens in D1 `user_oauth_tokens` with forward-compatible encrypted columns.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';
import { getAESKey, aesGcmEncryptToB64, aesGcmDecryptFromB64 } from '../core/crypto-vault.js';
import { syncProviderModels } from './integrations/model-sync.js';

const OAUTH_STATE_TTL_SECONDS = 600;

const PROVIDERS = new Set(['github', 'google', 'cloudflare', 'supabase']);
const APIKEY_PROVIDERS = new Set(['openai', 'anthropic', 'google_ai', 'resend', 'cursor']);

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function oauthStateKey(state) {
  return `oauth_state_${state}`;
}

const DEFAULT_OAUTH_RETURN = '/dashboard/settings?section=Integrations';

function safeReturnTo(url) {
  const raw = String(url || '').trim();
  if (!raw) return DEFAULT_OAUTH_RETURN;
  if (raw.startsWith('/dashboard/')) return raw;
  return DEFAULT_OAUTH_RETURN;
}

async function kvPutState(env, state, payload) {
  if (!env?.SESSION_CACHE?.put) return false;
  await env.SESSION_CACHE.put(oauthStateKey(state), JSON.stringify(payload), { expirationTtl: OAUTH_STATE_TTL_SECONDS });
  return true;
}

async function kvGetState(env, state) {
  if (!env?.SESSION_CACHE?.get) return null;
  const raw = await env.SESSION_CACHE.get(oauthStateKey(state));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvDeleteState(env, state) {
  if (!env?.SESSION_CACHE?.delete) return;
  await env.SESSION_CACHE.delete(oauthStateKey(state));
}

async function encryptWithVault(env, plaintext) {
  const key = await getAESKey(env, ['encrypt']);
  return aesGcmEncryptToB64(plaintext, key);
}

async function decryptWithVault(env, encryptedB64) {
  const key = await getAESKey(env, ['decrypt']);
  return aesGcmDecryptFromB64(encryptedB64, key);
}

async function pragmaColumns(DB, tableName) {
  const out = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

export async function ensureOauthTokenColumns(DB) {
  const cols = await pragmaColumns(DB, 'user_oauth_tokens');
  const alters = [];
  const want = [
    ['access_token_encrypted', 'TEXT'],
    ['refresh_token_encrypted', 'TEXT'],
    ['scopes', 'TEXT'],
    ['account_email', 'TEXT'],
    ['account_display', 'TEXT'],
    ['workspace_id', 'TEXT'],
    ['metadata_json', 'TEXT'],
    ['created_at', 'INTEGER'],
    ['updated_at', 'INTEGER'],
  ];
  for (const [name, type] of want) {
    if (!cols.has(name)) alters.push(`ALTER TABLE user_oauth_tokens ADD COLUMN ${name} ${type}`);
  }
  for (const sql of alters) {
    try { await DB.prepare(sql).run(); } catch { /* ignore older D1 schema edge-cases */ }
  }
  return await pragmaColumns(DB, 'user_oauth_tokens');
}

function normalizeProvider(provider) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'gdrive' || p === 'google_drive' || p === 'google_gmail' || p === 'google_calendar') return 'google';
  return p;
}

function mapTokenProviderForStorage(provider) {
  // Existing codebase uses provider keys like github, google_drive in health checks.
  if (provider === 'google') return 'google_drive';
  return provider;
}

function integrationUserId(authUser) {
  return authUser?.id;
}

/** Workspace-scoped Supabase OAuth row key (multi-workspace per user). */
export function supabaseOAuthAccountIdentifier(workspaceId) {
  const w = String(workspaceId || '').trim();
  return w ? `workspace:${w}` : 'Supabase';
}

async function fetchSupabaseManagementProjects(accessToken) {
  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    ref: p.ref,
    region: p.region,
  }));
}

async function upsertOauthToken(env, { user_id, tenant_id, person_uuid, provider, access_token, refresh_token, scope, expires_at, account_identifier, account_email, account_display, workspace_id, metadata_json }) {
  if (!env?.DB) throw new Error('DB not configured');
  if (!env.VAULT_MASTER_KEY) throw new Error('VAULT_MASTER_KEY not configured');

  const cols = await ensureOauthTokenColumns(env.DB); // PRAGMA requirement before write
  const createdAt = nowSeconds();
  const updatedAt = createdAt;

  const providerForDb = mapTokenProviderForStorage(provider);
  const encryptedAccess = access_token ? await encryptWithVault(env, access_token) : null;
  const encryptedRefresh = refresh_token ? await encryptWithVault(env, refresh_token) : null;

  const hasEncrypted = cols.has('access_token_encrypted');
  const hasPlain = cols.has('access_token');

  // Prefer encrypted columns, but keep plaintext columns if they already exist and were historically used.
  const accessPlain = hasPlain && access_token ? access_token : null;
  const refreshPlain = cols.has('refresh_token') && refresh_token ? refresh_token : null;

  const scopesVal = scope || null;
  const accountIdVal = account_identifier || account_email || '';
  
  if (!accountIdVal) {
    throw new Error(`account_identifier missing for provider ${provider}`);
  }

  const sql = `
    INSERT OR REPLACE INTO user_oauth_tokens
      (user_id, tenant_id, person_uuid, provider, account_identifier,
       ${hasPlain ? 'access_token,' : ''} ${cols.has('refresh_token') ? 'refresh_token,' : ''}
       ${hasEncrypted ? 'access_token_encrypted, refresh_token_encrypted,' : ''}
       ${cols.has('scope') ? 'scope,' : ''} ${cols.has('scopes') ? 'scopes,' : ''}
       expires_at,
       ${cols.has('workspace_id') ? 'workspace_id,' : ''}
       ${cols.has('metadata_json') ? 'metadata_json,' : ''}
       ${cols.has('account_email') ? 'account_email,' : ''} ${cols.has('account_display') ? 'account_display,' : ''}
       ${cols.has('created_at') ? 'created_at,' : ''} ${cols.has('updated_at') ? 'updated_at,' : ''}
       created_at
      )
    VALUES (
      ?, ?, ?, ?, ?,
      ${hasPlain ? '?,' : ''} ${cols.has('refresh_token') ? '?,' : ''}
      ${hasEncrypted ? '?, ?,': ''}
      ${cols.has('scope') ? '?,' : ''} ${cols.has('scopes') ? '?,' : ''}
      ?,
      ${cols.has('workspace_id') ? '?,' : ''}
      ${cols.has('metadata_json') ? '?,' : ''}
      ${cols.has('account_email') ? '?,' : ''} ${cols.has('account_display') ? '?,' : ''}
      ${cols.has('created_at') ? '?,' : ''} ${cols.has('updated_at') ? '?,' : ''}
      ?
    )
  `.replace(/\s+/g, ' ').trim();

  const binds = [
    String(user_id),
    String(tenant_id || ''),
    String(person_uuid || ''),
    providerForDb,
    String(accountIdVal || providerForDb),
  ];
  if (hasPlain) binds.push(accessPlain);
  if (cols.has('refresh_token')) binds.push(refreshPlain);
  if (hasEncrypted) { binds.push(encryptedAccess); binds.push(encryptedRefresh); }
  if (cols.has('scope')) binds.push(scopesVal);
  if (cols.has('scopes')) binds.push(scopesVal);
  binds.push(expires_at || null);
  if (cols.has('workspace_id')) binds.push(workspace_id ?? null);
  if (cols.has('metadata_json')) binds.push(metadata_json ?? null);
  if (cols.has('account_email')) binds.push(account_email || null);
  if (cols.has('account_display')) binds.push(account_display || null);
  if (cols.has('created_at')) binds.push(createdAt);
  if (cols.has('updated_at')) binds.push(updatedAt);
  binds.push(createdAt);

  await env.DB.prepare(sql).bind(...binds).run();

  // Also mark registry connected (best-effort).
  try {
    await env.DB.prepare(
      `UPDATE integration_registry
       SET status = 'connected', account_display = COALESCE(?, account_display), updated_at = datetime('now')
       WHERE tenant_id = ? AND provider_key = ?`,
    )
      .bind(account_display || account_email || account_identifier || null, String(tenant_id || ''), provider === 'cloudflare' ? 'cloudflare_oauth' : provider === 'supabase' ? 'supabase_oauth' : providerForDb)
      .run();
  } catch { /* ignore */ }

  try {
    await env.DB.prepare(
      `INSERT INTO integration_events (tenant_id, provider_key, event_type, actor, message, metadata_json)
       VALUES (?, ?, 'connected', ?, ?, ?)`,
    )
      .bind(
        String(tenant_id || ''),
        provider === 'cloudflare' ? 'cloudflare_oauth' : provider === 'supabase' ? 'supabase_oauth' : providerForDb,
        String(user_id),
        'OAuth connection established',
        JSON.stringify({ account_display: account_display || null }),
      )
      .run();
  } catch { /* ignore */ }
}

async function getOauthTokenRow(env, userId, providerForDb) {
  if (!env?.DB) return null;
  const cols = await ensureOauthTokenColumns(env.DB);
  const row = await env.DB.prepare(
    `SELECT provider, account_identifier,
            access_token, refresh_token, expires_at,
            access_token_encrypted, refresh_token_encrypted
     FROM user_oauth_tokens
     WHERE user_id = ? AND provider = ?
     ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(String(userId), String(providerForDb))
    .first();
  if (!row) return null;

  const access =
    row.access_token_encrypted && env.VAULT_MASTER_KEY
      ? await decryptWithVault(env, row.access_token_encrypted).catch(() => row.access_token || null)
      : row.access_token || null;
  const refresh =
    row.refresh_token_encrypted && env.VAULT_MASTER_KEY
      ? await decryptWithVault(env, row.refresh_token_encrypted).catch(() => row.refresh_token || null)
      : row.refresh_token || null;
  return { ...row, access_token: access, refresh_token: refresh, _columns: cols };
}

async function maybeRefreshGoogle(env, userId) {
  const row = await getOauthTokenRow(env, userId, 'google_drive');
  if (!row) return null;
  if (!row.expires_at || !Number.isFinite(Number(row.expires_at))) return row;
  if (Number(row.expires_at) > nowSeconds() + 30) return row;
  if (!row.refresh_token) return row;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return row;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return row;

  await upsertOauthToken(env, {
    user_id: userId,
    tenant_id: row.tenant_id || '',
    person_uuid: row.person_uuid || '',
    provider: 'google',
    access_token: data.access_token,
    refresh_token: row.refresh_token,
    scope: data.scope || null,
    expires_at: data.expires_in ? nowSeconds() + Number(data.expires_in) : row.expires_at,
    account_identifier: row.account_identifier || '',
    account_email: row.account_email || null,
    account_display: row.account_display || null,
  }).catch(() => {});

  return await getOauthTokenRow(env, userId, 'google_drive');
}

function githubAuthUrl(env, state, oauthScopeString) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', env.GITHUB_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', 'https://inneranimalmedia.com/api/oauth/github/callback');
  u.searchParams.set(
    'scope',
    (oauthScopeString && String(oauthScopeString).trim())
      ? String(oauthScopeString).trim()
      : 'repo read:user read:org workflow',
  );
  u.searchParams.set('state', state);
  return u.toString();
}

function googleAuthUrl(env, state, oauthScopeString) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', 'https://inneranimalmedia.com/api/oauth/google/callback');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set(
    'scope',
    (oauthScopeString && String(oauthScopeString).trim())
      ? String(oauthScopeString).trim()
      : [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
        ].join(' '),
  );
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

function cloudflareAuthUrl(env, state, oauthScopeString) {
  if (!env.CLOUDFLARE_OAUTH_CLIENT_ID) return null;
  const u = new URL('https://dash.cloudflare.com/oauth2/auth');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.CLOUDFLARE_OAUTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', 'https://inneranimalmedia.com/api/oauth/cloudflare/callback');
  u.searchParams.set(
    'scope',
    (oauthScopeString && String(oauthScopeString).trim())
      ? String(oauthScopeString).trim()
      : 'account:read zone:read workers:write d1:read r2:read',
  );
  u.searchParams.set('state', state);
  return u.toString();
}

// ── Supabase MANAGEMENT OAuth (/api/oauth/supabase/*) ────────────────────────
// Connects to Supabase Management API (api.supabase.com) — links org/projects.
// This is NOT the project OAuth Server login flow.
//
// Login OAuth ("Continue with Supabase"):
//   GET /api/auth/supabase/start     → dpmuvynqixblxsilnlut.supabase.co/auth/v1/oauth/authorize
//   GET /api/auth/supabase/callback  → establishIamSession → dashboard
//   GET /api/auth/oauth/consent      → consent HTML (DASHBOARD R2); WAF must allow this path
// ─────────────────────────────────────────────────────────────────────────────
function supabaseAuthUrl(env, state, oauthScopeString) {
  if (!env.SUPABASE_OAUTH_CLIENT_ID) return null;
  const u = new URL('https://api.supabase.com/v1/oauth/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.SUPABASE_OAUTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', 'https://inneranimalmedia.com/api/oauth/supabase/callback');
  u.searchParams.set(
    'scope',
    (oauthScopeString && String(oauthScopeString).trim())
      ? String(oauthScopeString).trim()
      : 'all',
  );
  u.searchParams.set('state', state);
  return u.toString();
}

async function exchangeGithub(env, code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: 'https://inneranimalmedia.com/api/oauth/github/callback',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'GitHub token exchange failed');
  return data;
}

async function githubAccount(accessToken) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'IAM-Platform', Accept: 'application/vnd.github+json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'GitHub user fetch failed');
  return { login: data.login || '', email: data.email || null };
}

async function exchangeGoogle(env, code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://inneranimalmedia.com/api/oauth/google/callback',
      grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || 'Google token exchange failed');
  return data;
}

async function googleUserinfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'Google userinfo fetch failed');
  return { email: data.email || null, name: data.name || null };
}

async function exchangeCloudflare(env, code) {
  if (!env.CLOUDFLARE_OAUTH_CLIENT_ID || !env.CLOUDFLARE_OAUTH_CLIENT_SECRET) {
    throw new Error('Cloudflare OAuth not configured');
  }
  const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.CLOUDFLARE_OAUTH_CLIENT_ID,
      client_secret: env.CLOUDFLARE_OAUTH_CLIENT_SECRET,
      redirect_uri: 'https://inneranimalmedia.com/api/oauth/cloudflare/callback',
      grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Cloudflare token exchange failed');
  return data;
}

async function exchangeSupabase(env, code) {
  if (!env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET) {
    throw new Error('Supabase OAuth not configured');
  }
  const res = await fetch('https://api.supabase.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SUPABASE_OAUTH_CLIENT_ID,
      client_secret: env.SUPABASE_OAUTH_CLIENT_SECRET,
      redirect_uri: 'https://inneranimalmedia.com/api/oauth/supabase/callback',
      grant_type: 'authorization_code',
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Supabase token exchange failed');
  return data;
}

async function validateApiKey(provider, apiKey) {
  const key = String(apiKey || '');
  if (!key) return { ok: false, error: 'api_key required' };
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check and retry' };
    return { ok: res.ok, error: res.ok ? null : `Validation failed (${res.status})` };
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check and retry' };
    // 200 OK or 400 Bad Request both indicate the key is accepted.
    if (res.status === 200 || res.status === 400) return { ok: true, error: null };
    return { ok: false, error: `Validation failed (${res.status})` };
  }
  if (provider === 'google_ai') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Invalid API key — check and retry' };
    return { ok: res.ok, error: res.ok ? null : `Validation failed (${res.status})` };
  }
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check and retry' };
    return { ok: res.ok, error: res.ok ? null : `Validation failed (${res.status})` };
  }
  if (provider === 'cursor') {
    return { ok: true, error: null };
  }
  return { ok: false, error: 'Unsupported provider' };
}

async function storeApiKeyAsOauth(env, authUser, provider, apiKey) {
  if (!env?.DB) throw new Error('DB not configured');
  if (!env.VAULT_MASTER_KEY) throw new Error('VAULT_MASTER_KEY not configured');
  const userId = integrationUserId(authUser);
  const tenantId = authUser?.tenant_id || '';
  await ensureOauthTokenColumns(env.DB); // PRAGMA before write
  const encrypted = await encryptWithVault(env, apiKey);
  const createdAt = nowSeconds();

  // Store under provider key; keep account_identifier empty.
  const cols = await pragmaColumns(env.DB, 'user_oauth_tokens');
  const hasEncrypted = cols.has('access_token_encrypted');
  const hasPlain = cols.has('access_token');

  const sql = `
    INSERT OR REPLACE INTO user_oauth_tokens
      (user_id, tenant_id, provider, account_identifier,
       ${hasPlain ? 'access_token,' : ''}
       ${hasEncrypted ? 'access_token_encrypted,' : ''}
       ${cols.has('created_at') ? 'created_at,' : ''} ${cols.has('updated_at') ? 'updated_at,' : ''}
       created_at
      )
    VALUES (?, ?, ?, ?,
            ${hasPlain ? '?,' : ''}
            ${hasEncrypted ? '?,' : ''}
            ${cols.has('created_at') ? '?,' : ''} ${cols.has('updated_at') ? '?,' : ''}
            ?
    )
  `.replace(/\s+/g, ' ').trim();

  const binds = [String(userId), String(tenantId), provider, ''];
  if (hasPlain) binds.push(String(apiKey));
  if (hasEncrypted) binds.push(encrypted);
  if (cols.has('created_at')) binds.push(createdAt);
  if (cols.has('updated_at')) binds.push(createdAt);
  binds.push(createdAt);

  await env.DB.prepare(sql).bind(...binds).run();

  try {
    await env.DB.prepare(
      `UPDATE integration_registry
       SET status = 'connected', account_display = 'API key validated', updated_at = datetime('now')
       WHERE tenant_id = ? AND provider_key = ?`,
    )
      .bind(String(tenantId), provider)
      .run();
  } catch { /* ignore */ }
}

export async function handleOAuthApi(request, env, ctx) {
  const url = new URL(request.url);
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  const startMatch = pathLower.match(/^\/api\/oauth\/([^/]+)\/start$/);
  const cbMatch = pathLower.match(/^\/api\/oauth\/([^/]+)\/callback$/);
  const apiKeyMatch = pathLower.match(/^\/api\/oauth\/apikey\/([^/]+)$/);

  if (!startMatch && !cbMatch && !apiKeyMatch) return jsonResponse({ error: 'not_found' }, 404);

  if (apiKeyMatch) {
    const provider = normalizeProvider(apiKeyMatch[1]);
    if (method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
    if (!APIKEY_PROVIDERS.has(provider)) return jsonResponse({ error: 'unsupported_provider' }, 400);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await request.json().catch(() => ({}));
    const apiKey = String(body.api_key || '');
    const v = await validateApiKey(provider, apiKey);
    if (!v.ok) return jsonResponse({ success: false, provider, error: v.error || 'Invalid API key — check and retry' }, 400);

    await storeApiKeyAsOauth(env, authUser, provider, apiKey);
    try {
      ctx?.waitUntil?.(syncProviderModels(env, provider, apiKey));
    } catch (_) { /* non-fatal */ }
    return jsonResponse({ success: true, provider, account_display: 'API key validated' });
  }

  if (startMatch) {
    const provider = normalizeProvider(startMatch[1]);
    if (method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
    if (!PROVIDERS.has(provider)) return jsonResponse({ error: 'unsupported_provider' }, 400);

    const authUser = await getAuthUser(request, env);
    // Login/sign-up OAuth is handled by the legacy worker (session creation on callback).
    // Return 404 so src/index.js delegates to legacyWorker.fetch for the same URL.
    if (!authUser && (provider === 'google' || provider === 'github')) {
      return jsonResponse({ error: 'not_found' }, 404);
    }
    // Dashboard Cloudflare OAuth requires a session; browser navigations get a login redirect
    // instead of a bare 401 JSON so the marketing auth page can show a clear path.
    if (!authUser && provider === 'cloudflare') {
      const accept = (request.headers.get('Accept') || '').toLowerCase();
      if (accept.includes('text/html')) {
        const returnTo = safeReturnTo(url.searchParams.get('return_to'));
        const next = encodeURIComponent(returnTo);
        return Response.redirect(
          `${url.origin}/auth/login?next=${next}&cf_connect=1`,
          302,
        );
      }
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userId = integrationUserId(authUser);
    const tenantId = authUser?.tenant_id || '';
    const personUuid = authUser?.person_uuid || '';

    const state = crypto.randomUUID();
    const returnTo = safeReturnTo(url.searchParams.get('return_to'));
    const workspace_id = String(url.searchParams.get('workspace_id') || '').trim() || String(env.WORKSPACE_ID || '').trim() || '';
    await kvPutState(env, state, {
      user_id: userId,
      tenant_id: tenantId,
      person_uuid: personUuid,
      provider,
      initiated_at: Date.now(),
      return_to: returnTo,
      workspace_id,
    });

    const oauthScopes = url.searchParams.get('oauth_scopes');

    let redirectUrl = null;
    if (provider === 'github') redirectUrl = githubAuthUrl(env, state, oauthScopes);
    if (provider === 'google') redirectUrl = googleAuthUrl(env, state, oauthScopes);
    if (provider === 'cloudflare') redirectUrl = cloudflareAuthUrl(env, state, oauthScopes);
    if (provider === 'supabase') redirectUrl = supabaseAuthUrl(env, state, oauthScopes);

    if (!redirectUrl) {
      return jsonResponse({
        error: `${provider}_oauth_not_configured`,
        setup: `Set Worker secrets, then retry.`,
      }, 503);
    }
    return Response.redirect(redirectUrl, 302);
  }

  if (cbMatch) {
    const provider = normalizeProvider(cbMatch[1]);
    if (method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
    if (!PROVIDERS.has(provider)) return jsonResponse({ error: 'unsupported_provider' }, 400);

    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    if (!state || !code) return Response.redirect(`${new URL(request.url).origin}/dashboard/settings?section=Integrations&error=missing_params`, 302);

    const stored = await kvGetState(env, state);
    if (!stored) return new Response(null, { status: 404 });

    const userId = stored.user_id;
    const tenantId = stored.tenant_id || '';
    const personUuid = stored.person_uuid || '';
    const oauthWorkspaceId = String(stored.workspace_id || '').trim() || null;
    const returnTo = safeReturnTo(stored.return_to);

    try {
      if (provider === 'github') {
        const tok = await exchangeGithub(env, code);
        const acct = await githubAccount(tok.access_token);
        await upsertOauthToken(env, {
          user_id: userId,
          tenant_id: tenantId,
          person_uuid: personUuid,
          provider: 'github',
          access_token: tok.access_token,
          refresh_token: null,
          scope: tok.scope || null,
          expires_at: null,
          account_identifier: acct.login || acct.email || userId,
          account_email: acct.email,
          account_display: acct.login ? `github.com/${acct.login}` : null,
        });
      } else if (provider === 'google') {
        const tok = await exchangeGoogle(env, code);
        const info = await googleUserinfo(tok.access_token);
        await upsertOauthToken(env, {
          user_id: userId,
          tenant_id: tenantId,
          person_uuid: personUuid,
          provider: 'google',
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || null,
          scope: tok.scope || null,
          expires_at: tok.expires_in ? nowSeconds() + Number(tok.expires_in) : null,
          account_identifier: info.email || userId,
          account_email: info.email,
          account_display: info.email || null,
        });
      } else if (provider === 'cloudflare') {
        const tok = await exchangeCloudflare(env, code);
        await upsertOauthToken(env, {
          user_id: userId,
          tenant_id: tenantId,
          person_uuid: personUuid,
          provider: 'cloudflare',
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || null,
          scope: tok.scope || null,
          expires_at: tok.expires_in ? nowSeconds() + Number(tok.expires_in) : null,
          account_identifier: 'Cloudflare',
          account_email: null,
          account_display: 'Cloudflare',
        });
      } else if (provider === 'supabase') {
        const tok = await exchangeSupabase(env, code);
        const supabaseAcct = supabaseOAuthAccountIdentifier(oauthWorkspaceId);
        let metadata_json = null;
        try {
          const projects = await fetchSupabaseManagementProjects(tok.access_token);
          metadata_json = JSON.stringify({
            projects,
            workspace_id: oauthWorkspaceId,
          });
        } catch {
          metadata_json = JSON.stringify({ projects: [], workspace_id: oauthWorkspaceId });
        }
        await upsertOauthToken(env, {
          user_id: userId,
          tenant_id: tenantId,
          person_uuid: personUuid,
          provider: 'supabase',
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || null,
          scope: tok.scope || null,
          expires_at: tok.expires_in ? nowSeconds() + Number(tok.expires_in) : null,
          account_identifier: supabaseAcct,
          account_email: null,
          account_display: 'Supabase',
          workspace_id: oauthWorkspaceId,
          metadata_json,
        });
      }
    } catch (e) {
      await kvDeleteState(env, state);
      const msg = encodeURIComponent(e?.message || 'oauth_failed');
      const _origin = new URL(request.url).origin; const _abs638 = returnTo.startsWith("http") ? returnTo : _origin + returnTo; return Response.redirect(`${_abs638}?error=${msg}`, 302);
    }

    await kvDeleteState(env, state);
    const _abs642 = returnTo.startsWith("http") ? returnTo : new URL(request.url).origin + returnTo; return Response.redirect(`${_abs642}?connected=${encodeURIComponent(provider)}&success=true`, 302);
  }

  return jsonResponse({ error: 'not_found' }, 404);
}

/**
 * Internal helper for other modules (future use):
 * returns decrypted access token (and refresh flow when applicable).
 */
export async function getOAuthToken(env, userId, provider) {
  const p = normalizeProvider(provider);
  if (!env?.DB) return null;
  if (!env.VAULT_MASTER_KEY) return null;
  if (p === 'google') {
    const refreshed = await maybeRefreshGoogle(env, userId);
    return refreshed?.access_token || null;
  }
  const providerForDb = mapTokenProviderForStorage(p);
  const row = await getOauthTokenRow(env, userId, providerForDb);
  return row?.access_token || null;
}

async function refreshSupabaseAccessToken(env, refreshToken) {
  if (!env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET || !refreshToken) return null;
  const res = await fetch('https://api.supabase.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.SUPABASE_OAUTH_CLIENT_ID,
      client_secret: env.SUPABASE_OAUTH_CLIENT_SECRET,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return null;
  return data;
}

/**
 * Decrypted Supabase OAuth token for Management API; includes linked projects from stored metadata.
 * Rows are scoped per workspace via account_identifier workspace:<workspace_id> when workspace_id was set at connect time.
 */
export async function getUserSupabaseToken(env, userId, workspaceId = null) {
  if (!env?.DB || !userId || !env.VAULT_MASTER_KEY) return null;
  await ensureOauthTokenColumns(env.DB);
  const acct = supabaseOAuthAccountIdentifier(workspaceId);
  const fullRow = await env.DB.prepare(
    `SELECT * FROM user_oauth_tokens
     WHERE user_id = ? AND provider = 'supabase' AND account_identifier = ?
     ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(String(userId), acct)
    .first();
  if (!fullRow) return null;

  let access =
    fullRow.access_token_encrypted && env.VAULT_MASTER_KEY
      ? await decryptWithVault(env, fullRow.access_token_encrypted).catch(() => fullRow.access_token || null)
      : fullRow.access_token || null;
  let refresh =
    fullRow.refresh_token_encrypted && env.VAULT_MASTER_KEY
      ? await decryptWithVault(env, fullRow.refresh_token_encrypted).catch(() => fullRow.refresh_token || null)
      : fullRow.refresh_token || null;

  const exp = Number(fullRow.expires_at);
  const needsRefresh =
    refresh &&
    env.SUPABASE_OAUTH_CLIENT_ID &&
    env.SUPABASE_OAUTH_CLIENT_SECRET &&
    (!Number.isFinite(exp) || exp <= nowSeconds() + 300);

  if (needsRefresh) {
    const tok = await refreshSupabaseAccessToken(env, refresh);
    if (tok?.access_token) {
      access = tok.access_token;
      refresh = tok.refresh_token || refresh;
      const newExp = tok.expires_in ? nowSeconds() + Number(tok.expires_in) : exp;
      await upsertOauthToken(env, {
        user_id: fullRow.user_id,
        tenant_id: fullRow.tenant_id || '',
        person_uuid: fullRow.person_uuid || '',
        provider: 'supabase',
        access_token: access,
        refresh_token: refresh,
        scope: tok.scope || fullRow.scope || null,
        expires_at: newExp,
        account_identifier: acct,
        account_email: fullRow.account_email || null,
        account_display: fullRow.account_display || 'Supabase',
        workspace_id: fullRow.workspace_id ?? workspaceId,
        metadata_json: fullRow.metadata_json || null,
      });
    }
  }

  let meta = {};
  try {
    meta = JSON.parse(fullRow.metadata_json || '{}');
  } catch {
    meta = {};
  }
  return {
    access_token: access,
    projects: Array.isArray(meta.projects) ? meta.projects : [],
    metadata: meta,
  };
}

