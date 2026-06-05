/**
 * Canonical Agent Sam semantic retrieval — 1536 Vectorize lanes + Hyperdrive pgvector fallback.
 * No env.VECTORIZE / AGENTSAMVECTORIZE / public.* in normal Agent chat paths.
 */
import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { resolveSupabaseWorkspaceId, LANES } from './rag-lanes.js';
import { resolveTextEmbeddingRoute } from './embedding-routes.js';

export const SEMANTIC_LANE_KEYS = Object.freeze([
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'media_semantic_search',
  'deep_archive_search',
]);

/** @type {Record<string, { laneKey: string, ragLane: string|null, binding: string|null, tables: string[], dims: number }>} */
export const SEMANTIC_LANE_REGISTRY = Object.freeze({
  code_semantic_search: {
    laneKey: 'code_semantic_search',
    ragLane: 'code',
    binding: 'AGENTSAM_VECTORIZE_CODE',
    tables: ['agentsam_codebase_chunks_oai3large_1536', 'agentsam_codebase_files_oai3large_1536'],
    dims: 1536,
  },
  schema_semantic_search: {
    laneKey: 'schema_semantic_search',
    ragLane: 'schema',
    binding: 'AGENTSAM_VECTORIZE_SCHEMA',
    tables: ['agentsam_database_schema_oai3large_1536'],
    dims: 1536,
  },
  memory_semantic_search: {
    laneKey: 'memory_semantic_search',
    ragLane: 'memory',
    binding: 'AGENTSAM_VECTORIZE_MEMORY',
    tables: ['agentsam_memory_oai3large_1536'],
    dims: 1536,
  },
  docs_knowledge_search: {
    laneKey: 'docs_knowledge_search',
    ragLane: 'docs',
    binding: 'AGENTSAM_VECTORIZE_DOCUMENTS',
    tables: ['agentsam_documents_oai3large_1536'],
    dims: 1536,
  },
  media_semantic_search: {
    laneKey: 'media_semantic_search',
    ragLane: 'media',
    binding: 'AGENTSAM_VECTORIZE_MEDIA',
    tables: ['agentsam_media_gemini2_1536'],
    dims: 1536,
    embedModel: 'gemini-embedding-2',
  },
  deep_archive_search: {
    laneKey: 'deep_archive_search',
    ragLane: 'archive',
    binding: null,
    tables: ['agentsam_deep_archive_oai3large_3072'],
    dims: 3072,
  },
});

const EMBEDDING_MODEL_1536 = resolveTextEmbeddingRoute('docs').model;
const EMBEDDING_MODEL_3072 = resolveTextEmbeddingRoute('docs').model;
const SEMANTIC_CACHE_TTL_SEC = 3600;

/**
 * @param {string} lane
 * @param {string} workspaceIdD1
 * @param {string} queryHash
 * @param {number} topK
 */
function semanticCacheKey(lane, workspaceIdD1, queryHash, topK) {
  return `sem:v1:${lane}:${workspaceIdD1}:${queryHash}:${topK}`;
}

/**
 * @param {any} env
 * @param {string} key
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function readSemanticCache(env, key) {
  if (!env?.SESSION_CACHE?.get) return null;
  try {
    const raw = await env.SESSION_CACHE.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} key
 * @param {Record<string, unknown>} payload
 */
async function writeSemanticCache(env, key, payload) {
  if (!env?.SESSION_CACHE?.put) return;
  try {
    await env.SESSION_CACHE.put(key, JSON.stringify(payload), {
      expirationTtl: SEMANTIC_CACHE_TTL_SEC,
    });
  } catch {
    /* non-fatal */
  }
}

/** @param {string} text */
export async function semanticQueryHash(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** @param {number[]} embedding */
function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('embedding required');
  return `[${embedding.join(',')}]`;
}

/**
 * @param {string} laneKey
 * @returns {{ provider: string, model: string, dimensions: number }}
 */
export function embeddingSpecForSemanticLane(laneKey) {
  const reg = SEMANTIC_LANE_REGISTRY[laneKey];
  if (!reg) throw new Error(`unknown semantic lane: ${laneKey}`);
  const dims = reg.dims;
  return {
    provider: 'openai',
    model: dims === 3072 ? EMBEDDING_MODEL_3072 : EMBEDDING_MODEL_1536,
    dimensions: dims,
  };
}

/**
 * @param {number[]} embedding
 * @param {number} expected
 */
function assertEmbeddingDimensions(embedding, expected) {
  if (!Array.isArray(embedding) || embedding.length !== expected) {
    const err = new Error(`embedding dimension mismatch: expected ${expected}, got ${embedding?.length ?? 0}`);
    err.code = 'semantic_lane_degraded';
    throw err;
  }
}

