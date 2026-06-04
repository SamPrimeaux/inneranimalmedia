/**
 * Unified keys & secrets: /api/settings/keys* (canonical)
 * Legacy alias: /api/settings/api-keys*
 *
 * Hard rules:
 * - Store secret material only in encrypted `user_secrets`.
 * - Treat `vault_secret_id` as an internal pointer only (never returned).
 * - Never return: raw key, encrypted key, vault_secret_id, user_secrets id, hashes, auth headers.
 * - Scope every operation by authenticated user + tenant_id (when available) + workspace_id.
 * - Schema drift safety: probe columns via PRAGMA and omit missing fields.
 */
import { jsonResponse, fetchAuthUserTenantId, fallbackSystemTenantId, getSession } from '../core/auth.js';
import {
  canonicalUserSecretId,
  handleKeySecurityAfterOp,
} from '../core/keys-security.js';
import { encryptApiKeyForStorage } from './provisioning.js';
import { userCanAccessWorkspace } from '../core/cms-theme-resolve.js';
import { validateProviderKey, checkValidateRateLimit } from '../core/secret-validators.js';
import { upsertWorkspaceDataBinding, listWorkspaceDataBindings } from '../core/workspace-data-bindings.js';
import {
  maskAccountId,
  resolveWorkspaceCloudflareCredentials,
} from '../core/workspace-cloudflare-credentials.js';
import { customerCloudflareSelectWorkspaceResource } from '../core/customer-cloudflare-dispatch.js';

const KEY_CATEGORIES = new Set(['provider', 'personal', 'internal']);

const PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'cloudflare',
  'resend',
  'github',
  'supabase',
  'other',
]);

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function lastFourOfKey(apiKey) {
  const s = String(apiKey || '');
  if (s.length < 4) return '????';
  return s.slice(-4);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

async function resolveTenantIdOrFetch(env, authUser) {
  if (authUser?.tenant_id && String(authUser.tenant_id).trim()) return String(authUser.tenant_id).trim();
  if (authUser?.id && env?.DB) {
    const tid = await fetchAuthUserTenantId(env, authUser.id);
    if (tid) return tid;
  }
  if (env?.TENANT_ID) return String(env.TENANT_ID).trim();
  return fallbackSystemTenantId(env);
}

async function tableExists(db, name) {
  try {
    const row = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`)
      .bind(name)
      .first();
    return !!row;
  } catch {
    return false;
  }
}

async function tableColumns(db, table) {
  try {
    const res = await db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = new Set();
    for (const r of res?.results || []) {
      if (r?.name) cols.add(String(r.name));
    }
    return cols;
  } catch {
    return new Set();
  }
}

function has(cols, col) {
  return cols && cols.has(col);
}

/** @param {string} code @param {string} message @param {number} [status] */
function clientError(code, message, status = 400) {
  return jsonResponse({ ok: false, error: code, message }, status);
}

/** @param {unknown} e */
function sqliteErrorMessage(e) {
  const raw = e?.message != null ? String(e.message) : String(e);
  if (/NOT NULL constraint failed:\s*user_api_keys\.key_name/i.test(raw)) {
    return {
      code: 'KEY_NAME_REQUIRED',
      message: 'API key label is required.',
    };
  }
  if (/NOT NULL constraint failed:\s*user_api_keys\.(\w+)/i.test(raw)) {
    const m = raw.match(/NOT NULL constraint failed:\s*user_api_keys\.(\w+)/i);
    const col = m ? m[1] : 'field';
    return {
      code: 'D1_CONSTRAINT',
      message: `Missing required field (${col}). Check that label, provider, and key are set.`,
    };
  }
  if (/UNIQUE constraint failed/i.test(raw)) {
    return { code: 'D1_UNIQUE', message: 'This key record conflicts with an existing row.' };
  }
  return { code: 'D1_ERROR', message: raw.length > 200 ? `${raw.slice(0, 200)}…` : raw };
}

async function resolveWorkspaceIdStrict(env, request, authUser) {
  const headerWs = String(request?.headers?.get('x-iam-workspace-id') || '').trim();
  if (headerWs) return headerWs;
  const authWs = authUser?.active_workspace_id != null ? String(authUser.active_workspace_id).trim() : '';
  if (authWs) return authWs;
  const session = await getSession(env, request).catch(() => null);
  const sessWs = session?.workspace_id != null ? String(session.workspace_id).trim() : '';
  if (sessWs) return sessWs;
  return '';
}

async function assertWorkspaceAccess(env, request, authUser) {
  const workspaceId = await resolveWorkspaceIdStrict(env, request, authUser);
  if (!workspaceId) return { workspaceId: null, error: 'WORKSPACE_CONTEXT_MISSING' };
  const ok = await userCanAccessWorkspace(env, authUser, workspaceId);
  if (!ok) return { workspaceId: null, error: 'Forbidden' };
  return { workspaceId, error: null };
}

function parseMeta(row) {
  try {
    return row?.metadata_json ? JSON.parse(String(row.metadata_json)) : {};
  } catch {
    return {};
  }
}

function toSafeItem(row, cols) {
  const lastFour =
    row?.last_four != null && String(row.last_four).trim() !== ''
      ? String(row.last_four).trim()
      : row?.key_preview
        ? String(row.key_preview).slice(-4)
        : '????';
  const meta = parseMeta(row);

  const cloudflareAccountId =
    meta.cloudflare_account_id != null
      ? String(meta.cloudflare_account_id).trim()
      : meta.account_id != null
        ? String(meta.account_id).trim()
        : null;

  return {
    id: row.id,
    workspace_id: has(cols, 'workspace_id') ? row.workspace_id ?? null : null,
    category: has(cols, 'category') ? row.category ?? 'provider' : 'provider',
    provider: row.provider ?? null,
    secret_name: meta.secret_name ?? meta.secretName ?? null,
    label:
      row.label ??
      row.key_name ??
      null,
    status: row.status ?? 'active',
    scope: row.scope ?? 'workspace',
    last_four: lastFour,
    cloudflare_account_mask: cloudflareAccountId ? maskAccountId(cloudflareAccountId) : null,
    validated_at: meta.validated_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    last_used_at: has(cols, 'last_used_at') ? row.last_used_at ?? null : null,
    rotated_at: has(cols, 'rotated_at') ? row.rotated_at ?? null : null,
    expires_at: has(cols, 'expires_at') ? row.expires_at ?? null : null,
  };
}

async function upsertCloudflareAccountBinding(env, { tenantId, userId, workspaceId, accountId, keyRowId, label }) {
  if (!accountId || !workspaceId) return null;
  const bindingId = `wsbind_cf_${String(workspaceId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`;
  await upsertWorkspaceDataBinding(env, {
    id: bindingId,
    tenant_id: tenantId,
    user_id: userId,
    workspace_id: workspaceId,
    provider: 'cloudflare',
    connection_id: keyRowId,
    external_account_id: String(accountId),
    display_name: label || 'Cloudflare account',
    selected_as_default: true,
    capabilities_json: JSON.stringify({ account_read: true, d1_list: true }),
    health_status: 'active',
    last_verified_at: Math.floor(Date.now() / 1000),
    metadata_json: JSON.stringify({ source: 'settings_keys', api_key_id: keyRowId }),
  });
  return bindingId;
}

/** Canonical /api/settings/keys paths; legacy /api/settings/api-keys maps here. */
function normalizeKeysPath(pathLower) {
  if (pathLower.startsWith('/api/settings/api-keys')) {
    return pathLower.replace('/api/settings/api-keys', '/api/settings/keys');
  }
  return pathLower;
}

async function decryptVaultSecret(env, vaultSecretId, userId, tenantId, workspaceId) {
  if (!env?.DB || !vaultSecretId) return null;
  const sCols = await tableColumns(env.DB, 'user_secrets');
  const where = ['id = ?', 'is_active = 1'];
  const binds = [vaultSecretId];
  if (has(sCols, 'user_id')) {
    where.push('user_id = ?');
    binds.push(userId);
  }
  if (has(sCols, 'tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tenantId);
  }
  if (workspaceId && has(sCols, 'workspace_id')) {
    where.push('workspace_id = ?');
    binds.push(workspaceId);
  }
  const row = await env.DB.prepare(
    `SELECT secret_value_encrypted FROM user_secrets WHERE ${where.join(' AND ')} LIMIT 1`,
  )
    .bind(...binds)
    .first();
  if (!row?.secret_value_encrypted) return null;
  const { vaultDecrypt } = await import('./vault.js');
  const plain = await vaultDecrypt(env, row.secret_value_encrypted);
  return plain ? String(plain).trim() : null;
}

async function patchValidatedMetadata(env, authUser, id, workspaceId, validationResult) {
  const { row, cols } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row || !has(cols, 'metadata_json')) return;
  const meta = parseMeta(row);
  meta.validated_at = nowIso();
  meta.validation_checks = validationResult?.checks ?? [];
  meta.validation_warnings = validationResult?.warnings ?? [];
  meta.checks = validationResult?.checks ?? [];
  meta.warnings = validationResult?.warnings ?? [];
  meta.latency_ms = (validationResult?.checks ?? []).reduce(
    (n, c) => n + (Number(c?.latency_ms) || 0),
    0,
  );
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const where = ['id = ?'];
  const binds = [id];
  if (has(cols, 'user_id')) {
    where.push('user_id = ?');
    binds.push(userId);
  }
  if (has(cols, 'tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tenantId);
  }
  await env.DB.prepare(
    `UPDATE user_api_keys SET metadata_json = ?, updated_at = datetime('now') WHERE ${where.join(' AND ')}`,
  )
    .bind(JSON.stringify(meta), ...binds)
    .run()
    .catch(() => {});
}

async function validateKeysRequest(env, authUser, request, body, keyId = null) {
  const userId = String(authUser?.id || '').trim();
  const rl = await checkValidateRateLimit(env, userId);
  if (!rl.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: 'rate_limited',
        message: `Too many validation attempts. Retry in ${rl.retry_after_sec ?? 60}s.`,
      },
      429,
    );
  }

  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing.', 400);
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  let provider = String(body?.provider || '').trim().toLowerCase();
  let apiKey = String(body?.api_key || body?.secret_value || '').trim();
  let cloudflareAccountId =
    body?.cloudflare_account_id != null ? String(body.cloudflare_account_id).trim() : '';

  if (keyId) {
    const tenantId = await resolveTenantIdOrFetch(env, authUser);
    const { row, cols } = await loadApiKeyRowScoped(env, authUser, keyId, wsRes.workspaceId);
    if (!row) return clientError('NOT_FOUND', 'Key not found.', 404);
    provider = String(row.provider || 'other').toLowerCase();
    apiKey = await decryptVaultSecret(env, row.vault_secret_id, userId, tenantId, wsRes.workspaceId);
    if (!apiKey) return clientError('DECRYPT_FAILED', 'Could not decrypt stored key for validation.', 500);
    if (!cloudflareAccountId) {
      const meta = parseMeta(row);
      cloudflareAccountId =
        meta.cloudflare_account_id != null
          ? String(meta.cloudflare_account_id).trim()
          : meta.account_id != null
            ? String(meta.account_id).trim()
            : '';
    }
  }

  if (!provider) return clientError('PROVIDER_REQUIRED', 'Provider is required.');
  if (!apiKey) return clientError('API_KEY_REQUIRED', 'API key value is required.');
  if (provider === 'cloudflare' && !cloudflareAccountId) {
    return clientError('CLOUDFLARE_ACCOUNT_ID_REQUIRED', 'Cloudflare Account ID is required.');
  }

  const validateOpts =
    provider === 'cloudflare' ? { cloudflare_account_id: cloudflareAccountId } : {};
  const result = await validateProviderKey(provider, apiKey, env, validateOpts);
  const tenantId = await resolveTenantIdOrFetch(env, authUser);

  if (keyId) {
    const { row } = await loadApiKeyRowScoped(env, authUser, keyId, wsRes.workspaceId);
    const secretId = canonicalUserSecretId(row || { id: keyId, vault_secret_id: null });
    if (result.ok) {
      await patchValidatedMetadata(env, authUser, keyId, wsRes.workspaceId, result);
    }
    await handleKeySecurityAfterOp(env, {
      operation: 'validate',
      secretId,
      apiKeyId: keyId,
      apiKeyRow: row,
      tenantId,
      userId,
      workspaceId: wsRes.workspaceId,
      provider,
      plaintextKey: apiKey,
      validationResult: result,
      request,
      triggeredBy: 'dashboard_ui',
    });
  }

  return jsonResponse(result);
}

async function revealKey(env, authUser, request, id) {
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error) {
    const code = wsRes.error === 'Forbidden' ? 403 : 400;
    return clientError(wsRes.error === 'Forbidden' ? 'FORBIDDEN' : 'WORKSPACE_CONTEXT_MISSING', wsRes.error, code);
  }
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const { row, cols } = await loadApiKeyRowScoped(env, authUser, id, wsRes.workspaceId);
  if (!row) return clientError('NOT_FOUND', 'Key not found.', 404);
  const category = has(cols, 'category') ? row.category : 'provider';
  if (category !== 'personal' && category !== 'internal') {
    return clientError('REVEAL_NOT_ALLOWED', 'Provider keys cannot be revealed. Rotate instead.', 403);
  }
  const plain = await decryptVaultSecret(env, row.vault_secret_id, userId, tenantId, wsRes.workspaceId);
  if (!plain) return clientError('DECRYPT_FAILED', 'Could not decrypt secret.', 500);
  const secretId = canonicalUserSecretId(row);
  await handleKeySecurityAfterOp(env, {
    operation: 'reveal',
    secretId,
    apiKeyId: id,
    apiKeyRow: row,
    tenantId,
    userId,
    workspaceId: wsRes.workspaceId,
    request,
    triggeredBy: 'dashboard_ui',
  });
  return jsonResponse({ ok: true, value: plain, expires_in_sec: 30 });
}

async function loadApiKeyRowScoped(env, authUser, id, workspaceId) {
  const db = env.DB;
  const cols = await tableColumns(db, 'user_api_keys');
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();

  const where = ['id = ?'];
  const binds = [id];
  if (has(cols, 'user_id')) {
    where.push('user_id = ?');
    binds.push(userId);
  }
  if (has(cols, 'tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tenantId);
  }
  if (workspaceId && has(cols, 'workspace_id')) {
    where.push('workspace_id = ?');
    binds.push(workspaceId);
  }

  // Soft-delete support
  if (has(cols, 'is_active')) where.push('COALESCE(is_active, 1) = 1');

  const select = [
    'id',
    has(cols, 'workspace_id') ? 'workspace_id' : 'NULL AS workspace_id',
    has(cols, 'tenant_id') ? 'tenant_id' : 'NULL AS tenant_id',
    has(cols, 'user_id') ? 'user_id' : 'NULL AS user_id',
    has(cols, 'provider') ? 'provider' : 'NULL AS provider',
    has(cols, 'label') ? 'label' : has(cols, 'key_name') ? 'key_name AS label' : 'NULL AS label',
    has(cols, 'status') ? 'status' : `'active' AS status`,
    has(cols, 'scope') ? 'scope' : `'workspace' AS scope`,
    has(cols, 'last_four')
      ? 'last_four'
      : has(cols, 'key_preview')
        ? 'key_preview AS last_four'
        : 'NULL AS last_four',
    has(cols, 'vault_secret_id') ? 'vault_secret_id' : 'NULL AS vault_secret_id',
    has(cols, 'created_at') ? 'created_at' : 'NULL AS created_at',
    has(cols, 'updated_at') ? 'updated_at' : 'NULL AS updated_at',
    has(cols, 'last_used_at') ? 'last_used_at' : 'NULL AS last_used_at',
    has(cols, 'rotated_at') ? 'rotated_at' : 'NULL AS rotated_at',
    has(cols, 'expires_at') ? 'expires_at' : 'NULL AS expires_at',
    has(cols, 'metadata_json') ? 'metadata_json' : 'NULL AS metadata_json',
  ].join(', ');

  const row = await db
    .prepare(`SELECT ${select} FROM user_api_keys WHERE ${where.join(' AND ')} LIMIT 1`)
    .bind(...binds)
    .first()
    .catch(() => null);

  return { row, cols, tenantId, userId };
}

async function listApiKeys(request, env, authUser, url) {
  if (!env?.DB) return jsonResponse({ items: [] });
  const db = env.DB;

  const ok = await tableExists(db, 'user_api_keys');
  if (!ok) return jsonResponse({ items: [] });

  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const cols = await tableColumns(db, 'user_api_keys');
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const workspaceId = wsRes.workspaceId;
  const categoryFilter = String(url.searchParams.get('category') || '').trim().toLowerCase();

  const where = [];
  const binds = [];
  if (has(cols, 'user_id')) {
    where.push('user_id = ?');
    binds.push(userId);
  }
  if (has(cols, 'tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tenantId);
  }
  if (has(cols, 'workspace_id')) {
    where.push('workspace_id = ?');
    binds.push(workspaceId);
  }
  if (has(cols, 'is_active')) where.push('COALESCE(is_active, 1) = 1');
  if (categoryFilter && has(cols, 'category') && KEY_CATEGORIES.has(categoryFilter)) {
    where.push('category = ?');
    binds.push(categoryFilter);
  }

  const select = [
    'id',
    has(cols, 'workspace_id') ? 'workspace_id' : 'NULL AS workspace_id',
    has(cols, 'category') ? 'category' : `'provider' AS category`,
    has(cols, 'provider') ? 'provider' : 'NULL AS provider',
    has(cols, 'metadata_json') ? 'metadata_json' : 'NULL AS metadata_json',
    has(cols, 'label') ? 'label' : has(cols, 'key_name') ? 'key_name AS label' : 'NULL AS label',
    has(cols, 'status') ? 'status' : `'active' AS status`,
    has(cols, 'scope') ? 'scope' : `'workspace' AS scope`,
    has(cols, 'last_four')
      ? 'last_four'
      : has(cols, 'key_preview')
        ? 'key_preview AS last_four'
        : 'NULL AS last_four',
    has(cols, 'created_at') ? 'created_at' : 'NULL AS created_at',
    has(cols, 'updated_at') ? 'updated_at' : 'NULL AS updated_at',
    has(cols, 'last_used_at') ? 'last_used_at' : 'NULL AS last_used_at',
    has(cols, 'rotated_at') ? 'rotated_at' : 'NULL AS rotated_at',
    has(cols, 'expires_at') ? 'expires_at' : 'NULL AS expires_at',
  ].join(', ');

  try {
    const sql = `SELECT ${select}
      FROM user_api_keys
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC
      LIMIT 500`;
    const res = await db.prepare(sql).bind(...binds).all();
    const items = (res?.results || []).map((r) => toSafeItem(r, cols));
    return jsonResponse({ items });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e), items: [] }, 500);
  }
}

async function createApiKey(env, authUser, request) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;

  const ok = await tableExists(db, 'user_api_keys');
  if (!ok) return jsonResponse({ error: 'user_api_keys table missing' }, 503);
  if (!(await tableExists(db, 'user_secrets'))) return jsonResponse({ error: 'user_secrets table missing' }, 503);

  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const cols = await tableColumns(db, 'user_api_keys');
  const sCols = await tableColumns(db, 'user_secrets');
  const body = await request.json().catch(() => ({}));

  const categoryRaw = String(body.category || 'provider').trim().toLowerCase();
  const category = KEY_CATEGORIES.has(categoryRaw) ? categoryRaw : 'provider';
  let provider = String(body.provider || '').trim().toLowerCase();
  const secretName = String(body.secret_name || '').trim();
  const cloudflareAccountId =
    body.cloudflare_account_id != null ? String(body.cloudflare_account_id).trim() : '';
  const keyLabel = String(
    body.label ?? body.key_name ?? (category === 'personal' ? secretName : ''),
  ).trim();
  const api_key = String(body.api_key || body.secret_value || '').trim();
  const scopeRaw =
    body.scope == null || String(body.scope).trim() === ''
      ? 'workspace'
      : String(body.scope).trim().toLowerCase();
  const scope = scopeRaw;
  const workspaceId = wsRes.workspaceId;
  const expires_at = body.expires_at ?? null;
  const metadata = body.metadata ?? null;
  const validationOnCreate = body.validate === true;
  let preValidateResult = null;

  if (category === 'personal') {
    provider = provider || 'other';
    if (!secretName && !keyLabel) {
      return clientError('SECRET_NAME_REQUIRED', 'Secret name is required for personal secrets.');
    }
  } else {
    if (!provider) return clientError('PROVIDER_REQUIRED', 'Provider is required.');
    if (!PROVIDERS.has(provider)) {
      return clientError('INVALID_PROVIDER', 'Choose a supported provider (OpenAI, Anthropic, Google, etc.).');
    }
  }
  if (!keyLabel && category !== 'provider') {
    return clientError('KEY_NAME_REQUIRED', 'Label is required.');
  }
  if (category === 'provider' && provider !== 'cloudflare' && !keyLabel) {
    return clientError('KEY_NAME_REQUIRED', 'Label is required.');
  }
  if (!api_key) return clientError('API_KEY_REQUIRED', 'Secret value is required.');
  if (category === 'provider' && provider === 'cloudflare' && !cloudflareAccountId) {
    return clientError('CLOUDFLARE_ACCOUNT_ID_REQUIRED', 'Cloudflare Account ID is required.');
  }

  const validateOpts =
    provider === 'cloudflare' ? { cloudflare_account_id: cloudflareAccountId } : {};

  if (validationOnCreate && category === 'provider') {
    preValidateResult = await validateProviderKey(provider, api_key, env, validateOpts);
    if (!preValidateResult.ok) {
      return jsonResponse({ ok: false, error: 'validation_failed', ...preValidateResult }, 400);
    }
  }
  if (!['user', 'workspace'].includes(scope)) {
    return clientError('INVALID_SCOPE', 'Scope must be user or workspace.');
  }

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const last_four = lastFourOfKey(api_key);
  const vaultSecretId = newId('sec'); // canonical secret_id for audit/findings
  const keyRowId = newId('uak');
  const effectiveLabel =
    keyLabel ||
    (provider === 'cloudflare' ? `Cloudflare ${maskAccountId(cloudflareAccountId)}` : provider);
  const providerMeta =
    provider === 'cloudflare' && cloudflareAccountId
      ? { cloudflare_account_id: cloudflareAccountId }
      : {};

  // Encrypt via existing helper (Cloudflare-safe)
  let encrypted;
  let encryptOk = true;
  try {
    encrypted = await encryptApiKeyForStorage(env, api_key);
    if (!encrypted) encryptOk = false;
  } catch {
    encryptOk = false;
    encrypted = null;
  }
  if (!encryptOk || !encrypted) {
    await handleKeySecurityAfterOp(env, {
      operation: 'create',
      secretId: vaultSecretId,
      tenantId,
      userId,
      workspaceId,
      provider,
      encryptOk: false,
      request,
      triggeredBy: 'dashboard_ui',
    });
    return clientError('ENCRYPT_FAILED', 'Could not encrypt secret value.', 500);
  }

  // Insert encrypted secret first
  try {
    const secretFields = [
      ['id', vaultSecretId],
      ['user_id', userId],
      ['tenant_id', tenantId],
      ['workspace_id', workspaceId],
      [
        'secret_name',
        category === 'personal' && secretName
          ? secretName
          : `api_key:${provider}:${keyRowId}`,
      ],
      ['secret_value_encrypted', encrypted],
      ['service_name', category === 'personal' ? body.service_name || 'personal' : provider],
      ['description', body.description || effectiveLabel],
      ['project_label', 'user_api_keys'],
      [
        'metadata_json',
        JSON.stringify({
          api_key_id: keyRowId,
          provider,
          label: effectiveLabel,
          last_four,
          secret_name: secretName || null,
          category,
          ...providerMeta,
          ...(validationOnCreate ? { validated_at: nowIso() } : {}),
        }),
      ],
      ['is_active', 1],
      ['created_at', nowIso()],
      ['updated_at', nowIso()],
    ].filter(([c]) => has(sCols, c));

    await db
      .prepare(
        `INSERT INTO user_secrets (${secretFields.map(([c]) => c).join(', ')})
         VALUES (${secretFields.map(() => '?').join(', ')})`,
      )
      .bind(...secretFields.map(([, v]) => v))
      .run();
  } catch (e) {
    const { code, message } = sqliteErrorMessage(e);
    return jsonResponse({ ok: false, error: code, message }, 500);
  }

  // Insert metadata row — support legacy columns (key_name, key_preview) and newer (label, last_four, vault_secret_id).
  try {
    const metaJson = metadata != null ? JSON.stringify(metadata) : null;
    // key_preview: store last 4 chars only — UI prefixes with ••••
    const keyPreviewVal = last_four;

    if (!has(cols, 'label') && !has(cols, 'key_name')) {
      try {
        await db.prepare(`UPDATE user_secrets SET is_active = 0 WHERE id = ?`).bind(vaultSecretId).run();
      } catch {}
      return clientError(
        'SCHEMA_UNSUPPORTED',
        'Database schema is missing both label and key_name on user_api_keys; cannot save.',
        503,
      );
    }

    const fields = [
      ['id', keyRowId],
      ['tenant_id', tenantId],
      ['user_id', userId],
      ['workspace_id', workspaceId],
      ['category', category],
      ['provider', provider],
      ['label', effectiveLabel],
      ['key_name', effectiveLabel],
      ['status', 'active'],
      ['scope', scope],
      ['last_four', last_four],
      ['key_preview', keyPreviewVal],
      ['vault_secret_id', vaultSecretId],
      ['expires_at', expires_at],
      [
        'metadata_json',
        metaJson != null
          ? metaJson
          : JSON.stringify({
              api_key_id: keyRowId,
              provider,
              label: effectiveLabel,
              last_four,
              secret_name: secretName || null,
              category,
              ...providerMeta,
              ...(validationOnCreate ? { validated_at: nowIso() } : {}),
            }),
      ],
      ['created_at', nowIso()],
      ['updated_at', nowIso()],
      ['is_active', 1],
    ].filter(([c]) => has(cols, c));

    await db
      .prepare(
        `INSERT INTO user_api_keys (${fields.map(([c]) => c).join(', ')})
         VALUES (${fields.map(() => '?').join(', ')})`,
      )
      .bind(...fields.map(([, v]) => v))
      .run();

    const metaField = fields.find(([c]) => c === 'metadata_json');
    const rowMetaJson = metaField ? metaField[1] : null;
    const apiKeyRow = {
      id: keyRowId,
      vault_secret_id: vaultSecretId,
      provider,
      expires_at,
      created_at: nowIso(),
      metadata_json: rowMetaJson,
    };
    await handleKeySecurityAfterOp(env, {
      operation: 'create',
      secretId: vaultSecretId,
      apiKeyId: keyRowId,
      apiKeyRow,
      tenantId,
      userId,
      workspaceId,
      provider,
      plaintextKey: api_key,
      encryptOk: true,
      newLast4: last_four,
      validationResult: preValidateResult,
      request,
      triggeredBy: 'dashboard_ui',
      notes: `Created API key (${provider})`,
    });

    if (category === 'provider' && provider === 'cloudflare' && cloudflareAccountId) {
      await upsertCloudflareAccountBinding(env, {
        tenantId,
        userId,
        workspaceId,
        accountId: cloudflareAccountId,
        keyRowId,
        label: effectiveLabel,
      });
    }
  } catch (e) {
    // Best-effort rollback secret row so we don't orphan it.
    try {
      await db.prepare(`UPDATE user_secrets SET is_active = 0 WHERE id = ?`).bind(vaultSecretId).run();
    } catch {}
    const { code, message } = sqliteErrorMessage(e);
    return jsonResponse({ ok: false, error: code, message }, 500);
  }

  const { row } = await loadApiKeyRowScoped(env, authUser, keyRowId, workspaceId);
  if (!row) return clientError('RELOAD_FAILED', 'Key was created but could not be reloaded.', 500);
  return jsonResponse({ ok: true, item: toSafeItem(row, cols) });
}

async function patchApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return clientError('NOT_FOUND', 'API key not found.', 404);

  const updates = [];
  const binds = [];

  if (body.label != null) {
    const v = String(body.label).trim();
    if (v && has(cols, 'label')) {
      updates.push('label = ?');
      binds.push(v);
    }
    if (v && has(cols, 'key_name')) {
      updates.push('key_name = ?');
      binds.push(v);
    }
  }
  if (body.key_name != null && has(cols, 'key_name') && body.label == null) {
    const v = String(body.key_name).trim();
    if (v) {
      updates.push('key_name = ?');
      binds.push(v);
    }
  }
  if (body.status != null && has(cols, 'status')) {
    updates.push('status = ?');
    binds.push(String(body.status).trim());
  }
  if (body.scope != null && has(cols, 'scope')) {
    const s = String(body.scope).trim().toLowerCase();
    if (!['user', 'workspace'].includes(s)) return jsonResponse({ error: 'scope must be user or workspace' }, 400);
    updates.push('scope = ?');
    binds.push(s);
  }
  if (body.expires_at !== undefined && has(cols, 'expires_at')) {
    updates.push('expires_at = ?');
    binds.push(body.expires_at ?? null);
  }
  if (body.metadata !== undefined && has(cols, 'metadata_json')) {
    updates.push('metadata_json = ?');
    binds.push(body.metadata == null ? null : JSON.stringify(body.metadata));
  }

  if (!updates.length) return jsonResponse({ ok: true, item: toSafeItem(row, cols) });

  if (has(cols, 'updated_at')) {
    updates.push('updated_at = ?');
    binds.push(nowIso());
  }

  // Guard with full scope in WHERE
  const where = ['id = ?'];
  const whereBinds = [id];
  if (has(cols, 'user_id')) {
    where.push('user_id = ?');
    whereBinds.push(userId);
  }
  if (has(cols, 'tenant_id')) {
    where.push('tenant_id = ?');
    whereBinds.push(tenantId);
  }
  if (has(cols, 'workspace_id')) {
    where.push('workspace_id = ?');
    whereBinds.push(workspaceId);
  }

  try {
    await db.prepare(`UPDATE user_api_keys SET ${updates.join(', ')} WHERE ${where.join(' AND ')}`)
      .bind(...binds, ...whereBinds)
      .run();
  } catch (e) {
    const { code, message } = sqliteErrorMessage(e);
    return jsonResponse({ ok: false, error: code, message }, 500);
  }

  const re = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!re.row) return clientError('RELOAD_FAILED', 'Updated but could not re-load row.', 500);
  return jsonResponse({ ok: true, item: toSafeItem(re.row, cols) });
}

async function rotateApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return clientError('NOT_FOUND', 'API key not found.', 404);

  const api_key = String(body.api_key || '').trim();
  if (!api_key) return jsonResponse({ error: 'api_key required' }, 400);

  const newLast4 = lastFourOfKey(api_key);
  const previousLast4 =
    row.last_four != null && String(row.last_four).trim() !== ''
      ? String(row.last_four).trim().slice(-4)
      : '????';

  const encrypted = await encryptApiKeyForStorage(env, api_key);

  // Create or update user_secrets row referenced by vault_secret_id
  const vaultSecretId = row.vault_secret_id != null ? String(row.vault_secret_id) : '';
  if (!vaultSecretId) return jsonResponse({ error: 'vault_secret_id missing for key' }, 500);

  try {
    // Strictly scope secret update
    const sCols = await tableColumns(db, 'user_secrets');
    const where = ['id = ?'];
    const wBinds = [vaultSecretId];
    if (has(sCols, 'user_id')) {
      where.push('user_id = ?');
      wBinds.push(userId);
    }
    if (has(sCols, 'tenant_id')) {
      where.push('tenant_id = ?');
      wBinds.push(tenantId);
    }
    if (has(sCols, 'workspace_id')) {
      where.push('workspace_id = ?');
      wBinds.push(workspaceId);
    }

    const sets = [];
    const binds = [];
    if (has(sCols, 'secret_value_encrypted')) {
      sets.push('secret_value_encrypted = ?');
      binds.push(encrypted);
    }
    if (has(sCols, 'metadata_json')) {
      sets.push('metadata_json = ?');
      binds.push(JSON.stringify({ api_key_id: id, provider: row.provider, label: row.label, last_four: newLast4 }));
    }
    if (has(sCols, 'updated_at')) {
      sets.push('updated_at = ?');
      binds.push(nowIso());
    }
    if (sets.length) {
      await db.prepare(`UPDATE user_secrets SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`)
        .bind(...binds, ...wBinds)
        .run();
    }
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  // Update registry row last_four / rotated_at / updated_at
  try {
    const updates = [];
    const binds = [];
    if (has(cols, 'last_four')) {
      updates.push('last_four = ?');
      binds.push(newLast4);
    }
    if (!has(cols, 'last_four') && has(cols, 'key_preview')) {
      updates.push('key_preview = ?');
      binds.push(newLast4);
    }
    if (has(cols, 'rotated_at')) {
      updates.push('rotated_at = ?');
      binds.push(nowIso());
    }
    if (has(cols, 'updated_at')) {
      updates.push('updated_at = ?');
      binds.push(nowIso());
    }
    if (!updates.length) {
      return clientError(
        'SCHEMA_UNSUPPORTED',
        'Cannot rotate: table is missing last_four, key_preview, rotated_at, and updated_at.',
        500,
      );
    }

    const where = ['id = ?'];
    const wBinds = [id];
    if (has(cols, 'user_id')) {
      where.push('user_id = ?');
      wBinds.push(userId);
    }
    if (has(cols, 'tenant_id')) {
      where.push('tenant_id = ?');
      wBinds.push(tenantId);
    }
    if (has(cols, 'workspace_id')) {
      where.push('workspace_id = ?');
      wBinds.push(workspaceId);
    }

    await db.prepare(`UPDATE user_api_keys SET ${updates.join(', ')} WHERE ${where.join(' AND ')}`)
      .bind(...binds, ...wBinds)
      .run();

    const secretId = canonicalUserSecretId(row);
    await handleKeySecurityAfterOp(env, {
      operation: 'rotate',
      secretId,
      apiKeyId: id,
      apiKeyRow: row,
      tenantId,
      userId,
      workspaceId,
      provider: row.provider,
      previousLast4,
      newLast4,
      request,
      triggeredBy: 'dashboard_ui',
    });
  } catch (e) {
    const { code, message } = sqliteErrorMessage(e);
    return jsonResponse({ ok: false, error: code, message }, 500);
  }

  const re = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!re.row) return clientError('RELOAD_FAILED', 'Rotated but could not re-load row.', 500);
  return jsonResponse({ ok: true, item: toSafeItem(re.row, cols) });
}

async function revokeApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return clientError('NOT_FOUND', 'API key not found.', 404);

  const previousLast4 =
    row.last_four != null && String(row.last_four).trim() !== ''
      ? String(row.last_four).trim().slice(-4)
      : '????';

  try {
    const updates = [];
    const binds = [];
    if (has(cols, 'status')) {
      updates.push('status = ?');
      binds.push('revoked');
    }
    if (has(cols, 'revoked_at')) {
      updates.push('revoked_at = ?');
      binds.push(nowIso());
    }
    if (has(cols, 'updated_at')) {
      updates.push('updated_at = ?');
      binds.push(nowIso());
    }
    if (has(cols, 'is_active')) {
      updates.push('is_active = 0');
    }
    if (!updates.length) return jsonResponse({ error: 'Schema missing revoke fields' }, 500);

    const where = ['id = ?'];
    const wBinds = [id];
    if (has(cols, 'user_id')) {
      where.push('user_id = ?');
      wBinds.push(userId);
    }
    if (has(cols, 'tenant_id')) {
      where.push('tenant_id = ?');
      wBinds.push(tenantId);
    }
    if (has(cols, 'workspace_id')) {
      where.push('workspace_id = ?');
      wBinds.push(workspaceId);
    }

    await db.prepare(`UPDATE user_api_keys SET ${updates.join(', ')} WHERE ${where.join(' AND ')}`)
      .bind(...binds, ...wBinds)
      .run();

    const secretId = canonicalUserSecretId(row);
    await handleKeySecurityAfterOp(env, {
      operation: 'delete',
      secretId,
      apiKeyId: id,
      apiKeyRow: row,
      tenantId,
      userId,
      workspaceId,
      provider: row.provider,
      previousLast4,
      request,
      triggeredBy: 'dashboard_ui',
    });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  return jsonResponse({ ok: true, revoked: true });
}

async function auditApiKeys(request, env, authUser, url) {
  if (!env?.DB) return jsonResponse({ items: [], limit: 50, offset: 0 });
  const db = env.DB;

  if (!(await tableExists(db, 'secret_audit_log'))) {
    return jsonResponse({ items: [], limit: 50, offset: 0 });
  }

  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing. Open this page from a workspace or set your active workspace.');
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const apiKeyId = String(url.searchParams.get('api_key_id') || '').trim() || null;
  const workspaceId = wsRes.workspaceId;

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();

  // Ensure no cross-tenant leakage by enforcing tenant_id/user_id when columns exist.
  const aCols = await tableColumns(db, 'secret_audit_log');

  const where = [`secret_source = 'user_api_keys'`];
  const binds = [];

  if (apiKeyId) {
    where.push('secret_id = ?');
    binds.push(apiKeyId);
  }
  if (has(aCols, 'tenant_id')) {
    where.push('tenant_id = ?');
    binds.push(tenantId);
  }
  if (has(aCols, 'user_id')) {
    where.push('user_id = ?');
    binds.push(userId);
  }

  try {
    const res = await db.prepare(
      `SELECT id, secret_id, event_type, triggered_by, previous_last4, new_last4, notes, created_at
       FROM secret_audit_log
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...binds, limit, offset)
      .all();

    // Redacted rows only (no IP/user agent)
    const items = (res?.results || []).map((r) => ({
      id: r.id,
      api_key_id: r.secret_id,
      event_type: r.event_type,
      actor: r.triggered_by ?? null,
      previous_last4: r.previous_last4 ?? null,
      new_last4: r.new_last4 ?? null,
      notes: r.notes ?? null,
      created_at: r.created_at ?? null,
    }));

    return jsonResponse({ items, limit, offset, api_key_id: apiKeyId, workspace_id: workspaceId });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e), items: [], limit, offset }, 500);
  }
}

