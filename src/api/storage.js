/**
 * Storage dashboard API — tenant-scoped via session (getAuthUser).
 * R2 bindings, analytics, Vectorize / AutoRAG, S3-compatible config, D1 preferences & access-key registry.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
  authUserIsSuperadmin,
} from '../core/auth.js';
import { getR2Binding, listBoundR2BucketNames, r2LiveBucketStats } from './r2-api.js';

const KNOWN_R2_BINDINGS = [
  { binding: 'ASSETS', storage_name: 'inneranimalmedia-assets', public: true },
  { binding: 'AUTORAG_BUCKET', storage_name: 'autorag', public: true, url: 'https://autorag.inneranimalmedia.com' },
  { binding: 'DASHBOARD', storage_name: 'agent-sam', public: false },
  { binding: 'TOOLS', storage_name: 'tools', public: true, url: 'https://tools.inneranimalmedia.com' },
  { binding: 'R2', storage_name: 'iam-platform', public: false },
  { binding: 'DOCS_BUCKET', storage_name: 'iam-docs', public: false },
  { binding: 'EMAIL', storage_name: 'inneranimalmedia-email-archive', public: false },
];

/** Resolve tenant for row scoping (prefs, keys). */
async function resolveTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return `user:${String(authUser.id || authUser.email || 'unknown').trim()}`;
}

