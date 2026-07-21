/**
 * Agent Sam semantic memory + codebase — AGENTSAMVECTORIZE (`inneranimalmedia-vectors`).
 * Dimensions/model resolved from binding.describe() — never assume 1536 in hot paths.
 *
 * When opts.usage is set (workspace_id + tenant_id + task_type), every successful embed
 * writes agentsam_usage_events (event_type=embed) via logEmbeddingUsageEvent.
 */
import {
  assertAgentsamEmbeddingDimensions,
  describeAgentsamVectorizeIndex,
  resolveAgentsamEmbeddingSpec,
  resolveAgentsamEmbeddingSpecForDimensions,
} from './agentsam-vectorize-index.js';
import { resolveOpenAiApiKey } from '../integrations/openai-credentials.js';
import { logEmbeddingUsageEvent, resolveEmbedTokensIn } from './embedding-usage.js';

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
 * @param {string|null|undefined} workspaceId
 */
async function resolveTenantIdForWorkspace(env, workspaceId) {
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!env?.DB || !ws) return null;
  try {
    const row = await env.DB.prepare(`SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(ws)
      .first();
    return row?.tenant_id != null ? String(row.tenant_id).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget usage row when opts.usage is provided.
 * @param {any} env
 * @param {string} input
 * @param {{ provider: string, model: string }} result
 * @param {{ prompt_tokens?: number, total_tokens?: number }|null} apiUsage
 * @param {any} opts
 * @param {number} startedAt
 */
async function maybeLogEmbedUsage(env, input, result, apiUsage, opts, startedAt) {
  const usage = opts?.usage;
  if (!usage || usage === false) return null;
  let workspace_id =
    usage.workspace_id != null
      ? String(usage.workspace_id).trim()
      : opts.workspaceId != null
        ? String(opts.workspaceId).trim()
        : '';
  let tenant_id = usage.tenant_id != null ? String(usage.tenant_id).trim() : '';
  if (!tenant_id && workspace_id) {
    tenant_id = (await resolveTenantIdForWorkspace(env, workspace_id)) || '';
  }
  if (!workspace_id || !tenant_id) return null;

  const tokens_in = resolveEmbedTokensIn(input, apiUsage);
  try {
    return await logEmbeddingUsageEvent(env, {
      workspace_id,
      tenant_id,
      user_id: usage.user_id ?? opts.userId ?? null,
      session_id: usage.session_id ?? null,
      conversation_id: usage.conversation_id ?? null,
      task_type: usage.task_type || 'embed',
      tool_name: usage.tool_name ?? null,
      ref_table: usage.ref_table ?? null,
      ref_id: usage.ref_id ?? null,
      model: result.model,
      model_key: result.model,
      provider: result.provider,
      tokens_in,
      duration_ms: Date.now() - startedAt,
      ctx: usage.ctx ?? opts.ctx ?? null,
    });
  } catch (e) {
    console.warn('[createAgentsamEmbedding] usage log failed', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} text
 * @param {{
 *   spec?: { provider: string, model: string, dimensions: number },
 *   userId?: string|null,
 *   workspaceId?: string|null,
 *   usage?: false | {
 *     workspace_id?: string,
 *     tenant_id?: string,
 *     user_id?: string|null,
 *     session_id?: string|null,
 *     conversation_id?: string|null,
 *     task_type: string,
 *     tool_name?: string|null,
 *     ref_table?: string|null,
 *     ref_id?: string|null,
 *     ctx?: any,
 *   },
 *   ctx?: any,
 * }} [opts]
 */
export async function createAgentsamEmbedding(env, text, opts = {}) {
  const startedAt = Date.now();
  const spec = opts.spec || (await resolveAgentsamEmbeddingSpec(env));
  const input = String(text ?? '').trim();
  if (!input) throw new Error('embedding input required');

  if (spec.provider === 'workers_ai') {
    if (!env?.AI) throw new Error('Workers AI binding required for AGENTSAMVECTORIZE embeddings');
    const resp = await env.AI.run(spec.model, { text: [input] });
    const emb = resp?.data?.[0] ?? resp?.result?.[0];
    assertAgentsamEmbeddingDimensions(emb, spec.dimensions);
    const result = { embedding: emb, provider: 'workers_ai', model: spec.model, usage: null };
    await maybeLogEmbedUsage(env, input, result, null, opts, startedAt);
    return result;
  }

  const openAiKey = await resolveOpenAiApiKey(env, spec.model, opts.userId ?? null);
  if (!openAiKey) throw new Error('OpenAI API key required for Agent Sam embeddings');
  const base = String(env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/$/, '');
  const body = { model: spec.model, input };
  if (spec.dimensions === 1536 || spec.dimensions === 3072) body.dimensions = spec.dimensions;
  // OpenAI end-user abuse / monitoring tag — stable non-PII principal id.
  const endUser = opts.userId != null ? String(opts.userId).trim() : '';
  if (endUser) body.user = endUser;

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
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
  const apiUsage =
    data?.usage && typeof data.usage === 'object'
      ? {
          prompt_tokens: Number(data.usage.prompt_tokens) || 0,
          total_tokens: Number(data.usage.total_tokens) || 0,
        }
      : null;
  const result = {
    embedding: emb,
    provider: 'openai',
    model: spec.model,
    usage: apiUsage,
    tokens_in: resolveEmbedTokensIn(input, apiUsage),
  };
  await maybeLogEmbedUsage(env, input, result, apiUsage, opts, startedAt);
  return result;
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
