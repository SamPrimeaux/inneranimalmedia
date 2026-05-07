/**
 * agentsam_memory — prompt injection for chat and scheduled decay (01:00 UTC cron).
 *
 * Returns a markdown-ish block for callers to concatenate **after** the main system prompt
 * (identity + policy strings). Do not prepend ahead of core system instructions.
 */

import { searchAgentMemoryHybrid } from '../api/rag.js';
import { compactToolStatsCompacted } from './tool-stats-rollup.js';

const IAM_EMBED_MODEL = '@cf/baai/bge-large-en-v1.5';
/** Default REST origin when env.SUPABASE_URL is unset (matches project Postgres RPC). */
const SUPABASE_REST_FALLBACK = 'https://dpmuvynqixblxsilnlut.supabase.co';

function supabaseRestOrigin(env) {
  const raw = env?.SUPABASE_URL && String(env.SUPABASE_URL).trim();
  if (raw) return raw.replace(/\/$/, '');
  return SUPABASE_REST_FALLBACK;
}

/**
 * @param {any} env
 * @param {number[]} embedding
 * @param {string|null} sessionId
 * @param {string|null} agentId
 * @param {string|null} workspaceId
 * @returns {Promise<any[]>}
 */
export async function recallSemanticMemory(env, embedding, sessionId, agentId, workspaceId) {
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey || !Array.isArray(embedding) || !embedding.length) return [];
  const supabaseUrl = supabaseRestOrigin(env);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/recall_agent_memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        p_session_id: sessionId || null,
        p_agent_id: agentId || null,
        p_workspace_id: workspaceId || null,
        p_limit: 10,
        p_threshold: 0.75,
      }),
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => []);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function formatSemanticRecallBlock(rows) {
  const lines = (rows || []).map((r) => {
    if (r == null) return '';
    if (typeof r === 'string') return `- ${r}`;
    const sim = r.similarity != null ? `[${Number(r.similarity).toFixed(3)}] ` : '';
    const text =
      r.content ?? r.text ?? r.value ?? r.memory ?? (typeof r === 'object' ? JSON.stringify(r) : String(r));
    return `- ${sim}${text}`;
  }).filter(Boolean);
  if (!lines.length) return '';
  return `\n## Agent Memory (semantic, ${lines.length} items)\n${lines.join('\n')}\n`;
}

/**
 * Semantic recall via Supabase RPC + Workers AI embedding; falls back to D1 agentsam_memory.
 * @param {any} env
 * @param {string} tenantId
 * @param {{ userMessage?: string, sessionId?: string|null, agentId?: string|null, workspaceId?: string|null }} [ctx]
 */
export async function loadAgentMemoryForPrompt(env, tenantId, ctx = {}) {
  const userMessage = ctx?.userMessage != null ? String(ctx.userMessage) : '';
  const fallback = () => loadAgentMemory(env, tenantId);
  if (!tenantId || !userMessage.trim()) {
    return fallback();
  }

  const workspaceId =
    ctx.workspaceId != null && String(ctx.workspaceId).trim() !== ''
      ? String(ctx.workspaceId).trim()
      : null;

  if (workspaceId) {
    const hybridRows = await searchAgentMemoryHybrid(env, userMessage, workspaceId, {});
    if (Array.isArray(hybridRows) && hybridRows.length > 0) {
      console.log('[rag] memory search via', 'hyperdrive');
      const mapped = hybridRows.map((r) => ({
        similarity: r.hybrid_score,
        content: r.content,
      }));
      const block = formatSemanticRecallBlock(mapped);
      return block || fallback();
    }
  }

  console.log('[rag] memory search via', 'vectorize');

  if (!env?.SUPABASE_SERVICE_ROLE_KEY || !env?.AI) {
    return fallback();
  }
  try {
    const resp = await env.AI.run(IAM_EMBED_MODEL, {
      text: [userMessage.slice(0, 8000)],
    });
    const vecs = resp?.data || resp?.result || [];
    const rawEmb = vecs?.[0];
    const queryEmbedding = Array.isArray(rawEmb)
      ? rawEmb
      : rawEmb != null && typeof rawEmb.length === 'number'
        ? Array.from(rawEmb)
        : null;
    if (!queryEmbedding?.length) return fallback();
    const recalled = await recallSemanticMemory(
      env,
      queryEmbedding,
      ctx.sessionId ?? null,
      ctx.agentId ?? null,
      ctx.workspaceId ?? null,
    );
    if (!Array.isArray(recalled) || !recalled.length) return fallback();
    const block = formatSemanticRecallBlock(recalled);
    return block || fallback();
  } catch {
    return fallback();
  }
}

