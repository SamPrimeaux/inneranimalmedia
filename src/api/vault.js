import { jsonResponse } from '../core/responses.js';
import { getAuthUser, fetchAuthUserTenantId } from '../core/auth.js';
import { getAESKey, aesGcmEncryptToB64, aesGcmDecryptFromB64 } from '../core/crypto-vault.js';

const LLM_VAULT_PROJECT = 'iam_user_llm_keys';
const LLM_ALLOWED_NAMES = new Set(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']);

async function resolveUserTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return null;
}

function vaultJson(data, status = 200) {
  return jsonResponse(data, status);
}

function vaultErr(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function vaultEncrypt(env, plaintext) {
  const key = await getAESKey(env, ['encrypt']);
  return aesGcmEncryptToB64(plaintext, key);
}

async function vaultDecrypt(env, encryptedB64) {
  const key = await getAESKey(env, ['decrypt']);
  return aesGcmDecryptFromB64(encryptedB64, key);
}

function vaultLast4(str) {
  return str ? str.slice(-4) : '????';
}

function vaultNewId(prefix = 'sec') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function vaultWriteAudit(db, { secret_id, event_type, triggered_by, previous_last4, new_last4, notes, request }) {
  const id = `saudit_${Math.random().toString(36).slice(2, 14)}`;
  const ip = request?.headers?.get('CF-Connecting-IP') || null;
  const ua = request?.headers?.get('User-Agent')?.slice(0, 200) || null;
  await db.prepare(
    `INSERT INTO secret_audit_log (id, secret_id, event_type, triggered_by, previous_last4, new_last4, notes, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(id, secret_id, event_type, triggered_by || null, previous_last4 || null, new_last4 || null, notes || null, ip, ua).run();
}

async function vaultCreateSecret(request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  if (!uid) return vaultErr('Unauthorized', 401);
  const body = await request.json();
  const { secret_name, secret_value, service_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  if (!secret_name || !secret_value) return vaultErr('secret_name and secret_value are required');
  const encrypted = await vaultEncrypt(env, secret_value);
  const id = vaultNewId('sec');
  const last4val = vaultLast4(secret_value);
  const metadata = JSON.stringify({ last4: last4val });
  const tid = await resolveUserTenantId(env, authUser);
  if (!tid) return vaultErr('Tenant not configured for this account', 503);
  await env.DB.prepare(
    `INSERT INTO user_secrets (id, user_id, tenant_id, secret_name, secret_value_encrypted, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, uid, tid, secret_name, encrypted, service_name || null, description || null, project_label || null, project_id || null, tags || null, scopes_json ? JSON.stringify(scopes_json) : '[]', metadata, expires_at || null).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'created', triggered_by: uid, new_last4: last4val, notes: `Created for service: ${service_name || 'unspecified'}`, request });
  return vaultJson({ success: true, id, last4: last4val });
}

async function vaultListSecrets(request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  if (!uid) return vaultErr('Unauthorized', 401);
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  let query = `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE user_id = ?`;
  const params = [uid];
  if (project) { query += ` AND project_label = ?`; params.push(project); }
  query += ` ORDER BY project_label ASC, service_name ASC, secret_name ASC`;
  const result = await env.DB.prepare(query).bind(...params).all();
  return vaultJson({ secrets: result.results });
}

async function vaultGetSecret(id, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const row = await env.DB.prepare(
    `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE id = ? AND user_id = ?`
  ).bind(id, uid).first();
  if (!row) return vaultErr('Secret not found', 404);
  return vaultJson(row);
}

async function vaultRevealSecret(id, eventType, request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const row = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ? AND is_active = 1`).bind(id, uid).first();
  if (!row) return vaultErr('Secret not found or inactive', 404);
  let plaintext;
  try {
    plaintext = await vaultDecrypt(env, row.secret_value_encrypted);
  } catch {
    return vaultErr('Decryption failed — master key may have changed', 500);
  }
  await env.DB.prepare(`UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = usage_count + 1, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: eventType, notes: `Secret ${eventType} for ${row.service_name || 'unknown service'}`, request });
  return vaultJson({ value: plaintext });
}

