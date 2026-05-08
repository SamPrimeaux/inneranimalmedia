/**
 * Settings-scoped API key management: /api/settings/api-keys*
 *
 * Hard rules:
 * - Store secret material only in encrypted `user_secrets`.
 * - Treat `vault_secret_id` as an internal pointer only (never returned).
 * - Never return: raw key, encrypted key, vault_secret_id, user_secrets id, hashes, auth headers.
 * - Scope every operation by authenticated user + tenant_id (when available) + workspace_id.
 * - Schema drift safety: probe columns via PRAGMA and omit missing fields.
 */
import { jsonResponse, fetchAuthUserTenantId, fallbackSystemTenantId, getSession } from '../core/auth.js';
import { logSecretAudit } from '../core/security-scan.js';
import { encryptApiKeyForStorage } from './provisioning.js';
import { userCanAccessWorkspace } from '../core/cms-theme-resolve.js';

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

function toSafeItem(row, cols) {
  const lastFour =
    row?.last_four != null && String(row.last_four).trim() !== ''
      ? String(row.last_four).trim()
      : row?.key_preview
        ? String(row.key_preview).slice(-4)
        : '????';

  return {
    id: row.id,
    workspace_id: has(cols, 'workspace_id') ? row.workspace_id ?? null : null,
    provider: row.provider ?? null,
    label:
      row.label ??
      row.key_name ??
      null,
    status: row.status ?? 'active',
    scope: row.scope ?? 'workspace',
    last_four: lastFour,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    last_used_at: has(cols, 'last_used_at') ? row.last_used_at ?? null : null,
    rotated_at: has(cols, 'rotated_at') ? row.rotated_at ?? null : null,
    expires_at: has(cols, 'expires_at') ? row.expires_at ?? null : null,
  };
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
    has(cols, 'last_four') ? 'last_four' : has(cols, 'key_preview') ? 'key_preview AS last_four' : 'NULL AS last_four',
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
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);

  const cols = await tableColumns(db, 'user_api_keys');
  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const workspaceId = wsRes.workspaceId;

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

  const select = [
    'id',
    has(cols, 'workspace_id') ? 'workspace_id' : 'NULL AS workspace_id',
    has(cols, 'provider') ? 'provider' : 'NULL AS provider',
    has(cols, 'label') ? 'label' : has(cols, 'key_name') ? 'key_name AS label' : 'NULL AS label',
    has(cols, 'status') ? 'status' : `'active' AS status`,
    has(cols, 'scope') ? 'scope' : `'workspace' AS scope`,
    has(cols, 'last_four') ? 'last_four' : 'NULL AS last_four',
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
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);

  const cols = await tableColumns(db, 'user_api_keys');
  const sCols = await tableColumns(db, 'user_secrets');
  const body = await request.json().catch(() => ({}));

  const provider = String(body.provider || '').trim().toLowerCase();
  const label = String(body.label || '').trim();
  const api_key = String(body.api_key || '').trim();
  const scope = String(body.scope || 'workspace').trim().toLowerCase();
  const workspaceId = wsRes.workspaceId;
  const expires_at = body.expires_at ?? null;
  const metadata = body.metadata ?? null;

  if (!PROVIDERS.has(provider)) return jsonResponse({ error: 'Invalid provider' }, 400);
  if (!label) return jsonResponse({ error: 'label required' }, 400);
  if (!api_key) return jsonResponse({ error: 'api_key required' }, 400);
  if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  if (!['user', 'workspace'].includes(scope)) return jsonResponse({ error: 'scope must be user or workspace' }, 400);

  const tenantId = await resolveTenantIdOrFetch(env, authUser);
  const userId = String(authUser?.id || '').trim();
  const last_four = lastFourOfKey(api_key);

  // Encrypt via existing helper (Cloudflare-safe)
  const encrypted = await encryptApiKeyForStorage(env, api_key);

  const vaultSecretId = newId('sec'); // internal pointer only; stored in user_api_keys, never returned
  const keyRowId = newId('uak');

  // Insert encrypted secret first
  try {
    const secretFields = [
      ['id', vaultSecretId],
      ['user_id', userId],
      ['tenant_id', tenantId],
      ['workspace_id', workspaceId],
      ['secret_name', `api_key:${provider}:${keyRowId}`],
      ['secret_value_encrypted', encrypted],
      ['service_name', provider],
      ['description', label],
      ['project_label', 'user_api_keys'],
      ['metadata_json', JSON.stringify({ api_key_id: keyRowId, provider, label, last_four })],
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
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  // Insert metadata row
  try {
    const metaJson = metadata != null ? JSON.stringify(metadata) : null;

    const fields = [
      ['id', keyRowId],
      ['tenant_id', tenantId],
      ['user_id', userId],
      ['workspace_id', workspaceId],
      ['provider', provider],
      ['label', label],
      ['status', 'active'],
      ['scope', scope],
      ['last_four', last_four],
      ['vault_secret_id', vaultSecretId],
      ['expires_at', expires_at],
      ['metadata_json', metaJson],
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

    await logSecretAudit(env, {
      secretId: keyRowId,
      tenantId,
      userId,
      eventType: 'created',
      triggeredBy: 'dashboard_ui',
      newLast4: last_four,
      notes: `Created API key (${provider})`,
      ipAddress: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      secretSource: 'user_api_keys',
    });
  } catch (e) {
    // Best-effort rollback secret row so we don't orphan it.
    try {
      await db.prepare(`UPDATE user_secrets SET is_active = 0 WHERE id = ?`).bind(vaultSecretId).run();
    } catch {}
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  const { row } = await loadApiKeyRowScoped(env, authUser, keyRowId, workspaceId);
  if (!row) return jsonResponse({ error: 'Created but could not re-load row' }, 500);
  return jsonResponse(toSafeItem(row, cols));
}

async function patchApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return jsonResponse({ error: 'Not found' }, 404);

  const updates = [];
  const binds = [];

  if (body.label != null && has(cols, 'label')) {
    updates.push('label = ?');
    binds.push(String(body.label).trim());
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

  if (!updates.length) return jsonResponse(toSafeItem(row, cols));

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
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  const re = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!re.row) return jsonResponse({ error: 'Updated but could not re-load row' }, 500);
  return jsonResponse(toSafeItem(re.row, cols));
}

async function rotateApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return jsonResponse({ error: 'Not found' }, 404);

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
    if (has(cols, 'rotated_at')) {
      updates.push('rotated_at = ?');
      binds.push(nowIso());
    }
    if (has(cols, 'updated_at')) {
      updates.push('updated_at = ?');
      binds.push(nowIso());
    }
    if (!updates.length) return jsonResponse({ error: 'Schema missing last_four/rotated_at/updated_at' }, 500);

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

    await logSecretAudit(env, {
      secretId: id,
      tenantId,
      userId,
      eventType: 'rotated',
      triggeredBy: 'dashboard_ui',
      previousLast4,
      newLast4,
      notes: 'Rotated API key',
      ipAddress: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      secretSource: 'user_api_keys',
    });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  const re = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!re.row) return jsonResponse({ error: 'Rotated but could not re-load row' }, 500);
  return jsonResponse(toSafeItem(re.row, cols));
}

