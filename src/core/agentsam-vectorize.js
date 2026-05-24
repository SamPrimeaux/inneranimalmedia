/**
 * Agent Sam semantic memory + codebase — AGENTSAMVECTORIZE (`inneranimalmedia-vectors`).
 * Dimensions/model resolved from binding.describe() — never assume 1536 in hot paths.
 */
import {
  assertAgentsamEmbeddingDimensions,
  describeAgentsamVectorizeIndex,
  resolveAgentsamEmbeddingSpec,
  resolveAgentsamEmbeddingSpecForDimensions,
} from './agentsam-vectorize-index.js';

export const AGENTSAM_VECTOR_DIM = 1536;

/** Sync fallback from env only (prefer describe via agentsamEmbeddingDims). */
export function agentsamEmbeddingDimsFromEnv(env) {
  const n = Number(env?.AGENTSAM_EMBEDDING_DIMENSIONS ?? AGENTSAM_VECTOR_DIM);
  return Number.isFinite(n) && n > 0 ? n : AGENTSAM_VECTOR_DIM;
}

/** @param {any} env */
export async function agentsamEmbeddingDims(env) {
  const index = await describeAgentsamVectorizeIndex(env);
  return index.dimensions;
}

/** @param {any} env @param {{ provider?: string, model?: string, dimensions?: number }} [spec] */
export function agentsamEmbeddingModel(env, spec = null) {
  if (spec?.model) return String(spec.model).trim();
  return String(
    env?.AGENTSAM_OPENAI_EMBEDDING_MODEL || env?.RAG_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
  ).trim();
}

/**
 * @param {any} env
 * @param {string} text
 * @param {{ spec?: { provider: string, model: string, dimensions: number } }} [opts]
 */
export async function createAgentsamEmbedding(env, text, opts = {}) {
  const spec = opts.spec || (await resolveAgentsamEmbeddingSpec(env));
  const input = String(text ?? '').trim();
  if (!input) throw new Error('embedding input required');

  if (spec.provider === 'workers_ai') {
    if (!env?.AI) throw new Error('Workers AI binding required for AGENTSAMVECTORIZE embeddings');
    const resp = await env.AI.run(spec.model, { text: [input] });
    const emb = resp?.data?.[0] ?? resp?.result?.[0];
    assertAgentsamEmbeddingDimensions(emb, spec.dimensions);
    return { embedding: emb, provider: 'workers_ai', model: spec.model };
  }

  if (!env?.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for Agent Sam embeddings');
  const base = String(env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/$/, '');
  const body = { model: spec.model, input };
  if (spec.dimensions === 1536) body.dimensions = 1536;

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
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
  assertAgentsamEmbeddingDimensions(emb, spec.dimensions);
  return { embedding: emb, provider: 'openai', model: spec.model };
}

/** @deprecated use createAgentsamEmbedding */
export const createAgentSamEmbedding = createAgentsamEmbedding;

/**
 * @param {any} env
 * @param {number[]} embedding
 * @param {{ topK?: number, filter?: Record<string, unknown>, returnMetadata?: string }} [opts]
 */
export async function searchAgentsamVectorizeByEmbedding(env, embedding, opts = {}) {
  if (!env?.AGENTSAMVECTORIZE?.query) return [];
  const index = await describeAgentsamVectorizeIndex(env);
  assertAgentsamEmbeddingDimensions(embedding, index.dimensions);
  const topK = Math.min(Math.max(1, Number(opts.topK) || 8), 50);
  const result = await env.AGENTSAMVECTORIZE.query(embedding, {
    topK,
    filter: opts.filter,
    returnMetadata: opts.returnMetadata || 'all',
  });
  return result?.matches || result?.result?.matches || [];
}

/**
 * Upsert one vector into AGENTSAMVECTORIZE.
 * @param {any} env
 * @param {{ id: string, embedding: number[], metadata?: Record<string, unknown> }} params
 */
export async function upsertAgentsamVectorizeMemory(env, { id, embedding, metadata = {} }) {
  if (!env?.AGENTSAMVECTORIZE) return { ok: false, skipped: 'no_binding' };
  const index = await describeAgentsamVectorizeIndex(env);
  if (!Array.isArray(embedding) || embedding.length !== index.dimensions) {
    return {
      ok: false,
      skipped: 'bad_dims',
      got: embedding?.length ?? 0,
      expected: index.dimensions,
    };
  }
  const vectorId = String(id);
  const meta = { ...(metadata && typeof metadata === 'object' ? metadata : {}) };
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

export {
  describeAgentsamVectorizeIndex,
  resolveAgentsamEmbeddingSpec,
  resolveAgentsamEmbeddingSpecForDimensions,
  assertAgentsamEmbeddingDimensions,
};