async function vaultEditSecret(id, request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const body = await request.json();
  const { secret_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  const existing = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!existing) return vaultErr('Secret not found', 404);
  await env.DB.prepare(
    `UPDATE user_secrets SET secret_name = COALESCE(?, secret_name), description = COALESCE(?, description), project_label = COALESCE(?, project_label), project_id = COALESCE(?, project_id), tags = COALESCE(?, tags), scopes_json = COALESCE(?, scopes_json), expires_at = COALESCE(?, expires_at), updated_at = unixepoch() WHERE id = ?`
  ).bind(secret_name || null, description || null, project_label || null, project_id || null, tags || null, scopes_json ? JSON.stringify(scopes_json) : null, expires_at || null, id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'edited', notes: 'Metadata updated', request });
  return vaultJson({ success: true });
}

async function vaultRotateSecret(id, request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const body = await request.json();
  const { new_value } = body;
  if (!new_value) return vaultErr('new_value is required');
  const existing = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!existing) return vaultErr('Secret not found', 404);
  let oldLast4 = '????';
  try {
    const oldPlain = await vaultDecrypt(env, existing.secret_value_encrypted);
    oldLast4 = vaultLast4(oldPlain);
  } catch { }
  const newEncrypted = await vaultEncrypt(env, new_value);
  const newLast4 = vaultLast4(new_value);
  const newMeta = JSON.stringify({ ...JSON.parse(existing.metadata_json || '{}'), last4: newLast4 });
  await env.DB.prepare(`UPDATE user_secrets SET secret_value_encrypted = ?, metadata_json = ?, updated_at = unixepoch() WHERE id = ?`).bind(newEncrypted, newMeta, id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'rotated', previous_last4: oldLast4, new_last4: newLast4, notes: 'Secret rotated', request });
  return vaultJson({ success: true, new_last4: newLast4 });
}

async function vaultRevokeSecret(id, env, request, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const existing = await env.DB.prepare(`SELECT id FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, uid).first();
  if (!existing) return vaultErr('Secret not found', 404);
  await env.DB.prepare(`UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'revoked', notes: 'Secret revoked', request });
  return vaultJson({ success: true });
}

async function vaultGetSecretAudit(id, env) {
  const rows = await env.DB.prepare(`SELECT * FROM secret_audit_log WHERE secret_id = ? ORDER BY created_at DESC LIMIT 100`).bind(id).all();
  return vaultJson({ audit: rows.results });
}

async function vaultListProjects(env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const rows = await env.DB.prepare(
    `SELECT DISTINCT project_label, project_id, COUNT(*) as secret_count FROM user_secrets WHERE user_id = ? AND project_label IS NOT NULL AND is_active = 1 GROUP BY project_label ORDER BY project_label ASC`
  ).bind(uid).all();
  return vaultJson({ projects: rows.results });
}

async function vaultFullAudit(request, env, authUser) {
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const url = new URL(request.url);
  const eventType = url.searchParams.get('event_type') || '';
  const since = url.searchParams.get('since');
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
  let query = `SELECT sal.id, sal.secret_id, sal.event_type, sal.triggered_by, sal.previous_last4, sal.new_last4, sal.notes, sal.ip_address, sal.user_agent, sal.created_at, us.secret_name, us.service_name, us.project_label
     FROM secret_audit_log sal
     LEFT JOIN user_secrets us ON sal.secret_id = us.id
     WHERE us.user_id = ?`;
  const params = [uid];
  if (eventType && ['created', 'viewed', 'copied', 'edited', 'rotated', 'revoked'].includes(eventType)) {
    query += ` AND sal.event_type = ?`;
    params.push(eventType);
  }
  if (since && /^\d+$/.test(since)) {
    query += ` AND sal.created_at >= ?`;
    params.push(since);
  }
  query += ` ORDER BY sal.created_at DESC LIMIT ?`;
  params.push(limit);
  const rows = await env.DB.prepare(query).bind(...params).all();
  return vaultJson({ audit: rows.results || [], filters: { event_type: eventType || null, since: since || null, limit } });
}

