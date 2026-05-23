/**
 * Agent Sam semantic memory — OpenAI @1536 + Cloudflare Vectorize `inneranimalmedia-vectors`.
 * Separate from legacy RAG/documents @1024 (`VECTORIZE` / `ai-search-inneranimalmedia-autorag`).
 */

export const AGENTSAM_VECTOR_DIM = 1536;

/** @param {any} env */
export function agentsamEmbeddingDims(env) {
  const n = Number(env?.AGENTSAM_EMBEDDING_DIMENSIONS ?? AGENTSAM_VECTOR_DIM);
  return Number.isFinite(n) && n > 0 ? n : AGENTSAM_VECTOR_DIM;
}

/** @param {any} env */
export function agentsamEmbeddingModel(env) {
  return String(
    env?.AGENTSAM_OPENAI_EMBEDDING_MODEL || env?.RAG_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
  ).trim();
}

/**
 * @param {any} env
 * @param {string} text
 * @returns {Promise<{ embedding: number[], provider: 'openai', model: string }>}
 */
export async function createAgentSamEmbedding(env, text) {
  const input = String(text ?? '');
  const dim = agentsamEmbeddingDims(env);
  const model = agentsamEmbeddingModel(env);
  if (!env?.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for Agent Sam embeddings');

  const base = String(env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/$/, '');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input, dimensions: dim }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI embeddings: non-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI embeddings HTTP ${res.status}`);
  }
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== dim) {
    throw new Error(`OpenAI embeddings: expected ${dim} dimensions, got ${emb?.length ?? 0}`);
  }
  return { embedding: emb, provider: 'openai', model };
}

/**
 * Upsert one `agent_memory` row into AGENTSAMVECTORIZE (`inneranimalmedia-vectors`).
 * @param {any} env
 * @param {{ id: string, embedding: number[], metadata?: Record<string, unknown> }} params
 */
export async function upsertAgentsamVectorizeMemory(env, { id, embedding, metadata = {} }) {
  if (!env?.AGENTSAMVECTORIZE) return { ok: false, skipped: 'no_binding' };
  const dim = agentsamEmbeddingDims(env);
  if (!Array.isArray(embedding) || embedding.length !== dim) {
    return { ok: false, skipped: 'bad_dims', got: embedding?.length ?? 0, expected: dim };
  }
  const vectorId = `agent_memory:${String(id)}`;
  const meta = {
    source: 'memory',
    memory_id: String(id),
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  };
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    if (v != null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      meta[k] = JSON.stringify(v).slice(0, 500);
    }
  }
  await env.AGENTSAMVECTORIZE.upsert([
    {
      id: vectorId,
      values: embedding,
      metadata: meta,
    },
  ]);
  return { ok: true, vector_id: vectorId };
}
