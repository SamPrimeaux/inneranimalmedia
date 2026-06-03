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
/**
 * Webhook audit tenant — explicit caller context only (no hardcoded tenant ids).
 * @param {unknown} _env
 * @param {string | null | undefined} override
 */
export function resolveWebhookTenantId(_env, override) {
  if (override == null) return null;
  const s = String(override).trim();
  if (!s || s === 'system') return null;
  return s;
}

/** @param {string | null | undefined} raw */
export function normalizeGithubRepoFullName(raw) {
  if (raw == null || !String(raw).trim()) return null;
  let s = String(raw).trim().replace(/\.git$/i, '');
  s = s.replace(/^https?:\/\/github\.com\//i, '');
  s = s.replace(/^github\.com\//i, '');
  const m = /^[\w.-]+\/[\w.-]+/.exec(s);
  return m ? m[0] : null;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string | null | undefined} repoFullName
 */
async function lookupWorkspaceScopeByGithubRepo(db, repoFullName) {
  const repo = normalizeGithubRepoFullName(repoFullName);
  if (!repo) return null;
  try {
    const row = await db
      .prepare(
        `SELECT id, tenant_id FROM workspaces
         WHERE lower(replace(replace(replace(trim(github_repo), 'https://github.com/', ''), 'http://github.com/', ''), '.git', '')) = lower(?)
            OR trim(github_repo) = ?
            OR lower(trim(github_repo)) = lower(?)
         ORDER BY CASE WHEN trim(github_repo) = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .bind(repo, repo, repo, repo)
      .first();
    if (!row?.tenant_id || !String(row.tenant_id).trim()) return null;
    return {
      tenantId: String(row.tenant_id).trim(),
      workspaceId: row.id != null ? String(row.id).trim() : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve tenant/workspace from WORKSPACE_ID binding or explicit workspace id.
 * @param {any} env
 * @param {string | null | undefined} [workspaceId]
 */
export async function resolvePlatformWebhookScope(env, workspaceId) {
  const db = env?.DB;
  if (!db) return null;
  const ws =
    workspaceId != null && String(workspaceId).trim()
      ? String(workspaceId).trim()
      : env?.WORKSPACE_ID != null
        ? String(env.WORKSPACE_ID).trim()
        : '';
  if (!ws) return null;
  try {
    const row = await db
      .prepare(`SELECT id, tenant_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(ws)
      .first();
    if (!row?.tenant_id || !String(row.tenant_id).trim()) return null;
    return {
      tenantId: String(row.tenant_id).trim(),
      workspaceId: row.id != null ? String(row.id).trim() : ws,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve NOT NULL tenant_id + optional workspace_id for agentsam_webhook_events inserts.
 * @param {any} env
 * @param {Parameters<typeof insertAgentsamWebhookEvent>[1]} opts
 */
export async function resolveWebhookInsertScope(env, opts) {
  let tenantId = resolveWebhookTenantId(env, opts.tenantId);
  let workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : null;

  if (!tenantId && env?.DB && String(opts.provider || '').trim().toLowerCase() === 'github') {
    const repo =
      opts.metadata?.repo_full_name ??
      /** @type {any} */ (opts.payload)?.repository?.full_name ??
      null;
    const scope = await lookupWorkspaceScopeByGithubRepo(env.DB, repo);
    if (scope) {
      tenantId = scope.tenantId;
      workspaceId = workspaceId || scope.workspaceId;
    }
  }

  if (!tenantId) {
    const platform = await resolvePlatformWebhookScope(env, workspaceId);
    if (platform) {
      tenantId = platform.tenantId;
      workspaceId = workspaceId || platform.workspaceId;
    }
  }

  return { tenantId, workspaceId };
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
  const scope = await resolveWebhookInsertScope(env, opts);
  const tenantId = scope.tenantId;
  const workspaceId = scope.workspaceId;
  if (cols.has('tenant_id') && !tenantId) {
    console.warn('[webhook-events] insert skipped: missing tenant_id', provider, eventType);
    return { ok: false, reason: 'missing_tenant_id' };
  }
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
  add('workspace_id', workspaceId);
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