function vaultRegistry() {
  const secrets = [
    { name: 'ANTHROPIC_API_KEY', type: 'secret', description: 'Claude API' },
    { name: 'CF_ACCESS_CLIENT_ID', type: 'secret', description: 'Zero Trust / Access' },
    { name: 'CF_ACCESS_CLIENT_SECRET', type: 'secret', description: 'Zero Trust / Access' },
    { name: 'CLOUDFLARE_ACCOUNT_ID', type: 'plaintext', description: 'Account ID' },
    { name: 'CLOUDFLARE_API_TOKEN', type: 'secret', description: 'Workers, R2, D1, API' },
    { name: 'CLOUDFLARE_IMAGES_ACCOUNT_HASH', type: 'plaintext', description: 'Images account hash' },
    { name: 'CLOUDFLARE_IMAGES_TOKEN', type: 'secret', description: 'Images API' },
    { name: 'CLOUDFLARE_STREAM_TOKEN', type: 'secret', description: 'Stream API' },
    { name: 'DEPLOY_HOOK_SECRET', type: 'secret', description: 'Deploy webhooks' },
    { name: 'GITHUB_CLIENT_ID', type: 'plaintext', description: 'GitHub OAuth' },
    { name: 'GITHUB_CLIENT_SECRET', type: 'secret', description: 'GitHub OAuth' },
    { name: 'GITHUB_TOKEN', type: 'secret', description: 'GitHub PAT for github_repos / github_file (preferred over per-user OAuth when set)' },
    { name: 'GOOGLE_AI_API_KEY', type: 'secret', description: 'Google AI' },
    { name: 'GOOGLE_CLIENT_ID', type: 'plaintext', description: 'Google OAuth' },
    { name: 'GOOGLE_CLIENT_SECRET', type: 'secret', description: 'Google OAuth' },
    { name: 'GOOGLE_OAUTH_CLIENT_SECRET', type: 'secret', description: 'Google OAuth (alternate)' },
    { name: 'INTERNAL_API_SECRET', type: 'secret', description: 'Internal APIs (post-deploy, X-Internal-Secret, admin routes)' },
    { name: 'INGEST_SECRET', type: 'secret', description: 'X-Ingest-Secret bypass for /api/rag/ingest, /api/rag/query, /api/rag/feedback (MCP)' },
    { name: 'INTERNAL_WEBHOOK_SECRET', type: 'secret', description: '/api/webhooks/internal X-IAM-Signature HMAC' },
    { name: 'MCP_AUTH_TOKEN', type: 'secret', description: 'MCP server auth' },
    { name: 'OPENAI_API_KEY', type: 'secret', description: 'OpenAI API' },
    { name: 'OPENAI_WEBHOOK_SECRET', type: 'secret', description: 'OpenAI webhooks (X-OpenAI-Signature HMAC)' },
    { name: 'PTY_AUTH_TOKEN', type: 'secret', description: 'PTY / terminal' },
    { name: 'R2_ACCESS_KEY_ID', type: 'secret', description: 'R2 storage' },
    { name: 'R2_SECRET_ACCESS_KEY', type: 'secret', description: 'R2 storage' },
    { name: 'RESEND_API_KEY', type: 'secret', description: 'Transactional email' },
    { name: 'TERMINAL_SECRET', type: 'secret', description: 'Terminal auth' },
    { name: 'TERMINAL_WS_URL', type: 'secret', description: 'Terminal WebSocket URL' },
    { name: 'VAULT_MASTER_KEY', type: 'secret', description: 'Vault encryption' },
  ];
  const domains = [
    { type: 'workers.dev', value: 'inneranimalmedia.meauxbility.workers.dev', description: 'Preview URLs: *-inneranimalmedia.meauxbility.workers.dev' },
    { type: 'route', value: 'inneranimalmedia.com/*', description: 'Route' },
    { type: 'route', value: 'www.inneranimalmedia.com/*', description: 'Route' },
    { type: 'route', value: 'webhooks.inneranimalmedia.com/*', description: 'Route' },
    { type: 'custom_domain', value: 'inneranimalmedia.com', description: 'Custom domain' },
    { type: 'custom_domain', value: 'www.inneranimalmedia.com', description: 'Custom domain' },
    { type: 'custom_domain', value: 'webhooks.inneranimalmedia.com', description: 'Custom domain' },
  ];
  return vaultJson({ secrets, domains });
}

