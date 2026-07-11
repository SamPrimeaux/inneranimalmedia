/**
 * agentsam_reward_events — multi-tenant reward ledger.
 * No guessed tenant/workspace. Dedup via unique dedup_key.
 */

/**
 * @param {unknown} env
 * @param {{
 *   tenant_id: string,
 *   workspace_id: string,
 *   task_type: string,
 *   signal_type: string,
 *   signal_value: number,
 *   signal_source?: string,
 *   alpha_delta?: number,
 *   beta_delta?: number,
 *   agent_run_id?: string|null,
 *   tool_call_log_id?: string|null,
 *   routing_arm_id?: string|null,
 *   model_key?: string|null,
 *   provider?: string|null,
 *   content_tier?: string|null,
 *   cost_usd?: number|null,
 *   latency_ms?: number|null,
 *   reason?: string|null,
 *   metadata?: Record<string, unknown>|null,
 *   dedup_key?: string|null,
 * }} p
 */
export async function recordRewardEvent(env, p) {
  if (!env?.DB) throw new Error('Database not configured');
  const tenantId = String(p.tenant_id || '').trim();
  const workspaceId = String(p.workspace_id || '').trim();
  const taskType = String(p.task_type || '').trim();
  const signalType = String(p.signal_type || '').trim();
  if (!tenantId) throw new Error('tenant_id required');
  if (!workspaceId) throw new Error('workspace_id required');
  if (!taskType) throw new Error('task_type required');
  if (!signalType) throw new Error('signal_type required');

  const id = `re_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const nowUnix = Math.floor(Date.now() / 1000);
  const dedup = p.dedup_key != null && String(p.dedup_key).trim() ? String(p.dedup_key).trim().slice(0, 191) : null;
  const meta =
    p.metadata && typeof p.metadata === 'object' ? JSON.stringify(p.metadata) : '{}';

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_reward_events (
         id, tenant_id, workspace_id, task_type,
         agent_run_id, tool_call_log_id, routing_arm_id,
         model_key, provider, content_tier,
         signal_type, signal_source, signal_value,
         alpha_delta, beta_delta, cost_usd, latency_ms,
         reason, metadata_json, dedup_key, created_at_unix
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        taskType,
        p.agent_run_id ?? null,
        p.tool_call_log_id ?? null,
        p.routing_arm_id ?? null,
        p.model_key ?? null,
        p.provider ?? null,
        p.content_tier ?? null,
        signalType,
        String(p.signal_source || 'user').slice(0, 32),
        Number(p.signal_value) || 0,
        Number(p.alpha_delta) || 0,
        Number(p.beta_delta) || 0,
        Number.isFinite(Number(p.cost_usd)) ? Number(p.cost_usd) : null,
        Number.isFinite(Number(p.latency_ms)) ? Math.round(Number(p.latency_ms)) : null,
        p.reason != null ? String(p.reason).slice(0, 500) : null,
        meta.slice(0, 4000),
        dedup,
        nowUnix,
      )
      .run();
    return { ok: true, id, deduped: false };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (dedup && /UNIQUE|constraint/i.test(msg)) {
      return { ok: true, id: null, deduped: true };
    }
    throw e;
  }
}
