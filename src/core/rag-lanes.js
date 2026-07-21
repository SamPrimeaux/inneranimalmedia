import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { runHyperdriveQuery } from './hyperdrive-query.js';

export const LANES = {
  memory: {
    name: 'memory',
    vectorize: 'AGENTSAM_VECTORIZE_MEMORY',
    supabase_table: 'agentsam_memory_oai3large_1536',
  },
  code: {
    name: 'code',
    vectorize: 'AGENTSAM_VECTORIZE_CODE',
    supabase_table: 'agentsam_codebase_chunks_oai3large_1536',
  },
  docs: {
    name: 'docs',
    vectorize: 'AGENTSAM_VECTORIZE_DOCUMENTS',
    supabase_table: 'agentsam_documents_oai3large_1536',
  },
  schema: {
    name: 'schema',
    vectorize: 'AGENTSAM_VECTORIZE_SCHEMA',
    supabase_table: 'agentsam_database_schema_oai3large_1536',
  },
  archive: {
    name: 'archive',
    vectorize: null,
    supabase_table: 'agentsam_deep_archive_oai3large_3072',
  },
  media: {
    name: 'media',
    vectorize: 'AGENTSAM_VECTORIZE_MEDIA',
    supabase_table: 'agentsam_media_gemini2_1536',
    embed_lane: 'multimodal',
    embed_model: 'gemini-embedding-2',
  },
};

function resolveLaneConfig(laneName) {
  const key = String(laneName ?? '').trim();
  return key ? LANES[key] ?? null : null;
}

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('embedding required');
  return `[${embedding.join(',')}]`;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) {
      out[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value).slice(0, 2000);
    }
  }
  return out;
}

/** D1 workspace_key → Supabase agentsam_workspaces.id (UUID) */
const KNOWN_SUPABASE_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
  ws_connor_mcneely: '105ac2d1-8e61-4cec-80c8-ef2a0902448d',
  ws_meauxbility: '869137d3-cd65-4ac1-88cc-a1bad9844718',
  ws_companionscpas: 'e57c3f65-d6d9-4a87-8b3d-55cfbdcc8641',
});

function isSupabaseWorkspaceUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

export async function resolveSupabaseWorkspaceId(env, d1WorkspaceId) {
  const key = String(d1WorkspaceId || '').trim();
  if (!key) return null;
  if (isSupabaseWorkspaceUuid(key)) return key;

  // Prefer D1 registry column when present (WS ↔ UUID SSOT).
  if (env?.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT supabase_workspace_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
      )
        .bind(key)
        .first();
      const fromD1 = row?.supabase_workspace_id != null ? String(row.supabase_workspace_id).trim() : '';
      if (fromD1 && isSupabaseWorkspaceUuid(fromD1)) return fromD1;
    } catch {
      /* column may be missing on old DBs */
    }
  }

  const known = KNOWN_SUPABASE_WORKSPACE_UUIDS[key];
  if (known) return known;

  const fromPg = await runHyperdriveQuery(
    env,
    'SELECT id FROM agentsam.agentsam_workspaces WHERE workspace_key = $1 LIMIT 1',
    [key],
  )
    .then((r) => {
      const id = r?.rows?.[0]?.id;
      return id != null ? String(id) : null;
    })
    .catch(() => null);
  if (fromPg && isSupabaseWorkspaceUuid(fromPg)) return fromPg;

  return null;
}