/**
 * @param {any} env
 * @param {string} laneKey
 * @param {number[]} embedding
 * @param {string} d1WorkspaceId
 * @param {string} workspaceUuid
 * @param {number} topK
 */
async function queryVectorizeLane(env, laneKey, embedding, d1WorkspaceId, workspaceUuid, topK) {
  const reg = SEMANTIC_LANE_REGISTRY[laneKey];
  const ragLane = reg.ragLane ? LANES[reg.ragLane] : null;
  if (!reg.binding || !ragLane?.vectorize) return { hits: [], backend: 'vectorize', skipped: 'no_binding' };
  const binding = env?.[reg.binding];
  if (typeof binding?.query !== 'function') {
    return { hits: [], backend: 'vectorize', skipped: 'binding_unavailable' };
  }
  const result = await binding.query(embedding, {
    topK,
    filter: { workspace_id: { $eq: d1WorkspaceId } },
    returnMetadata: 'all',
  });
  const matches = result?.matches || result?.result?.matches || [];
  const hits = [];
  for (const match of matches) {
    const row = await hydrateVectorHit(env, ragLane, workspaceUuid, match);
    if (row) hits.push(row);
  }
  return { hits, backend: 'cloudflare_vectorize', binding: reg.binding, table: ragLane.supabase_table };
}

/**
 * @param {string} table
 * @param {number} dims
 * @returns {string}
 */
function pgvectorSelectSqlForTable(table, dims) {
  const vec = `$1::vector(${dims})`;
  if (table.includes('database_schema')) {
    return `
    SELECT id, title, content, database_name, object_type, table_name, schema_name, metadata,
           1 - (embedding <=> ${vec}) AS score
      FROM agentsam.${table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> ${vec}
     LIMIT $3`;
  }
  if (table.includes('codebase_chunks')) {
    return `
    SELECT id, file_path, content, chunk_index, metadata,
           COALESCE(file_path, '') AS title,
           1 - (embedding <=> ${vec}) AS score
      FROM agentsam.${table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> ${vec}
     LIMIT $3`;
  }
  const titleCol = table.includes('memory') ? 'memory_key' : 'title';
  return `
    SELECT id,
           COALESCE(${titleCol}, '') AS title,
           content,
           source_ref,
           metadata,
           1 - (embedding <=> ${vec}) AS score
      FROM agentsam.${table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> ${vec}
     LIMIT $3`;
}

/**
 * @param {string} laneKey
 * @param {string} table
 * @param {Record<string, unknown>} row
 */
