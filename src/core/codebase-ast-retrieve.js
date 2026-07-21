/**
 * AST / Graph RAG retrieve — Phase 3 core, Phase 4 tool surface.
 *
 * Pipeline:
 *   1) Symbol ANN  → agentsam.agentsam_codebase_ast_symbols_oai3large_1536 (Hyperdrive)
 *   2) Graph expand → D1 codebase_dep_edges (imports/calls hops)
 *   3) Hydrate      → agentsam.agentsam_codebase_chunks_oai3large_1536 WHERE node_id = ANY(...)
 *
 * Phase 2 fills the symbol table. This module is the runtime glue.
 * Wire into catalog-tool-executor as agentsam_codebase_retrieve (migration 954).
 */

import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { resolveAgentsamEmbeddingSpecForDimensions } from './agentsam-vectorize-index.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { PLATFORM_SUPABASE_WORKSPACE_UUID } from './platform-identity-constants.js';

const SYMBOL_TABLE = 'agentsam.agentsam_codebase_ast_symbols_oai3large_1536';
const CHUNKS_TABLE = 'agentsam.agentsam_codebase_chunks_oai3large_1536';
const EMBED_SPEC = resolveAgentsamEmbeddingSpecForDimensions(1536);

/**
 * @param {number[]} embedding
 * @returns {string}
 */
function vectorLiteral(embedding) {
  return `[${embedding.map((x) => Number(x).toFixed(8)).join(',')}]`;
}

/**
 * @param {object} env
 * @param {string} query
 * @param {{ topK?: number, workspaceUuid?: string, repo?: string|null }} [opts]
 */
export async function searchAstSymbols(env, query, opts = {}) {
  if (!isHyperdriveUsable(env)) {
    return { ok: false, error: 'hyperdrive_unavailable', hits: [] };
  }
  const topK = Math.min(Math.max(Number(opts.topK) || 8, 1), 32);
  const workspaceUuid = opts.workspaceUuid || PLATFORM_SUPABASE_WORKSPACE_UUID;
  const { embedding } = await createAgentsamEmbedding(env, query, { spec: EMBED_SPEC });
  const lit = vectorLiteral(embedding);

  const params = [lit, workspaceUuid, topK];
  let repoClause = '';
  if (opts.repo) {
    repoClause = ' AND repo = $4';
    params.push(opts.repo);
  }

  const sql = `
    SELECT node_id, node_type, node_name, file_path, repo, signature, line_start, line_end,
           1 - (embedding <=> $1::vector) AS score
    FROM ${SYMBOL_TABLE}
    WHERE workspace_id = $2::uuid
      AND embedding IS NOT NULL
      ${repoClause}
    ORDER BY embedding <=> $1::vector
    LIMIT $3
  `;
  const r = await runHyperdriveQuery(env, sql, params);
  if (!r.ok) return { ok: false, error: r.error || 'pgvector_error', hits: [] };
  const hits = (r.rows || []).map((row) => ({
    node_id: row.node_id,
    node_type: row.node_type,
    node_name: row.node_name,
    file_path: row.file_path,
    repo: row.repo,
    signature: row.signature,
    line_start: row.line_start,
    line_end: row.line_end,
    score: row.score != null ? Number(row.score) : null,
  }));
  return { ok: true, hits, backend: 'pgvector_symbols' };
}

/**
 * Expand D1 dependency edges one hop from seed node ids.
 * @param {object} env
 * @param {string[]} nodeIds
 * @param {{ workspaceId?: string, edgeTypes?: string[], maxNodes?: number }} [opts]
 */