export async function loadAgentMemory(env, tenantId) {
  if (!env?.DB || !tenantId) return '';
  try {
    const rows = await env.DB.prepare(
      `SELECT id, key, value, memory_type, confidence, decay_score
       FROM agentsam_memory
       WHERE tenant_id = ?
         AND decay_score > 0.3
         AND (expires_at IS NULL OR expires_at > unixepoch())
         AND value NOT LIKE '[STALE%'
       ORDER BY
         CASE memory_type
           WHEN 'error' THEN 1
           WHEN 'decision' THEN 2
           WHEN 'fact' THEN 3
           WHEN 'skill' THEN 4
           WHEN 'preference' THEN 5
           WHEN 'project' THEN 6
           ELSE 7
         END,
         confidence DESC,
         decay_score DESC
       LIMIT 20`,
    )
      .bind(String(tenantId))
      .all();

    const list = rows?.results || [];
    if (!list.length) return '';

    const lines = list.map((r) => {
      const t = String(r.memory_type || 'fact').toUpperCase();
      return `[${t}] ${r.key}: ${r.value}`;
    });

    const ids = list.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      env.DB.prepare(
        `UPDATE agentsam_memory
         SET recall_count = recall_count + 1,
             last_recalled_at = unixepoch(),
             updated_at = unixepoch()
         WHERE id IN (${ph})`,
      )
        .bind(...ids)
        .run()
        .catch(() => {});
    }

    return `\n## Agent Memory (${list.length} items)\n${lines.join('\n')}\n`;
  } catch (e) {
    console.warn('[agentsam_memory] loadAgentMemory', e?.message ?? e);
    return '';
  }
}

/** Snapshot agentsam_tool_call_log into agentsam_tool_stats_compacted (daily). */
export async function compactAgentsamToolCallLogToStats(env) {
  if (!env?.DB) return;
  // Delegate to canonical writer (tenant-level until migration 263 rebuilds unique key).
  await compactToolStatsCompacted(env, {
    includeAllTenants: true,
    metadata: { invoked_by: 'src/core/memory.js::compactAgentsamToolCallLogToStats' },
  }).catch(() => null);
}

/** Roll up agentsam_command_run into agentsam_execution_performance_metrics for the prior local day. */
export async function rollupExecutionPerformanceMetrics(env) {
  if (!env?.DB) return;
  await env.DB.prepare(
    `INSERT INTO agentsam_execution_performance_metrics
      (id, tenant_id, workspace_id, metric_date, metric_grain, source_table,
       command_id, command_slug,
       execution_count, success_count, failure_count,
       avg_duration_ms, min_duration_ms, max_duration_ms,
       success_rate_percent, total_tokens_consumed, total_cost_usd, total_cost_cents,
       last_computed_at)
     SELECT
       'epm_' || lower(hex(randomblob(8))),
       w.tenant_id,
       acr.workspace_id,
       date('now', '-1 day'),
       'daily',
       'agentsam_command_run',
       acr.selected_command_id,
       acr.selected_command_slug,
       COUNT(*),
       SUM(CASE WHEN acr.success=1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN acr.success=0 THEN 1 ELSE 0 END),
       AVG(acr.duration_ms),
       MIN(acr.duration_ms),
       MAX(acr.duration_ms),
       ROUND(AVG(acr.success)*100, 2),
       SUM(COALESCE(acr.input_tokens, 0) + COALESCE(acr.output_tokens, 0)),
       SUM(COALESCE(acr.cost_usd, 0)),
       SUM(COALESCE(acr.cost_usd, 0) * 100),
       unixepoch()
     FROM agentsam_command_run acr
     INNER JOIN agentsam_workspace w ON w.id = acr.workspace_id
     WHERE acr.selected_command_id IS NOT NULL
       AND acr.created_at >= unixepoch('now', '-1 day')
       AND acr.created_at < unixepoch('now')
     GROUP BY w.tenant_id, acr.workspace_id, acr.selected_command_id, acr.selected_command_slug
     ON CONFLICT(
       tenant_id,
       workspace_id,
       metric_date,
       metric_grain,
       source_table,
       command_id,
       command_slug,
       tool_name,
       tool_category,
       workflow_id,
       task_type,
       intent_category,
       model_key,
       provider,
       trigger_key
     ) DO UPDATE SET
       execution_count = excluded.execution_count,
       success_count = excluded.success_count,
       failure_count = excluded.failure_count,
       avg_duration_ms = excluded.avg_duration_ms,
       min_duration_ms = excluded.min_duration_ms,
       max_duration_ms = excluded.max_duration_ms,
       success_rate_percent = excluded.success_rate_percent,
       total_tokens_consumed = excluded.total_tokens_consumed,
       total_cost_usd = excluded.total_cost_usd,
       total_cost_cents = excluded.total_cost_cents,
       last_computed_at = unixepoch()`,
  )
    .run()
    .catch((e) => console.warn('[cron] agentsam_execution_performance_metrics', e?.message ?? e));
}