export async function contentHash(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Memory lane write — uses memory_key (not source_ref). Table: agentsam_memory_oai3large_1536.
 * @param {any} env
 * @param {Record<string, unknown>} params
 */
export async function writeMemoryLane(env, params = {}) {
  const d1WorkspaceId = String(params.workspace_id ?? params.workspace_id_d1 ?? '').trim();
  if (!d1WorkspaceId) throw new Error('writeMemoryLane: workspace_id required');

  const memoryKey = String(params.memory_key ?? '').trim();
  if (!memoryKey) throw new Error('writeMemoryLane: memory_key required');

  const content = String(params.content ?? '').trim();
  if (!content) throw new Error('writeMemoryLane: content required');

  const workspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceId) return { ok: false, skipped: 'workspace_unresolved' };

  const title = String(params.title ?? memoryKey).trim();
  const source = String(params.source ?? 'chat').trim();
  const metadata = sanitizeMetadata({
    ...(params.metadata && typeof params.metadata === 'object' ? params.metadata : {}),
    source_type: params.source_type ?? 'conversation',
    user_id: params.user_id ?? null,
  });

  const { embedding } = await createAgentsamEmbedding(env, content);
  const vector = vectorLiteral(embedding);
  const rowId = crypto.randomUUID();
  const table = LANES.memory.supabase_table;

  const write = await runHyperdriveQuery(
    env,
    `INSERT INTO agentsam.${table} (
       id, workspace_id, user_id, memory_key, content, title,
       embedding, source, metadata, created_at, updated_at, embedded_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6,
       $7::vector, $8, $9::jsonb, now(), now(), now()
     )
     RETURNING id`,
    [
      rowId,
      workspaceId,
      params.user_id != null ? String(params.user_id) : null,
      memoryKey,
      content,
      title,
      vector,
      source,
      JSON.stringify(metadata),
    ],
  );
  if (!write?.ok) throw new Error(write?.error || 'memory lane insert failed');

  const savedId = String(write.rows?.[0]?.id ?? rowId);
  const vectorizeBinding = LANES.memory.vectorize;
  if (vectorizeBinding && typeof env?.[vectorizeBinding]?.upsert === 'function') {
    await env[vectorizeBinding].upsert([
      {
        id: savedId,
        values: embedding,
        metadata: { workspace_id: d1WorkspaceId, memory_key: memoryKey, title, source },
      },
    ]);
  } else {
    try {
      const { enqueueVectorSyncOutbox } = await import('./agentsam-vector-sync-outbox.js');
      await enqueueVectorSyncOutbox(env, {
        workspaceId,
        sourceTable: table,
        sourceId: savedId,
        vectorIndex: vectorizeBinding || 'AGENTSAM_VECTORIZE_MEMORY',
        operation: 'upsert',
        embeddingDims: 1536,
      });
    } catch (e) {
      console.warn('[writeMemoryLane] outbox', e?.message ?? e);
    }
  }
  return { ok: true, id: savedId, memory_key: memoryKey };
}

export async function writeToLane(env, laneName, entry) {
  const lane = resolveLaneConfig(laneName);
  if (!lane) throw new Error(`unknown lane: ${laneName}`);

  const d1WorkspaceId = String(entry?.workspace_id_d1 ?? '').trim();
  if (!d1WorkspaceId) throw new Error('writeToLane: workspace_id_d1 required');

  const workspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceId) return { ok: false, skipped: 'workspace_unresolved' };

  const sourceRef = String(entry?.source_ref ?? '').trim();
  if (!sourceRef) throw new Error('writeToLane: source_ref required');

  const title = String(entry?.title ?? '').trim();
  const content = String(entry?.content ?? '').trim();
  if (!content) throw new Error('writeToLane: content required');

  const sourceType = String(entry?.source_type ?? '').trim() || 'unknown';
  const metadata = sanitizeMetadata(entry?.metadata);
  const hash = await contentHash(content);

  const existing = await runHyperdriveQuery(
    env,
    `SELECT id, content_hash
       FROM agentsam.${lane.supabase_table}
      WHERE workspace_id = $1 AND source_ref = $2
      LIMIT 1`,
    [workspaceId, sourceRef],
  );
  const existingRow = existing?.rows?.[0] ?? null;
  if (existingRow?.content_hash && String(existingRow.content_hash) === hash) {
    return { ok: true, skipped: 'unchanged', id: String(existingRow.id) };
  }

  const { embedding } = await createAgentsamEmbedding(env, content);
  const vector = vectorLiteral(embedding);
  const rowId = existingRow?.id != null ? String(existingRow.id) : crypto.randomUUID();
  const upsert = await runHyperdriveQuery(
    env,
    `INSERT INTO agentsam.${lane.supabase_table} (
       id, workspace_id, title, content, source_type, source_ref,
       metadata, rule_id, content_hash, embedding, embedded_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8, $9, $10::vector, now(), now()
     )
     ON CONFLICT (workspace_id, source_ref) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       source_type = EXCLUDED.source_type,
       metadata = EXCLUDED.metadata,
       rule_id = EXCLUDED.rule_id,
       content_hash = EXCLUDED.content_hash,
       embedding = EXCLUDED.embedding,
       embedded_at = now(),
       updated_at = now()
     RETURNING id`,
    [
      rowId,
      workspaceId,
      title || null,
      content,
      sourceType,
      sourceRef,
      JSON.stringify(metadata),
      entry?.rule_id ?? null,
      hash,
      vector,
    ],
  );
  if (!upsert?.ok) throw new Error(upsert?.error || 'rag lane upsert failed');

  const supabaseRowId = String(upsert?.rows?.[0]?.id ?? rowId);
  if (lane.vectorize && typeof env?.[lane.vectorize]?.upsert === 'function') {
    await env[lane.vectorize].upsert([
      {
        id: supabaseRowId,
        values: embedding,
        metadata: {
          workspace_id: d1WorkspaceId,
          source_ref: sourceRef,
          title,
          source_type: sourceType,
        },
      },
    ]);
    await runHyperdriveQuery(
      env,
      `UPDATE agentsam.${lane.supabase_table}
          SET vectorize_id = $1,
              embedded_at = now(),
              updated_at = now()
        WHERE id = $2`,
      [supabaseRowId, supabaseRowId],
    );
  }

  return { ok: true, id: supabaseRowId, content_hash: hash };
}

