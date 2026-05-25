import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { runHyperdriveQuery } from './hyperdrive-query.js';
import { LANES, resolveSupabaseWorkspaceId } from './rag-lanes.js';

const LANE_ORDER_BY_INTENT = {
  code: ['code', 'schema'],
  schema: ['schema', 'code'],
  courses: ['docs', 'code'],
  memory: ['memory'],
  architecture: ['memory', 'schema'],
  mixed: ['memory', 'code', 'docs', 'schema'],
};

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || !embedding.length) throw new Error('embedding required');
  return `[${embedding.join(',')}]`;
}

function dedupeLaneNames(lanes) {
  return Array.from(new Set((Array.isArray(lanes) ? lanes : []).map((lane) => String(lane || '').trim()).filter(Boolean)));
}

function archiveEmbeddingSpec(env) {
  return {
    provider: 'openai',
    model: String(
      env?.AGENTSAM_OPENAI_EMBEDDING_MODEL || env?.RAG_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
    ).trim(),
    dimensions: 3072,
  };
}

function inferConfidence(similarity) {
  const top = Number(similarity ?? 0);
  if (top > 0.85) return 'high';
  if (top > 0.72) return 'medium';
  return 'low';
}

async function fetchLaneRow(env, lane, workspaceUuid, match) {
  const rowId = match?.id != null ? String(match.id).trim() : '';
  const sourceRef = String(match?.metadata?.source_ref ?? '').trim();
  const sql = `
    SELECT id, title, content, content_hash, source_path, source_ref, metadata
      FROM agentsam.${lane.supabase_table}
     WHERE workspace_id = $1
       AND (($2 <> '' AND id::text = $2) OR ($3 <> '' AND source_ref = $3))
     LIMIT 1
  `;
  const result = await runHyperdriveQuery(env, sql, [workspaceUuid, rowId, sourceRef]);
  return result?.rows?.[0] ?? null;
}

async function queryVectorizeLane(env, laneName, embedding1536, workspaceIdD1, workspaceUuid, topK) {
  const lane = LANES[laneName];
  if (!lane?.vectorize || typeof env?.[lane.vectorize]?.query !== 'function') {
    return [];
  }
  const result = await env[lane.vectorize].query(embedding1536, {
    topK,
    returnMetadata: 'all',
    filter: { workspace_id: { $eq: workspaceIdD1 } },
  });
  const matches = result?.matches || result?.result?.matches || [];
  const chunks = [];
  for (const match of matches) {
    const row = await fetchLaneRow(env, lane, workspaceUuid, match);
    if (!row?.content) continue;
    chunks.push({
      lane: laneName,
      id: String(row.id ?? match?.id ?? ''),
      title: String(row.title ?? match?.metadata?.title ?? '').trim() || laneName,
      content: String(row.content ?? '').trim(),
      sourcePath: row.source_path != null ? String(row.source_path).trim() : null,
      sourceRef: String(row.source_ref ?? match?.metadata?.source_ref ?? '').trim() || null,
      similarity: Number(match?.score ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : match?.metadata ?? {},
      content_hash: row.content_hash != null ? String(row.content_hash).trim() : '',
    });
  }
  return chunks;
}

async function queryDeepArchive(env, query, workspaceUuid) {
  if (!workspaceUuid) return [];
  const { embedding } = await createAgentsamEmbedding(env, query, {
    spec: archiveEmbeddingSpec(env),
  });
  const result = await runHyperdriveQuery(
    env,
    'SELECT * FROM agentsam.agentsam_match_deep_archive_oai3large_3072_ann($1::vector,$2,$3,$4,$5)',
    [vectorLiteral(embedding), workspaceUuid, 8, 80, 0.70],
  );
  return (result?.rows ?? []).map((row) => ({
    lane: 'archive',
    id: row?.id != null ? String(row.id).trim() : '',
    title: String(row?.title ?? 'archive').trim(),
    content: String(row?.content ?? '').trim(),
    sourcePath: row?.source_path != null ? String(row.source_path).trim() : null,
    sourceRef: row?.source_ref != null ? String(row.source_ref).trim() : null,
    similarity: Number(row?.similarity ?? 0),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    content_hash: row?.content_hash != null ? String(row.content_hash).trim() : '',
  }));
}

export async function retrieveContextPack(env, opts = {}) {
  const workspaceId = String(opts?.workspaceId ?? '').trim();
  const query = String(opts?.query ?? '').trim();
  const intent = String(opts?.intent ?? 'mixed').trim().toLowerCase() || 'mixed';
  const maxChunks = Math.min(Math.max(1, Number(opts?.maxChunks) || 8), 20);
  if (!workspaceId || !query) {
    return {
      query,
      intent,
      chunks: [],
      diagnostics: { searchedLanes: [], resultCounts: {}, confidence: 'low' },
    };
  }

  const workspaceUuid = await resolveSupabaseWorkspaceId(env, workspaceId);
  if (!workspaceUuid) {
    return {
      query,
      intent,
      chunks: [],
      diagnostics: { searchedLanes: [], resultCounts: {}, confidence: 'low' },
    };
  }

  const { embedding } = await createAgentsamEmbedding(env, query);
  const searchedLanes = dedupeLaneNames(LANE_ORDER_BY_INTENT[intent] ?? LANE_ORDER_BY_INTENT.mixed);
  const resultCounts = {};
  const combined = [];

  for (const laneName of searchedLanes) {
    const chunks = await queryVectorizeLane(env, laneName, embedding, workspaceId, workspaceUuid, 5);
    resultCounts[laneName] = chunks.length;
    combined.push(...chunks);
  }

  if (intent === 'architecture') {
    const archiveChunks = await queryDeepArchive(env, query, workspaceUuid);
    resultCounts.archive = archiveChunks.length;
    combined.push(...archiveChunks);
    if (!searchedLanes.includes('archive')) searchedLanes.push('archive');
  }

  combined.sort((a, b) => Number(b.similarity ?? 0) - Number(a.similarity ?? 0));
  const seen = new Set();
  const chunks = [];
  for (const chunk of combined) {
    const hash = String(chunk.content_hash ?? '').trim();
    const dedupeKey = hash || `${chunk.lane}:${chunk.sourceRef || chunk.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    chunks.push({
      lane: chunk.lane,
      id: chunk.id,
      title: chunk.title,
      content: chunk.content,
      sourcePath: chunk.sourcePath,
      similarity: Number(chunk.similarity ?? 0),
      metadata: chunk.metadata ?? {},
      sourceRef: chunk.sourceRef,
    });
    if (chunks.length >= maxChunks) break;
  }

  return {
    query,
    intent,
    chunks,
    diagnostics: {
      searchedLanes,
      resultCounts,
      confidence: inferConfidence(chunks[0]?.similarity ?? 0),
    },
  };
}