async function revokeApiKey(env, authUser, request, id) {
  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  const db = env.DB;
  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);
  const workspaceId = wsRes.workspaceId;

  const { row, cols, tenantId, userId } = await loadApiKeyRowScoped(env, authUser, id, workspaceId);
  if (!row) return jsonResponse({ error: 'Not found' }, 404);

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

    await logSecretAudit(env, {
      secretId: id,
      tenantId,
      userId,
      eventType: 'revoked',
      triggeredBy: 'dashboard_ui',
      previousLast4,
      notes: 'Revoked API key',
      ipAddress: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      secretSource: 'user_api_keys',
    });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e) }, 500);
  }

  return jsonResponse({ ok: true });
}

async function auditApiKeys(request, env, authUser, url) {
  if (!env?.DB) return jsonResponse({ items: [], limit: 50, offset: 0 });
  const db = env.DB;

  if (!(await tableExists(db, 'secret_audit_log'))) {
    return jsonResponse({ items: [], limit: 50, offset: 0 });
  }

  const wsRes = await assertWorkspaceAccess(env, request, authUser);
  if (wsRes.error) return jsonResponse({ error: wsRes.error }, wsRes.error === 'Forbidden' ? 403 : 400);

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

/**
 * @returns {Promise<Response|null>}
 */
export async function handleSettingsApiKeysApi(request, env, ctx, authUser, url, pathLower, method) {
  void ctx;
  if (!pathLower.startsWith('/api/settings/api-keys')) return null;

  if (pathLower === '/api/settings/api-keys' && method === 'GET') {
    return listApiKeys(request, env, authUser, url);
  }

  if (pathLower === '/api/settings/api-keys' && method === 'POST') {
    return createApiKey(env, authUser, request);
  }

  if (pathLower === '/api/settings/api-keys/audit' && method === 'GET') {
    return auditApiKeys(request, env, authUser, url);
  }

  const idMatch = pathLower.match(/^\/api\/settings\/api-keys\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    if (method === 'PATCH') return patchApiKey(env, authUser, request, id);
    if (method === 'DELETE') return revokeApiKey(env, authUser, request, id);
  }

  const rotateMatch = pathLower.match(/^\/api\/settings\/api-keys\/([^/]+)\/rotate$/);
  if (rotateMatch && method === 'POST') {
    const id = decodeURIComponent(rotateMatch[1] || '').trim();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    return rotateApiKey(env, authUser, request, id);
  }

  return null;
}