async function listCloudflareD1Databases(env, authUser, request, url) {
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing.', 400);
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const workspaceId = wsRes.workspaceId;
  const accountIdParam = String(url.searchParams.get('account_id') || '').trim();

  const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
  if (!creds.ok) {
    return clientError('CLOUDFLARE_CREDENTIALS_MISSING', 'Add a Cloudflare API token for this workspace first.', 400);
  }

  const accountId = accountIdParam || creds.account_id;
  if (!accountId) {
    return clientError('CLOUDFLARE_ACCOUNT_ID_REQUIRED', 'Cloudflare Account ID is required.', 400);
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      const msg = data?.errors?.[0]?.message || `cloudflare_d1_list_${res.status}`;
      return clientError('CLOUDFLARE_D1_LIST_FAILED', String(msg), 400);
    }
    const databases = Array.isArray(data?.result) ? data.result : [];
    const bindings = await listWorkspaceDataBindings(env, workspaceId, 'cloudflare_d1');
    return jsonResponse({
      ok: true,
      account_id_mask: maskAccountId(accountId),
      databases,
      selected_binding: bindings.find((b) => b.selected_as_default === 1) ?? bindings[0] ?? null,
      workspace_id: workspaceId,
    });
  } catch (e) {
    return clientError('CLOUDFLARE_D1_LIST_FAILED', e?.message ?? String(e), 500);
  }
}

