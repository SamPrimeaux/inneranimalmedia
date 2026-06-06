/**
 * Storage → Vectors API surface: platform operator CF/pgvector registry vs tenant workspace lanes.
 */
import { authUserIsSuperadmin } from './auth.js';
import { resolveSupabaseWorkspaceId } from './rag-lanes.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';

export const PLATFORM_VECTOR_TENANT = 'tenant_sam_primeaux';

const PGVECTOR_LANE_PURPOSES = [
  { purpose: 'memory', table: 'agentsam_memory_oai3large_1536', dimensions: 1536 },
  { purpose: 'codebase_chunks', table: 'agentsam_codebase_chunks_oai3large_1536', dimensions: 1536 },
  { purpose: 'documents', table: 'agentsam_documents_oai3large_1536', dimensions: 1536 },
  { purpose: 'database_schema', table: 'agentsam_database_schema_oai3large_1536', dimensions: 1536 },
  { purpose: 'deep_archive', table: 'agentsam_deep_archive_oai3large_3072', dimensions: 3072, is_archive: true },
  { purpose: 'media', table: 'agentsam_media_gemini2_1536', dimensions: 1536 },
];

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

/**
 * Platform Vectorize registry visible only to superadmin / tenant_sam_primeaux au_* operators.
 * @param {any} env
 * @param {any} authUser
 * @param {string} tenantId
 */
