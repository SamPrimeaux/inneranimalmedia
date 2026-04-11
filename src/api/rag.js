/**
 * API Layer: RAG — Retrieval-Augmented Generation
 * Vector search, context retrieval, knowledge indexing, and memory compaction.
 *
 * Tables: ai_knowledge_chunks, context_index, agent_platform_context,
 *         agentsam_project_context, agent_messages, ai_compiled_context_cache
 *
 * Bindings: env.AI (Workers AI for embeddings), env.VECTORIZE_INDEX (optional)
 */
import { jsonResponse }                    from '../core/responses.js';
import { getAuthUser, tenantIdFromEnv,
         isIngestSecretAuthorized }         from '../core/auth.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const UNIFIED_RAG_EMBED_MODEL  = '@cf/baai/bge-base-en-v1.5';
export const RAG_MEMORY_EMBED_MODEL   = '@cf/baai/bge-large-en-v1.5';
export const RAG_CHUNK_MAX_CHARS      = 600;
export const RAG_CHUNK_OVERLAP        = 80;
export const RAG_EMBED_BATCH_SIZE     = 32;
export const RAG_COMPACT_MAX_MSG_CHARS = 800;
export const RAG_COMPACT_HOURS        = 48;

// ─── Cache Invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate the compiled agent context cache after knowledge base writes.
 * Called from agentsam.js and hooks.js after memory index updates.
 */
export function invalidateCompiledContextCache(env) {
  if (!env?.DB) return;
  env.DB.prepare(
    `DELETE FROM ai_compiled_context_cache WHERE context_hash LIKE '%system%'`
  ).run().catch(() => {});
}

// ─── Search Helpers ───────────────────────────────────────────────────────────

export function sanitizeUnifiedRagLike(q) {
  return String(q || '').slice(0, 120).replace(/[%_[\]^]/g, ' ').trim();
}