async function vaultStoreUserKey(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return vaultErr('Unauthorized', 401);
  const body = await request.json().catch(() => ({}));
  const keyName = String(body.key_name || body.secret_name || '').trim();
  const value = String(body.value ?? body.secret_value ?? '');
  if (!keyName || !value) return vaultErr('key_name and value are required', 400);
  if (!LLM_ALLOWED_NAMES.has(keyName)) return vaultErr('key_name must be one of OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY', 400);
  const tenantId = await resolveUserTenantId(env, authUser);
  if (!tenantId) return vaultErr('Tenant could not be resolved', 403);
  const encrypted = await vaultEncrypt(value, env.VAULT_MASTER_KEY);
  const last4val = vaultLast4(value);
  const metadata = JSON.stringify({ last4: last4val });
  const uid = String(authUser.id || '').trim();
  if (!uid) return vaultErr('Invalid session', 401);

  const existing = await env.DB.prepare(
    `SELECT id FROM user_secrets WHERE user_id = ? AND secret_name = ? AND project_label = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(uid, keyName, LLM_VAULT_PROJECT)
    .first();

  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE user_secrets SET secret_value_encrypted = ?, metadata_json = ?, service_name = 'llm', updated_at = unixepoch() WHERE id = ?`,
    )
      .bind(encrypted, metadata, existing.id)
      .run();
    await vaultWriteAudit(env.DB, {
      secret_id: existing.id,
      event_type: 'rotated',
      new_last4: last4val,
      notes: `User LLM key updated: ${keyName}`,
      request,
      env,
    });
    return vaultJson({
      success: true,
      id: existing.id,
      key_name: keyName,
      masked: maskApiKeyPreview(value, last4val),
    });
  }

  const id = vaultNewId('sec');
  await env.DB.prepare(
    `INSERT INTO user_secrets (id, user_id, tenant_id, secret_name, secret_value_encrypted, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, 'llm', NULL, ?, NULL, NULL, '[]', ?, NULL, 1)`,
  )
    .bind(id, uid, tenantId, keyName, encrypted, LLM_VAULT_PROJECT, metadata)
    .run();
  await vaultWriteAudit(env.DB, {
    secret_id: id,
    event_type: 'created',
    new_last4: last4val,
    notes: `User LLM key stored: ${keyName}`,
    request,
    env,
  });
  return vaultJson({
    success: true,
    id,
    key_name: keyName,
    masked: maskApiKeyPreview(value, last4val),
  });
}

function maskApiKeyPreview(plain, last4) {
  const l4 = last4 || '????';
  const p = String(plain || '');
  if (!p) return `stored…${l4}`;
  if (p.startsWith('sk-ant')) return `sk-ant-...${l4}`;
  if (p.startsWith('sk-')) return `sk-...${l4}`;
  if (p.length > 8) return `${p.slice(0, 4)}...${l4}`;
  return `••••${l4}`;
}

