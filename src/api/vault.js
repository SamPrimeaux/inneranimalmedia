/**
 * API Layer: Vault — Encrypted Secret Management
 * AES-GCM encryption via VAULT_MASTER_KEY secret.
 * Tables: user_secrets, secret_audit_log, env_secrets
 */
import { jsonResponse }   from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv } from '../core/auth.js';

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

async function vaultGetKey(masterKeyB64) {
  const raw = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function vaultEncrypt(plaintext, masterKeyB64) {
  const key      = await vaultGetKey(masterKeyB64);
  const iv       = crypto.getRandomValues(new Uint8Array(12));
  const encoded  = new TextEncoder().encode(plaintext);
  const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function vaultDecrypt(encryptedB64, masterKeyB64) {
  const key      = await vaultGetKey(masterKeyB64);
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv       = combined.slice(0, 12);
  const cipher   = combined.slice(12);
  const plain    = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

function last4(str) { return str ? str.slice(-4) : '????'; }
function newId(prefix = 'sec') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ─── Audit ────────────────────────────────────────────────────────────────────

async function writeAudit(env, { secret_id, event_type, triggered_by, previous_last4, new_last4, notes, request }) {
  const id = `saudit_${Math.random().toString(36).slice(2, 14)}`;
  const ip = request?.headers?.get('CF-Connecting-IP') || null;
  const ua = request?.headers?.get('User-Agent')?.slice(0, 200) || null;
  await env.DB.prepare(
    `INSERT INTO secret_audit_log (id, secret_id, event_type, triggered_by, previous_last4, new_last4, notes, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(id, secret_id, event_type, triggered_by || tenantIdFromEnv(env), previous_last4 || null, new_last4 || null, notes || null, ip, ua).run();
}

// ─── Secret CRUD ──────────────────────────────────────────────────────────────

async function vaultCreateSecret(request, env) {
  const body = await request.json().catch(() => ({}));
  const { secret_name, secret_value, service_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  if (!secret_name || !secret_value) return jsonResponse({ error: 'secret_name and secret_value are required' }, 400);

  const tid = tenantIdFromEnv(env);
  if (!tid) return jsonResponse({ error: 'TENANT_ID not configured' }, 503);

  const encrypted = await vaultEncrypt(secret_value, env.VAULT_MASTER_KEY);
  const id        = newId('sec');
  const last4val  = last4(secret_value);

  await env.DB.prepare(
    `INSERT INTO user_secrets
     (id, user_id, tenant_id, secret_name, secret_value_encrypted, service_name, description,
      project_label, project_id, tags, scopes_json, metadata_json, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id, tid, tid, secret_name, encrypted, service_name || null, description || null,
    project_label || null, project_id || null, tags || null,
    scopes_json ? JSON.stringify(scopes_json) : '[]',
    JSON.stringify({ last4: last4val }),
    expires_at || null
  ).run();

  await writeAudit(env, { secret_id: id, event_type: 'created', new_last4: last4val, notes: `Created for service: ${service_name || 'unspecified'}`, request });
  return jsonResponse({ success: true, id, last4: last4val });
}

async function vaultListSecrets(request, env) {
  const url     = new URL(request.url);
  const project = url.searchParams.get('project');
  const tid     = tenantIdFromEnv(env);
  const params  = [tid];
  let query     = `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE user_id = ?`;
  if (project) { query += ` AND project_label = ?`; params.push(project); }
  query += ` ORDER BY project_label ASC, service_name ASC, secret_name ASC`;
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ secrets: results || [] });
}

async function vaultGetSecret(id, env) {
  const row = await env.DB.prepare(
    `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE id = ? AND user_id = ?`
  ).bind(id, tenantIdFromEnv(env)).first();
  if (!row) return jsonResponse({ error: 'Secret not found' }, 404);
  return jsonResponse(row);
}

async function vaultRevealSecret(id, eventType, request, env) {
  const row = await env.DB.prepare(
    `SELECT * FROM user_secrets WHERE id = ? AND user_id = ? AND is_active = 1`
  ).bind(id, tenantIdFromEnv(env)).first();
  if (!row) return jsonResponse({ error: 'Secret not found or inactive' }, 404);

  let plaintext;
  try { plaintext = await vaultDecrypt(row.secret_value_encrypted, env.VAULT_MASTER_KEY); }
  catch { return jsonResponse({ error: 'Decryption failed — master key may have changed' }, 500); }

  await env.DB.prepare(
    `UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = usage_count + 1, updated_at = unixepoch() WHERE id = ?`
  ).bind(id).run();
  await writeAudit(env, { secret_id: id, event_type: eventType, notes: `Secret ${eventType} for ${row.service_name || 'unknown'}`, request });
  return jsonResponse({ value: plaintext });
}

async function vaultEditSecret(id, request, env) {
  const body = await request.json().catch(() => ({}));
  const existing = await env.DB.prepare(`SELECT id FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, tenantIdFromEnv(env)).first();
  if (!existing) return jsonResponse({ error: 'Secret not found' }, 404);

  const { secret_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  await env.DB.prepare(
    `UPDATE user_secrets SET
       secret_name   = COALESCE(?, secret_name),
       description   = COALESCE(?, description),
       project_label = COALESCE(?, project_label),
       project_id    = COALESCE(?, project_id),
       tags          = COALESCE(?, tags),
       scopes_json   = COALESCE(?, scopes_json),
       expires_at    = COALESCE(?, expires_at),
       updated_at    = unixepoch()
     WHERE id = ?`
  ).bind(secret_name || null, description || null, project_label || null, project_id || null, tags || null, scopes_json ? JSON.stringify(scopes_json) : null, expires_at || null, id).run();

  await writeAudit(env, { secret_id: id, event_type: 'edited', notes: 'Metadata updated', request });
  return jsonResponse({ success: true });
}

async function vaultRotateSecret(id, request, env) {
  const body = await request.json().catch(() => ({}));
  const { new_value } = body;
  if (!new_value) return jsonResponse({ error: 'new_value is required' }, 400);

  const existing = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, tenantIdFromEnv(env)).first();
  if (!existing) return jsonResponse({ error: 'Secret not found' }, 404);

  let oldLast4 = '????';
  try { const old = await vaultDecrypt(existing.secret_value_encrypted, env.VAULT_MASTER_KEY); oldLast4 = last4(old); } catch (_) {}

  const newEncrypted = await vaultEncrypt(new_value, env.VAULT_MASTER_KEY);
  const newLast4val  = last4(new_value);

  await env.DB.prepare(
    `UPDATE user_secrets SET secret_value_encrypted = ?, metadata_json = ?, updated_at = unixepoch() WHERE id = ?`
  ).bind(newEncrypted, JSON.stringify({ ...JSON.parse(existing.metadata_json || '{}'), last4: newLast4val }), id).run();

  await writeAudit(env, { secret_id: id, event_type: 'rotated', previous_last4: oldLast4, new_last4: newLast4val, notes: 'Secret rotated', request });
  return jsonResponse({ success: true, new_last4: newLast4val });
}

async function vaultRevokeSecret(id, request, env) {
  const existing = await env.DB.prepare(`SELECT id FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, tenantIdFromEnv(env)).first();
  if (!existing) return jsonResponse({ error: 'Secret not found' }, 404);
  await env.DB.prepare(`UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await writeAudit(env, { secret_id: id, event_type: 'revoked', notes: 'Secret revoked', request });
  return jsonResponse({ success: true });
}

async function vaultGetSecretAudit(id, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM secret_audit_log WHERE secret_id = ? ORDER BY created_at DESC LIMIT 100`
  ).bind(id).all();
  return jsonResponse({ audit: results || [] });
}

async function vaultListProjects(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT project_label, project_id, COUNT(*) AS secret_count FROM user_secrets WHERE user_id = ? AND project_label IS NOT NULL AND is_active = 1 GROUP BY project_label ORDER BY project_label ASC`
  ).bind(tenantIdFromEnv(env)).all();
  return jsonResponse({ projects: results || [] });
}

async function vaultFullAudit(request, env) {
  const url       = new URL(request.url);
  const eventType = url.searchParams.get('event_type') || '';
  const since     = url.searchParams.get('since');
  const limit     = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
  const allowed   = ['created','viewed','copied','edited','rotated','revoked'];

  let query  = `SELECT sal.*, us.secret_name, us.service_name, us.project_label FROM secret_audit_log sal LEFT JOIN user_secrets us ON sal.secret_id = us.id WHERE us.user_id = ?`;
  const params = [tenantIdFromEnv(env)];

  if (eventType && allowed.includes(eventType)) { query += ` AND sal.event_type = ?`; params.push(eventType); }
  if (since && /^\d+$/.test(since))             { query += ` AND sal.created_at >= ?`; params.push(since); }
  query += ` ORDER BY sal.created_at DESC LIMIT ?`;
  params.push(limit);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse({ audit: results || [], filters: { event_type: eventType || null, since: since || null, limit } });
}

// ─── Vault Secret Loader (used by worker.js / hooks.js) ──────────────────────

/**
 * Load all active vault secrets from env_secrets D1 table into a plain object.
 * Used as a resolveSecret() source in webhook signature verification.
 * Returns empty object on any failure — never throws.
 */
export async function getVaultSecrets(env) {
  try {
    if (!env.VAULT_KEY || !env.DB) return {};

    async function importKey(b64) {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    }

    async function decryptRow(encB64, ivB64) {
      const key   = await importKey(env.VAULT_KEY);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(ivB64), c => c.charCodeAt(0)) },
        key,
        Uint8Array.from(atob(encB64), c => c.charCodeAt(0))
      );
      return new TextDecoder().decode(plain);
    }

    const { results } = await env.DB.prepare(
      `SELECT key_name, encrypted_value, iv FROM env_secrets WHERE is_active = 1`
    ).all();

    const secrets = {};
    for (const row of results || []) {
      try { secrets[row.key_name] = await decryptRow(row.encrypted_value, row.iv); } catch (_) {}
    }
    return secrets;
  } catch (_) {
    return {};
  }
}

// ─── Registry (static manifest) ──────────────────────────────────────────────

function vaultRegistry() {
  return jsonResponse({
    secrets: [
      { name: 'ANTHROPIC_API_KEY',         type: 'secret',    description: 'Claude API' },
      { name: 'CLOUDFLARE_API_TOKEN',       type: 'secret',    description: 'Workers, R2, D1, API' },
      { name: 'DEPLOY_TRACKING_TOKEN',      type: 'secret',    description: 'Deploy webhooks' },
      { name: 'GEMINI_API_KEY',             type: 'secret',    description: 'Google Gemini API' },
      { name: 'GITHUB_TOKEN',               type: 'secret',    description: 'GitHub PAT' },
      { name: 'GITHUB_WEBHOOK_SECRET',      type: 'secret',    description: 'GitHub webhook HMAC' },
      { name: 'GOOGLE_AI_API_KEY',          type: 'secret',    description: 'Google AI API' },
      { name: 'GOOGLE_SERVICE_ACCOUNT_JSON',type: 'secret',    description: 'Vertex AI / GCP auth' },
      { name: 'INTERNAL_API_SECRET',        type: 'secret',    description: 'Internal API routes' },
      { name: 'INTERNAL_WEBHOOK_SECRET',    type: 'secret',    description: '/api/webhooks/internal HMAC' },
      { name: 'INGEST_SECRET',              type: 'secret',    description: 'RAG ingest bypass' },
      { name: 'MCP_AUTH_TOKEN',             type: 'secret',    description: 'MCP server auth' },
      { name: 'OPENAI_API_KEY',             type: 'secret',    description: 'OpenAI API' },
      { name: 'OPENAI_WEBHOOK_SECRET',      type: 'secret',    description: 'OpenAI webhooks HMAC' },
      { name: 'PTY_AUTH_TOKEN',             type: 'secret',    description: 'PTY / terminal' },
      { name: 'R2_ACCESS_KEY_ID',           type: 'secret',    description: 'R2 storage' },
      { name: 'R2_SECRET_ACCESS_KEY',       type: 'secret',    description: 'R2 storage' },
      { name: 'RESEND_API_KEY',             type: 'secret',    description: 'Transactional email' },
      { name: 'RESEND_WEBHOOK_SECRET',      type: 'secret',    description: 'Resend webhooks HMAC' },
      { name: 'STRIPE_WEBHOOK_SECRET',      type: 'secret',    description: 'Stripe webhooks HMAC' },
      { name: 'SUPABASE_SERVICE_ROLE_KEY',  type: 'secret',    description: 'Supabase admin' },
      { name: 'TERMINAL_SECRET',            type: 'secret',    description: 'Terminal auth' },
      { name: 'TERMINAL_WS_URL',            type: 'secret',    description: 'Terminal WebSocket URL' },
      { name: 'VAULT_KEY',                  type: 'secret',    description: 'env_secrets decryption' },
      { name: 'VAULT_MASTER_KEY',           type: 'secret',    description: 'user_secrets AES-GCM key' },
    ],
  });
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleVaultApi(request, env) {
  if (!env.VAULT_MASTER_KEY) {
    return jsonResponse({ error: 'VAULT_MASTER_KEY not configured' }, 500);
  }

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/vault/registry' && method === 'GET') return vaultRegistry();
  if (path === '/api/vault/projects'  && method === 'GET') return vaultListProjects(env);
  if (path === '/api/vault/audit'     && method === 'GET') return vaultFullAudit(request, env);

  if (path === '/api/vault/secrets') {
    if (method === 'GET')  return vaultListSecrets(request, env);
    if (method === 'POST') return vaultCreateSecret(request, env);
  }

  const secretMatch = path.match(/^\/api\/vault\/secrets\/([^/]+)(\/(.+))?$/);
  if (secretMatch) {
    const id     = secretMatch[1];
    const action = secretMatch[3];
    if (action === 'reveal' && method === 'POST') return vaultRevealSecret(id, 'viewed',  request, env);
    if (action === 'copy'   && method === 'POST') return vaultRevealSecret(id, 'copied',  request, env);
    if (action === 'rotate' && method === 'POST') return vaultRotateSecret(id, request, env);
    if (action === 'audit'  && method === 'GET')  return vaultGetSecretAudit(id, env);
    if (!action && method === 'GET')    return vaultGetSecret(id, env);
    if (!action && method === 'PUT')    return vaultEditSecret(id, request, env);
    if (!action && method === 'DELETE') return vaultRevokeSecret(id, request, env);
  }

  return jsonResponse({ error: 'Vault route not found' }, 404);
}
