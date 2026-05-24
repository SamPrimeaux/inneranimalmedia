/**
 * GET /api/internal/agentsam-vectorize/describe
 * Returns AGENTSAMVECTORIZE index config + resolved embedding model (source of truth for scripts).
 */
import { jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import {
  describeAgentsamVectorizeIndex,
  resolveAgentsamEmbeddingSpec,
} from '../core/agentsam-vectorize-index.js';

/** @param {Request} request @param {any} env */
export async function handleAgentsamVectorizeDescribe(request, env) {
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const index = await describeAgentsamVectorizeIndex(env);
    const embedding = await resolveAgentsamEmbeddingSpec(env);
    return jsonResponse({
      ok: true,
      binding: 'AGENTSAMVECTORIZE',
      index_name: index.indexName,
      dimensions: index.dimensions,
      metric: index.metric,
      describe_source: index.source,
      embedding_provider: embedding.provider,
      embedding_model: embedding.model,
      rule: 'One index, one dimension, one model — indexing and query must use embedding_model above.',
    });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: String(e?.message || e) },
      500,
    );
  }
}
