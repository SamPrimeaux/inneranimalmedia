/**
 * Dashboard AST Re-Index — re-embed D1 codebase_ast_nodes → Supabase symbol table.
 * Phase-1 graph walk stays CLI; this refreshes Phase-2 symbols + stamps last_sync + usage cost.
 */
import { createAgentsamEmbedding } from './agentsam-vectorize.js';
import { resolveAgentsamEmbeddingSpecForDimensions } from './agentsam-vectorize-index.js';
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { resolveSupabaseWorkspaceId } from './rag-lanes.js';
import { writeUsageEvent } from './usage-event-writer.js';
import { resolveUsageEventCostUsd } from './usage-event-cost.js';

const SYMBOL_TABLE = 'agentsam_codebase_ast_symbols_oai3large_1536';
const EMBED_SPEC = resolveAgentsamEmbeddingSpecForDimensions(1536);
const EMBEDDABLE_TYPES = [
  'function',
  'class',
  'method',
  'arrow_function',
  'component',
  'hook',
  'const',
  'type_alias',
  'interface',
  'variable',
];
const MAX_NODES_PER_RUN = 48;
const EMBED_BATCH = 8;
const CPU_BUDGET_MS = 18_000;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function vectorLiteral(embedding) {
  return `[${embedding.map((x) => Number(x).toFixed(8)).join(',')}]`;
}

function sanitizeText(text) {
  return String(text ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
    .replace(/\s{4,}/g, '   ')
    .trim();
}

function buildEmbedText(node) {
  const parts = [
    `repo:${node.repo || ''}`,
    `file:${node.file_path || ''}`,
    `type:${node.node_type || ''}`,
    `name:${node.node_name || ''}`,
    String(node.signature || node.node_name || ''),
  ];
  if (node.docstring) parts.push(String(node.docstring).slice(0, 400));
  return sanitizeText(parts.join(' | ')).slice(0, 4000);
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text ?? '').length / 4));
}