function r2S3PublicEndpoint(env) {
  const id = env.CLOUDFLARE_ACCOUNT_ID;
  if (!id || String(id).trim() === '') return '';
  return `https://${String(id).trim()}.r2.cloudflarestorage.com`;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : (Array.isArray(result) ? result : []);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function knownLiveStorage(env) {
  return KNOWN_R2_BINDINGS
    .filter((b) => !!env[b.binding])
    .map((b) => ({ ...b, storage_type: 'r2_bucket', storage_id: b.storage_name, region: 'auto' }));
}

async function cachedStorageResponse(env, endpoint, tenantId, producer) {
  const cacheKey = `storage_${endpoint}_${tenantId}`;
  if (env.SESSION_CACHE) {
    try {
      const cached = await env.SESSION_CACHE.get(cacheKey, 'json');
      if (cached) return jsonResponse(cached);
    } catch (_) { }
  }
  const failed = new Set();
  const payload = await producer(failed);
  const out = {
    source: payload.source || 'd1_registry',
    data_quality: payload.data_quality || (failed.size ? 'partial' : 'healthy'),
    last_synced_at: payload.last_synced_at ?? null,
    ...payload,
    ...(failed.size ? { failed: [...failed] } : {}),
  };
  if (env.SESSION_CACHE) {
    env.SESSION_CACHE.put(cacheKey, JSON.stringify(out), { expirationTtl: 300 }).catch(() => { });
  }
  return jsonResponse(out);
}

async function q(env, failed, table, sql, binds = [], mode = 'all') {
  try {
    const stmt = env.DB.prepare(sql).bind(...binds);
    return mode === 'first' ? await stmt.first() : rows(await stmt.all());
  } catch (e) {
    failed?.add?.(table);
    console.warn(`[storage:${table}]`, e?.message ?? e);
    return mode === 'first' ? null : [];
  }
}

function mergeContentTypes(bucketRows) {
  const merged = {};
  for (const b of bucketRows) {
    const obj = parseJsonObject(b.by_content_type_json);
    for (const [k, v] of Object.entries(obj)) merged[k] = num(merged[k]) + num(v);
  }
  return merged;
}

function cleanupBreakdown(bucketRows) {
  return bucketRows.reduce((acc, b) => {
    const k = String(b.cleanup_status || 'unreviewed');
    acc[k] = num(acc[k]) + 1;
    return acc;
  }, { unreviewed: 0, reviewed: 0, archived: 0 });
}

async function requireStorageSuperadmin(env, authUser) {
  if (authUserIsSuperadmin(authUser)) return true;
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (!email || !env.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 FROM superadmin_identity WHERE LOWER(email) = ? AND COALESCE(is_enabled, 0) = 1 LIMIT 1`,
    ).bind(email).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

/** Dedupe stats when multiple logical names map to the same R2 binding (e.g. agent-sam + tools → DASHBOARD). */
function bindingIdentity(env, logicalName) {
  const b = getR2Binding(env, logicalName);
  if (b === env.ASSETS) return 'ASSETS';
  if (b === env.AUTORAG_BUCKET) return 'AUTORAG_BUCKET';
  if (b === env.DASHBOARD) return 'DASHBOARD';
  if (b === env.R2) return 'R2';
  if (b === env.DOCS_BUCKET) return 'DOCS_BUCKET';
  return logicalName;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function randomSecret(len = 40) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

async function listAccessKeysForTenant(env, tenantId, userId) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT access_key_id, created_at, status FROM user_storage_access_keys
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
      .bind(tenantId, userId)
      .all();
    return (results || []).map((r) => ({
      accessKeyId: r.access_key_id,
      id: r.access_key_id,
      created_at: r.created_at,
      createdAt: r.created_at,
      status: r.status ?? 'active',
    }));
  } catch (e) {
    console.warn('[storage] listAccessKeysForTenant', e?.message ?? e);
    return [];
  }
}

/**
 * Main router for /api/storage/*
 */
export async function handleStorageApi(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const tenantId = await resolveTenantId(env, authUser);
  const userId = String(authUser.id || authUser.email || '').trim();
  if (!userId) {
    return jsonResponse({ error: 'Invalid session user' }, 401);
  }

  const baseMeta = { tenant_id: tenantId, user_id: userId };

  // ── DELETE /api/storage/policies/:id ────────────────────────────────────
  const policyIdMatch = path.match(/^\/api\/storage\/policies\/([^/]+)$/i);
  if (policyIdMatch && method === 'DELETE') {
    if (!env.DB) return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    const policyId = decodeURIComponent(policyIdMatch[1] || '').trim();
    if (!policyId) return jsonResponse({ error: 'id required' }, 400);
    try {
      const del = await env.DB.prepare(
        `DELETE FROM storage_policies WHERE id = ? AND tenant_id = ? AND user_id = ?`,
      )
        .bind(policyId, tenantId, userId)
        .run();
      if (!(del.meta?.changes ?? 0)) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      return jsonResponse({ ok: true, ...baseMeta });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('no such table')) {
        return jsonResponse(
          {
            error: 'storage_policies table missing',
            hint: 'Apply migrations/234_storage_policies.sql',
            ...baseMeta,
          },
          503,
        );
      }
      return jsonResponse({ error: msg, ...baseMeta }, 500);
    }
  }

  // ── GET / POST /api/storage/policies ─────────────────────────────────────
  if (pathLower === '/api/storage/policies') {
    if (method === 'GET') {
      if (!env.DB) return jsonResponse({ policies: [], ...baseMeta });
      try {
        const { results } = await env.DB.prepare(
          `SELECT p.*, s.storage_name, s.storage_type, s.storage_id, s.status AS storage_status
           FROM storage_policies p
           LEFT JOIN project_storage s
             ON s.tenant_id = p.tenant_id AND s.storage_name = p.bucket_name
           WHERE p.tenant_id = ? AND p.user_id = ?
           ORDER BY p.created_at DESC`,
        )
          .bind(tenantId, userId)
          .all();
        return jsonResponse({
          source: 'd1_registry',
          data_quality: 'healthy',
          last_synced_at: null,
          policies: results || [],
          ...baseMeta,
        });
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('no such table')) {
          return jsonResponse(
            {
              source: 'd1_registry',
              data_quality: 'partial',
              last_synced_at: null,
              policies: [],
              error: 'storage_policies table missing',
              hint: 'Apply migrations/234_storage_policies.sql',
              ...baseMeta,
            },
            503,
          );
        }
        return jsonResponse({ error: msg, ...baseMeta }, 500);
      }
    }

    if (method === 'POST') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
      }
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const effect = String(body.effect || '').toLowerCase().trim();
      if (effect !== 'allow' && effect !== 'deny') {
        return jsonResponse({ error: 'effect must be allow or deny' }, 400);
      }
      const bucket_name =
        typeof body.bucket_name === 'string' ? body.bucket_name.trim() : '';
      if (!bucket_name) return jsonResponse({ error: 'bucket_name required' }, 400);

      let actionsArr = body.actions;
      if (typeof actionsArr === 'string') {
        try {
          actionsArr = JSON.parse(actionsArr);
        } catch {
          actionsArr = null;
        }
      }
      if (!Array.isArray(actionsArr) || actionsArr.length === 0) {
        return jsonResponse({ error: 'actions must be a non-empty JSON array' }, 400);
      }
      const actionsStr = JSON.stringify(actionsArr);
      const resource =
        typeof body.resource === 'string' && body.resource.trim()
          ? body.resource.trim()
          : '*';
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      try {
        await env.DB.prepare(
          `INSERT INTO storage_policies (
            id, tenant_id, user_id, bucket_name, effect, actions, resource, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            tenantId,
            userId,
            bucket_name,
            effect,
            actionsStr,
            resource,
            now,
            now,
          )
          .run();
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('no such table')) {
          return jsonResponse(
            {
              error: 'storage_policies table missing',
              hint: 'Apply migrations/234_storage_policies.sql',
              ...baseMeta,
            },
            503,
          );
        }
        return jsonResponse({ error: msg, ...baseMeta }, 500);
      }
      const policy = await env.DB.prepare(
        `SELECT * FROM storage_policies WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      return jsonResponse({ policy, ...baseMeta }, 201);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── Buckets (bindings) ─────────────────────────────────────────
  if (pathLower === '/api/storage/buckets' && method === 'GET') {
    if (!env.DB) {
      return jsonResponse({
        source: 'd1_registry',
        data_quality: 'partial',
        last_synced_at: null,
        buckets: [],
        missing_registry_rows: knownLiveStorage(env),
        total_objects: 0,
        total_mb: 0,
        failed: ['DB'],
        ...baseMeta,
      });
    }
    return cachedStorageResponse(env, 'buckets', tenantId, async (failed) => {
      const [bucketRows, syncRow] = await Promise.all([
        q(env, failed, 'project_storage', `
          SELECT ps.id, ps.tenant_id, ps.storage_type, ps.storage_name, ps.storage_id, ps.storage_url,
                 ps.region, ps.status, ps.metadata_json, ps.created_at, ps.updated_at,
                 rs.object_count, rs.total_bytes, rs.total_mb, rs.by_content_type_json,
                 rs.prefix_breakdown_json, rs.is_live_connected, rs.priority,
                 rs.last_inventoried_at, rs.cleanup_status, rs.cleanup_notes, rs.owner, rs.project_ref
          FROM project_storage ps
          LEFT JOIN r2_bucket_summary rs ON rs.bucket_name = ps.storage_name
          WHERE ps.tenant_id = ? AND ps.status = 'active'
          ORDER BY COALESCE(rs.priority, 999), ps.storage_name
        `, [tenantId]),
        q(env, failed, 'r2_bucket_summary', `SELECT MAX(last_inventoried_at) AS last_synced_at FROM r2_bucket_summary`, [], 'first'),
      ]);
      const names = new Set(bucketRows.map((b) => b.storage_name));
      const live = knownLiveStorage(env);
      const missing = live
        .filter((b) => !names.has(b.storage_name))
        .map((b) => ({ ...b, registry_status: 'missing_from_project_storage' }));
      const buckets = bucketRows.map((b) => ({
        ...b,
        name: b.storage_name,
        bucket_name: b.storage_name,
        object_count: num(b.object_count),
        total_bytes: num(b.total_bytes),
        total_mb: num(b.total_mb),
        registry_status: 'registered',
      }));
      return {
        source: 'd1_registry',
        data_quality: buckets.length ? 'healthy' : 'fallback_live_scan',
        last_synced_at: syncRow?.last_synced_at ?? null,
        buckets: [...buckets, ...missing],
        missing_registry_rows: missing,
        total_objects: buckets.reduce((s, b) => s + num(b.object_count), 0),
        total_mb: buckets.reduce((s, b) => s + num(b.total_mb), 0),
        ...baseMeta,
      };
    });
  }

  // ── Analytics (D1 inventory + worker analytics) ──────────────────
  if (pathLower === '/api/storage/analytics' && method === 'GET') {
    if (!env.DB) return jsonResponse({ source: 'd1_registry', data_quality: 'partial', last_synced_at: null, failed: ['DB'], ...baseMeta });
    return cachedStorageResponse(env, 'analytics', tenantId, async (failed) => {
      const workspaceId = url.searchParams.get('workspace_id') || 'ws_inneranimalmedia';
      const [summaries, syncRow, trends, errors, usage] = await Promise.all([
        q(env, failed, 'r2_bucket_summary', `SELECT * FROM r2_bucket_summary ORDER BY COALESCE(priority,999), bucket_name`),
        q(env, failed, 'r2_bucket_summary', `SELECT MAX(last_inventoried_at) AS last_synced_at FROM r2_bucket_summary`, [], 'first'),
        q(env, failed, 'worker_analytics_hourly', `
          SELECT hour_timestamp AS hour, total_requests, failed_requests, avg_duration_ms, p95_duration_ms
          FROM worker_analytics_hourly
          WHERE datetime(hour_timestamp) >= datetime('now','-24 hours')
          ORDER BY hour_timestamp ASC
        `),
        q(env, failed, 'worker_analytics_errors', `
          SELECT event_id, worker_name, environment, timestamp, error_message, path, method, status_code, resolved
          FROM worker_analytics_errors
          WHERE COALESCE(resolved,0) = 0
          ORDER BY timestamp DESC LIMIT 20
        `),
        q(env, failed, 'workspace_usage_metrics', `
          SELECT metric_date, storage_used_mb, api_calls_used, mcp_calls, deployments_count
          FROM workspace_usage_metrics
          WHERE workspace_id = ?
          ORDER BY metric_date DESC LIMIT 30
        `, [workspaceId]),
      ]);
      const totalObjects = summaries.reduce((s, b) => s + num(b.object_count), 0);
      const totalBytes = summaries.reduce((s, b) => s + num(b.total_bytes), 0);
      const totalMb = summaries.reduce((s, b) => s + num(b.total_mb), 0);
      return {
        source: 'd1_registry',
        data_quality: trends.length ? 'healthy' : 'fallback_live_scan',
        last_synced_at: syncRow?.last_synced_at ?? null,
        total_objects: totalObjects,
        total_bytes: totalBytes,
        by_bucket: summaries.map((b) => ({ bucket: b.bucket_name, bucket_name: b.bucket_name, object_count: num(b.object_count), total_bytes: num(b.total_bytes), total_mb: num(b.total_mb) })),
        summary: { object_count: totalObjects, size_bytes: totalBytes },
        storage_inventory: {
          total_objects: totalObjects,
          total_bytes: totalBytes,
          total_mb: totalMb,
          bucket_count: summaries.length,
          storage_by_bucket: summaries.map((b) => ({ bucket_name: b.bucket_name, total_mb: num(b.total_mb), object_count: num(b.object_count) })),
          by_content_type: mergeContentTypes(summaries),
          cleanup_breakdown: cleanupBreakdown(summaries),
        },
        request_trends: trends,
        recent_errors: errors,
        workspace_usage: usage.reverse(),
        ...baseMeta,
      };
    });
  }

  // ── Vectors + AutoRAG registry ─────────────────────────────────
  if (pathLower === '/api/storage/vectors' && method === 'GET') {
    if (!env.DB) return jsonResponse({ source: 'd1_registry', data_quality: 'partial', last_synced_at: null, indexes: [], failed: ['DB'], ...baseMeta });
    return cachedStorageResponse(env, 'vectors', tenantId, async (failed) => {
      const registry = await q(env, failed, 'vectorize_index_registry', `
        SELECT * FROM vectorize_index_registry
        WHERE tenant_id = ? AND COALESCE(is_active,1) = 1
        ORDER BY COALESCE(is_preferred,0) DESC, display_name
      `, [tenantId]);
      const indexRows = await Promise.all(registry.map(async (idx) => {
        const [docRow, staleRow, recentDocs] = await Promise.all([
          q(env, failed, 'vectorize_indexed_docs', `SELECT COUNT(*) AS doc_count FROM vectorize_indexed_docs WHERE index_id = ? AND COALESCE(is_current,1) = 1`, [idx.id], 'first'),
          q(env, failed, 'vectorize_indexed_docs', `SELECT COUNT(*) AS stale_count FROM vectorize_indexed_docs WHERE index_id = ? AND COALESCE(is_current,1) = 0`, [idx.id], 'first'),
          q(env, failed, 'vectorize_indexed_docs', `
            SELECT source_r2_key, content_preview, chunk_index, token_count, indexed_at, is_current
            FROM vectorize_indexed_docs
            WHERE index_id = ?
            ORDER BY indexed_at DESC LIMIT 5
          `, [idx.id]),
        ]);
        const binding = idx.binding_name && env[idx.binding_name] ? env[idx.binding_name] : null;
        let live = !!binding;
        if (binding?.query) {
          try { live = !!binding; } catch (_) { live = false; }
        }
        return {
          ...idx,
          doc_count: num(docRow?.doc_count),
          stale_doc_count: num(staleRow?.stale_count),
          recent_docs: recentDocs,
          is_live_connected: live,
          registry_status: 'registered',
        };
      }));
      const liveMissing = [];
      if (env.VECTORIZE && !indexRows.some((x) => x.binding_name === 'VECTORIZE')) {
        liveMissing.push({ binding_name: 'VECTORIZE', registry_status: 'missing_from_vectorize_index_registry', is_live_connected: true });
      }
      return {
        source: 'd1_registry',
        data_quality: indexRows.length ? 'healthy' : 'fallback_live_scan',
        last_synced_at: indexRows.reduce((m, x) => x.last_indexed_at && (!m || String(x.last_indexed_at) > String(m)) ? x.last_indexed_at : m, null),
        indexes: [...indexRows, ...liveMissing],
        total_stored_vectors: indexRows.reduce((s, x) => s + num(x.stored_vectors), 0),
        total_indexed_docs: indexRows.reduce((s, x) => s + num(x.doc_count), 0),
        total_queries_30d: indexRows.reduce((s, x) => s + num(x.queries_30d), 0),
        ...baseMeta,
      };
    });
  }

  const cleanupMatch = path.match(/^\/api\/storage\/buckets\/([^/]+)\/cleanup$/i);
  if (cleanupMatch && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    const bucketName = decodeURIComponent(cleanupMatch[1] || '').trim();
    const body = await request.json().catch(() => ({}));
    const status = String(body.status || '').trim();
    if (!['reviewed', 'archived', 'unreviewed'].includes(status)) {
      return jsonResponse({ error: 'status must be reviewed, archived, or unreviewed' }, 400);
    }
    await env.DB.prepare(
      `UPDATE r2_bucket_summary SET cleanup_status = ?, cleanup_notes = COALESCE(?, cleanup_notes) WHERE bucket_name = ?`,
    ).bind(status, body.notes != null ? String(body.notes).slice(0, 1000) : null, bucketName).run();
    if (env.SESSION_CACHE?.delete) {
      await Promise.all([
        env.SESSION_CACHE.delete(`storage_buckets_${tenantId}`).catch(() => { }),
        env.SESSION_CACHE.delete(`storage_analytics_${tenantId}`).catch(() => { }),
      ]);
    }
    return jsonResponse({ ok: true, bucket_name: bucketName, cleanup_status: status, ...baseMeta });
  }

  const errorMatch = path.match(/^\/api\/storage\/errors\/([^/]+)$/i);
  if (errorMatch && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    const eventId = decodeURIComponent(errorMatch[1] || '').trim();
    await env.DB.prepare(
      `UPDATE worker_analytics_errors SET resolved = 1 WHERE event_id = ?`,
    ).bind(eventId).run();
    if (env.SESSION_CACHE?.delete) await env.SESSION_CACHE.delete(`storage_analytics_${tenantId}`).catch(() => { });
    return jsonResponse({ ok: true, event_id: eventId, resolved: 1, ...baseMeta });
  }

  if (pathLower === '/api/storage/activity' && method === 'GET') {
    if (!env.DB) return jsonResponse({ source: 'd1_registry', data_quality: 'partial', last_synced_at: null, events: [], failed: ['DB'], ...baseMeta });
    return cachedStorageResponse(env, 'activity', tenantId, async (failed) => {
      const worker = (url.searchParams.get('worker_name') || '').trim();
      const outcome = (url.searchParams.get('outcome') || '').trim();
      const start = (url.searchParams.get('start') || '').trim();
      const end = (url.searchParams.get('end') || '').trim();
      const where = [];
      const binds = [];
      if (worker) { where.push('worker_name = ?'); binds.push(worker); }
      if (outcome) { where.push('outcome = ?'); binds.push(outcome); }
      if (start) { where.push('datetime(timestamp) >= datetime(?)'); binds.push(start); }
      if (end) { where.push('datetime(timestamp) <= datetime(?)'); binds.push(end); }
      const events = await q(env, failed, 'worker_analytics_events', `
        SELECT id, event_id, worker_name, environment, timestamp, outcome, status, method, url, duration_ms, cpu_time_ms
        FROM worker_analytics_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY timestamp DESC LIMIT 50
      `, binds);
      const syncRow = await q(env, failed, 'worker_analytics_events', `SELECT MAX(timestamp) AS last_synced_at FROM worker_analytics_events`, [], 'first');
      return { source: 'd1_registry', data_quality: 'healthy', last_synced_at: syncRow?.last_synced_at ?? null, events, ...baseMeta };
    });
  }

  if (pathLower.startsWith('/api/storage/jobs/') && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    if (!(await requireStorageSuperadmin(env, authUser))) return jsonResponse({ error: 'Forbidden' }, 403);

    if (pathLower === '/api/storage/jobs/sync-project-storage') {
      let upserted = 0;
      let already_current = 0;
      const errors = [];
      await Promise.all(knownLiveStorage(env).map(async (b) => {
        try {
          const existing = await env.DB.prepare(
            `SELECT id FROM project_storage WHERE tenant_id = ? AND storage_name = ? LIMIT 1`,
          ).bind(tenantId, b.storage_name).first();
          if (existing) {
            await env.DB.prepare(
              `UPDATE project_storage SET status = 'active', storage_type = 'r2_bucket', storage_id = ?, metadata_json = ?, updated_at = unixepoch() WHERE tenant_id = ? AND storage_name = ?`,
            ).bind(b.storage_id, JSON.stringify({ binding: b.binding, public: b.public, url: b.url || null }), tenantId, b.storage_name).run();
            already_current += 1;
          } else {
            await env.DB.prepare(
              `INSERT INTO project_storage (id, tenant_id, storage_type, storage_name, storage_id, region, status, metadata_json, created_at, updated_at)
               VALUES (?, ?, 'r2_bucket', ?, ?, 'auto', 'active', ?, unixepoch(), unixepoch())`,
            ).bind(`ps_${b.storage_name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`, tenantId, b.storage_name, b.storage_id, JSON.stringify({ binding: b.binding, public: b.public, url: b.url || null })).run();
            upserted += 1;
          }
        } catch (e) {
          errors.push({ storage_name: b.storage_name, error: String(e?.message || e) });
        }
      }));
      return jsonResponse({ upserted, already_current, errors, ...baseMeta });
    }

    if (pathLower === '/api/storage/jobs/rollup-bucket-summary') {
      const bucketRows = await q(env, new Set(), 'r2_objects', `SELECT DISTINCT bucket_id FROM r2_objects WHERE tenant_id = ? AND COALESCE(is_active,1) = 1`, [tenantId]);
      let buckets_updated = 0;
      let total_objects = 0;
      let total_mb = 0;
      await Promise.all(bucketRows.map(async (b) => {
        const bucketId = b.bucket_id;
        const [sumRow, typeRows] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS object_count, COALESCE(SUM(file_size),0) AS total_bytes, COALESCE(SUM(file_size),0)/1048576.0 AS total_mb FROM r2_objects WHERE bucket_id = ? AND tenant_id = ? AND COALESCE(is_active,1) = 1`).bind(bucketId, tenantId).first(),
          env.DB.prepare(`SELECT COALESCE(content_type,'unknown') AS content_type, COUNT(*) AS cnt FROM r2_objects WHERE bucket_id = ? AND tenant_id = ? AND COALESCE(is_active,1) = 1 GROUP BY COALESCE(content_type,'unknown')`).bind(bucketId, tenantId).all(),
        ]);
        const contentTypes = {};
        rows(typeRows).forEach((r) => { contentTypes[r.content_type] = num(r.cnt); });
        await env.DB.prepare(
          `INSERT INTO r2_bucket_summary (bucket_name, object_count, total_bytes, total_mb, by_content_type_json, is_live_connected, last_inventoried_at, cleanup_status)
           VALUES (?, ?, ?, ?, ?, 1, datetime('now'), 'unreviewed')
           ON CONFLICT(bucket_name) DO UPDATE SET object_count = excluded.object_count, total_bytes = excluded.total_bytes, total_mb = excluded.total_mb, by_content_type_json = excluded.by_content_type_json, last_inventoried_at = excluded.last_inventoried_at`,
        ).bind(bucketId, num(sumRow?.object_count), num(sumRow?.total_bytes), num(sumRow?.total_mb), JSON.stringify(contentTypes)).run();
        buckets_updated += 1;
        total_objects += num(sumRow?.object_count);
        total_mb += num(sumRow?.total_mb);
      }));
      return jsonResponse({ buckets_updated, total_objects, total_mb, ...baseMeta });
    }

    if (pathLower === '/api/storage/jobs/rollup-worker-analytics') {
      const last = await q(env, new Set(), 'worker_analytics_hourly', `SELECT MAX(hour_timestamp) AS h FROM worker_analytics_hourly`, [], 'first');
      const since = last?.h || '1970-01-01 00:00:00';
      const grouped = await q(env, new Set(), 'worker_analytics_events', `
        SELECT worker_name, environment, strftime('%Y-%m-%d %H:00:00', timestamp) AS hour_timestamp,
               COUNT(*) AS total_requests,
               SUM(CASE WHEN outcome = 'ok' OR status BETWEEN 200 AND 399 THEN 1 ELSE 0 END) AS successful_requests,
               SUM(CASE WHEN NOT (outcome = 'ok' OR status BETWEEN 200 AND 399) THEN 1 ELSE 0 END) AS failed_requests,
               AVG(duration_ms) AS avg_duration_ms,
               AVG(cpu_time_ms) AS avg_cpu_time_ms,
               MAX(duration_ms) AS p95_duration_ms,
               SUM(CASE WHEN errors IS NOT NULL AND errors != '' AND errors != 'null' THEN 1 ELSE 0 END) AS total_errors
        FROM worker_analytics_events
        WHERE datetime(timestamp) > datetime(?)
        GROUP BY worker_name, environment, strftime('%Y-%m-%d %H:00:00', timestamp)
      `, [since]);
      await Promise.all(grouped.map((r) => env.DB.prepare(
        `INSERT OR REPLACE INTO worker_analytics_hourly
         (id, worker_name, environment, hour_timestamp, total_requests, successful_requests, failed_requests, avg_duration_ms, avg_cpu_time_ms, p95_duration_ms, total_errors, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(`${r.worker_name}:${r.environment}:${r.hour_timestamp}`, r.worker_name, r.environment, r.hour_timestamp, num(r.total_requests), num(r.successful_requests), num(r.failed_requests), num(r.avg_duration_ms), num(r.avg_cpu_time_ms), num(r.p95_duration_ms), num(r.total_errors)).run()));
      const errorEvents = await q(env, new Set(), 'worker_analytics_events', `
        SELECT event_id, worker_name, environment, timestamp, errors, url, method, status
        FROM worker_analytics_events
        WHERE errors IS NOT NULL AND errors != '' AND errors != 'null'
        ORDER BY timestamp DESC LIMIT 500
      `);
      await Promise.all(errorEvents.map((r) => env.DB.prepare(
        `INSERT OR IGNORE INTO worker_analytics_errors
         (event_id, worker_name, environment, timestamp, error_message, path, method, status_code, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      ).bind(r.event_id, r.worker_name, r.environment, r.timestamp, String(r.errors || '').slice(0, 1000), r.url, r.method, num(r.status)).run()));
      return jsonResponse({ hourly_rows: grouped.length, errors_extracted: errorEvents.length, ...baseMeta });
    }

    return jsonResponse({ error: 'Storage job not found', path: pathLower }, 404);
  }

  // ── S3-compatible config + keys (tenant-scoped key list) ───────
  async function s3BundleResponse() {
    const endpoint = r2S3PublicEndpoint(env);
    const region = env.R2_REGION || 'auto';
    const [accessKeys, sourceBuckets, policies] = await Promise.all([
      listAccessKeysForTenant(env, tenantId, userId),
      env.DB
        ? q(env, new Set(), 'project_storage', `SELECT storage_name, storage_id, storage_type, status FROM project_storage WHERE tenant_id = ? AND status = 'active' ORDER BY storage_name`, [tenantId])
        : Promise.resolve([]),
      env.DB
        ? q(env, new Set(), 'storage_policies', `SELECT bucket_name, actions FROM storage_policies WHERE tenant_id = ? AND user_id = ? AND effect = 'allow'`, [tenantId, userId])
        : Promise.resolve([]),
    ]);
    const allowedBuckets = [...new Set(policies.map((p) => p.bucket_name).filter(Boolean))];
    let hyperdrive =
      'Hyperdrive binding HYPERDRIVE is configured for Postgres/regional acceleration; connection strings are not exposed via this API.';
    if (!env.HYPERDRIVE) {
      hyperdrive = 'No Hyperdrive binding in this Worker.';
    }

    return jsonResponse({
      source: 'd1_registry',
      data_quality: 'healthy',
      last_synced_at: null,
      ...baseMeta,
      endpoint,
      region,
      accessKeys,
      keys: accessKeys,
      source_buckets: sourceBuckets,
      allowed_buckets_json: JSON.stringify(allowedBuckets),
      hyperdrive,
      hyperdriveInfo: hyperdrive,
    });
  }

  if (
    (pathLower === '/api/storage/s3-config' || pathLower === '/api/storage/s3') &&
    method === 'GET'
  ) {
    return s3BundleResponse();
  }

  // ── Create access key (registry + one-time secret) ─────────────
  if (
    (pathLower === '/api/storage/access-keys' || pathLower === '/api/storage/s3/keys') &&
    method === 'POST'
  ) {
    if (!env.DB) {
      return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    }

    const accessKeyId = `iam_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const secretAccessKey = `sec_${randomSecret(40)}`;
    const secret_hash = await sha256Hex(secretAccessKey);
    const id = crypto.randomUUID();
    const created_at = Math.floor(Date.now() / 1000);

    try {
      await env.DB.prepare(
        `INSERT INTO user_storage_access_keys (id, tenant_id, user_id, access_key_id, secret_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`
      )
        .bind(id, tenantId, userId, accessKeyId, secret_hash, created_at)
        .run();
    } catch (e) {
      console.error('[storage] access-keys insert', e);
      return jsonResponse(
        {
          error: 'Failed to store access key',
          detail: String(e?.message || e),
          hint: 'Apply D1 migration migrations/233_storage_preferences_and_keys.sql',
          ...baseMeta,
        },
        503,
      );
    }

    return jsonResponse({
      ...baseMeta,
      accessKeyId,
      secretAccessKey,
      secret: secretAccessKey,
      rawSecret: secretAccessKey,
      created_at,
      warning: 'Store the secret now; it cannot be retrieved again.',
    });
  }

  // ── Preferences (D1) ────────────────────────────────────────────
  async function savePreferences(body) {
    if (!env.DB) {
      return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    }
    const prefs =
      body && typeof body === 'object'
        ? body
        : {};
    const prefs_json = JSON.stringify(prefs);
    const updated_at = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO user_storage_preferences (tenant_id, user_id, prefs_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tenant_id, user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`
      )
        .bind(tenantId, userId, prefs_json, updated_at)
        .run();
    } catch (e) {
      console.error('[storage] preferences', e);
      return jsonResponse(
        {
          error: 'Failed to save preferences',
          detail: String(e?.message || e),
          hint: 'Apply D1 migration migrations/233_storage_preferences_and_keys.sql',
          ...baseMeta,
        },
        503,
      );
    }
    return jsonResponse({ ok: true, ...baseMeta, prefs });
  }

  if (pathLower === '/api/storage/preferences' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    return savePreferences(body);
  }

  // Dashboard UI uses PATCH /api/storage/settings — same as preferences
  if (pathLower === '/api/storage/settings' && method === 'PATCH') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    return savePreferences(body);
  }

  if (pathLower === '/api/storage/preferences' && method === 'GET') {
    if (!env.DB) {
      return jsonResponse({ prefs: {}, ...baseMeta });
    }
    try {
      const row = await env.DB.prepare(
        `SELECT prefs_json, updated_at FROM user_storage_preferences WHERE tenant_id = ? AND user_id = ? LIMIT 1`
      )
        .bind(tenantId, userId)
        .first();
      let prefs = {};
      if (row?.prefs_json) {
        try {
          prefs = JSON.parse(row.prefs_json);
        } catch (_) {
          prefs = {};
        }
      }
      return jsonResponse({ ...baseMeta, prefs, updated_at: row?.updated_at ?? null });
    } catch (e) {
      return jsonResponse({ prefs: {}, ...baseMeta, error: String(e?.message || e) }, 200);
    }
  }

  return jsonResponse({ error: 'Storage route not found', path: pathLower }, 404);
}
