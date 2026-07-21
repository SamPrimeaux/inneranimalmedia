/**
 * Codebase semantic search — AGENTSAMVECTORIZE + pgvector.
 * Query-time embedding MUST match indexing (see resolveAgentsamEmbeddingSpec).
 */
import { createAgentsamEmbedding, searchAgentsamVectorizeByEmbedding } from './agentsam-vectorize.js';
import {
  assertAgentsamEmbeddingDimensions,
  resolveAgentsamEmbeddingSpec,
} from './agentsam-vectorize-index.js';
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';

/**
 * Embed a codebase search query using the same model/dims as the Vectorize index.
 * @param {any} env
 * @param {string} query
 * @param {{
 *   workspaceId?: string|null,
 *   userId?: string|null,
 *   tenantId?: string|null,
 *   taskType?: string,
 * }} [opts]
 */
export async function embedCodebaseSearchQuery(env, query, opts = {}) {
  const spec = await resolveAgentsamEmbeddingSpec(env);
  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const { embedding, model, provider, tokens_in } = await createAgentsamEmbedding(env, query, {
    spec,
    userId: opts.userId ?? null,
    workspaceId: ws || null,
    usage: ws
      ? {
          workspace_id: ws,
          tenant_id: opts.tenantId || undefined,
          user_id: opts.userId ?? null,
          task_type: opts.taskType || 'code_retrieve',
          tool_name: 'codebase_search',
          ref_table: 'agentsam-codebase-oai3large-1536',
        }
      : false,
  });
  assertAgentsamEmbeddingDimensions(embedding, spec.dimensions);
  return { embedding, model, provider, dimensions: spec.dimensions, tokens_in };
}

/**
 * Vectorize ANN over codebase vectors (metadata.source = codebase).
 * @param {any} env
 * @param {string} query
 * @param {{ topK?: number, workspaceId?: string | null, filter?: Record<string, unknown> }} [opts]
 */
export async function searchCodebaseVectorize(env, query, opts = {}) {
  const { embedding, model, dimensions } = await embedCodebaseSearchQuery(env, query, {
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    tenantId: opts.tenantId,
    taskType: 'code_retrieve',
  });
  const topK = Math.min(Math.max(1, Number(opts.topK) || 8), 50);
  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';

  const filter = { source: 'codebase', ...(opts.filter && typeof opts.filter === 'object' ? opts.filter : {}) };
  if (ws) filter.workspace_id = ws;

  const hits = await searchAgentsamVectorizeByEmbedding(env, embedding, {
    topK,
    filter,
    returnMetadata: 'all',
  });

  return { model, dimensions, hits };
}

/**
 * Supabase semantic_code_search when Hyperdrive is available.
 * @param {any} env
 * @param {string} query
 * @param {{ workspaceId: string, matchCount?: number, matchThreshold?: number }} opts
 */
export async function searchCodebasePg(env, query, opts) {
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!workspaceId) throw new Error('workspaceId required');
  if (!isHyperdriveUsable(env)) return { rows: [], skipped: 'hyperdrive_unavailable' };

  const { embedding, model, dimensions } = await embedCodebaseSearchQuery(env, query, {
    workspaceId,
    userId: opts.userId,
    tenantId: opts.tenantId,
    taskType: 'code_retrieve',
  });
  const matchCount = Math.min(Math.max(1, Number(opts.matchCount) || 8), 50);
  const matchThreshold = Number(opts.matchThreshold);
  const threshold = Number.isFinite(matchThreshold) ? matchThreshold : 0.5;

  const vecLit = `[${embedding.join(',')}]`;
  const sql = `
    SELECT *
    FROM semantic_code_search(
      $1::vector(${dimensions}),
      $2::text,
      $3::int,
      $4::float
    )`;
  const r = await runHyperdriveQuery(env, sql, [
    vecLit,
    workspaceId,
    matchCount,
    threshold,
  ]);
  if (!r.ok) {
    return { rows: [], model, dimensions, error: r.error || 'hyperdrive_query_failed' };
  }
  return { rows: r.rows || [], model, dimensions };
}

/**
 * Hybrid: Vectorize first; optional pg fallback can be added at call sites.
 * @param {any} env
 * @param {string} query
 * @param {{ workspaceId: string, topK?: number }} opts
 */
export async function searchCodebase(env, query, opts) {
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!workspaceId) throw new Error('workspaceId required');

  const vectorize = await searchCodebaseVectorize(env, query, {
    topK: opts.topK,
    workspaceId,
  });

  let pg = { rows: [], skipped: 'not_requested' };
  try {
    pg = await searchCodebasePg(env, query, {
      workspaceId,
      matchCount: opts.topK,
    });
  } catch (e) {
    pg = { rows: [], error: String(e?.message || e) };
  }

  return { vectorize, pg };
}