/** Roll up yesterday's agentsam_usage_events into agentsam_usage_rollups_daily (midnight UTC cron). */
export async function rollupUsageEventsDaily(env) {
  if (!env?.DB) return;
  await env.DB.prepare(`
    INSERT OR REPLACE INTO agentsam_usage_rollups_daily
      (tenant_id, workspace_id, day, ai_calls,
       tokens_in, tokens_out, cost_usd,
       error_count, rollup_source, rolled_up_at)
    SELECT tenant_id, workspace_id, DATE(created_at, 'unixepoch'),
      COUNT(*), SUM(tokens_in), SUM(tokens_out),
      ROUND(SUM(cost_usd),6),
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),
      'daily_cron', unixepoch()
    FROM agentsam_usage_events
    WHERE DATE(created_at, 'unixepoch') = DATE('now','-1 day')
    GROUP BY tenant_id, workspace_id, DATE(created_at, 'unixepoch')
  `).run();
}

export async function runAgentsamMemoryDecay(env) {
  if (!env?.DB) return;
  try {
    const r1 = await env.DB.prepare(
      `UPDATE agentsam_memory
       SET decay_score = MAX(0, decay_score - 0.1),
           updated_at = unixepoch()
       WHERE (
           (last_recalled_at IS NOT NULL AND last_recalled_at < unixepoch('now', '-14 days'))
           OR (last_recalled_at IS NULL AND created_at < unixepoch('now', '-14 days'))
         )`,
    ).run();
    const n1 = r1.meta?.changes ?? r1.changes ?? 0;
    if (n1 > 0) console.log('[cron] agentsam_memory decay_score adjusted:', n1);

    const r2 = await env.DB.prepare(
      `UPDATE agentsam_memory
       SET expires_at = unixepoch('now', '+7 days'),
           updated_at = unixepoch()
       WHERE decay_score <= 0
         AND expires_at IS NULL`,
    ).run();
    const n2 = r2.meta?.changes ?? r2.changes ?? 0;
    if (n2 > 0) console.log('[cron] agentsam_memory expires_at set for decayed rows:', n2);
  } catch (e) {
    console.warn('[cron] agentsam_memory decay failed', e?.message ?? e);
  }
}

/** Upsert a row; optional caller for future task-outcome writes. */
export async function upsertAgentsamMemory(env, row) {
  if (!env?.DB) return;
  const tenantId = row.tenantId != null ? String(row.tenantId) : null;
  const userId = row.userId != null ? String(row.userId) : null;
  const workspaceId =
    row.workspaceId != null && String(row.workspaceId).trim() !== ''
      ? String(row.workspaceId).trim()
      : env?.WORKSPACE_ID != null && String(env.WORKSPACE_ID).trim() !== ''
        ? String(env.WORKSPACE_ID).trim()
        : 'system';
  const memoryType = row.memoryType != null ? String(row.memoryType) : 'fact';
  const key = row.key != null ? String(row.key) : '';
  const value = row.value != null ? String(row.value) : '';
  if (!tenantId || !userId || !key || !value) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_memory (
         tenant_id, user_id, workspace_id, memory_type, key, value, source,
         confidence, decay_score, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'agent_sam', 1.0, 1.0, unixepoch())
       ON CONFLICT(user_id, workspace_id, key) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         value = excluded.value,
         confidence = excluded.confidence,
         decay_score = 1.0,
         memory_type = excluded.memory_type,
         updated_at = unixepoch()`,
    )
      .bind(tenantId, userId, workspaceId, memoryType, key, value)
      .run();
  } catch (e) {
    console.warn('[agentsam_memory] upsertAgentsamMemory', e?.message ?? e);
  }
}
