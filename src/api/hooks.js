/**
 * API Layer: Inbound Webhook Infrastructure
 * Handles signature verification, endpoint resolution, event storage,
 * and subscription action dispatch for all external webhook sources.
 *
 * Supported sources: github, stripe, cursor, resend, resend_inbound,
 *                    supabase, cloudflare, internal, openai
 *
 * Route: /api/webhooks/* and /api/hooks/* (aliases resolved internally)
 * Tables: webhook_endpoints, webhook_events, hook_subscriptions, hook_executions,
 *         cicd_github_runs, cicd_events, agent_memory_index, github_repositories
 */
import { jsonResponse } from '../core/responses.js';
import { tenantIdFromEnv } from '../core/auth.js';
import { notifySam } from '../core/notifications.js';
import { invalidateCompiledContextCache } from '../api/rag.js';

// ─── Timing-Safe Comparison ───────────────────────────────────────────────────

function timingSafeEqualUtf8(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// ─── HMAC Helpers ─────────────────────────────────────────────────────────────

async function hmacSha256HexFromUtf8Key(secretUtf8, messageUtf8) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secretUtf8),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageUtf8));
  return [...new Uint8Array(sig)].map(c => c.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256HexFromRawKey(keyBytes, messageUtf8) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageUtf8));
  return [...new Uint8Array(sig)].map(c => c.toString(16).padStart(2, '0')).join('');
}

function decodeStripeSigningSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  const m = secret.match(/^whsec_(.+)$/);
  if (!m) return new TextEncoder().encode(secret);
  try {
    const b64  = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin  = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch { return null; }
}

function base64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// ─── Signature Verification ───────────────────────────────────────────────────

async function verifyGithubSignature(secret, rawBody, sigHeader) {
  if (!secret || !sigHeader) return false;
  const expected = `sha256=${await hmacSha256HexFromUtf8Key(secret, rawBody)}`;
  return timingSafeEqualUtf8(expected.toLowerCase(), sigHeader.trim().toLowerCase());
}

async function verifySha256HmacHeader(secret, rawBody, sigHeader) {
  if (!secret || !sigHeader) return false;
  const got = sigHeader.trim().toLowerCase().replace(/^sha256=/, '');
  const exp = (await hmacSha256HexFromUtf8Key(secret, rawBody)).toLowerCase();
  return timingSafeEqualUtf8(exp, got);
}

async function verifyStripeHeader(secret, rawBody, sigHeader) {
  const keyBytes = decodeStripeSigningSecret(secret);
  if (!keyBytes || !sigHeader) return false;
  const parts = sigHeader.split(',').map(p => p.trim());
  let t    = null;
  const v1s = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === 't') t = v;
    if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) return false;
  const now = Math.floor(Date.now() / 1000);
  const ts  = Number(t);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const signedPayload = `${t}.${rawBody}`;
  const expHex        = await hmacSha256HexFromRawKey(keyBytes, signedPayload);
  return v1s.some(v => timingSafeEqualUtf8(expHex.toLowerCase(), (v || '').toLowerCase()));
}

async function verifySvixSignature(secret, rawBody, svixId, svixTimestamp, svixSigHeader) {
  if (!secret || !svixId || !svixTimestamp || !svixSigHeader) return false;
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  const keyBytes      = decodeStripeSigningSecret(secret) ?? new TextEncoder().encode(secret);
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key           = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf        = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expectedB64   = base64FromArrayBuffer(sigBuf);
  for (const part of svixSigHeader.trim().split(/\s+/)) {
    const idx = part.indexOf(',');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === 'v1' && timingSafeEqualUtf8(part.slice(idx + 1).trim(), expectedB64)) return true;
  }
  return false;
}

async function verifySupabaseSignature(secret, rawBody, sigHeader) {
  if (!secret || !sigHeader) return false;
  const got = sigHeader.trim().replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return false;
  return timingSafeEqualUtf8((await hmacSha256HexFromUtf8Key(secret, rawBody)).toLowerCase(), got);
}

/**
 * Verify the incoming webhook signature based on source type.
 * resolveSecret(name) → string|null pulls from env or vault.
 */