async function listCloudflareZones(env, authUser, request) {
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing.', 400);
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const workspaceId = wsRes.workspaceId;

  const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
  if (!creds.ok) {
    return clientError('CLOUDFLARE_CREDENTIALS_MISSING', 'Add a Cloudflare API token for this workspace first.', 400);
  }

  const accountId = creds.account_id;
  if (!accountId) {
    return clientError('CLOUDFLARE_ACCOUNT_ID_REQUIRED', 'Cloudflare Account ID is required.', 400);
  }

  try {
    const zones = [];
    let page = 1;
    for (let guard = 0; guard < 20; guard += 1) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones?account.id=${encodeURIComponent(accountId)}&page=${page}&per_page=50`,
        {
          headers: {
            Authorization: `Bearer ${creds.token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        const msg = data?.errors?.[0]?.message || `cloudflare_zones_list_${res.status}`;
        return clientError('CLOUDFLARE_ZONES_LIST_FAILED', String(msg), 400);
      }
      const batch = Array.isArray(data?.result) ? data.result : [];
      for (const z of batch) {
        if (!z?.id) continue;
        zones.push({
          id: String(z.id),
          name: z.name != null ? String(z.name) : '',
          status: z.status != null ? String(z.status) : '',
        });
      }
      const info = data?.result_info;
      const totalPages = info?.total_pages != null ? Number(info.total_pages) : page;
      if (page >= totalPages || batch.length === 0) break;
      page += 1;
    }

    return jsonResponse({
      ok: true,
      account_id_mask: maskAccountId(accountId),
      zones,
      workspace_id: workspaceId,
    });
  } catch (e) {
    return clientError('CLOUDFLARE_ZONES_LIST_FAILED', e?.message ?? String(e), 500);
  }
}