function mapPgvectorHit(laneKey, table, row) {
  const isMemoryLane = laneKey === 'memory_semantic_search' || table.includes('memory_oai3large');
  if (isMemoryLane) {
    return {
      id: String(row.id ?? ''),
      title: String(row.title ?? row.memory_key ?? '').trim(),
      content: String(row.content ?? '').trim(),
      source_ref: row.memory_key != null ? String(row.memory_key) : null,
      file_path: null,
      score: Number(row.score ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    };
  }
  if (table.includes('database_schema')) {
    const parts = [row.database_name, row.object_type, row.table_name || row.title].filter(Boolean);
    return {
      id: String(row.id ?? ''),
      title: String(row.title ?? '').trim(),
      content: String(row.content ?? '').trim(),
      source_ref: parts.length ? parts.join(':') : null,
      file_path: null,
      score: Number(row.score ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    };
  }
  if (table.includes('codebase_chunks')) {
    const filePath = row.file_path != null ? String(row.file_path) : '';
    const chunkIndex = row.chunk_index ?? 0;
    return {
      id: String(row.id ?? ''),
      title: filePath.slice(0, 200),
      content: String(row.content ?? '').trim(),
      source_ref: filePath ? `${filePath}#${chunkIndex}` : null,
      file_path: filePath || null,
      score: Number(row.score ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    };
  }
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? '').trim(),
    content: String(row.content ?? '').trim(),
    source_ref: row.source_ref != null ? String(row.source_ref) : null,
    file_path: null,
    score: Number(row.score ?? 0),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

/**
 * @param {any} env
 * @param {{ supabase_table: string }} ragLane
 * @param {string} workspaceUuid
 * @param {any} match
 */
async function hydrateVectorHit(env, ragLane, workspaceUuid, match) {
  const table = ragLane.supabase_table;
  const sourceRef = String(match?.metadata?.source_ref ?? '').trim();
  const rowId = match?.id != null ? String(match.id).trim() : '';
  if (!sourceRef && !rowId) return null;

  let sql;
  let params;
  if (table.includes('database_schema')) {
    sql = `
    SELECT id, title, content, database_name, object_type, table_name, schema_name, metadata
      FROM agentsam.${table}
     WHERE workspace_id = $1::uuid
       AND ($2 <> '' AND id::text = $2)
     LIMIT 1`;
    params = [workspaceUuid, rowId];
  } else if (table.includes('codebase_chunks')) {
    sql = `
    SELECT id, file_path, content, chunk_index, metadata
      FROM agentsam.${table}
     WHERE workspace_id = $1::uuid
       AND ($2 <> '' AND id::text = $2)
     LIMIT 1`;
    params = [workspaceUuid, rowId];
  } else if (table.includes('memory_oai3large')) {
    sql = `
    SELECT id, title, content, source_ref, file_path, memory_key, metadata
      FROM agentsam.${table}
     WHERE workspace_id = $1::uuid
       AND (($2 <> '' AND id::text = $2) OR ($3 <> '' AND memory_key = $3))
     LIMIT 1`;
    params = [workspaceUuid, rowId, sourceRef];
  } else {
    sql = `
    SELECT id, title, content, source_ref, file_path, memory_key, metadata
      FROM agentsam.${table}
     WHERE workspace_id = $1::uuid
       AND (($2 <> '' AND id::text = $2) OR ($3 <> '' AND source_ref = $3) OR ($3 <> '' AND memory_key = $3))
     LIMIT 1`;
    params = [workspaceUuid, rowId, sourceRef];
  }

  const r = await runHyperdriveQuery(env, sql, params);
  const found = r?.rows?.[0];
  if (!found?.content && !found?.title && !found?.file_path) return null;

  let mappedSourceRef = sourceRef;
  let mappedTitle = String(found.title ?? found.memory_key ?? match?.metadata?.title ?? '').trim();
  if (table.includes('database_schema')) {
    const parts = [found.database_name, found.object_type, found.table_name || found.title].filter(Boolean);
    mappedSourceRef = parts.length ? parts.join(':') : sourceRef;
    mappedTitle = mappedTitle || mappedSourceRef;
  } else if (table.includes('codebase_chunks')) {
    const fp = found.file_path != null ? String(found.file_path) : '';
    const idx = found.chunk_index ?? 0;
    mappedSourceRef = fp ? `${fp}#${idx}` : sourceRef;
    mappedTitle = fp.slice(0, 200) || mappedTitle;
  }

  return {
    id: String(found.id ?? rowId),
    title: mappedTitle,
    content: String(found.content ?? '').trim(),
    source_ref: String(found.source_ref ?? found.memory_key ?? mappedSourceRef).trim(),
    file_path: found.file_path != null ? String(found.file_path) : null,
    score: Number(match?.score ?? 0),
    metadata: found.metadata && typeof found.metadata === 'object' ? found.metadata : match?.metadata ?? {},
  };
}

/**
 * @param {any} env
 * @param {string} laneKey
 * @param {number[]} embedding
 * @param {string} workspaceUuid
 * @param {number} topK
 */
async function queryPgvectorLane(env, laneKey, embedding, workspaceUuid, topK) {
  const reg = SEMANTIC_LANE_REGISTRY[laneKey];
  if (laneKey === 'deep_archive_search') {
    const table = reg.tables[0];
    const sql = `
    SELECT id, title, content, source_ref, source_path, metadata,
           1 - (embedding <=> $1::vector(3072)) AS similarity
      FROM agentsam.${table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector(3072)
     LIMIT $3`;
    const r = await runHyperdriveQuery(env, sql, [vectorLiteral(embedding), workspaceUuid, topK]);
    if (!r.ok) return { hits: [], backend: 'pgvector', error: r.error, table };
    const hits = (r.rows || []).map((row) => ({
      id: String(row.id ?? ''),
      title: String(row.title ?? 'archive').trim(),
      content: String(row.content ?? '').trim(),
      source_ref: row.source_ref != null ? String(row.source_ref) : null,
      file_path: row.source_path != null ? String(row.source_path) : null,
      score: Number(row.similarity ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    }));
    return { hits, backend: 'pgvector', table: reg.tables[0] };
  }

  const primaryTable = reg.tables[0];
  const ragLane = reg.ragLane ? LANES[reg.ragLane] : null;
  const table = ragLane?.supabase_table || primaryTable;
  const isMemoryLane = laneKey === 'memory_semantic_search' || table.includes('memory_oai3large');
  const dims = reg.dims === 3072 ? 3072 : 1536;

  let sql;
  if (isMemoryLane) {
    sql = `
    SELECT id, workspace_id, user_id, oauth_client_id, memory_key, content,
           title, source, metadata, created_at, updated_at,
           vectorize_binding, vectorize_index, vectorize_id, embedded_at,
           1 - (embedding <=> $1::vector(${dims})) AS score
      FROM agentsam.${table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector(${dims})
     LIMIT $3`;
  } else {
    sql = pgvectorSelectSqlForTable(table, dims);
  }

  const r = await runHyperdriveQuery(env, sql, [vectorLiteral(embedding), workspaceUuid, topK]);
  if (!r.ok) return { hits: [], backend: 'pgvector', error: r.error, table };
  const hits = (r.rows || []).map((row) => mapPgvectorHit(laneKey, table, row));
  return { hits, backend: 'pgvector', table };
}

/**
 * @param {any} env
 * @param {{
 *   lane: string,
 *   query: string,
 *   workspace_id: string,
 *   tenant_id?: string,
 *   user_id?: string,
 *   agent_run_id?: string,
 *   top_k?: number,
 * }} opts
 */
export async function dispatchSemanticRetrieval(env, opts) {
  const lane = String(opts.lane || '').trim();
  const query = String(opts.query || '').trim();
  const workspaceIdD1 = String(opts.workspace_id || '').trim();
  const topK = Math.min(Math.max(1, Number(opts.top_k) || 6), 20);
  const t0 = Date.now();
  const queryHash = await semanticQueryHash(query);

  const reg = SEMANTIC_LANE_REGISTRY[lane];
  if (!reg || !query || !workspaceIdD1) {
    return {
      ok: false,
      lane,
      backend: 'none',
      binding: null,
      table: null,
      query_hash: queryHash,
      results: [],
      result_count: 0,
      duration_ms: Date.now() - t0,
      fallback_used: false,
      degraded_reason: !reg ? 'unknown_lane' : 'missing_query_or_workspace',
      error: 'invalid_dispatch_input',
    };
  }

  const cacheKey = semanticCacheKey(lane, workspaceIdD1, queryHash, topK);
  if (opts.bypass_cache !== true) {
    const cached = await readSemanticCache(env, cacheKey);
    if (cached && cached.ok === true) {
      return {
        ...cached,
        duration_ms: Date.now() - t0,
        cached: true,
      };
    }
  }

  if (lane === 'media_semantic_search') {
    try {
      const { searchMovieModeMedia } = await import('./moviemode-media-vectorize.js');
      const out = await searchMovieModeMedia(env, {
        workspaceId: workspaceIdD1,
        query,
        topK,
        projectId: opts.project_id || null,
        mediaKind: opts.media_kind || null,
      });
      const results = (out.results || []).map((r) => ({
        lane,
        id: String(r.asset_id || ''),
        title: String(r.filename || r.asset_id || 'media'),
        content: [r.media_kind, r.filename, r.object_key].filter(Boolean).join(' · '),
        source_ref: String(r.object_key || ''),
        file_path: String(r.object_key || ''),
        score: Number(r.score) || 0,
        metadata: {
          bucket: r.bucket,
          media_kind: r.media_kind,
          content_type: r.content_type,
          project_id: r.project_id,
        },
      }));
      const payload = {
        ok: out.ok !== false,
        lane,
        backend: 'cloudflare_vectorize',
        binding: reg.binding,
        table: 'media_assets',
        query_hash: queryHash,
        results,
        result_count: results.length,
        duration_ms: Date.now() - t0,
        fallback_used: false,
        embed_model: out.model || reg.embedModel || 'gemini-embedding-2',
      };
      await writeSemanticCache(env, cacheKey, payload);
      return payload;
    } catch (e) {
      return {
        ok: false,
        lane,
        backend: 'cloudflare_vectorize',
        binding: reg.binding,
        table: 'media_assets',
        query_hash: queryHash,
        results: [],
        result_count: 0,
        duration_ms: Date.now() - t0,
        fallback_used: false,
        degraded_reason: 'media_search_failed',
        error: e?.message ? String(e.message) : String(e),
      };
    }
  }

  if (!isHyperdriveUsable(env)) {
    return {
      ok: false,
      lane,
      backend: 'hyperdrive',
      binding: reg.binding,
      table: reg.tables[0],
      query_hash: queryHash,
      results: [],
      result_count: 0,
      duration_ms: Date.now() - t0,
      fallback_used: false,
      degraded_reason: 'hyperdrive_unavailable',
      error: 'hyperdrive_unavailable',
    };
  }

  const workspaceUuid = await resolveSupabaseWorkspaceId(env, workspaceIdD1);
  if (!workspaceUuid) {
    return {
      ok: false,
      lane,
      backend: 'hyperdrive',
      binding: reg.binding,
      table: reg.tables[0],
      query_hash: queryHash,
      results: [],
      result_count: 0,
      duration_ms: Date.now() - t0,
      fallback_used: false,
      degraded_reason: 'workspace_unresolved',
      error: 'workspace_unresolved',
    };
  }

  let embedding;
  try {
    const spec = embeddingSpecForSemanticLane(lane);
    ({ embedding } = await createAgentsamEmbedding(env, query, { spec }));
    assertEmbeddingDimensions(embedding, spec.dimensions);
  } catch (e) {
    return {
      ok: false,
      lane,
      backend: 'none',
      binding: reg.binding,
      table: reg.tables[0],
      query_hash: queryHash,
      results: [],
      result_count: 0,
      duration_ms: Date.now() - t0,
      fallback_used: false,
      degraded_reason: e?.code === 'semantic_lane_degraded' ? 'dimension_mismatch' : 'embedding_failed',
      error: e?.message ? String(e.message) : String(e),
    };
  }

  let backend = 'cloudflare_vectorize';
  let binding = reg.binding;
  let table = reg.tables[0];
  let fallbackUsed = false;
  let hits = [];
  let pgError = null;

  if (lane !== 'deep_archive_search' && reg.binding) {
    const vz = await queryVectorizeLane(env, lane, embedding, workspaceIdD1, workspaceUuid, topK);
    hits = vz.hits || [];
    backend = vz.backend;
    binding = vz.binding ?? reg.binding;
    table = vz.table ?? table;
    if (!hits.length && !vz.skipped) {
      fallbackUsed = true;
    }
  }

  if (!hits.length) {
    const pg = await queryPgvectorLane(env, lane, embedding, workspaceUuid, topK);
    hits = pg.hits || [];
    backend = pg.backend;
    table = pg.table ?? table;
    pgError = pg.error ? String(pg.error) : null;
    if (lane === 'deep_archive_search') binding = null;
    fallbackUsed = lane === 'deep_archive_search' || fallbackUsed || Boolean(pgError);
  }

  const results = hits.map((h) => ({
    lane,
    id: h.id,
    title: h.title,
    content: h.content,
    source_ref: h.source_ref,
    file_path: h.file_path,
    score: h.score,
    metadata: h.metadata ?? {},
  }));

  const durationMs = Date.now() - t0;

  scheduleSemanticSearchLog(env, {
    workspaceUuid,
    userId: opts.user_id,
    query,
    queryHash,
    lane,
    backend,
    binding,
    table,
    resultCount: results.length,
    durationMs,
    fallbackUsed,
    agentRunId: opts.agent_run_id,
  }).catch(() => {});

  if (pgError) {
    return {
      ok: false,
      lane,
      backend,
      binding,
      table,
      query_hash: queryHash,
      results: [],
      result_count: 0,
      duration_ms: durationMs,
      fallback_used: fallbackUsed,
      degraded_reason: 'pgvector_error',
      error: pgError,
    };
  }

  const response = {
    ok: true,
    lane,
    backend,
    binding,
    table,
    query_hash: queryHash,
    results,
    result_count: results.length,
    duration_ms: durationMs,
    fallback_used: fallbackUsed,
    degraded_reason: results.length ? null : 'no_hits',
    error: null,
    cached: false,
  };
  writeSemanticCache(env, cacheKey, response).catch(() => {});
  return response;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row
 */
async function scheduleSemanticSearchLog(env, row) {
  if (!isHyperdriveUsable(env)) return;
  const sql = `INSERT INTO agentsam.agentsam_search_log (
      workspace_id, user_id, query_text, result_count, duration_ms, search_type, metadata
    ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)`;
  const meta = {
    lane: row.lane,
    backend: row.backend,
    binding: row.binding,
    table: row.table,
    query_hash: row.queryHash,
    fallback_used: row.fallbackUsed === true,
    agent_run_id: row.agentRunId ?? null,
  };
  let userUuid = null;
  const uid = row.userId != null ? String(row.userId) : '';
  if (/^[0-9a-f-]{36}$/i.test(uid)) userUuid = uid;
  await runHyperdriveQuery(env, sql, [
    row.workspaceUuid,
    userUuid,
    String(row.query || '').slice(0, 4000),
    Number(row.resultCount) || 0,
    Number(row.durationMs) || 0,
    String(row.lane || 'semantic'),
    JSON.stringify(meta),
  ]);
}