async function verifyWebhookSignature(verifyKind, resolveSecret, request, rawBody) {
  switch (verifyKind) {
    case 'none': return { ok: true };

    case 'github': {
      const s = resolveSecret('GITHUB_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'GITHUB_WEBHOOK_SECRET not configured' };
      const ok = await verifyGithubSignature(s, rawBody, request.headers.get('X-Hub-Signature-256') || '');
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid X-Hub-Signature-256' };
    }

    case 'stripe': {
      const s = resolveSecret('STRIPE_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'STRIPE_WEBHOOK_SECRET not configured' };
      const ok = await verifyStripeHeader(s, rawBody, request.headers.get('Stripe-Signature') || '');
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid Stripe-Signature' };
    }

    case 'cursor': {
      const s = resolveSecret('CURSOR_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'CURSOR_WEBHOOK_SECRET not configured' };
      const sig = request.headers.get('X-Cursor-Signature') || request.headers.get('X-Webhook-Signature') || '';
      const ok  = await verifySha256HmacHeader(s, rawBody, sig);
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid Cursor webhook signature' };
    }

    case 'resend': {
      const s = resolveSecret('RESEND_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'RESEND_WEBHOOK_SECRET not configured' };
      const ok = await verifySvixSignature(s, rawBody,
        request.headers.get('svix-id') || '',
        request.headers.get('svix-timestamp') || '',
        request.headers.get('svix-signature') || ''
      );
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid Resend/Svix signature' };
    }

    case 'resend_inbound': {
      const s = resolveSecret('RESEND_INBOUND_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'RESEND_INBOUND_WEBHOOK_SECRET not configured' };
      const ok = await verifySvixSignature(s, rawBody,
        request.headers.get('svix-id') || '',
        request.headers.get('svix-timestamp') || '',
        request.headers.get('svix-signature') || ''
      );
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid Resend inbound signature' };
    }

    case 'supabase': {
      const s = resolveSecret('SUPABASE_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'SUPABASE_WEBHOOK_SECRET not configured' };
      const sig = request.headers.get('x-supabase-signature') || request.headers.get('X-Supabase-Signature') || '';
      const ok  = await verifySupabaseSignature(s, rawBody, sig);
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid x-supabase-signature' };
    }

    case 'cloudflare': {
      const s = resolveSecret('DEPLOY_TRACKING_TOKEN');
      if (!s) return { ok: false, status: 501, message: 'DEPLOY_TRACKING_TOKEN not configured' };
      const sig = request.headers.get('X-CF-Signature') || '';
      const ok  = await verifySha256HmacHeader(s, rawBody, sig);
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid X-CF-Signature' };
    }

    case 'internal': {
      const s = resolveSecret('INTERNAL_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'INTERNAL_WEBHOOK_SECRET not configured' };
      const sig = request.headers.get('X-IAM-Signature') || '';
      const ok  = await verifySha256HmacHeader(s, rawBody, sig);
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid X-IAM-Signature' };
    }

    case 'openai': {
      const s = resolveSecret('OPENAI_WEBHOOK_SECRET');
      if (!s) return { ok: false, status: 501, message: 'OPENAI_WEBHOOK_SECRET not configured' };
      const sig = request.headers.get('X-OpenAI-Signature') || '';
      const ok  = await verifySha256HmacHeader(s, rawBody, sig);
      return ok ? { ok: true } : { ok: false, status: 401, message: 'Invalid X-OpenAI-Signature' };
    }

    default:
      return { ok: false, status: 400, message: 'Unknown webhook verify kind' };
  }
}

// ─── Endpoint Resolution ──────────────────────────────────────────────────────

const PATH_ALIASES = {
  '/api/hooks/github':   '/api/webhooks/github',
  '/api/hooks/cursor':   '/api/webhooks/cursor',
  '/api/hooks/stripe':   '/api/webhooks/stripe',
  '/api/hooks/internal': '/api/webhooks/internal',
  '/api/hooks/supabase': '/api/webhooks/supabase',
  '/api/hooks/openai':   '/api/webhooks/openai',
  '/api/hooks/resend':   '/api/webhooks/resend',
};

function normalizePath(p) {
  let s = String(p || '').trim().toLowerCase();
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

async function resolveWebhookEndpoint(db, source, requestPath) {
  const norm     = normalizePath(requestPath);
  const tryPaths = new Set([norm]);
  const alias    = PATH_ALIASES[norm];
  if (alias) tryPaths.add(normalizePath(alias));

  for (const p of tryPaths) {
    if (!p) continue;
    const row = await db.prepare(
      `SELECT id, tenant_id FROM webhook_endpoints
       WHERE source = ? AND COALESCE(is_active, 1) = 1
         AND lower(trim(endpoint_path)) = ? LIMIT 1`
    ).bind(source, p).first();
    if (row?.id) return row;
  }

  // Fallback: most recent active endpoint for this source
  return db.prepare(
    `SELECT id, tenant_id FROM webhook_endpoints
     WHERE source = ? AND COALESCE(is_active, 1) = 1
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(source).first();
}

// ─── Event Metadata ───────────────────────────────────────────────────────────

function resolveEventType(source, request, rawBody) {
  if (source === 'github')  return (request.headers.get('X-GitHub-Event') || 'unknown').toLowerCase();
  if (source === 'stripe')  { try { return JSON.parse(rawBody || '{}').type || 'unknown'; } catch { return 'unknown'; } }
  if (source === 'cursor')  {
    const h = request.headers.get('X-Webhook-Event');
    if (h) return h;
    try { const j = JSON.parse(rawBody || '{}'); return j.event || j.type || 'unknown'; } catch { return 'unknown'; }
  }
  if (source === 'resend')  { try { const j = JSON.parse(rawBody || '{}'); return j.type || j.event?.type || 'unknown'; } catch { return 'unknown'; } }
  if (source === 'supabase') { try { const j = JSON.parse(rawBody || '{}'); return j.type || j.table || 'unknown'; } catch { return 'unknown'; } }
  try { const j = JSON.parse(rawBody || '{}'); return j.event_type || j.type || j.event || 'internal'; } catch { return 'internal'; }
}

function captureHeaders(request) {
  const names = [
    'X-GitHub-Event','X-GitHub-Delivery','X-Hub-Signature-256',
    'X-Cursor-Signature','X-Webhook-Signature','X-Webhook-ID','X-Webhook-Event',
    'Stripe-Signature','X-IAM-Signature','svix-id','svix-timestamp','svix-signature',
    'x-supabase-signature','X-CF-Signature',
  ];
  const o = {};
  for (const n of names) {
    const v = request.headers.get(n);
    if (v) o[n] = v.length > 2000 ? `${v.slice(0, 2000)}...` : v;
  }
  return JSON.stringify(o);
}

function extractDeliveryContext(source, request, rawBody) {
  let payload = {};
  try { payload = JSON.parse(rawBody || '{}'); } catch { payload = {}; }

  let externalEventId = null;
  let repo            = null;
  let branch          = null;
  let sha             = null;
  let actor           = null;

  if (source === 'github') {
    externalEventId = request.headers.get('X-GitHub-Delivery') || null;
    repo   = payload.repository?.full_name ?? null;
    branch = payload.ref ? String(payload.ref).replace(/^refs\/heads\//, '') : (payload.workflow_run?.head_branch ?? null);
    sha    = payload.after ?? payload.head_commit?.id ?? payload.workflow_run?.head_sha ?? null;
    actor  = payload.sender?.login ?? payload.pusher?.name ?? null;
  } else if (source === 'stripe') {
    externalEventId = payload.id ?? null;
  } else if (source === 'resend') {
    externalEventId = request.headers.get('svix-id') || payload.id || null;
  } else if (source === 'cursor') {
    externalEventId = request.headers.get('X-Webhook-ID') || payload.id || null;
  } else {
    externalEventId = payload.id ?? payload.delivery_id ?? null;
  }

  return { payload, externalEventId, repo, branch, sha, actor };
}

// ─── CIDI GitHub Follow-ups ───────────────────────────────────────────────────

async function recordGithubCicdFollowups(env, row, rawBody) {
  if (!env?.DB || !row) return;
  const status     = String(row.status || '').toLowerCase();
  const conclusion = String(row.conclusion || '').toLowerCase();
  if (status !== 'success' && conclusion !== 'success') return;

  const commitSha  = row.commit_sha != null ? String(row.commit_sha) : '';
  const repoFull   = String(row.repo_name || row.repo_full_name || '').trim();
  const runId      = row.run_id != null ? String(row.run_id) : '';
  const wfName     = row.workflow_name != null ? String(row.workflow_name) : '';
  const branch     = row.branch != null ? String(row.branch) : '';
  const vShort     = commitSha.length >= 7 ? commitSha.slice(0, 7) : commitSha || 'unknown';
  const cdep       = row.cloudflare_deployment_id != null ? String(row.cloudflare_deployment_id).trim() : '';
  const deployId   = cdep || (runId ? `cicd-${runId}` : `gh-${vShort}-${Date.now()}`);

  let workerName = '';
  if (repoFull) {
    try {
      const gr = await env.DB.prepare(
        `SELECT cloudflare_worker_name FROM github_repositories
         WHERE lower(trim(repo_full_name)) = lower(trim(?)) LIMIT 1`
      ).bind(repoFull).first();
      if (gr?.cloudflare_worker_name) workerName = String(gr.cloudflare_worker_name);
    } catch (_) {}
  }

  // No hardcoded worker name fallback — log warning if unresolved
  if (!workerName) {
    console.warn('[hooks] could not resolve cloudflare_worker_name for repo:', repoFull);
    workerName = 'unknown';
  }

  let payload = {};
  try { payload = JSON.parse(rawBody || '{}'); } catch { payload = {}; }

  const actor       = payload.sender?.login || payload.workflow_run?.triggering_actor?.login || 'github';
  const commitMsg   = String(payload.workflow_run?.head_commit?.message || payload.head_commit?.message || '').slice(0, 4000);
  const desc        = `GitHub CI: ${wfName || 'workflow'}${branch ? ` (${branch})` : ''}`;

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO deployments
       (id, timestamp, version, git_hash, description, status, deployed_by, environment, deploy_time_seconds, worker_name, triggered_by, notes)
       VALUES (?, datetime('now'), ?, ?, ?, 'success', ?, 'production', 0, ?, 'github_push', ?)`
    ).bind(deployId, vShort, commitSha || null, desc, actor, workerName, commitMsg || null).run();
  } catch (e) {
    console.warn('[hooks] deployments INSERT:', e?.message ?? e);
  }
}

// ─── Subscription Action Executor ────────────────────────────────────────────

const ALLOWED_WRITE_COLUMNS = new Set(['id', 'client_id', 'workflow_id']);
const ALLOWED_PATCH_KEYS    = new Set([
  'implementation_status','priority','title','workflow_name','client_name',
  'description','notes','technical_notes','billing_status',
]);

function getByPath(root, pathStr) {
  if (root == null || !pathStr) return undefined;
  const parts = String(pathStr).split('.').filter(p => p.length > 0);
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /^\d+$/.test(p) ? cur[Number(p)] : cur[p];
  }
  return cur;
}

async function executeAction(env, actionType, actionConfigJson, ctx) {
  let cfg = {};
  try {
    cfg = typeof actionConfigJson === 'string'
      ? JSON.parse(actionConfigJson || '{}')
      : (actionConfigJson || {});
  } catch { return { ok: false, error: 'Invalid action_config_json' }; }

  // ── write_d1 ─────────────────────────────────────────────────────────────
  if (actionType === 'write_d1') {
    const sqlStr = (cfg.sql || '').trim();
    if (sqlStr) {
      if (/\b(drop\s+table|truncate)\b/i.test(sqlStr)) return { ok: false, error: 'write_d1: blocked statement' };
      try {
        const params = Array.isArray(cfg.params) ? cfg.params : [];
        const result = await (params.length
          ? env.DB.prepare(sqlStr).bind(...params).run()
          : env.DB.prepare(sqlStr).run()
        );
        return { ok: true, result: { changes: result.meta?.changes ?? 0 } };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    }

    if (cfg.table && cfg.map) {
      const table = String(cfg.table);
      if (!/^[a-zA-Z0-9_]+$/.test(table)) return { ok: false, error: 'write_d1: invalid table name' };

      let parsed = {};
      try { parsed = JSON.parse(ctx.rawBody || '{}'); } catch { parsed = {}; }

      const row = {};
      for (const [col, path] of Object.entries(cfg.map)) {
        if (!/^[a-zA-Z0-9_]+$/.test(col)) continue;
        const v = getByPath(parsed, String(path)) ?? getByPath({ payload: parsed }, String(path));
        row[col] = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : v;
      }
      if (cfg.defaults && typeof cfg.defaults === 'object') {
        for (const [k, v] of Object.entries(cfg.defaults)) {
          if (/^[a-zA-Z0-9_]+$/.test(k)) row[k] = v;
        }
      }

      const cols = Object.keys(row);
      if (!cols.length) return { ok: false, error: 'write_d1: map produced no columns' };

      const verb   = cfg.insert_only === true ? 'INSERT' : 'INSERT OR REPLACE';
      const sql    = `${verb} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      try {
        const result = await env.DB.prepare(sql).bind(...cols.map(c => row[c])).run();
        const changes = result.meta?.changes ?? 0;

        if (table === 'cicd_github_runs' && changes > 0) {
          await recordGithubCicdFollowups(env, row, ctx.rawBody);
        }

        return { ok: true, result: { changes } };
      } catch (e) { return { ok: false, error: String(e?.message || e) }; }
    }

    return { ok: false, error: 'write_d1: sql, or table+map required' };
  }

  // ── notify_agent ──────────────────────────────────────────────────────────
  if (actionType === 'notify_agent') {
    const tenantId  = cfg.tenant_id ? String(cfg.tenant_id) : tenantIdFromEnv(env);
    if (!tenantId) return { ok: false, error: 'notify_agent: tenant_id required' };
    const agentCfg = cfg.agent_config_id ? String(cfg.agent_config_id) : 'agent-sam-primary';
    const memKey   = cfg.key || cfg.memory_key || `webhook_notify_${ctx.webhookEventId}`;
    const valueStr = cfg.value != null
      ? (typeof cfg.value === 'string' ? cfg.value : JSON.stringify(cfg.value))
      : JSON.stringify({ message: cfg.message || cfg.text || '', webhook_event_id: ctx.webhookEventId, event_type: ctx.eventType, source: ctx.source });
    const score = Number(cfg.importance_score) >= 0 && Number(cfg.importance_score) <= 1
      ? Number(cfg.importance_score) : 0.75;

    try {
      await env.DB.prepare(
        `INSERT INTO agent_memory_index
         (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at)
         VALUES (?, ?, 'execution_outcome', ?, ?, ?, unixepoch(), unixepoch())
         ON CONFLICT(key) DO UPDATE SET
           value            = excluded.value,
           importance_score = excluded.importance_score,
           updated_at       = unixepoch()`
      ).bind(tenantId, agentCfg, memKey, valueStr, score).run();

      invalidateCompiledContextCache(env);
      return { ok: true, result: { memory_key: memKey } };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  // ── send_notification ─────────────────────────────────────────────────────
  if (actionType === 'send_notification') {
    const subject = cfg.subject ? String(cfg.subject) : `Webhook: ${ctx.eventType}`;
    const message = cfg.message || cfg.body || JSON.stringify({ webhook_event_id: ctx.webhookEventId, source: ctx.source });
    const pri     = String(cfg.priority || '').toLowerCase();

    if (pri === 'high' && env.RESEND_API_KEY) {
      const recipient = cfg.recipient ? String(cfg.recipient) : null;
      notifySam(env, { subject, body: message, category: 'webhook', ...(recipient ? { to: recipient } : {}) }, ctx.executionCtx);
    }

    return { ok: true, result: { notified: true } };
  }

  return { ok: false, error: `Unknown action_type: ${actionType}` };
}

// ─── Subscription Runner ──────────────────────────────────────────────────────

async function runHookSubscriptions(env, endpointId, eventType, ctx) {
  if (!env.DB) return;

  let subscriptions = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, action_type, action_config_json, event_filter, run_order
       FROM hook_subscriptions
       WHERE endpoint_id = ? AND is_active = 1
       ORDER BY run_order ASC`
    ).bind(endpointId).all();
    subscriptions = results || [];
  } catch (e) {
    console.warn('[hooks] subscription lookup failed:', e?.message ?? e);
    return;
  }

  for (const sub of subscriptions) {
    // Check event_filter
    const ef = String(sub.event_filter || '*').trim();
    if (ef !== '*' && ef && !ef.includes(eventType)) continue;

    const execId  = 'hexec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const startMs = Date.now();
    let result;

    try {
      result = await executeAction(env, sub.action_type, sub.action_config_json, ctx);
    } catch (e) {
      result = { ok: false, error: String(e?.message || e) };
    }

    const durationMs = Date.now() - startMs;

    // Log execution to hook_executions
    await env.DB.prepare(
      `INSERT INTO hook_executions
       (id, subscription_id, webhook_event_id, status, error_message, result_json, duration_ms, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      execId,
      sub.id,
      ctx.webhookEventId,
      result.ok ? 'success' : 'failed',
      result.ok ? null : (result.error || null),
      JSON.stringify(result.result || null),
      durationMs,
    ).run().catch(e => console.warn('[hooks] hook_executions INSERT:', e?.message ?? e));
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle an inbound webhook.
 *
 * @param {object} env
 * @param {Request} request
 * @param {function} resolveSecret - (name) => string|null, pulls from env or vault
 * @param {object} opts
 * @param {string} opts.verifyKind - signature verification method
 * @param {string} opts.source     - webhook source label (github, stripe, etc.)
 * @param {string} opts.endpointPath - the request pathname
 * @param {ExecutionContext} executionCtx
 */
export async function handleInboundWebhook(env, request, resolveSecret, opts, executionCtx) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);

  const { verifyKind, source, endpointPath } = opts;

  const rawBody = await request.text();

  // Signature verification
  const v = await verifyWebhookSignature(verifyKind, resolveSecret, request, rawBody);
  if (!v.ok) return jsonResponse({ error: v.message || 'Unauthorized' }, v.status || 401);

  // Resolve endpoint row
  const url         = new URL(request.url);
  const pathForLookup = normalizePath(endpointPath || url.pathname);
  const ep          = await resolveWebhookEndpoint(env.DB, source, pathForLookup);
  if (!ep?.id) {
    return jsonResponse({ error: `No active webhook_endpoints row for source=${source} path=${pathForLookup}` }, 503);
  }

  // Event metadata
  const eventType   = String(resolveEventType(source, request, rawBody));
  const headersJson = captureHeaders(request);
  const { externalEventId, repo, branch, sha, actor } = extractDeliveryContext(source, request, rawBody);
  const tenantId    = ep.tenant_id || tenantIdFromEnv(env);
  const ip          = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();

  if (!tenantId) return jsonResponse({ error: 'tenant_id required' }, 503);

  const eventId     = crypto.randomUUID();
  const payloadStore = rawBody.length > 500000 ? `${rawBody.slice(0, 500000)}\n...[truncated]` : rawBody;

  // Store event
  try {
    await env.DB.prepare(
      `INSERT INTO webhook_events
       (id, endpoint_id, tenant_id, source, event_type, event_id,
        repo_full_name, branch, commit_sha, actor,
        payload_json, headers_json, signature_valid, ip_address, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'received', datetime('now'))`
    ).bind(
      eventId, ep.id, tenantId, source, eventType, externalEventId,
      repo, branch, sha, actor, payloadStore, headersJson, ip || null
    ).run();
  } catch (e) {
    console.error('[hooks] webhook_events INSERT:', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }

  // Cursor webhook notify
  if (source === 'cursor' && executionCtx) {
    const summary = rawBody.length > 500 ? rawBody.slice(0, 500) + '...' : rawBody;
    notifySam(env, { subject: `Cursor webhook: ${eventType}`, body: summary, category: 'cursor' }, executionCtx);
  }

  // Run subscriptions async
  const ctx = {
    webhookEventId: eventId,
    rawBody,
    eventType,
    source,
    ip: ip || null,
    executionCtx,
    waitUntil: executionCtx && typeof executionCtx.waitUntil === 'function'
      ? executionCtx.waitUntil.bind(executionCtx)
      : null,
  };

  const subRun = runHookSubscriptions(env, ep.id, eventType, ctx);
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(subRun.catch(e => console.warn('[hooks] subscription run:', e?.message ?? e)));
  } else {
    await subRun.catch(e => console.warn('[hooks] subscription run:', e?.message ?? e));
  }

  return jsonResponse({ ok: true, event_id: eventId, source, event_type: eventType });
}

/**
 * Health check — returns all webhook endpoints with subscription counts.
 */
export async function handleHooksHealth(env) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
  try {
    const { results } = await env.DB.prepare(
      `SELECT e.*,
         (SELECT COUNT(*) FROM hook_subscriptions h WHERE h.endpoint_id = e.id) AS subscription_count
       FROM webhook_endpoints e
       ORDER BY e.source, e.slug`
    ).all();
    return jsonResponse({ ok: true, endpoints: results || [] });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e), endpoints: [] }, 500);
  }
}