async function selectCloudflareD1Database(env, authUser, request) {
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error === 'Forbidden') return clientError('FORBIDDEN', 'You do not have access to this workspace.', 403);
  if (wsRes.error === 'WORKSPACE_CONTEXT_MISSING') {
    return clientError('WORKSPACE_CONTEXT_MISSING', 'Workspace context is missing.', 400);
  }
  if (wsRes.error) return clientError('WORKSPACE_ERROR', wsRes.error, 400);

  const body = await request.json().catch(() => ({}));
  const databaseId = String(body.database_id || body.external_database_id || '').trim();
  const accountId = body.account_id != null ? String(body.account_id).trim() : '';
  const displayName = body.display_name != null ? String(body.display_name).trim() : '';

  if (!databaseId) {
    return clientError('DATABASE_ID_REQUIRED', 'database_id is required.', 400);
  }

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const workspaceId = wsRes.workspaceId;

  const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
  if (!creds.ok) {
    return clientError('CLOUDFLARE_CREDENTIALS_MISSING', 'Add a Cloudflare API token for this workspace first.', 400);
  }

  const resolvedAccountId = accountId || creds.account_id;
  if (!resolvedAccountId) {
    return clientError('CLOUDFLARE_ACCOUNT_ID_REQUIRED', 'Cloudflare Account ID is required.', 400);
  }

  const out = await customerCloudflareSelectWorkspaceResource(env, {
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    account_id: resolvedAccountId,
    database_id: databaseId,
    display_name: displayName || databaseId,
  });

  return jsonResponse({
    ok: true,
    binding_id: out.binding_id,
    database_id: databaseId,
    account_id_mask: maskAccountId(resolvedAccountId),
    workspace_id: workspaceId,
  });
}

