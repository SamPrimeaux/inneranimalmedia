/**
 * D1 wiring for Cursor-style subagent spawning (multitask fanout).
 *
 * Phase 1 (seamless install):
 * - Ensure at least one active agentsam_subagent_profile exists (auto-provision default when empty)
 * - Insert parent agentsam_agent_run for multitask turns (if not already present)
 * - Insert agentsam_spawn_job row + up to N child agentsam_agent_run rows (queued)
 * - Lightweight tool_call_log rows for traceability
 *
 * NOTE: This module avoids any "mode guessing" — it accepts the compiled RuntimeProfile and session scope.
 */

import { scheduleToolCallLog } from './agentsam-ops-ledger.js';
import { estimateModelRunCostUsd } from './model-pricing.js';
import { pragmaTableInfo } from './retention.js';
import { ensureDefaultSubagentProfile } from './subagent-profile-write.js';

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, unknown>} fields
 */
async function patchAgentRunRow(db, runId, fields) {
  const cols = await pragmaTableInfo(db, 'agentsam_agent_run');
  const sets = [];
  const binds = [];
  for (const [col, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    if (!cols.has(col)) continue;
    sets.push(`${col} = ?`);
    binds.push(val);
  }
  if (cols.has('updated_at_unix')) {
    sets.push('updated_at_unix = ?');
    binds.push(unixNow());
  }
  if (!sets.length) return { ok: false, reason: 'no_columns' };
  binds.push(String(runId).trim());
  await db.prepare(`UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return { ok: true, reason: null };
}

/**
 * @param {any} env
 * @param {string|null|undefined} modelKey
 * @param {number} inputTokens
 * @param {number} outputTokens
 */
export async function estimateAgentRunCostUsd(env, modelKey, inputTokens, outputTokens) {
  if (!env?.DB || !modelKey) return 0;
  try {
    const priced = await estimateModelRunCostUsd(env.DB, {
      modelKey: String(modelKey).trim(),
      inputTokens: Math.max(0, Math.floor(Number(inputTokens) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(outputTokens) || 0)),
      cacheReadTokens: 0,
    });
    return Number(priced?.costUsd) || 0;
  } catch {
    return 0;
  }
}

/**
 * Mark an agent run as actively executing (multitask child / spine).
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId: string,
 *   modelKey?: string|null,
 *   provider?: string|null,
 *   routingArmId?: string|null,
 *   mode?: string|null,
 *   taskType?: string|null,
 * }} p
 */
export async function markAgentRunStarted(env, ctx, p) {
  if (!env?.DB || !p?.runId) return { ok: false, reason: 'no_db' };
  try {
    await patchAgentRunRow(env.DB, p.runId, {
      status: 'running',
      started_at: new Date().toISOString(),
      model_key: p.modelKey != null ? String(p.modelKey).trim() : null,
      provider: p.provider != null ? String(p.provider).trim() : '',
      routing_arm_id: p.routingArmId != null ? String(p.routingArmId).trim() : null,
      mode: p.mode != null ? String(p.mode).trim() : null,
      task_type: p.taskType != null ? String(p.taskType).trim() : null,
    });
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  scheduleToolCallLog(env, ctx, {
    toolName: 'agent_run_started',
    status: 'success',
    agent_run_id: p.runId,
    inputSummary: `agent_run marked running model=${p.modelKey ?? 'auto'}`,
  });
  return { ok: true, reason: null };
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * @param {any} env
 * @param {{ userId: string, workspaceId: string, tenantId: string|null }} scope
 */
export async function ensureSubagentProfilesAvailable(env, scope) {
  if (!env?.DB) return { ok: false, profiles: [], createdDefault: false, reason: 'no_db' };
  const userId = String(scope.userId || '').trim();
  const workspaceId = String(scope.workspaceId || '').trim();
  const tenantId = scope.tenantId != null ? String(scope.tenantId).trim() : '';
  if (!userId || !workspaceId) {
    return { ok: false, profiles: [], createdDefault: false, reason: 'missing_scope' };
  }

  const selectSql = `SELECT * FROM agentsam_subagent_profile
    WHERE is_active = 1
      AND (
        (user_id = ? AND COALESCE(workspace_id,'') = ?)
        OR (COALESCE(is_platform_global,0) = 1 AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?))
      )
    ORDER BY
      CASE WHEN user_id = ? AND COALESCE(workspace_id,'') = ? THEN 0 ELSE 1 END,
      COALESCE(sort_order, 0) ASC
    LIMIT 25`;
  let rows = [];
  try {
    const out = await env.DB.prepare(selectSql)
      .bind(userId, workspaceId, tenantId, userId, workspaceId)
      .all();
    rows = out?.results || [];
  } catch (_) {
    rows = [];
  }
  if (rows.length) return { ok: true, profiles: rows, createdDefault: false, reason: null };

  const provisioned = await ensureDefaultSubagentProfile(env, { userId, workspaceId, tenantId });
  if (!provisioned.ok) {
    return {
      ok: false,
      profiles: [],
      createdDefault: false,
      reason: provisioned.reason || 'default_profile_insert_failed',
    };
  }
  return {
    ok: true,
    profiles: provisioned.profiles || [],
    createdDefault: provisioned.createdDefault === true,
    reason: null,
  };
}

/**
 * Create a parent agentsam_agent_run row for multitask turns.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   userId: string, workspaceId: string, tenantId: string|null,
 *   conversationId?: string|null, sessionId?: string|null,
 *   mode: string, taskType: string, trigger: string,
 *   routingArmId?: string|null, modelKey?: string|null, provider?: string|null,
 * }} p
 */
export async function createMultitaskParentRun(env, ctx, p) {
  if (!env?.DB) return { ok: false, runId: null, reason: 'no_db' };
  const runId = id('ar');
  const userId = String(p.userId || '').trim();
  const workspaceId = String(p.workspaceId || '').trim();
  const tenantId = p.tenantId != null ? String(p.tenantId).trim() : '';
  if (!userId || !workspaceId) return { ok: false, runId: null, reason: 'missing_scope' };

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_agent_run (
        id, user_id, tenant_id, workspace_id,
        conversation_id, session_id,
        mode, task_type, trigger,
        model_key, provider, routing_arm_id,
        status, timeout_ms, created_at_unix, updated_at_unix
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        'queued', 90000, ?, ?
      )`,
    )
      .bind(
        runId,
        userId,
        tenantId,
        workspaceId,
        p.conversationId ?? null,
        p.sessionId ?? null,
        String(p.mode || 'multitask'),
        String(p.taskType || 'multitask'),
        String(p.trigger || 'multitask_spine'),
        p.modelKey ?? null,
        p.provider ?? '',
        p.routingArmId ?? null,
        unixNow(),
        unixNow(),
      )
      .run();
  } catch (e) {
    return { ok: false, runId: null, reason: e?.message ?? String(e) };
  }

  scheduleToolCallLog(env, ctx, {
    tenantId,
    workspaceId,
    userId,
    sessionId: p.sessionId ?? null,
    conversationId: p.conversationId ?? null,
    agent_run_id: runId,
    toolName: 'multitask_fanout',
    status: 'pending',
    inputSummary: 'multitask parent run created',
  });

  return { ok: true, runId, reason: null };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   spawnJobId?: string|null,
 *   masterRunId: string,
 *   masterAgentSlug: string,
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string|null,
 *   taskDescription: string,
 *   chunkCount: number,
 *   orchestratorSlug: string,
 *   mergeStrategy: string,
 * }} p
 */
