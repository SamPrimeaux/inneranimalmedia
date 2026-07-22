/**
 * Workspace Code Index status — chunk job + AST Graph RAG counts + last deploy.
 * Used by Settings → Workspace and project page Codebase Index rail.
 */
import { runHyperdriveQuery, isHyperdriveUsable } from '../core/hyperdrive-query.js';
import { resolveSupabaseWorkspaceId } from '../core/rag-lanes.js';
import { stampAstJobLastSync } from '../core/ast-symbol-reembed.js';

const SYMBOL_TABLE = 'agentsam.agentsam_codebase_ast_symbols_oai3large_1536';
const CHUNKS_TABLE = 'agentsam.agentsam_codebase_chunks_oai3large_1536';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Normalize D1 unix seconds / ms / ISO into ISO string for UI relativeTime. */
function normalizeTs(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || (/^\d+(\.\d+)?$/.test(String(raw)) && Number(raw) > 1e9)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(raw);
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadLatestDeployForWorkspace(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT id, timestamp, created_at, git_hash, version, status, worker_name, environment, description
         FROM deployments
        WHERE workspace_id = ?
        ORDER BY COALESCE(timestamp, created_at) DESC
        LIMIT 1`,
    )
      .bind(ws)
      .first();
    if (!row) return null;
    return {
      at: row.timestamp || row.created_at || null,
      version: row.version || null,
      git_sha: row.git_hash || row.version || null,
      status: row.status || null,
      worker_name: row.worker_name || null,
      environment: row.environment || null,
      id: row.id || null,
      source: 'd1_deployments',
    };
  } catch (e) {
    console.warn('[workspace-code-index-status] deployments', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadLatestCodeIndexJob(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return null;
  try {
    // Prefer the canonical workspace job row over abandoned experimental jobs
    // (e.g. cidx_src_reindex_v1 failed_partial) that can otherwise win ORDER BY updated_at.
    const canonicalId = `cidx_${ws}`;
    const canonical = await env.DB.prepare(
      `SELECT id, status, triggered_by, last_sync_at, started_at, finished_at, completed_at, updated_at,
              last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name,
              source_type, symbol_count, chunk_count
         FROM agentsam_code_index_job
        WHERE id = ? AND workspace_id = ?
        LIMIT 1`,
    )
      .bind(canonicalId, ws)
      .first()
      .catch(() => null);
    if (canonical) return canonical;

    const row = await env.DB.prepare(
      `SELECT id, status, triggered_by, last_sync_at, started_at, finished_at, completed_at, updated_at,
              last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name,
              source_type, symbol_count, chunk_count
         FROM agentsam_code_index_job
        WHERE workspace_id = ?
          AND id NOT LIKE 'cidx_src_%'
          AND COALESCE(status, '') NOT IN ('failed_partial', 'abandoned')
        ORDER BY COALESCE(updated_at, finished_at, completed_at, started_at) DESC
        LIMIT 1`,
    )
      .bind(ws)
      .first();
    if (row) return row;

    return (
      (await env.DB.prepare(
        `SELECT id, status, triggered_by, last_sync_at, started_at, finished_at, completed_at, updated_at,
                last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name,
                source_type, symbol_count, chunk_count
           FROM agentsam_code_index_job
          WHERE workspace_id = ?
          ORDER BY COALESCE(updated_at, finished_at, completed_at, started_at) DESC
          LIMIT 1`,
      )
        .bind(ws)
        .first()) || null
    );
  } catch (e) {
    console.warn('[workspace-code-index-status] code_index_job', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadAstGraphCounts(env, workspaceId) {
  const ws = trim(workspaceId) || 'ws_inneranimalmedia';
  const out = {
    nodes: null,
    edges: null,
    files: null,
    symbols: null,
    linked_chunks: null,
    total_chunks: null,
    hyperdrive_ok: false,
    last_synced_at: null,
    nodes_updated_at: null,
    symbols_updated_at: null,
    workspace_uuid: null,
  };
  if (env?.DB) {
    try {
      const n = await env.DB.prepare(
        `SELECT COUNT(*) AS c,
                COUNT(DISTINCT file_path) AS files,
                MAX(updated_at) AS last_u
           FROM codebase_ast_nodes WHERE workspace_id = ?`,
      )
        .bind(ws)
        .first();
      out.nodes = Number(n?.c ?? 0);
      out.files = Number(n?.files ?? 0);
      out.nodes_updated_at = normalizeTs(n?.last_u);
    } catch {
      out.nodes = null;
      out.files = null;
    }
    try {
      const e = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM codebase_dep_edges WHERE workspace_id = ?`,
      )
        .bind(ws)
        .first();
      out.edges = Number(e?.c ?? 0);
    } catch {
      out.edges = null;
    }
  }

  const uuid = await resolveSupabaseWorkspaceId(env, ws).catch(() => null);
  out.workspace_uuid = uuid;

  if (isHyperdriveUsable(env) && uuid) {
    out.hyperdrive_ok = true;
    const sym = await runHyperdriveQuery(
      env,
      `SELECT COUNT(*)::int AS c, MAX(updated_at) AS last_u
         FROM ${SYMBOL_TABLE}
        WHERE workspace_id = $1::uuid`,
      [uuid],
    );
    if (sym.ok) {
      out.symbols = Number(sym.rows?.[0]?.c ?? 0);
      out.symbols_updated_at = normalizeTs(sym.rows?.[0]?.last_u);
    }
    const ch = await runHyperdriveQuery(
      env,
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE node_id IS NOT NULL)::int AS linked
       FROM ${CHUNKS_TABLE}
       WHERE workspace_id = $1::uuid`,
      [uuid],
    );
    if (ch.ok) {
      out.total_chunks = Number(ch.rows?.[0]?.total ?? 0);
      out.linked_chunks = Number(ch.rows?.[0]?.linked ?? 0);
    }
  }

  // Prefer freshest signal: symbols → nodes (graph upsert) — not stale chunk job last_sync.
  out.last_synced_at = out.symbols_updated_at || out.nodes_updated_at || null;
  return out;
}

/**
 * Embedding cost monitor for AST / code-index embeds in this workspace.
 * @param {any} env
 * @param {string} workspaceId
 */
export async function loadAstEmbedCostRollup(env, workspaceId) {
  const ws = trim(workspaceId);
  const empty = {
    cost_usd_30d: 0,
    cost_usd_all: 0,
    embed_events_30d: 0,
    last_embed_at: null,
  };
  if (!env?.DB || !ws) return empty;
  try {
    const row = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN COALESCE(created_at_unix, created_at) >= unixepoch() - 30 * 86400
                           THEN cost_usd ELSE 0 END), 0) AS cost_30d,
         COALESCE(SUM(cost_usd), 0) AS cost_all,
         COALESCE(SUM(CASE WHEN COALESCE(created_at_unix, created_at) >= unixepoch() - 30 * 86400
                           THEN 1 ELSE 0 END), 0) AS n_30d,
         MAX(COALESCE(created_at_unix, created_at)) AS last_at
       FROM agentsam_usage_events
      WHERE workspace_id = ?
        AND (
          event_type = 'embed'
          OR task_type IN ('ast_symbol_reembed', 'ast_rag_phase2', 'code_index_embed')
          OR tool_name IN ('ast_symbol_reembed', 'ast_rag_phase2')
          OR model_key LIKE '%embedding%'
          OR model LIKE '%embedding%'
        )`,
    )
      .bind(ws)
      .first();
    return {
      cost_usd_30d: Number(row?.cost_30d) || 0,
      cost_usd_all: Number(row?.cost_all) || 0,
      embed_events_30d: Number(row?.n_30d) || 0,
      last_embed_at: normalizeTs(row?.last_at),
    };
  } catch (e) {
    console.warn('[workspace-code-index-status] embed_cost', e?.message ?? e);
    return empty;
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceCodeIndexStatus(env, workspaceId) {
  const ws = trim(workspaceId);
  const [last_deploy, chunk_job, ast, embed_cost] = await Promise.all([
    loadLatestDeployForWorkspace(env, ws),
    loadLatestCodeIndexJob(env, ws),
    loadAstGraphCounts(env, ws),
    loadAstEmbedCostRollup(env, ws),
  ]);

  // Heal stale job.last_sync_at when AST graph is newer (e.g. Phase 1/2 CLI never stamped the job).
  const jobSync = normalizeTs(chunk_job?.last_sync_at);
  const astSync = ast?.last_synced_at || null;
  let healedJob = chunk_job;
  if (astSync && (!jobSync || new Date(astSync).getTime() > new Date(jobSync).getTime() + 60_000)) {
    const stamped = await stampAstJobLastSync(env, ws, { atIso: astSync }).catch(() => null);
    if (stamped?.ok) {
      healedJob = chunk_job
        ? { ...chunk_job, last_sync_at: stamped.last_sync_at || astSync }
        : chunk_job;
    }
  }

  return {
    ok: true,
    workspace_id: ws,
    last_deploy,
    chunk_index: {
      job: healedJob,
    },
    ast: {
      ...ast,
      last_synced_at: astSync || normalizeTs(healedJob?.last_sync_at) || null,
    },
    embed_cost,
    notes: {
      refresh_ast:
        'Re-Index (AST) re-embeds symbols from D1 nodes via Worker + stamps last_sync. ' +
        'Full graph re-walk (new files) still uses CLI Phase 1 with --target platform or --workspace-id.',
      refresh_chunks: 'Re-index chunks queues agentsam_code_index_job for the Worker code-indexer cron.',
      retrieve_latency: 'Pre-edit / tool only — do not use in hot intent classification (~2–3s).',
      cost: 'AST Phase 2 + dashboard re-embed write agentsam_usage_events (event_type=embed).',
    },
  };
}
