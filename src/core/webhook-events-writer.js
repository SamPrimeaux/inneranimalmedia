/**
 * Canonical inserts into agentsam_webhook_events (production schema: received_at_unix, endpoint_id).
 * Resolves endpoint_id from agentsam_webhooks when omitted.
 */
import { pragmaTableInfo } from './retention.js';

const EVENTS_TABLE = 'agentsam_webhook_events';
const REGISTRY_TABLE = 'agentsam_webhooks';

/** @returns {string} */
export function newWebhookEventId() {
  return `whe_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * @param {any} env
 * @param {string | null | undefined} [override]
 */
export function resolveWebhookTenantId(env, override) {
  if (override != null && String(override).trim() !== '') return String(override).trim();
  if (typeof env?.ANTHROPIC_WEBHOOK_TENANT_ID === 'string' && env.ANTHROPIC_WEBHOOK_TENANT_ID.trim()) {
    return env.ANTHROPIC_WEBHOOK_TENANT_ID.trim();
  }
  if (typeof env?.GITHUB_WEBHOOK_TENANT_ID === 'string' && env.GITHUB_WEBHOOK_TENANT_ID.trim()) {
    return env.GITHUB_WEBHOOK_TENANT_ID.trim();
  }
  if (typeof env?.SUPABASE_WEBHOOK_TENANT_ID === 'string' && env.SUPABASE_WEBHOOK_TENANT_ID.trim()) {
    return env.SUPABASE_WEBHOOK_TENANT_ID.trim();
  }
  // system-scoped: no authenticated user context at this path
  if (typeof env?.TENANT_ID === 'string' && env.TENANT_ID.trim()) return env.TENANT_ID.trim();
  return 'system';
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} provider
 * @param {string} [endpointPath] e.g. /api/webhooks/github
 */
async function lookupRegistryEndpointId(db, provider, endpointPath) {
  const p = provider != null ? String(provider).trim() : '';
  if (!p) return null;
  try {
    if (endpointPath) {
      const path = String(endpointPath).trim();
      const legacy = path.replace('/api/webhooks/', '/api/hooks/');
      const row = await db
        .prepare(
          `SELECT id FROM ${REGISTRY_TABLE}
           WHERE is_active = 1
             AND (endpoint_url LIKE '%' || ? OR endpoint_url LIKE '%' || ?)
           ORDER BY rowid ASC LIMIT 1`,
        )
        .bind(path, legacy)
        .first();
      if (row?.id) return String(row.id);
    }
    const row = await db
      .prepare(
        `SELECT id FROM ${REGISTRY_TABLE}
         WHERE provider = ? AND is_active = 1
         ORDER BY rowid ASC LIMIT 1`,
      )
      .bind(p)
      .first();
    return row?.id != null ? String(row.id) : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {{
 *   id?: string,
 *   tenantId?: string | null,
 *   workspaceId?: string | null,
 *   provider: string,
 *   eventType: string,
 *   eventId?: string | null,
 *   payload?: unknown,
 *   payloadJson?: string | null,
 *   headersJson?: string | Record<string, unknown> | null,
 *   metadata?: Record<string, unknown> | null,
 *   endpointId?: string | null,
 *   endpointPath?: string | null,
 *   status?: string,
 *   signatureValid?: boolean,
 *   ipAddress?: string | null,
 *   maxPayloadChars?: number,
 * }} opts
 */
export async function insertAgentsamWebhookEvent(env, opts) {
  const db = env?.DB;
  if (!db) return { ok: false, reason: 'no_db' };

  const cols = await pragmaTableInfo(db, EVENTS_TABLE);
  if (!cols.size) return { ok: false, reason: 'table_missing' };

  const provider = opts.provider != null ? String(opts.provider).trim() : '';
  const eventType = opts.eventType != null ? String(opts.eventType).trim() : '';
  if (!provider || !eventType) return { ok: false, reason: 'missing_provider_or_event_type' };

  const id = opts.id != null ? String(opts.id).trim() : newWebhookEventId();
  const tenantId = resolveWebhookTenantId(env, opts.tenantId);
  const receivedUnix = Math.floor(Date.now() / 1000);

  let endpointId = opts.endpointId != null ? String(opts.endpointId).trim() : '';
  if (!endpointId && cols.has('endpoint_id')) {
    endpointId =
      (await lookupRegistryEndpointId(db, provider, opts.endpointPath ?? null)) || '';
  }

  const maxChars = Number(opts.maxPayloadChars) > 0 ? Number(opts.maxPayloadChars) : 800_000;
  let payloadJson = null;
  if (opts.payloadJson != null) {
    payloadJson = String(opts.payloadJson).slice(0, maxChars);
  } else if (opts.payload !== undefined) {
    try {
      payloadJson = JSON.stringify(opts.payload).slice(0, maxChars);
    } catch {
      payloadJson = '{"_error":"payload_stringify_failed"}';
    }
  }

  let headersJson = null;
  if (opts.headersJson != null) {
    headersJson =
      typeof opts.headersJson === 'string'
        ? opts.headersJson.slice(0, 32_000)
        : JSON.stringify(opts.headersJson).slice(0, 32_000);
  }

  const metadata =
    opts.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)
      ? opts.metadata
      : null;

  const parts = [];
  const binds = [];
  const add = (name, val) => {
    if (!cols.has(name)) return;
    parts.push(name);
    binds.push(val);
  };

  add('id', id);
  add('tenant_id', tenantId);
  add('workspace_id', opts.workspaceId != null ? String(opts.workspaceId).trim() : null);
  add('endpoint_id', endpointId || null);
  add('provider', provider);
  add('event_type', eventType.slice(0, 200));
  add('event_id', opts.eventId != null ? String(opts.eventId).slice(0, 200) : null);
  add('payload_json', payloadJson);
  add('headers_json', headersJson);
  add('metadata_json', metadata ? JSON.stringify(metadata).slice(0, 32_000) : null);
  add('status', opts.status != null ? String(opts.status) : 'received');
  add('received_at_unix', receivedUnix);
  add('signature_valid', opts.signatureValid === false ? 0 : 1);
  add('ip_address', opts.ipAddress != null ? String(opts.ipAddress).slice(0, 120) : null);

  if (parts.length < 4) return { ok: false, reason: 'columns_missing' };

  try {
    await db
      .prepare(
        `INSERT INTO ${EVENTS_TABLE} (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
      )
      .bind(...binds)
      .run();
    return { ok: true, id, endpointId: endpointId || null };
  } catch (e) {
    console.warn('[webhook-events] insert', provider, eventType, e?.message ?? e);
    return { ok: false, reason: String(e?.message || e), id };
  }
}