export async function createSpawnJob(env, ctx, p) {
  if (!env?.DB) return { ok: false, spawnJobId: null, reason: 'no_db' };
  const idOut = p.spawnJobId && String(p.spawnJobId).trim() ? String(p.spawnJobId).trim() : id('sj');
  const tenantId = p.tenantId != null ? String(p.tenantId).trim() : '';

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_spawn_job (
        id, master_run_id, master_agent_slug,
        user_id, workspace_id, tenant_id,
        task_description, chunking_strategy, chunk_count,
        subagent_slug, merge_strategy,
        status, started_at
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, 'manual', ?,
        ?, ?,
        'running', datetime('now')
      )`,
    )
      .bind(
        idOut,
        String(p.masterRunId).trim(),
        String(p.masterAgentSlug).trim(),
        String(p.userId).trim(),
        String(p.workspaceId).trim(),
        tenantId,
        String(p.taskDescription || '').slice(0, 4000),
        Math.max(0, Math.floor(Number(p.chunkCount) || 0)),
        String(p.orchestratorSlug || '').trim() || String(p.masterAgentSlug || '').trim(),
        String(p.mergeStrategy || 'concat').trim(),
      )
      .run();
  } catch (e) {
    return { ok: false, spawnJobId: null, reason: e?.message ?? String(e) };
  }

  scheduleToolCallLog(env, ctx, {
    tenantId,
    workspaceId: p.workspaceId,
    userId: p.userId,
    agent_run_id: p.masterRunId,
    toolName: 'spawn_job_create',
    status: 'success',
    inputSummary: `spawn_job ${idOut} created (chunks=${p.chunkCount})`,
  });

  return { ok: true, spawnJobId: idOut, reason: null };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId: string,
 *   status: 'completed'|'failed'|'partial'|'cancelled'|'running',
 *   latencyMs?: number,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   costUsd?: number,
 *   errorMessage?: string|null,
 *   modelKey?: string|null,
 *   provider?: string|null,
 *   routingArmId?: string|null,
 *   mode?: string|null,
 *   taskType?: string|null,
 * }} p
 */
export async function markAgentRunComplete(env, ctx, p) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };
  const st = String(p.status || '').trim();
  const completedAt = new Date().toISOString();
  try {
    await patchAgentRunRow(env.DB, p.runId, {
      status: st,
      completed_at: completedAt,
      latency_ms: Math.max(0, Math.floor(Number(p.latencyMs) || 0)),
      input_tokens: Math.max(0, Math.floor(Number(p.inputTokens) || 0)),
      output_tokens: Math.max(0, Math.floor(Number(p.outputTokens) || 0)),
      cost_usd: Number(p.costUsd) || 0,
      error_message: p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null,
      model_key: p.modelKey != null ? String(p.modelKey).trim() : null,
      provider: p.provider != null ? String(p.provider).trim() : null,
      routing_arm_id: p.routingArmId != null ? String(p.routingArmId).trim() : null,
      mode: p.mode != null ? String(p.mode).trim() : null,
      task_type: p.taskType != null ? String(p.taskType).trim() : null,
    });
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  scheduleToolCallLog(env, ctx, {
    toolName: 'agent_run_complete',
    status: 'success',
    agent_run_id: p.runId,
    inputSummary: `agent_run marked ${st}`,
    inputTokens: Math.max(0, Math.floor(Number(p.inputTokens) || 0)),
    outputTokens: Math.max(0, Math.floor(Number(p.outputTokens) || 0)),
    costUsd: Number(p.costUsd) || 0,
  });
  return { ok: true, reason: null };
}

/**
 * Increment spawn job counters and totals after a child completes.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   spawnJobId: string,
 *   ok: boolean,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   costUsd?: number,
 *   latencyMs?: number,
 * }} p
 */
export async function bumpSpawnJobAfterChild(env, ctx, p) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };
  const succ = p.ok ? 1 : 0;
  const fail = p.ok ? 0 : 1;
  try {
    await env.DB.prepare(
      `UPDATE agentsam_spawn_job SET
         subagents_spawned = subagents_spawned + 1,
         subagents_succeeded = subagents_succeeded + ?,
         subagents_failed = subagents_failed + ?,
         total_input_tokens = total_input_tokens + ?,
         total_output_tokens = total_output_tokens + ?,
         total_cost_usd = total_cost_usd + ?,
         total_latency_ms = total_latency_ms + ?
       WHERE id = ?`,
    )
      .bind(
        succ,
        fail,
        Math.max(0, Math.floor(Number(p.inputTokens) || 0)),
        Math.max(0, Math.floor(Number(p.outputTokens) || 0)),
        Number(p.costUsd) || 0,
        Math.max(0, Math.floor(Number(p.latencyMs) || 0)),
        String(p.spawnJobId).trim(),
      )
      .run();
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  scheduleToolCallLog(env, ctx, {
    toolName: 'spawn_job_bump',
    status: 'success',
    inputSummary: `spawn_job bumped (ok=${succ})`,
  });
  return { ok: true, reason: null };
}

/**
 * Finalize spawn job with merged output.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   spawnJobId: string,
 *   mergedOutput: string,
 *   subagentsFailed: number,
 *   subagentsSucceeded: number,
 * }} p
 */
export async function finalizeSpawnJob(env, ctx, p) {
  if (!env?.DB) return { ok: false, reason: 'no_db' };
  const failed = Math.max(0, Math.floor(Number(p.subagentsFailed) || 0));
  const succeeded = Math.max(0, Math.floor(Number(p.subagentsSucceeded) || 0));
  const status = failed === 0 ? 'completed' : succeeded > 0 ? 'partial' : 'failed';
  try {
    await env.DB.prepare(
      `UPDATE agentsam_spawn_job SET
         status = ?,
         merged_output = ?,
         completed_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(status, String(p.mergedOutput || '').slice(0, 120_000), String(p.spawnJobId).trim())
      .run();
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  scheduleToolCallLog(env, ctx, {
    toolName: 'spawn_job_finalize',
    status: 'success',
    inputSummary: `spawn_job finalized (${status})`,
  });
  return { ok: true, reason: null, status };
}