export async function queryLanes(env, opts = {}) {
  const d1WorkspaceId = String(opts?.workspace_id_d1 ?? '').trim();
  const queryText = String(opts?.query_text ?? '').trim();
  if (!d1WorkspaceId || !queryText) return [];

  const workspaceId = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
  if (!workspaceId) return [];

  const { embedding } = await createAgentsamEmbedding(env, queryText);
  const topK = Math.min(Math.max(1, Number(opts?.top_k) || 5), 20);
  const laneNames = Array.isArray(opts?.lanes) && opts.lanes.length ? opts.lanes : Object.keys(LANES);
  const deduped = new Map();

  for (const laneName of laneNames) {
    const lane = resolveLaneConfig(laneName);
    if (!lane?.vectorize || typeof env?.[lane.vectorize]?.query !== 'function') continue;

    const result = await env[lane.vectorize].query(embedding, {
      topK,
      filter: { workspace_id: { $eq: d1WorkspaceId } },
      returnMetadata: 'all',
    });
    const matches = result?.matches || result?.result?.matches || [];
    for (const match of matches) {
      const sourceRef = String(match?.metadata?.source_ref ?? '').trim();
      if (!sourceRef) continue;
      const score = Number(match?.score ?? 0);
      const existing = deduped.get(sourceRef);
      if (!existing || score > existing.score) {
        deduped.set(sourceRef, {
          lane: lane.name,
          table: lane.supabase_table,
          score,
          source_ref: sourceRef,
          title: String(match?.metadata?.title ?? '').trim(),
        });
      }
    }
  }

  const results = [];
  for (const hit of deduped.values()) {
    const row = await runHyperdriveQuery(
      env,
      `SELECT title, content, source_ref
         FROM agentsam.${hit.table}
        WHERE workspace_id = $1 AND source_ref = $2
        LIMIT 1`,
      [workspaceId, hit.source_ref],
    );
    const found = row?.rows?.[0] ?? null;
    if (!found) continue;
    results.push({
      lane: hit.lane,
      title: String(found.title ?? hit.title ?? '').trim(),
      content: String(found.content ?? '').trim(),
      score: hit.score,
      source_ref: String(found.source_ref ?? hit.source_ref),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

const ROUTE_LANE_MAP = {
  db_write: ['schema', 'code', 'memory'],
  db_read: ['schema', 'code', 'memory'],
  debug: ['schema', 'code', 'memory'],
  cf_ops: ['schema', 'docs', 'memory'],
  ask: ['docs', 'code', 'memory'],
  agent_spawn: ['docs', 'code', 'memory'],
  research: ['docs', 'code', 'memory'],
};

/**
 * pgvector cosine search on a single Supabase agentsam.* lane (Hyperdrive).
 * @param {any} env
 * @param {'schema'|'docs'|'memory'} laneName
 * @param {string} d1WorkspaceId
 * @param {string} queryText
 * @param {{ topK?: number }} [opts]
 */
export async function queryPgvectorLane(env, laneName, d1WorkspaceId, queryText, opts = {}) {
  const lane = resolveLaneConfig(laneName);
  if (!lane?.supabase_table || lane.name === 'archive') return [];
  const ws = String(d1WorkspaceId || '').trim();
  const q = String(queryText || '').trim();
  if (!ws || !q) return [];

  const workspaceId = await resolveSupabaseWorkspaceId(env, ws);
  if (!workspaceId) return [];

  const t0 = Date.now();
  const { embedding } = await createAgentsamEmbedding(env, q);
  const topK = Math.min(Math.max(1, Number(opts.topK) || 4), 12);
  const vecLit = vectorLiteral(embedding);
  const sql = `
    SELECT title, content, source_ref,
           1 - (embedding <=> $1::vector) AS score
      FROM agentsam.${lane.supabase_table}
     WHERE workspace_id = $2::uuid
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`;

  const r = await runHyperdriveQuery(env, sql, [vecLit, workspaceId, topK]);
  const latencyMs = Date.now() - t0;
  const rows = (r?.rows || []).map((row) => ({
    lane: lane.name,
    title: String(row.title || '').trim(),
    content: String(row.content || '').trim(),
    score: Number(row.score) || 0,
    source_ref: String(row.source_ref || '').trim(),
  }));

  try {
    const { logAiSearchAnalytics } = await import('./agent-prompt-context.js');
    await logAiSearchAnalytics(env, 'supabase_pgvector', lane.name, {
      workspaceId: ws,
      query: q,
      resultsCount: rows.length,
      latencyMs,
    });
  } catch {
    /* non-fatal */
  }

  return rows;
}

/**
 * Route-aware multi-lane RAG (Vectorize + pgvector), capped for prompt injection.
 * @param {any} env
 * @param {{ workspace_id_d1?: string, query_text?: string, route_key?: string | null, top_k?: number }} opts
 */
export async function queryRouteRagLanes(env, opts = {}) {
  const routeKey = opts.route_key != null ? String(opts.route_key).trim() : '';
  const laneNames = ROUTE_LANE_MAP[routeKey] || ['memory'];
  const topK = Math.min(Math.max(1, Number(opts.top_k) || 8), 12);

  const vectorLaneNames = laneNames.filter((n) => {
    const lane = resolveLaneConfig(n);
    return lane?.vectorize && typeof env?.[lane.vectorize]?.query === 'function';
  });
  const vectorHits = vectorLaneNames.length
    ? await queryLanes(env, {
        workspace_id_d1: opts.workspace_id_d1,
        query_text: opts.query_text,
        lanes: vectorLaneNames,
        top_k: Math.ceil(topK / 2),
      })
    : [];

  const pgTasks = [];
  if (laneNames.includes('schema')) {
    pgTasks.push(
      queryPgvectorLane(env, 'schema', opts.workspace_id_d1, opts.query_text, {
        topK: Math.ceil(topK / 2),
      }),
    );
  }
  if (laneNames.includes('docs')) {
    pgTasks.push(
      queryPgvectorLane(env, 'docs', opts.workspace_id_d1, opts.query_text, {
        topK: Math.ceil(topK / 2),
      }),
    );
  }
  const pgChunks = (await Promise.all(pgTasks)).flat();

  const merged = [...vectorHits, ...pgChunks];
  merged.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const seen = new Set();
  const out = [];
  for (const hit of merged) {
    const key = `${hit.lane}:${hit.source_ref || hit.title}:${(hit.content || '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= topK) break;
  }
  return out;
}