/**
 * @param {any} env
 * @param {string} eventId
 */
export async function markAgentsamWebhookEventProcessed(env, eventId) {
  const db = env?.DB;
  const id = eventId != null ? String(eventId).trim() : '';
  if (!db || !id) return;
  const cols = await pragmaTableInfo(db, EVENTS_TABLE);
  const unix = Math.floor(Date.now() / 1000);
  try {
    if (cols.has('processed_at_unix')) {
      await db
        .prepare(
          `UPDATE ${EVENTS_TABLE} SET status = 'processed', processed_at_unix = ? WHERE id = ?`,
        )
        .bind(unix, id)
        .run();
    } else if (cols.has('processed_at')) {
      await db
        .prepare(`UPDATE ${EVENTS_TABLE} SET status = 'processed', processed_at = datetime('now') WHERE id = ?`)
        .bind(id)
        .run();
    } else {
      await db.prepare(`UPDATE ${EVENTS_TABLE} SET status = 'processed' WHERE id = ?`).bind(id).run();
    }
  } catch (e) {
    console.warn('[webhook-events] mark processed', id, e?.message ?? e);
  }
}

/**
 * Insert audit row; optionally mark processed (default true).
 * @param {any} env
 * @param {any} [ctx]
 * @param {Parameters<typeof insertAgentsamWebhookEvent>[1] & { markProcessed?: boolean }} opts
 */
export async function recordAgentsamWebhookEvent(env, ctx, opts) {
  const run = async () => {
    const ins = await insertAgentsamWebhookEvent(env, opts);
    if (ins.ok && opts.markProcessed !== false) {
      await markAgentsamWebhookEventProcessed(env, ins.id);
    }
    return ins;
  };
  if (ctx?.waitUntil) {
    ctx.waitUntil(run().catch((e) => console.warn('[webhook-events] record', e?.message ?? e)));
    return { scheduled: true };
  }
  return run();
}