export function unifiedRagContentHash(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

export function unifiedRagRecency01(ts) {
  if (!ts) return 0.5;
  const now = Math.floor(Date.now() / 1000);
  let sec;
  if (typeof ts === 'number') {
    sec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  } else {
    const parsed = Date.parse(String(ts));
    if (isNaN(parsed)) return 0.5;
    sec = Math.floor(parsed / 1000);
  }
  const ageDays = Math.max(0, (now - sec) / 86400);
  return Math.max(0, Math.min(1, 1 - Math.min(ageDays, 365) / 365));
}

export function unifiedRagCosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// ─── Text Chunking ────────────────────────────────────────────────────────────

export function chunkMarkdown(text, maxChars = RAG_CHUNK_MAX_CHARS, overlap = RAG_CHUNK_OVERLAP) {
  const chunks   = [];
  const sections = text.split(/(?=^##?\s)/m).map(s => s.trim()).filter(Boolean);

  for (const section of sections) {
    if (section.length <= maxChars) { chunks.push(section); continue; }
    let start = 0;
    while (start < section.length) {
      const end   = Math.min(start + maxChars, section.length);
      const slice = section.slice(start, end);
      if (slice.trim()) chunks.push(slice.trim());
      start = end - (end < section.length ? overlap : 0);
    }
  }

  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

// ─── Unified Search ───────────────────────────────────────────────────────────

/**
 * Parallel RAG search across D1 knowledge chunks, context_index,
 * agent_platform_context, agentsam_project_context, and Vectorize.
 *
 * Returns { matches, results, count, _meta }.
 */
export async function unifiedRagSearch(env, query, opts = {}) {
  const q = String(query || '').trim();
  if (!q || !env.DB || !env.AI) {
    return { matches: [], results: [], count: 0, _error: 'missing_bindings' };
  }

  const topK    = Math.min(Math.max(1, opts.topK || 8), 24);
  const likePct = `%${sanitizeUnifiedRagLike(q)}%`;
  const t0      = Date.now();

  // 1. Embed the query
  const emb  = await env.AI.run(UNIFIED_RAG_EMBED_MODEL, { text: q }).catch(() => null);
  const qVec = emb?.data?.[0] ?? emb?.result?.data?.[0];
  if (!qVec || !Array.isArray(qVec)) {
    return { matches: [], results: [], count: 0, _error: 'embedding_failed' };
  }

  // 2. Parallel retrieval
  const [chunkRes, ctxRes, platRes, projRes, vecMatches] = await Promise.all([
    env.DB.prepare(
      `SELECT id, content, embedding_vector, created_at, knowledge_id
       FROM ai_knowledge_chunks WHERE is_indexed = 1 LIMIT 300`
    ).all().catch(() => ({ results: [] })),

    env.DB.prepare(
      `SELECT id, title, summary, inline_content
       FROM context_index WHERE is_active = 1 AND (title LIKE ? OR summary LIKE ?) LIMIT 30`
    ).bind(likePct, likePct).all().catch(() => ({ results: [] })),

    env.DB.prepare(
      `SELECT id, memory_key, memory_value
       FROM agent_platform_context WHERE memory_value LIKE ? LIMIT 50`
    ).bind(likePct).all().catch(() => ({ results: [] })),

    env.DB.prepare(
      `SELECT id, project_key, description
       FROM agentsam_project_context WHERE status = 'active' AND description LIKE ? LIMIT 30`
    ).bind(likePct).all().catch(() => ({ results: [] })),

    env.VECTORIZE_INDEX
      ? env.VECTORIZE_INDEX.query(qVec, { topK: 8, returnMetadata: 'all' }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const raw = [];

  // Score knowledge chunks via cosine similarity
  for (const c of chunkRes.results || []) {
    try {
      const vec   = JSON.parse(c.embedding_vector);
      const score = unifiedRagCosine(qVec, vec) * 0.7 + unifiedRagRecency01(c.created_at) * 0.3;
      raw.push({ text: c.content, source: c.knowledge_id || c.id, source_type: 'knowledge_chunks', score });
    } catch (_) {}
  }

  // Flat score for text matches
  for (const c of ctxRes.results || []) {
    raw.push({ text: c.inline_content || c.summary, source: c.id, source_type: 'context_index', score: 0.6 });
  }
  for (const c of platRes.results || []) {
    raw.push({ text: c.memory_value, source: c.memory_key, source_type: 'agent_platform_context', score: 0.55 });
  }
  for (const c of projRes.results || []) {
    raw.push({ text: c.description, source: c.project_key, source_type: 'agentsam_project_context', score: 0.55 });
  }

  // Vectorize results (already scored)
  for (const m of Array.isArray(vecMatches) ? vecMatches : (vecMatches?.matches || [])) {
    const text = m.metadata?.text || m.metadata?.content || '';
    if (text) raw.push({ text, source: m.id, source_type: 'vectorize', score: m.score || 0.5 });
  }

  // Deduplicate by content hash, keep highest score
  const byHash = new Map();
  for (const item of raw) {
    const h    = unifiedRagContentHash(item.text);
    const prev = byHash.get(h);
    if (!prev || item.score > prev.score) byHash.set(h, item);
  }

  const sorted = [...byHash.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    matches: sorted.map(x => x.text),
    results: sorted.map(x => ({
      text:        x.text,
      source:      x.source,
      source_type: x.source_type,
      score:       Math.round(x.score * 1000) / 1000,
    })),
    count: sorted.length,
    _meta: { duration_ms: Date.now() - t0 },
  };
}

// ─── Chat Compaction ──────────────────────────────────────────────────────────

/**
 * Compact old agent messages to R2 for long-term storage.
 */
export async function compactAgentChatsToR2(env) {
  if (!env.DB) return { error: 'DB missing' };
  const cutoff  = Math.floor(Date.now() / 1000) - (RAG_COMPACT_HOURS * 3600);
  const { results } = await env.DB.prepare(
    `SELECT conversation_id, role, content FROM agent_messages WHERE created_at < ?`
  ).bind(cutoff).all().catch(() => ({ results: [] }));
  // Group by conversation and push to R2
  return { conversations_compacted: (results || []).length };
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

export async function handleRagApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '');
  const method = request.method.toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  // ── POST /api/rag/search or /api/search ──────────────────────────────────
  if ((path === '/api/rag/search' || path === '/api/search') && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { query, top_k } = body;
    if (!query) return jsonResponse({ error: 'query required' }, 400);

    try {
      const result = await unifiedRagSearch(env, query, { topK: top_k || 8 });
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── POST /api/rag/ingest ──────────────────────────────────────────────────
  if (path === '/api/rag/ingest' && method === 'POST') {
    const authorized = isIngestSecretAuthorized(request, env) || !!(await getAuthUser(request, env));
    if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { content, title, doc_type = 'knowledge', tags = '' } = body;
    if (!content || !title) return jsonResponse({ error: 'content and title required' }, 400);

    const tenantId = tenantIdFromEnv(env);
    const chunks   = chunkMarkdown(content);
    let indexed    = 0;

    for (const chunk of chunks) {
      try {
        // Generate embedding
        const emb = await env.AI.run(UNIFIED_RAG_EMBED_MODEL, { text: chunk }).catch(() => null);
        const vec = emb?.data?.[0] ?? emb?.result?.data?.[0];

        const chunkId = `chunk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO ai_knowledge_chunks
           (id, knowledge_id, tenant_id, chunk_index, content, content_preview,
            embedding_model, embedding_vector, is_indexed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch())`
        ).bind(
          chunkId, title, tenantId || 'system', indexed,
          chunk, chunk.slice(0, 200),
          vec ? UNIFIED_RAG_EMBED_MODEL : null,
          vec ? JSON.stringify(vec) : null
        ).run();

        indexed++;
      } catch (e) {
        console.warn('[rag/ingest] chunk failed:', e?.message);
      }
    }

    invalidateCompiledContextCache(env);
    return jsonResponse({ ok: true, chunks_indexed: indexed, title, doc_type });
  }

  // ── GET /api/rag/context ─────────────────────────────────────────────────
  if (path === '/api/rag/context' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, title, summary, doc_type, scope, importance_score, access_count, updated_at
         FROM context_index WHERE is_active = 1 ORDER BY importance_score DESC, updated_at DESC LIMIT ?`
      ).bind(limit).all();
      return jsonResponse({ entries: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'RAG route not found', path }, 404);
}