async function vaultListUserLlmKeys(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const { results } = await env.DB.prepare(
    `SELECT id, secret_name, metadata_json, is_active, created_at, updated_at
     FROM user_secrets WHERE user_id = ? AND project_label = ? AND is_active = 1
     ORDER BY secret_name ASC`,
  )
    .bind(uid, LLM_VAULT_PROJECT)
    .all();
  const rows = (results || []).map((r) => {
    let last4 = '????';
    try {
      const m = JSON.parse(r.metadata_json || '{}');
      if (m.last4) last4 = String(m.last4);
    } catch {
      /* ignore */
    }
    const kn = String(r.secret_name || '');
    const masked =
      kn === 'OPENAI_API_KEY'
        ? `sk-...${last4}`
        : kn === 'ANTHROPIC_API_KEY'
          ? `sk-ant-...${last4}`
          : kn === 'GEMINI_API_KEY'
            ? `AIza...${last4}`
            : `••••${last4}`;
    const provider =
      kn === 'OPENAI_API_KEY'
        ? 'OpenAI'
        : kn === 'ANTHROPIC_API_KEY'
          ? 'Anthropic'
          : kn === 'GEMINI_API_KEY'
            ? 'Gemini'
            : 'Other';
    return {
      id: r.id,
      key_name: kn,
      provider,
      masked,
      last4,
      created_at: r.created_at ?? null,
    };
  });
  return vaultJson({ keys: rows });
}

async function vaultDeleteUserLlmKey(request, env, id) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return vaultErr('Unauthorized', 401);
  const uid = String(authUser.id || '').trim();
  const row = await env.DB.prepare(
    `SELECT id FROM user_secrets WHERE id = ? AND user_id = ? AND project_label = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(id, uid, LLM_VAULT_PROJECT)
    .first();
  if (!row) return vaultErr('Not found', 404);
  await env.DB.prepare(`UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await vaultWriteAudit(env.DB, {
    secret_id: id,
    event_type: 'revoked',
    notes: 'User removed LLM API key',
    request,
    env,
  });
  return vaultJson({ success: true });
}

export async function handleVaultApi(request, urlIn, env, _ctx) {
  if (!env.VAULT_MASTER_KEY) return vaultErr('VAULT_MASTER_KEY not configured. Run: wrangler secret put VAULT_MASTER_KEY', 500);
  const url = urlIn instanceof URL ? urlIn : new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/vault/store' && method === 'POST') return vaultStoreUserKey(request, env);
  if (path === '/api/vault/llm-keys' && method === 'GET') return vaultListUserLlmKeys(request, env);
  const llmDel = path.match(/^\/api\/vault\/llm-keys\/([^/]+)$/);
  if (llmDel && method === 'DELETE') return vaultDeleteUserLlmKey(request, env, llmDel[1]);

  if (path === '/api/vault/registry' && method === 'GET') return vaultRegistry();

  const vaultAuthUser = await getAuthUser(request, env);
  if (path === '/api/vault/projects' && method === 'GET') return vaultListProjects(env, vaultAuthUser);
  if (path === '/api/vault/audit' && method === 'GET') return vaultFullAudit(request, env, vaultAuthUser);

  if (path === '/api/vault/secrets') {
    if (method === 'GET') return vaultListSecrets(request, env, vaultAuthUser);
    if (method === 'POST') return vaultCreateSecret(request, env, vaultAuthUser);
  }

  const secretMatch = path.match(/^\/api\/vault\/secrets\/([^/]+)(\/(.+))?$/);
  if (secretMatch) {
    const id = secretMatch[1];
    const action = secretMatch[3];
    if (action === 'reveal' && method === 'POST') return vaultRevealSecret(id, 'viewed', request, env, vaultAuthUser);
    if (action === 'copy' && method === 'POST') return vaultRevealSecret(id, 'copied', request, env, vaultAuthUser);
    if (action === 'rotate' && method === 'POST') return vaultRotateSecret(id, request, env, vaultAuthUser);
    if (action === 'audit' && method === 'GET') return vaultGetSecretAudit(id, env);
    if (!action && method === 'GET') return vaultGetSecret(id, env, vaultAuthUser);
    if (!action && method === 'PUT') return vaultEditSecret(id, request, env, vaultAuthUser);
    if (!action && method === 'DELETE') return vaultRevokeSecret(id, env, request, vaultAuthUser);
  }

  return vaultErr('Not found', 404);
}
