/**
 * Hybrid memory recall — exact → pinned/recent → Vectorize → pgvector → lexical → D1 hydrate.
 * Vectorize is fast serving; pgvector is durable fallback. No blind duplicate merge.
 */
import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { EMBEDDING_CONTRACT } from './agentsam-memory-contract.js';
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function textContent(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

/**
 * @param {Record<string, unknown>} env
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, unknown>} workspace
 * @param {Record<string, unknown>} args
 */
export async function executeAgentsamMemoryHybridSearch(env, db, workspace, args = {}) {
  const tenantId = trim(workspace?.tenant_id);
  const userId = trim(workspace?.user_id);
  const workspaceId = trim(workspace?.workspace_id);
  if (!db || !tenantId || !userId) {
    return textContent({ ok: false, error: 'auth_scope_required' });
  }

  // Never trust agent-supplied user/tenant for filter override
  if (trim(args.user_id) && trim(args.user_id) !== userId) {
    return textContent({ ok: false, error: 'agent_supplied_user_id_rejected' });
  }

  const query = trim(args.query) || trim(args.q) || '';
  const memoryKey = trim(args.memory_key) || trim(args.key);
  const topK = Math.min(50, Math.max(1, Number(args.top_k ?? args.limit) || 5));
  const now = Math.floor(Date.now() / 1000);
  const hits = new Map();

  const push = (row, provenance, score) => {
    if (!row?.memory_id && !row?.id) return;
    if (trim(row.status) && !['active', ''].includes(trim(row.status))) return;
    if (row.expires_at && Number(row.expires_at) > 0 && Number(row.expires_at) < now) return;
    if (Number(row.is_archived) === 1) return;
    const mid = trim(row.memory_id) || trim(row.id);
    const existing = hits.get(mid);
    if (!existing || score > existing.score) {
      hits.set(mid, { memory_id: mid, score, provenance, row });
    }
  };

  // 1) Exact memory_key
  if (memoryKey) {
    const exact = await db
      .prepare(
        `SELECT * FROM agentsam_memory
          WHERE tenant_id = ? AND user_id = ? AND key = ? AND status = 'active'
          LIMIT 1`,
      )
      .bind(tenantId, userId, memoryKey)
      .first();
    if (exact) push(exact, 'exact_key', 1.0);
  }

  // 2) Pinned / important / recent — only seed when there is no semantic query
  if (!query) {
    const pinned = await db
      .prepare(
        `SELECT * FROM agentsam_memory
          WHERE tenant_id = ? AND user_id = ? AND status = 'active'
            AND (is_pinned = 1 OR importance >= 8)
            AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?)
          ORDER BY is_pinned DESC, importance DESC, updated_at DESC
          LIMIT ?`,
      )
      .bind(tenantId, userId, now, topK)
      .all();
    for (const r of pinned.results || []) push(r, 'pinned_important', 0.85);
  }

  if (!query && !memoryKey) {
    const recent = await db
      .prepare(
        `SELECT * FROM agentsam_memory
          WHERE tenant_id = ? AND user_id = ? AND status = 'active'
            AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?)
          ORDER BY updated_at DESC LIMIT ?`,
      )
      .bind(tenantId, userId, now, topK)
      .all();
    for (const r of recent.results || []) push(r, 'recent', 0.5);
    return finalize(hits, topK, { query: null, used_semantic: false });
  }

  // 3) Semantic Vectorize (server-side metadata filter — never caller override)
  let usedSemantic = false;
  let usedPgvector = false;
  if (query) {
    try {
      const { embedding } = await createAgentsamEmbedding(env, query, {
        spec: {
          provider: 'openai',
          model: EMBEDDING_CONTRACT.model,
          dimensions: EMBEDDING_CONTRACT.dimensions,
        },
      });
      const binding = env?.AGENTSAM_VECTORIZE_MEMORY;
      if (binding?.query) {
        usedSemantic = true;
        const vr = await binding.query(embedding, {
          topK: Math.min(50, topK * 4),
          returnMetadata: 'all',
        });
        const matches = vr?.matches || vr?.result || [];
        for (const m of matches) {
          const meta = m.metadata || {};
          // Server-side scope enforcement (do not trust client filters)
          if (trim(meta.tenant_key) !== tenantId) continue;
          if (trim(meta.user_key) !== userId) continue;
          if (trim(meta.status) && trim(meta.status) !== 'active') continue;
          const score = typeof m.score === 'number' ? m.score : 1 - (m.distance || 0);
          push(
            {
              memory_id: meta.memory_id,
              key: meta.memory_key,
              status: meta.status || 'active',
              content_hash: meta.content_hash,
              revision: meta.revision,
            },
            'vectorize',
            score,
          );
        }
      }

      // 4) pgvector fallback only when Vectorize thin or unavailable
      if ((!usedSemantic || hits.size < Math.min(2, topK)) && isHyperdriveUsable(env)) {
        usedPgvector = true;
        const vec = `[${embedding.join(',')}]`;
        const pg = await runHyperdriveQuery(
          env,
          `SELECT memory_id, memory_key, revision, content_hash, status, workspace_key,
                  1 - (embedding <=> $1::vector) AS score
             FROM agentsam.agentsam_memory_oai3large_1536
            WHERE tenant_key = $2
              AND user_key = $3
              AND COALESCE(status, 'active') = 'active'
            ORDER BY embedding <=> $1::vector
            LIMIT $4`,
          [vec, tenantId, userId, topK * 2],
        );
        for (const r of pg?.rows || []) {
          push(
            {
              memory_id: r.memory_id,
              key: r.memory_key,
              status: r.status || 'active',
              content_hash: r.content_hash,
              revision: r.revision,
            },
            'pgvector',
            Number(r.score) || 0,
          );
        }
      }
    } catch {
      /* fall through to lexical */
    }
  }

  // 5) Lexical / LIKE
  if (query) {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9:_-]/gi, ''))
      .filter((t) => t.length >= 2)
      .slice(0, 6);
    if (tokens.length) {
      const like = `%${tokens[0]}%`;
      const lex = await db
        .prepare(
          `SELECT * FROM agentsam_memory
            WHERE tenant_id = ? AND user_id = ? AND status = 'active'
              AND (expires_at IS NULL OR expires_at = 0 OR expires_at > ?)
              AND (lower(key) LIKE ? OR lower(value) LIKE ? OR lower(COALESCE(title,'')) LIKE ?)
            ORDER BY importance DESC, updated_at DESC
            LIMIT ?`,
        )
        .bind(tenantId, userId, now, like, like, like, topK)
        .all();
      for (const r of lex.results || []) push(r, 'lexical', 0.45);
    }
  }

  // 8) Hydrate canonical D1 revisions for vector-only hits
  for (const [mid, hit] of hits) {
    if (hit.row?.value) continue;
    const full = await db
      .prepare(
        `SELECT * FROM agentsam_memory
          WHERE memory_id = ? AND status = 'active'
            AND tenant_id = ? AND user_id = ?
          LIMIT 1`,
      )
      .bind(mid, tenantId, userId)
      .first();
    if (full) hit.row = full;
    else hits.delete(mid);
  }

  try {
    return finalize(hits, topK, { query, used_semantic: usedSemantic, used_pgvector: usedPgvector });
  } catch (e) {
    return textContent({
      ok: false,
      error: e?.message || String(e),
      count: 0,
      items: [],
    });
  }
}

function finalize(hits, topK, meta) {
  const items = [...hits.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((h) => ({
      memory_id: h.memory_id,
      memory_key: h.row?.key,
      revision: h.row?.revision ?? null,
      content_hash: h.row?.content_hash ?? null,
      memory_type: h.row?.memory_type,
      title: h.row?.title,
      summary: h.row?.summary,
      content: h.row?.value,
      importance: h.row?.importance,
      is_pinned: Number(h.row?.is_pinned) === 1,
      projection_status: h.row?.projection_status,
      score: h.score,
      provenance: h.provenance,
      staleness:
        h.row?.projection_status && h.row.projection_status !== 'ready' ? 'projection_not_ready' : null,
    }));

  return textContent({
    ok: true,
    count: items.length,
    items,
    meta,
  });
}
