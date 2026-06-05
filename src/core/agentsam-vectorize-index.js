/**
 * AGENTSAMVECTORIZE (`inneranimalmedia-vectors`) — describe + embedding spec resolution.
 * One index, one dimension, one model. Index config from binding.describe() is source of truth.
 */
import { resolveTextEmbeddingRoute } from './embedding-routes.js';

export const AGENTSAM_VECTORIZE_INDEX_NAME = 'inneranimalmedia-vectors';

const DESCRIBE_CACHE_MS = 5 * 60 * 1000;
/** @type {{ at: number, cfg: { indexName: string, dimensions: number, metric: string, source: string } } | null} */
let describeCache = null;

/**
 * @param {any} env
 * @returns {Promise<{ indexName: string, dimensions: number, metric: string, source: string }>}
 */
export async function describeAgentsamVectorizeIndex(env) {
  const now = Date.now();
  if (describeCache && now - describeCache.at < DESCRIBE_CACHE_MS) {
    return describeCache.cfg;
  }

  let dimensions = 0;
  let metric = 'cosine';
  let source = 'env';

  if (env?.AGENTSAMVECTORIZE?.describe) {
    const raw = await env.AGENTSAMVECTORIZE.describe();
    dimensions = Number(raw?.dimensions ?? raw?.config?.dimensions);
    metric = String(raw?.metric ?? raw?.config?.metric ?? 'cosine').toLowerCase();
    source = 'binding';
  }

  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    dimensions = Number(env?.AGENTSAM_EMBEDDING_DIMENSIONS ?? 0);
    source = 'env';
  }

  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    throw new Error(
      'AGENTSAMVECTORIZE dimensions unknown — call describe() on binding or set AGENTSAM_EMBEDDING_DIMENSIONS',
    );
  }

  const cfg = {
    indexName: AGENTSAM_VECTORIZE_INDEX_NAME,
    dimensions,
    metric,
    source,
  };
  describeCache = { at: now, cfg };
  return cfg;
}

/**
 * Map index dimensions → single embedding provider/model (indexing + query must match).
 * @param {number} dimensions
 * @returns {{ provider: 'openai' | 'workers_ai', model: string, dimensions: number }}
 */
export function resolveAgentsamEmbeddingSpecForDimensions(dimensions) {
  const dim = Number(dimensions);
  if (dim === 1536) {
    const route = resolveTextEmbeddingRoute('docs');
    return { provider: route.provider, model: route.model, dimensions: route.dimensions };
  }
  if (dim === 768) {
    return { provider: 'workers_ai', model: '@cf/baai/bge-large-en-v1.5', dimensions: 768 };
  }
  if (dim === 1024) {
    return { provider: 'workers_ai', model: '@cf/baai/bge-large-en-v1.5', dimensions: 1024 };
  }
  throw new Error(
    `No embedding model for AGENTSAMVECTORIZE dimension ${dim}. One index, one dimension, one model.`,
  );
}

/**
 * @param {any} env
 * @returns {Promise<{ provider: 'openai' | 'workers_ai', model: string, dimensions: number, metric: string, indexName: string }>}
 */
export async function resolveAgentsamEmbeddingSpec(env) {
  const index = await describeAgentsamVectorizeIndex(env);
  const spec = resolveAgentsamEmbeddingSpecForDimensions(index.dimensions);
  return { ...spec, metric: index.metric, indexName: index.indexName };
}

/**
 * @param {number[]} embedding
 * @param {number} expectedDimensions
 */
export function assertAgentsamEmbeddingDimensions(embedding, expectedDimensions) {
  const dim = Number(expectedDimensions);
  if (!Array.isArray(embedding) || embedding.length !== dim) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding?.length ?? 0}, index requires ${dim}`,
    );
  }
}