export async function canViewPlatformVectorRegistry(env, authUser, tenantId) {
  if (authUserIsSuperadmin(authUser)) return true;
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (email && env?.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT 1 FROM superadmin_identity WHERE LOWER(email) = ? AND COALESCE(is_enabled, 0) = 1 LIMIT 1`,
      )
        .bind(email)
        .first();
      if (row) return true;
    } catch (_) {
      /* table optional */
    }
  }
  const uid = String(authUser?.id || '').trim();
  if (!uid.startsWith('au_')) return false;
  return String(tenantId || '').trim() === PLATFORM_VECTOR_TENANT;
}

function resolveWorkspaceId(authUser, url, env) {
  const fromQuery = url.searchParams.get('workspace_id');
  if (fromQuery != null && String(fromQuery).trim() !== '') return String(fromQuery).trim();
  if (authUser?.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== '') {
    return String(authUser.active_workspace_id).trim();
  }
  return null;
}

async function enrichCfIndex(env, idx, q) {
  const [docRow, staleRow, recentDocs] = await Promise.all([
    q(
      `SELECT COUNT(*) AS doc_count FROM vectorize_indexed_docs WHERE index_id = ? AND COALESCE(is_current,1) = 1`,
      [idx.id],
      'first',
    ),
    q(
      `SELECT COUNT(*) AS stale_count FROM vectorize_indexed_docs WHERE index_id = ? AND COALESCE(is_current,1) = 0`,
      [idx.id],
      'first',
    ),
    q(
      `SELECT source_r2_key, content_preview, chunk_index, token_count, indexed_at, is_current
       FROM vectorize_indexed_docs WHERE index_id = ? ORDER BY indexed_at DESC LIMIT 5`,
      [idx.id],
    ),
  ]);
  const binding = idx.binding_name && env[idx.binding_name] ? env[idx.binding_name] : null;
  return {
    ...idx,
    provider: 'cloudflare_vectorize',
    doc_count: num(docRow?.doc_count),
    stale_doc_count: num(staleRow?.stale_count),
    recent_docs: recentDocs,
    is_live_connected: !!binding,
    registry_status: 'registered',
  };
}

async function loadCfIndexCatalog(env, q, tenantId, isSuper) {
  const registrySql = isSuper
    ? `SELECT * FROM vectorize_index_registry
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY COALESCE(is_preferred, 0) DESC, display_name`
    : `SELECT * FROM vectorize_index_registry
       WHERE (tenant_id = ? OR tenant_id IS NULL OR tenant_id = ?)
         AND COALESCE(is_active, 1) = 1
       ORDER BY COALESCE(is_preferred, 0) DESC, display_name`;
  const binds = isSuper ? [] : [tenantId, PLATFORM_VECTOR_TENANT];
  const registry = await q(registrySql, binds);
  return Promise.all(registry.map((idx) => enrichCfIndex(env, idx, q)));
}

async function loadPlatformPgvectorLanes(env, q) {
  // Global lane catalog — no tenant_id on agentsam_pgvector_lane_registry.
  // Workspace isolation lives on workspace_id in the Supabase pgvector tables.
  const lanes = await q(
    `SELECT id, schema_name, table_name, purpose, dimensions, metric, embedding_model,
            size_label, is_active, is_archive, description, updated_at
     FROM agentsam_pgvector_lane_registry
     WHERE COALESCE(is_active, 1) = 1
     ORDER BY purpose`,
  );
  return lanes.map((lane) => ({
    ...lane,
    provider: 'supabase_pgvector',
    is_live_connected: isHyperdriveUsable(env),
  }));
}

async function workspacePgvectorStats(env, d1WorkspaceId) {
  if (!isHyperdriveUsable(env) || !d1WorkspaceId) return [];
  const pgWorkspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!pgWorkspaceId) return [];

  const out = [];
  for (const lane of PGVECTOR_LANE_PURPOSES) {
    const sql = `SELECT COUNT(*)::bigint AS row_count
      FROM agentsam.${lane.table}
      WHERE workspace_id = $1::uuid`;
    const result = await runHyperdriveQuery(env, sql, [pgWorkspaceId]);
    out.push({
      provider: 'supabase_pgvector',
      purpose: lane.purpose,
      table_name: lane.table,
      schema_name: 'agentsam',
      dimensions: lane.dimensions,
      is_archive: !!lane.is_archive,
      workspace_id: d1WorkspaceId,
      workspace_row_count: result.ok ? num(result.rows?.[0]?.row_count) : null,
      query_ok: result.ok,
      query_error: result.ok ? null : result.error || 'query_failed',
    });
  }
  return out;
}

async function loadTenantConnections(env, tenantId, userId, q) {
  return q(
    `SELECT id, tenant_id, user_id, workspace_id, provider, display_name, index_name, table_name,
            schema_name, binding_label, account_id, dimensions, metric, connection_status,
            config_json, is_active, created_at, updated_at
     FROM tenant_vector_connections
     WHERE tenant_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1
     ORDER BY updated_at DESC`,
    [tenantId, userId],
  );
}

/**
 * @param {any} env
 * @param {any} authUser
 * @param {URL} url
 * @param {string} tenantId
 * @param {string} userId
 * @param {(sql: string, binds?: unknown[], mode?: string) => Promise<any>} q
 */
export async function buildStorageVectorsPayload(env, authUser, url, tenantId, userId, q) {
  const isSuper = authUserIsSuperadmin(authUser);
  const canViewPlatform = await canViewPlatformVectorRegistry(env, authUser, tenantId);
  const workspaceId = resolveWorkspaceId(authUser, url, env);

  const platformCfIndexes = await loadCfIndexCatalog(env, q, tenantId, isSuper);
  const platformPgvectorLanes = await loadPlatformPgvectorLanes(env, q);
  const workspacePgvector = canViewPlatform
    ? []
    : await workspacePgvectorStats(env, workspaceId);
  const tenantConnections = await loadTenantConnections(env, tenantId, userId, q);

  const indexes = platformCfIndexes;
  const totalsFromCf = platformCfIndexes.reduce(
    (acc, x) => ({
      stored: acc.stored + num(x.stored_vectors),
      docs: acc.docs + num(x.doc_count),
      queries: acc.queries + num(x.queries_30d),
    }),
    { stored: 0, docs: 0, queries: 0 },
  );

  return {
    can_view_platform: canViewPlatform,
    workspace_id: workspaceId,
    platform_cf_indexes: platformCfIndexes,
    platform_pgvector_lanes: platformPgvectorLanes,
    workspace_pgvector_lanes: workspacePgvector,
    tenant_connections: tenantConnections.map((row) => ({
      ...row,
      config: parseJsonObject(row.config_json),
    })),
    indexes,
    total_stored_vectors: totalsFromCf.stored,
    total_indexed_docs: totalsFromCf.docs,
    total_queries_30d: totalsFromCf.queries,
    last_synced_at: platformCfIndexes.reduce(
      (m, x) =>
        x.last_indexed_at && (!m || String(x.last_indexed_at) > String(m)) ? x.last_indexed_at : m,
      null,
    ),
  };
}

function newConnectionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `tvc_${hex}`;
}

const ALLOWED_PROVIDERS = new Set(['cloudflare_vectorize', 'supabase_pgvector', 'external']);

/**
 * @param {any} env
 * @param {string} tenantId
 * @param {string} userId
 * @param {Record<string, unknown>} body
 * @param {string|null} workspaceId
 */
export async function upsertTenantVectorConnection(env, tenantId, userId, body, workspaceId) {
  if (!env?.DB) throw new Error('database_not_configured');
  const provider = String(body.provider || '').trim().toLowerCase();
  if (!ALLOWED_PROVIDERS.has(provider)) throw new Error('invalid_provider');
  const displayName = String(body.display_name || '').trim();
  if (!displayName) throw new Error('display_name_required');

  const id = String(body.id || '').trim() || newConnectionId();
  const existing = await env.DB.prepare(
    `SELECT id FROM tenant_vector_connections WHERE id = ? AND tenant_id = ? AND user_id = ? LIMIT 1`,
  )
    .bind(id, tenantId, userId)
    .first();
  if (body.id && !existing) throw new Error('connection_not_found');

  const fields = {
    workspace_id: workspaceId || (body.workspace_id != null ? String(body.workspace_id).trim() : null),
    provider,
    display_name: displayName.slice(0, 200),
    index_name: body.index_name != null ? String(body.index_name).trim().slice(0, 200) : null,
    table_name: body.table_name != null ? String(body.table_name).trim().slice(0, 200) : null,
    schema_name:
      body.schema_name != null ? String(body.schema_name).trim().slice(0, 64) : 'agentsam',
    binding_label: body.binding_label != null ? String(body.binding_label).trim().slice(0, 120) : null,
    account_id: body.account_id != null ? String(body.account_id).trim().slice(0, 64) : null,
    dimensions: body.dimensions != null ? num(body.dimensions, null) : null,
    metric: body.metric != null ? String(body.metric).trim().slice(0, 32) : 'cosine',
    connection_status: String(body.connection_status || 'pending').trim().slice(0, 32),
    config_json: JSON.stringify(
      body.config && typeof body.config === 'object' ? body.config : parseJsonObject(body.config_json),
    ).slice(0, 4000),
    is_active: body.is_active === false || body.is_active === 0 ? 0 : 1,
  };

  if (existing) {
    await env.DB.prepare(
      `UPDATE tenant_vector_connections SET
         workspace_id = ?, provider = ?, display_name = ?, index_name = ?, table_name = ?,
         schema_name = ?, binding_label = ?, account_id = ?, dimensions = ?, metric = ?,
         connection_status = ?, config_json = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND user_id = ?`,
    )
      .bind(
        fields.workspace_id,
        fields.provider,
        fields.display_name,
        fields.index_name,
        fields.table_name,
        fields.schema_name,
        fields.binding_label,
        fields.account_id,
        fields.dimensions,
        fields.metric,
        fields.connection_status,
        fields.config_json,
        fields.is_active,
        id,
        tenantId,
        userId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO tenant_vector_connections (
         id, tenant_id, user_id, workspace_id, provider, display_name, index_name, table_name,
         schema_name, binding_label, account_id, dimensions, metric, connection_status,
         config_json, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        id,
        tenantId,
        userId,
        fields.workspace_id,
        fields.provider,
        fields.display_name,
        fields.index_name,
        fields.table_name,
        fields.schema_name,
        fields.binding_label,
        fields.account_id,
        fields.dimensions,
        fields.metric,
        fields.connection_status,
        fields.config_json,
        fields.is_active,
      )
      .run();
  }
  return id;
}

export async function deactivateTenantVectorConnection(env, tenantId, userId, connectionId) {
  if (!env?.DB) throw new Error('database_not_configured');
  const id = String(connectionId || '').trim();
  if (!id) throw new Error('id_required');
  const result = await env.DB.prepare(
    `UPDATE tenant_vector_connections
     SET is_active = 0, updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND user_id = ?`,
  )
    .bind(id, tenantId, userId)
    .run();
  if (!(result.meta?.changes ?? 0)) throw new Error('connection_not_found');
}