export async function expandAstGraph(env, nodeIds, opts = {}) {
  const db = env?.DB;
  if (!db) return { ok: false, error: 'd1_unavailable', node_ids: nodeIds || [], edges: [] };
  const seeds = [...new Set((nodeIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!seeds.length) return { ok: true, node_ids: [], edges: [] };

  const workspaceId = opts.workspaceId || 'ws_inneranimalmedia';
  const edgeTypes = opts.edgeTypes || ['imports', 'calls', 'extends', 'uses_hook'];
  const maxNodes = Math.min(Math.max(Number(opts.maxNodes) || 40, 1), 120);

  const phSeeds = seeds.map(() => '?').join(',');
  const phTypes = edgeTypes.map(() => '?').join(',');
  const sql = `
    SELECT id, source_node_id, target_node_id, target_external, edge_type,
           source_file, target_file, is_external, repo
    FROM codebase_dep_edges
    WHERE workspace_id = ?
      AND edge_type IN (${phTypes})
      AND (
        source_node_id IN (${phSeeds})
        OR (target_node_id IS NOT NULL AND target_node_id IN (${phSeeds}))
      )
    LIMIT 200
  `;
  const binds = [workspaceId, ...edgeTypes, ...seeds, ...seeds];
  const res = await db.prepare(sql).bind(...binds).all();
  const edges = res?.results || [];

  const expanded = new Set(seeds);
  for (const e of edges) {
    if (e.source_node_id) expanded.add(e.source_node_id);
    if (e.target_node_id) expanded.add(e.target_node_id);
  }
  const node_ids = [...expanded].slice(0, maxNodes);
  return { ok: true, node_ids, edges, seed_count: seeds.length };
}

/**
 * Hydrate chunk text for node ids via Hyperdrive.
 * @param {object} env
 * @param {string[]} nodeIds
 * @param {{ workspaceUuid?: string, limit?: number }} [opts]
 */
export async function hydrateChunksByNodeIds(env, nodeIds, opts = {}) {
  if (!isHyperdriveUsable(env)) {
    return { ok: false, error: 'hyperdrive_unavailable', chunks: [] };
  }
  const ids = [...new Set((nodeIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return { ok: true, chunks: [] };
  const workspaceUuid = opts.workspaceUuid || PLATFORM_SUPABASE_WORKSPACE_UUID;
  const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 64);

  const sql = `
    SELECT id::text AS chunk_id, node_id, file_path, chunk_index, content, token_count
    FROM ${CHUNKS_TABLE}
    WHERE workspace_id = $1::uuid
      AND node_id = ANY($2::text[])
    ORDER BY file_path, chunk_index
    LIMIT $3
  `;
  const r = await runHyperdriveQuery(env, sql, [workspaceUuid, ids, limit]);
  if (!r.ok) return { ok: false, error: r.error || 'hydrate_error', chunks: [] };
  return { ok: true, chunks: r.rows || [], backend: 'hyperdrive_chunks' };
}

/**
 * Full Graph RAG retrieve for agent / MCP tool.
 * @param {object} env
 * @param {string} query
 * @param {{ topK?: number, expand?: boolean, hydrate?: boolean, repo?: string|null, workspaceId?: string }} [opts]
 */
export async function retrieveCodebaseAstContext(env, query, opts = {}) {
  const t0 = Date.now();
  const q = String(query || '').trim();
  if (!q) {
    return { ok: false, error: 'empty_query', results: [], duration_ms: 0 };
  }

  let workspaceUuid = opts.workspaceUuid || null;
  const d1WorkspaceId = opts.workspaceId ? String(opts.workspaceId).trim() : '';
  if (!workspaceUuid && d1WorkspaceId) {
    try {
      const { resolveSupabaseWorkspaceId } = await import('./rag-lanes.js');
      workspaceUuid = await resolveSupabaseWorkspaceId(env, d1WorkspaceId);
    } catch {
      /* fall through to platform default */
    }
  }
  if (!workspaceUuid) workspaceUuid = PLATFORM_SUPABASE_WORKSPACE_UUID;

  const sym = await searchAstSymbols(env, q, {
    topK: opts.topK ?? 8,
    repo: opts.repo ?? null,
    workspaceUuid,
  });
  if (!sym.ok) {
    return { ok: false, error: sym.error, results: [], duration_ms: Date.now() - t0 };
  }

  let nodeIds = sym.hits.map((h) => h.node_id);
  let edges = [];
  if (opts.expand !== false) {
    const g = await expandAstGraph(env, nodeIds, { workspaceId: d1WorkspaceId || opts.workspaceId });
    if (g.ok) {
      nodeIds = g.node_ids;
      edges = g.edges;
    }
  }

  let chunks = [];
  if (opts.hydrate !== false) {
    const h = await hydrateChunksByNodeIds(env, nodeIds, { workspaceUuid });
    if (h.ok) chunks = h.chunks;
  }

  // Fallback: if no chunk links yet, return symbol signatures as context snippets
  const results =
    chunks.length > 0
      ? chunks.map((c) => ({
          kind: 'chunk',
          node_id: c.node_id,
          file_path: c.file_path,
          content: c.content,
          chunk_index: c.chunk_index,
        }))
      : sym.hits.map((h) => ({
          kind: 'symbol',
          node_id: h.node_id,
          file_path: h.file_path,
          content: h.signature || `${h.node_type} ${h.node_name}`,
          score: h.score,
        }));

  return {
    ok: true,
    query: q,
    symbol_hits: sym.hits,
    expanded_node_ids: nodeIds,
    edge_count: edges.length,
    results,
    result_count: results.length,
    duration_ms: Date.now() - t0,
    note:
      chunks.length === 0
        ? 'No chunk node_id links yet — returning symbol signatures. Run Phase 2 chunk 3 --commit.'
        : null,
  };
}