function canonicalJobId(workspaceId) {
  return `cidx_${trim(workspaceId)}`;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
async function resolveTenantId(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return null;
  try {
    const row = await env.DB.prepare(`SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(ws)
      .first();
    if (row?.tenant_id) return String(row.tenant_id).trim();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Ensure canonical job row + mark queued for AST symbol refresh.
 * @param {any} env
 * @param {{ workspaceId: string, triggeredBy?: string, repoFullName?: string|null, userId?: string|null }} opts
 */
export async function queueAstSymbolReembed(env, opts = {}) {
  const workspaceId = trim(opts.workspaceId);
  if (!env?.DB || !workspaceId) return { ok: false, skipped: true, reason: 'no_workspace' };

  const jobId = canonicalJobId(workspaceId);
  const triggeredBy = trim(opts.triggeredBy) || 'dashboard_ast_reindex';
  const repo = opts.repoFullName != null ? trim(opts.repoFullName) : null;
  const userId = opts.userId != null ? trim(opts.userId) : 'usr_sam_primeaux';

  try {
    const existing = await env.DB.prepare(
      `SELECT id, status, triggered_by, indexed_file_count, progress_percent
         FROM agentsam_code_index_job WHERE id = ? LIMIT 1`,
    )
      .bind(jobId)
      .first()
      .catch(() => null);

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO agentsam_code_index_job (
           id, user_id, workspace_id, status, source_type, vector_backend,
           triggered_by, repo_full_name, indexed_file_count, progress_percent, updated_at
         ) VALUES (?, ?, ?, 'idle', 'ast_rag', 'supabase_pgvector', ?, ?, 0, 0, datetime('now'))`,
      )
        .bind(jobId, userId || 'usr_sam_primeaux', workspaceId, triggeredBy, repo || null)
        .run();
    } else if (String(existing.status || '') === 'running') {
      return { ok: true, skipped: true, reason: 'already_running', job_id: jobId };
    } else {
      const progress = Number(existing.progress_percent) || 0;
      const offset = Number(existing.indexed_file_count) || 0;
      const resumePartial =
        opts.resume === true ||
        (String(existing.triggered_by || '').includes('ast_reindex_resume') &&
          progress > 0 &&
          progress < 100 &&
          offset > 0);
      if (resumePartial) {
        await env.DB.prepare(
          `UPDATE agentsam_code_index_job
              SET status = 'idle',
                  source_type = 'ast_rag',
                  vector_backend = 'supabase_pgvector',
                  triggered_by = ?,
                  last_error = NULL,
                  repo_full_name = COALESCE(?, repo_full_name),
                  updated_at = datetime('now')
            WHERE id = ?`,
        )
          .bind(triggeredBy, repo || null, jobId)
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE agentsam_code_index_job
              SET status = 'idle',
                  source_type = 'ast_rag',
                  vector_backend = 'supabase_pgvector',
                  triggered_by = ?,
                  indexed_file_count = 0,
                  progress_percent = 0,
                  last_error = NULL,
                  repo_full_name = COALESCE(?, repo_full_name),
                  updated_at = datetime('now')
            WHERE id = ?`,
        )
          .bind(triggeredBy, repo || null, jobId)
          .run();
      }
    }

    return { ok: true, job_id: jobId, queued: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Stamp last_sync_at on canonical job from live AST node freshness (or now).
 * @param {any} env
 * @param {string} workspaceId
 * @param {{ atIso?: string|null }} [opts]
 */
export async function stampAstJobLastSync(env, workspaceId, opts = {}) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return { ok: false };
  const jobId = canonicalJobId(ws);
  let atIso = opts.atIso != null ? trim(opts.atIso) : '';
  if (!atIso) {
    try {
      const row = await env.DB.prepare(
        `SELECT MAX(updated_at) AS m FROM codebase_ast_nodes WHERE workspace_id = ?`,
      )
        .bind(ws)
        .first();
      const m = row?.m;
      if (m != null && Number(m) > 1e9 && Number(m) < 1e12) {
        atIso = new Date(Number(m) * 1000).toISOString();
      } else if (m != null) {
        atIso = String(m);
      }
    } catch {
      /* ignore */
    }
  }
  if (!atIso) atIso = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE agentsam_code_index_job
          SET last_sync_at = ?,
              updated_at = datetime('now'),
              status = CASE WHEN status = 'running' THEN status ELSE 'idle' END
        WHERE id = ?`,
    )
      .bind(atIso, jobId)
      .run();
    return { ok: true, last_sync_at: atIso, job_id: jobId };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} node
 * @param {string} workspaceUuid
 * @param {number[]} embedding
 * @param {string} embedText
 */
async function upsertSymbolRow(env, node, workspaceUuid, embedding, embedText) {
  const sql = `
    INSERT INTO agentsam.${SYMBOL_TABLE} (
      node_id, workspace_id, repo, file_path, node_type, node_name,
      signature, line_start, line_end, content, embedding, metadata, updated_at
    ) VALUES (
      $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12::jsonb, now()
    )
    ON CONFLICT (node_id) DO UPDATE SET
      signature = EXCLUDED.signature,
      line_start = EXCLUDED.line_start,
      line_end = EXCLUDED.line_end,
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      updated_at = now()
  `;
  const r = await runHyperdriveQuery(env, sql, [
    String(node.id),
    workspaceUuid,
    node.repo != null ? String(node.repo) : null,
    node.file_path != null ? String(node.file_path) : null,
    node.node_type != null ? String(node.node_type) : null,
    node.node_name != null ? String(node.node_name) : null,
    node.signature != null ? String(node.signature) : null,
    node.line_start != null ? Number(node.line_start) : null,
    node.line_end != null ? Number(node.line_end) : null,
    embedText,
    vectorLiteral(embedding),
    JSON.stringify({
      workspace_id: node.workspace_id || null,
      language: node.language ?? null,
      is_exported: node.is_exported ?? null,
      embedding_model: EMBED_SPEC.model,
      source: 'dashboard_ast_reindex',
    }),
  ]);
  if (!r.ok) throw new Error(r.error || 'symbol_upsert_failed');
}

/**
 * Run one CPU-budgeted batch of AST symbol re-embeds for a workspace.
 * @param {any} env
 * @param {string} workspaceId
 * @param {{ userId?: string|null, cpuBudgetMs?: number, maxNodes?: number }} [opts]
 */
export async function runAstSymbolReembedJob(env, workspaceId, opts = {}) {
  const ws = trim(workspaceId);
  if (!env?.DB || !ws) return { ok: false, skipped: true, reason: 'no_workspace' };
  if (!isHyperdriveUsable(env)) return { ok: false, error: 'hyperdrive_unavailable' };

  const workspaceUuid = await resolveSupabaseWorkspaceId(env, ws);
  if (!workspaceUuid) return { ok: false, error: 'workspace_uuid_unresolved' };

  const tenantId = await resolveTenantId(env, ws);
  if (!tenantId) return { ok: false, error: 'tenant_unresolved' };

  const jobId = canonicalJobId(ws);
  const cpuBudgetMs = Number(opts.cpuBudgetMs) || CPU_BUDGET_MS;
  const maxNodes = Math.min(Number(opts.maxNodes) || MAX_NODES_PER_RUN, 120);
  const startedAt = Date.now();

  const job = await env.DB.prepare(
    `SELECT id, status, indexed_file_count, repo_full_name FROM agentsam_code_index_job WHERE id = ? LIMIT 1`,
  )
    .bind(jobId)
    .first()
    .catch(() => null);

  if (!job) {
    await queueAstSymbolReembed(env, {
      workspaceId: ws,
      triggeredBy: 'dashboard_ast_reindex',
      userId: opts.userId,
    });
  }

  const offset = Number(job?.indexed_file_count) || 0;
  const typePlaceholders = EMBEDDABLE_TYPES.map(() => '?').join(',');
  const nodes = await env.DB.prepare(
    `SELECT id, workspace_id, repo, file_path, node_type, node_name, signature,
            docstring, language, is_exported, line_start, line_end
       FROM codebase_ast_nodes
      WHERE workspace_id = ?
        AND node_type IN (${typePlaceholders})
      ORDER BY id
      LIMIT ? OFFSET ?`,
  )
    .bind(ws, ...EMBEDDABLE_TYPES, maxNodes, offset)
    .all()
    .then((r) => r?.results || [])
    .catch(() => []);

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM codebase_ast_nodes
      WHERE workspace_id = ? AND node_type IN (${typePlaceholders})`,
  )
    .bind(ws, ...EMBEDDABLE_TYPES)
    .first()
    .catch(() => ({ c: 0 }));
  const total = Number(totalRow?.c) || 0;

  if (!nodes.length) {
    const stamped = await stampAstJobLastSync(env, ws);
    await env.DB.prepare(
      `UPDATE agentsam_code_index_job
          SET status = 'idle',
              progress_percent = 100,
              indexed_file_count = ?,
              symbol_count = ?,
              triggered_by = 'dashboard_ast_reindex',
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(total, total, jobId)
      .run()
      .catch(() => null);
    return {
      ok: true,
      complete: true,
      job_id: jobId,
      embedded: 0,
      offset,
      total,
      last_sync_at: stamped.last_sync_at || null,
    };
  }

  await env.DB.prepare(
    `UPDATE agentsam_code_index_job
        SET status = 'running', started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(jobId)
    .run()
    .catch(() => null);

  let embedded = 0;
  let tokensIn = 0;
  let costUsd = 0;
  const errors = [];

  try {
    for (let i = 0; i < nodes.length; i += EMBED_BATCH) {
      if (Date.now() - startedAt > cpuBudgetMs) break;
      const slice = nodes.slice(i, i + EMBED_BATCH);
      for (const node of slice) {
        if (Date.now() - startedAt > cpuBudgetMs) break;
        const embedText = buildEmbedText(node);
        if (!embedText) continue;
        try {
          const { embedding, model } = await createAgentsamEmbedding(env, embedText, {
            spec: EMBED_SPEC,
            userId: opts.userId ?? null,
          });
          await upsertSymbolRow(env, node, workspaceUuid, embedding, embedText);
          embedded += 1;
          tokensIn += estimateTokens(embedText);
          void model;
        } catch (e) {
          errors.push(String(e?.message || e).slice(0, 160));
        }
      }
    }

    if (embedded > 0) {
      const priced = await resolveUsageEventCostUsd(env.DB, {
        modelKey: EMBED_SPEC.model,
        provider: EMBED_SPEC.provider || 'openai',
        inputTokens: tokensIn,
        outputTokens: 0,
      });
      costUsd = Number(priced.costUsd) || 0;
      await writeUsageEvent(env, {
        model: EMBED_SPEC.model,
        model_key: EMBED_SPEC.model,
        provider: EMBED_SPEC.provider || 'openai',
        workspace_id: ws,
        tenant_id: tenantId,
        user_id: opts.userId ?? null,
        event_type: 'embed',
        task_type: 'ast_symbol_reembed',
        tokens_in: tokensIn,
        tokens_out: 0,
        cost_usd: costUsd,
        duration_ms: Date.now() - startedAt,
        ref_table: 'agentsam_code_index_job',
        ref_id: jobId,
        tool_name: 'ast_symbol_reembed',
        status: 'ok',
        reason: errors.length ? `partial_errors=${errors.length}` : null,
      });
    }

    const nextOffset = offset + nodes.length;
    const complete = nextOffset >= total;
    const progress = total ? Math.min(100, Math.round((nextOffset / total) * 100)) : 100;

    await env.DB.prepare(
      `UPDATE agentsam_code_index_job
          SET status = ?,
              indexed_file_count = ?,
              progress_percent = ?,
              symbol_count = ?,
              last_error = ?,
              triggered_by = 'dashboard_ast_reindex',
              finished_at = CASE WHEN ? = 1 THEN datetime('now') ELSE finished_at END,
              completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE completed_at END,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(
        complete ? 'idle' : 'idle',
        complete ? total : nextOffset,
        progress,
        nextOffset,
        errors.length ? errors.slice(0, 3).join('; ').slice(0, 500) : null,
        complete ? 1 : 0,
        complete ? 1 : 0,
        jobId,
      )
      .run()
      .catch(() => null);

    let lastSync = null;
    if (complete) {
      const stamped = await stampAstJobLastSync(env, ws, { atIso: new Date().toISOString() });
      lastSync = stamped.last_sync_at || null;
    } else {
      // Keep job idle so next click / cron can resume via indexed_file_count offset.
      await env.DB.prepare(
        `UPDATE agentsam_code_index_job SET triggered_by = 'dashboard_ast_reindex_resume', updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(jobId)
        .run()
        .catch(() => null);
    }

    return {
      ok: true,
      complete,
      job_id: jobId,
      embedded,
      offset: nextOffset,
      total,
      tokens_in: tokensIn,
      cost_usd: costUsd,
      errors: errors.slice(0, 5),
      last_sync_at: lastSync,
      resume: !complete,
    };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await env.DB.prepare(
      `UPDATE agentsam_code_index_job
          SET status = 'idle', last_error = ?, triggered_by = 'dashboard_ast_reindex', updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(msg, jobId)
      .run()
      .catch(() => null);
    return { ok: false, error: msg, job_id: jobId, embedded };
  }
}
