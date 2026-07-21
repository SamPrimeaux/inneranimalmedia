/**
 * Workspace Code Index status — chunk job + AST Graph RAG counts + last deploy.
 * Used by Settings → Workspace (Phase 1 panel). No PTY / AST refresh.
 */
import { runHyperdriveQuery, isHyperdriveUsable } from '../core/hyperdrive-query.js';
import { PLATFORM_SUPABASE_WORKSPACE_UUID } from '../core/platform-identity-constants.js';

const SYMBOL_TABLE = 'agentsam.agentsam_codebase_ast_symbols_oai3large_1536';
const CHUNKS_TABLE = 'agentsam.agentsam_codebase_chunks_oai3large_1536';

function trim(v) {
  return v == null ? '' : String(v).trim();
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
              last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name
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
              last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name
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

    // Last resort: any row for the workspace (including experimental), still live D1 — not synthetic.
    return (
      (await env.DB.prepare(
        `SELECT id, status, triggered_by, last_sync_at, started_at, finished_at, completed_at, updated_at,
                last_error, file_count, indexed_file_count, failed_file_count, progress_percent, repo_full_name
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
    symbols: null,
    linked_chunks: null,
    total_chunks: null,
    hyperdrive_ok: false,
  };
  if (env?.DB) {
    try {
      const n = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM codebase_ast_nodes WHERE workspace_id = ?`,
      )
        .bind(ws)
        .first();
      out.nodes = Number(n?.c ?? 0);
    } catch {
      out.nodes = null;
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

  if (isHyperdriveUsable(env)) {
    out.hyperdrive_ok = true;
    const uuid = PLATFORM_SUPABASE_WORKSPACE_UUID;
    const sym = await runHyperdriveQuery(
      env,
      `SELECT COUNT(*)::int AS c FROM ${SYMBOL_TABLE} WHERE workspace_id = $1::uuid`,
      [uuid],
    );
    if (sym.ok) out.symbols = Number(sym.rows?.[0]?.c ?? 0);
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
  return out;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceCodeIndexStatus(env, workspaceId) {
  const ws = trim(workspaceId);
  const [last_deploy, chunk_job, ast] = await Promise.all([
    loadLatestDeployForWorkspace(env, ws),
    loadLatestCodeIndexJob(env, ws),
    loadAstGraphCounts(env, ws),
  ]);
  return {
    ok: true,
    workspace_id: ws,
    last_deploy,
    chunk_index: {
      job: chunk_job,
    },
    ast,
    notes: {
      refresh_ast:
        'AST Phase 1/2 is CLI (`ast_rag_phase*_*.py` with --target platform or --workspace-id). ' +
        'Settings Re-index queues chunk RAG only — not a live PTY gate on that job row.',
      retrieve_latency: 'Pre-edit / tool only — do not use in hot intent classification (~2–3s).',
    },
  };
}