/**
 * @returns {Promise<Response|null>}
 */
export async function handleSettingsKeysApi(request, env, ctx, authUser, url, pathLower, method) {
  void ctx;
  const keysPath = normalizeKeysPath(pathLower);
  if (!keysPath.startsWith('/api/settings/keys')) return null;

  if (keysPath === '/api/settings/keys/validate' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return validateKeysRequest(env, authUser, request, body, null);
  }

  if (keysPath === '/api/settings/keys' && method === 'GET') {
    return listApiKeys(request, env, authUser, url);
  }

  if (keysPath === '/api/settings/keys' && method === 'POST') {
    return createApiKey(env, authUser, request);
  }

  if (keysPath === '/api/settings/keys/audit' && method === 'GET') {
    return auditApiKeys(request, env, authUser, url);
  }

  if (keysPath === '/api/settings/keys/cloudflare/d1' && method === 'GET') {
    return listCloudflareD1Databases(env, authUser, request, url);
  }

  if (keysPath === '/api/settings/keys/cloudflare/zones' && method === 'GET') {
    return listCloudflareZones(env, authUser, request);
  }

  if (keysPath === '/api/settings/keys/cloudflare/d1/select' && method === 'POST') {
    return selectCloudflareD1Database(env, authUser, request);
  }

  const validateIdMatch = keysPath.match(/^\/api\/settings\/keys\/([^/]+)\/validate$/);
  if (validateIdMatch && method === 'POST') {
    const id = decodeURIComponent(validateIdMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    const body = await request.json().catch(() => ({}));
    return validateKeysRequest(env, authUser, request, body, id);
  }

  const revealMatch = keysPath.match(/^\/api\/settings\/keys\/([^/]+)\/reveal$/);
  if (revealMatch && method === 'POST') {
    const id = decodeURIComponent(revealMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    return revealKey(env, authUser, request, id);
  }

  const rotateMatch = keysPath.match(/^\/api\/settings\/keys\/([^/]+)\/rotate$/);
  if (rotateMatch && method === 'POST') {
    const id = decodeURIComponent(rotateMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    return rotateApiKey(env, authUser, request, id);
  }

  const idMatch = keysPath.match(/^\/api\/settings\/keys\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    if (method === 'PATCH') return patchApiKey(env, authUser, request, id);
    if (method === 'DELETE') return revokeApiKey(env, authUser, request, id);
  }

  return null;
}

/** @deprecated alias — use handleSettingsKeysApi */
export const handleSettingsApiKeysApi = handleSettingsKeysApi;