/**
 * Create a queued child run row linked to parent.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   parentRunId: string,
 *   userId: string,
 *   workspaceId: string,
 *   tenantId: string|null,
 *   conversationId?: string|null,
 *   sessionId?: string|null,
 *   subagentSlug: string,
 *   taskType?: string|null,
 * }} p
 */
export async function createChildRun(env, ctx, p) {
  if (!env?.DB) return { ok: false, runId: null, reason: 'no_db' };
  const runId = id('ar');
  const tenantId = p.tenantId != null ? String(p.tenantId).trim() : '';

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_agent_run (
        id, user_id, tenant_id, workspace_id,
        conversation_id, session_id,
        parent_run_id, chain_root_id,
        mode, task_type, trigger,
        status, timeout_ms, created_at_unix, updated_at_unix,
        agent_id
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        'agent', ?, 'spawn',
        'queued', 90000, ?, ?,
        ?
      )`,
    )
      .bind(
        runId,
        String(p.userId).trim(),
        tenantId,
        String(p.workspaceId).trim(),
        p.conversationId ?? null,
        p.sessionId ?? null,
        String(p.parentRunId).trim(),
        String(p.parentRunId).trim(),
        String(p.taskType || 'multitask').trim(),
        unixNow(),
        unixNow(),
        String(p.subagentSlug || '').trim() || null,
      )
      .run();
  } catch (e) {
    return { ok: false, runId: null, reason: e?.message ?? String(e) };
  }

  scheduleToolCallLog(env, ctx, {
    tenantId,
    workspaceId: p.workspaceId,
    userId: p.userId,
    agent_run_id: runId,
    conversationId: p.conversationId ?? null,
    sessionId: p.sessionId ?? null,
    toolName: 'subagent_child_run_create',
    status: 'pending',
    inputSummary: `child run queued (parent=${p.parentRunId}) slug=${p.subagentSlug}`,
  });

  return { ok: true, runId, reason: null };
}

