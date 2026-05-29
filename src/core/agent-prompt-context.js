/**
 * Workspace project context + rules injection helpers for buildSystemPrompt.
 */
import { pragmaTableInfo } from './retention.js';

function estimateTokens(text) {
  const s = String(text || '');
  return s ? Math.max(1, Math.ceil(s.length / 4)) : 0;
}

/**
 * @param {any} env
 * @param {{ workspaceId?: string | null, tenantId?: string | null, limit?: number }} opts
 */
export async function fetchActiveProjectContextBlocks(env, opts = {}) {
  if (!env?.DB) return [];
  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  if (!ws) return [];
  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  const limit = Math.min(Math.max(1, Number(opts.limit) || 3), 5);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, project_name, project_key, description, goals, constraints,
              current_blockers, priority, status
       FROM agentsam_project_context
       WHERE status = 'active'
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
         AND (tenant_id = ? OR tenant_id IS NULL OR TRIM(COALESCE(tenant_id, '')) = '')
       ORDER BY COALESCE(priority, 0) DESC, updated_at DESC
       LIMIT ${limit}`,
    )
      .bind(ws, tid || '')
      .all();
    return (results || []).map((r) => {
      const parts = [
        r.project_name ? `**${r.project_name}** (${r.project_key || r.id})` : r.project_key,
        r.description,
        r.goals ? `Goals: ${r.goals}` : null,
        r.constraints ? `Constraints: ${r.constraints}` : null,
        r.current_blockers ? `Blockers: ${r.current_blockers}` : null,
      ].filter(Boolean);
      return {
        id: String(r.id),
        text: parts.join('\n'),
        tokenEstimate: estimateTokens(parts.join('\n')),
      };
    });
  } catch (e) {
    console.warn('[agent-prompt-context] project_context', e?.message ?? e);
    return [];
  }
}

/**
 * @param {any} env
 * @param {Array<{ id: string, tokenEstimate: number }>} blocks
 */
export async function bumpProjectContextTokensUsed(env, blocks) {
  if (!env?.DB || !blocks?.length) return;
  for (const b of blocks) {
    const delta = Math.max(0, Math.floor(Number(b.tokenEstimate) || 0));
    if (!delta || !b.id) continue;
    await env.DB.prepare(
      `UPDATE agentsam_project_context
       SET tokens_used = COALESCE(tokens_used, 0) + ?,
           updated_at = unixepoch()
       WHERE id = ?`,
    )
      .bind(delta, b.id)
      .run()
      .catch(() => {});
  }
}

/**
 * @param {any} env
 * @param {string} systemPrompt
 * @param {{ workspaceId?: string | null, tenantId?: string | null }} opts
 */
export async function appendActiveProjectsToSystemPrompt(env, systemPrompt, opts = {}) {
  const blocks = await fetchActiveProjectContextBlocks(env, opts);
  if (!blocks.length) return systemPrompt;
  const body = blocks.map((b) => b.text).join('\n\n');
  void bumpProjectContextTokensUsed(env, blocks);
  return `${systemPrompt}\n\n## Active Projects\n${body}\n`;
}

/**
 * @param {any} env
 * @param {string} provider
 * @param {string} searchType
 * @param {{ userId?: string | null, workspaceId?: string | null, tenantId?: string | null, sessionId?: string | null, query?: string, resultsCount?: number, latencyMs?: number }} ctx
 */
export async function logAiSearchAnalytics(env, provider, searchType, ctx = {}) {
  if (!env?.DB) return;
  const cols = await pragmaTableInfo(env.DB, 'ai_search_analytics');
  if (!cols.size) return;
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO ai_search_analytics (
         id, tenant_id, workspace_id, user_id, query,
         results_count, search_type, latency_ms, source, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
      .bind(
        id,
        ctx.tenantId != null ? String(ctx.tenantId) : null,
        ctx.workspaceId != null ? String(ctx.workspaceId) : null,
        ctx.userId != null ? String(ctx.userId) : null,
        String(ctx.query || '').slice(0, 500),
        Math.max(0, Math.floor(Number(ctx.resultsCount) || 0)),
        String(searchType || 'unknown').slice(0, 64),
        ctx.latencyMs != null && Number.isFinite(Number(ctx.latencyMs))
          ? Math.max(0, Math.floor(Number(ctx.latencyMs)))
          : null,
        String(provider || 'unknown').slice(0, 64),
      )
      .run();
  } catch (e) {
    console.warn('[ai_search_analytics]', searchType, e?.message ?? e);
  }
}
