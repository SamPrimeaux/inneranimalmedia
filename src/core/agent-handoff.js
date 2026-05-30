/**
 * Dynamic handoff: checkpoint expensive agent runs and resume on a cheaper model + fresh DO session.
 */
import { sha256Hex } from './cms-theme-hashing.js';
import { estimateModelRunCostUsd } from './model-pricing.js';
import { newChatAgentRunId } from './agent-run-routing.js';
import { resolveRoutingArmByModelKey } from './routing.js';
import { resolveModelMeta } from './provider.js';
import { pragmaTableInfo } from './retention.js';
import { checkBudgetPressure } from './budget-sentinel.js';
import {
  buildHandoffContextDigest,
  extractRemainingGoal,
} from './handoff-context.js';

export { buildHandoffContextDigest, buildHandoffPrimingUserMessage } from './handoff-context.js';

const MAX_HANDOFF_DEPTH = 4;

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} digestText
 * @param {{ digestType?: string, generationModel?: string | null, sourceMaterial?: string }} [opts]
 */
export async function upsertHandoffContextDigest(env, workspaceId, digestText, opts = {}) {
  if (!env?.DB || !workspaceId || !digestText) return null;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_context_digest');
  if (!cols.has('digest_text')) return null;

  const digestType = opts.digestType != null ? String(opts.digestType) : 'handoff';
  const sourceMaterial = opts.sourceMaterial != null ? String(opts.sourceMaterial) : digestText;
  const sourceHash = await sha256Hex(sourceMaterial);
  const digestHash = await sha256Hex(`${workspaceId}:${digestType}:${sourceHash}`);
  const id = `cd_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const rawSize = sourceMaterial.length;
  const reducedSize = digestText.length;

  try {
    if (cols.has('source_hash') && cols.has('digest_hash')) {
      await env.DB.prepare(
        `INSERT INTO agentsam_context_digest (
           id, workspace_id, digest_type, source_hash, digest_hash,
           raw_size_bytes, reduced_size_bytes, digest_text,
           generation_model, namespace, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent_handoff', datetime('now'), datetime('now'))`,
      )
        .bind(
          id,
          workspaceId,
          digestType,
          sourceHash,
          digestHash,
          rawSize,
          reducedSize,
          digestText,
          opts.generationModel ?? null,
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO agentsam_context_digest (id, workspace_id, digest_type, digest_text, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
        .bind(id, workspaceId, digestType, digestText)
        .run();
    }
    return id;
  } catch (e) {
    console.warn('[agent-handoff] context_digest_upsert', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} runId
 * @param {{ inputTokens?: number, outputTokens?: number, costUsd?: number, status?: string }} p
 */
export async function patchAgentRunBudgetProgress(env, runId, p = {}) {
  if (!env?.DB || !runId) return;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  const sets = [];
  const binds = [];
  const push = (col, val) => {
    if (!cols.has(col)) return;
    sets.push(`${col} = ?`);
    binds.push(val);
  };
  push('input_tokens', Math.max(0, Math.floor(Number(p.inputTokens) || 0)));
  push('output_tokens', Math.max(0, Math.floor(Number(p.outputTokens) || 0)));
  push('cost_usd', Number(p.costUsd) || 0);
  push('status', p.status != null ? String(p.status) : 'running');
  if (!sets.length) return;
  binds.push(String(runId));
  try {
    await env.DB.prepare(`UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  } catch (e) {
    console.warn('[agent-handoff] patch_run_progress', e?.message ?? e);
  }
}

/**
 * Resolve routing arm + catalog meta and evaluate handoff pressure.
 * @param {any} env
 * @param {{
 *   modelKey: string,
 *   workspaceId: string,
 *   taskType?: string,
 *   mode?: string,
 *   agentSlug?: string | null,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   cacheReadTokens?: number,
 * }} p
 */
export async function evaluateAgentHandoffPressure(env, p) {
  const modelKey = p.modelKey != null ? String(p.modelKey).trim() : '';
  if (!env?.DB || !modelKey) {
    return { shouldHandoff: false, reason: null, arm: null, fallbackModelKey: null, pressure: null, runCostUsd: 0, contextWindow: 0 };
  }

  const armLookup = await resolveRoutingArmByModelKey(env, {
    modelKey,
    taskType: p.taskType ?? 'ask',
    mode: p.mode ?? 'agent',
    workspaceId: p.workspaceId ?? '',
    agentSlug: p.agentSlug ?? null,
  });
  const arm = armLookup?.arm ?? null;
  const meta = await resolveModelMeta(env, modelKey);
  const contextWindow =
    Number(meta?.context_max_tokens) ||
    Number(meta?.context_window) ||
    Number(meta?.output_max_tokens) ||
    128000;

  const inputTokens = Math.max(0, Math.floor(Number(p.inputTokens) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(p.outputTokens) || 0));
  const cacheRead = Math.max(0, Math.floor(Number(p.cacheReadTokens) || 0));

  let runCostUsd = 0;
  try {
    const priced = await estimateModelRunCostUsd(env.DB, {
      modelKey,
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
    });
    runCostUsd = Number(priced?.costUsd) || 0;
  } catch {
    runCostUsd = 0;
  }

  const maxCost = arm?.max_cost_per_call_usd != null ? Number(arm.max_cost_per_call_usd) : 0;
  const pressure = checkBudgetPressure({
    runCostUsd,
    maxCostPerCallUsd: maxCost,
    inputTokens,
    contextWindow,
  });

  const fallbackModelKey =
    arm?.fallback_model_key != null && String(arm.fallback_model_key).trim() !== ''
      ? String(arm.fallback_model_key).trim()
      : null;

  const shouldHandoff =
    pressure.shouldHandoff &&
    fallbackModelKey &&
    fallbackModelKey !== modelKey;

  return {
    shouldHandoff,
    reason: shouldHandoff ? pressure.reason : null,
    urgency: pressure.urgency,
    pressure,
    arm,
    armId: armLookup?.armId ?? null,
    fallbackModelKey: shouldHandoff ? fallbackModelKey : null,
    runCostUsd,
    contextWindow,
  };
}

/**
 * Write spawn row + digest; mint child session ids for dashboard reconnect.
 * @param {any} env
 * @param {{
 *   parentRunId: string,
 *   parentSlug: string,
 *   fallbackModelKey: string,
 *   workspaceId: string,
 *   goal?: string,
 *   messages?: unknown[],
 *   executedToolNames?: string[],
 *   triggeredBy?: string,
 *   depth?: number,
 *   userId?: string | null,
 *   tenantId?: string | null,
 * }} p
 */
export async function initiateHandoff(env, p) {
  const parentRunId = String(p.parentRunId || '').trim();
  const parentSlug = String(p.parentSlug || '').trim();
  const childSlug = String(p.fallbackModelKey || '').trim();
  const workspaceId = String(p.workspaceId || '').trim();
  if (!env?.DB || !parentRunId || !parentSlug || !childSlug || !workspaceId) {
    throw new Error('initiateHandoff: missing required fields');
  }

  const depth = Math.max(1, Math.min(MAX_HANDOFF_DEPTH, Number(p.depth) || 1));
  const remainingGoal = extractRemainingGoal(p.messages) || String(p.goal || '').trim();
  const digestText = buildHandoffContextDigest({
    goal: remainingGoal,
    messages: p.messages,
    executedToolNames: p.executedToolNames,
    triggeredBy: p.triggeredBy,
    parentModelKey: parentSlug,
    childModelKey: childSlug,
  });

  const digestId = await upsertHandoffContextDigest(env, workspaceId, digestText, {
    digestType: 'handoff',
    generationModel: parentSlug,
    sourceMaterial: JSON.stringify({
      parent_run_id: parentRunId,
      goal: remainingGoal,
      tools: p.executedToolNames ?? [],
    }),
  });

  const childSessionId = crypto.randomUUID();
  const childRunId = newChatAgentRunId({ label: 'handoff' });
  const spawnId = `spawn_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const messagePayload = {
    summary: digestText.slice(0, 2000),
    remainingGoal,
    contextDigest: digestText,
    digest_id: digestId,
    triggeredBy: p.triggeredBy ?? 'budget',
    next_session_id: childSessionId,
    fallback_model_key: childSlug,
    parent_model_key: parentSlug,
  };

  await env.DB.prepare(
    `INSERT INTO agentsam_spawn_session (
       id, parent_run_id, child_run_id, parent_slug, child_slug,
       depth, message, status, workspace_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, unixepoch())`,
  )
    .bind(
      spawnId,
      parentRunId,
      childSessionId,
      parentSlug,
      childSlug,
      depth,
      JSON.stringify(messagePayload),
      workspaceId,
    )
    .run();

  if (p.userId && p.tenantId) {
    const userId = String(p.userId).trim();
    const tenantId = String(p.tenantId).trim();
    await env.DB.prepare(
      `INSERT INTO agentsam_agent_run (
         id, user_id, workspace_id, tenant_id, conversation_id, status, trigger,
         model_key, ai_model_ref, created_at, started_at
       ) VALUES (?, ?, ?, ?, ?, 'pending_handoff', 'handoff_child', ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(childRunId, userId, workspaceId, tenantId, childSessionId, childSlug, childSlug)
      .run()
      .catch(() => {});

    await env.DB.prepare(
      `INSERT OR IGNORE INTO agent_conversations (id, user_id, title, name, created_at, updated_at, is_archived)
       VALUES (?, ?, ?, ?, unixepoch(), unixepoch(), 0)`,
    )
      .bind(childSessionId, userId, 'Handoff session', 'Handoff session')
      .run()
      .catch(() => {});
  }

  return {
    spawnId,
    childSessionId,
    childRunId,
    digestId,
    digestText,
    messagePayload,
    fallbackModelKey: childSlug,
  };
}

/**
 * Pending handoff for a child session reconnect.
 * @param {any} env
 * @param {{ sessionId?: string | null, workspaceId?: string | null }} p
 */
export async function resolvePendingHandoffForSession(env, p) {
  const sessionId = p.sessionId != null ? String(p.sessionId).trim() : '';
  const workspaceId = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!env?.DB || !sessionId) return null;
  try {
    let row = await env.DB.prepare(
      `SELECT id, parent_run_id, child_run_id, parent_slug, child_slug, depth, message, status, workspace_id
       FROM agentsam_spawn_session
       WHERE status = 'pending' AND child_run_id = ?
       ${workspaceId ? 'AND workspace_id = ?' : ''}
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(...(workspaceId ? [sessionId, workspaceId] : [sessionId]))
      .first();
    if (!row?.id) {
      row = await env.DB.prepare(
        `SELECT id, parent_run_id, child_run_id, parent_slug, child_slug, depth, message, status, workspace_id
         FROM agentsam_spawn_session
         WHERE status = 'pending'
           AND json_extract(message, '$.next_session_id') = ?
         ${workspaceId ? 'AND workspace_id = ?' : ''}
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(...(workspaceId ? [sessionId, workspaceId] : [sessionId]))
        .first();
    }
    if (!row?.id) return null;
    const payload = (() => {
      try {
        return JSON.parse(String(row.message || '{}'));
      } catch {
        return {};
      }
    })();
    return {
      spawnId: String(row.id),
      parentRunId: row.parent_run_id != null ? String(row.parent_run_id) : null,
      childSlug: row.child_slug != null ? String(row.child_slug) : null,
      parentSlug: row.parent_slug != null ? String(row.parent_slug) : null,
      depth: Number(row.depth) || 1,
      payload,
      contextDigest:
        payload.contextDigest != null
          ? String(payload.contextDigest)
          : payload.summary != null
            ? String(payload.summary)
            : '',
      remainingGoal:
        payload.remainingGoal != null ? String(payload.remainingGoal) : '',
      fallbackModelKey:
        payload.fallback_model_key != null
          ? String(payload.fallback_model_key)
          : row.child_slug != null
            ? String(row.child_slug)
            : null,
    };
  } catch (e) {
    console.warn('[agent-handoff] resolve_pending', e?.message ?? e);
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} spawnId
 * @param {{ childRunId?: string | null }} [opts]
 */
export async function markHandoffAccepted(env, spawnId, opts = {}) {
  if (!env?.DB || !spawnId) return;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_spawn_session');
  const sets = [`status = 'accepted'`];
  const binds = [];
  if (cols.has('completed_at')) {
    sets.push('completed_at = unixepoch()');
  }
  if (opts.childRunId && cols.has('child_run_id')) {
    sets.push('child_run_id = ?');
    binds.push(String(opts.childRunId));
  }
  binds.push(String(spawnId));
  try {
    await env.DB.prepare(
      `UPDATE agentsam_spawn_session SET ${sets.join(', ')} WHERE id = ? AND status = 'pending'`,
    )
      .bind(...binds)
      .run();
  } catch (e) {
    console.warn('[agent-handoff] mark_accepted', e?.message ?? e);
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Function} emit
 * @param {Function} safeDone
 * @param {Record<string, unknown>} p
 */
export async function executeAgentHandoffFromLoop(env, ctx, emit, safeDone, p) {
  if ((Number(p.handoffDepth) || 0) >= MAX_HANDOFF_DEPTH) {
    return null;
  }

  const evaluation = await evaluateAgentHandoffPressure(env, {
    modelKey: p.modelKey,
    workspaceId: p.workspaceId,
    taskType: p.routingTaskType,
    mode: p.mode,
    agentSlug: p.agentSlug,
    inputTokens: p.totalUsage?.input_tokens,
    outputTokens: p.totalUsage?.output_tokens,
    cacheReadTokens: p.totalUsage?.cache_read_input_tokens,
  });

  if (!evaluation.shouldHandoff || !evaluation.fallbackModelKey) {
    return null;
  }

  const handoff = await initiateHandoff(env, {
    parentRunId: String(p.chatAgentRunId),
    parentSlug: String(p.modelKey),
    fallbackModelKey: evaluation.fallbackModelKey,
    workspaceId: String(p.workspaceId),
    goal: p.goal,
    messages: p.conversationMessages,
    executedToolNames: p.executedToolNames,
    triggeredBy: evaluation.reason ?? 'budget',
    depth: (Number(p.handoffDepth) || 0) + 1,
    userId: p.userId,
    tenantId: p.tenantId,
  });

  await patchAgentRunBudgetProgress(env, String(p.chatAgentRunId), {
    inputTokens: p.totalUsage?.input_tokens,
    outputTokens: p.totalUsage?.output_tokens,
    costUsd: evaluation.runCostUsd,
    status: 'handoff',
  });

  emit('handoff', {
    type: 'handoff',
    reason: evaluation.reason,
    urgency: evaluation.urgency,
    parent_run_id: p.chatAgentRunId,
    parent_model_key: p.modelKey,
    fallback_model_key: handoff.fallbackModelKey,
    next_session_id: handoff.childSessionId,
    child_run_id: handoff.childRunId,
    spawn_id: handoff.spawnId,
    digest_id: handoff.digestId,
  });

  emit('text', {
    text: `\n\n---\nHanding off to **${handoff.fallbackModelKey}** (${evaluation.reason} pressure). Resuming in a fresh session…\n`,
  });

  safeDone({
    tool_calls_used: p.toolCallsUsed ?? 0,
    turns: p.turnCount ?? 0,
    handoff: true,
    next_session_id: handoff.childSessionId,
  });

  console.log(
    '[agent-handoff] initiated',
    JSON.stringify({
      parent_run_id: p.chatAgentRunId,
      spawn_id: handoff.spawnId,
      reason: evaluation.reason,
      from: p.modelKey,
      to: handoff.fallbackModelKey,
      budget_pressure: evaluation.pressure?.budgetPressure,
      context_pressure: evaluation.pressure?.contextPressure,
    }),
  );

  return {
    handoff: true,
    spawnId: handoff.spawnId,
    childSessionId: handoff.childSessionId,
    childRunId: handoff.childRunId,
    fallbackModelKey: handoff.fallbackModelKey,
    totalUsage: p.totalUsage,
    toolCallsUsed: p.toolCallsUsed,
    executedToolNames: p.executedToolNames,
    modelKey: p.modelKey,
    turnCount: p.turnCount,
    timedOut: false,
    workflowRunId: null,
    agentRunId: p.chatAgentRunId != null ? String(p.chatAgentRunId) : null,
    chainRootId: p.toolChainRootId ?? null,
  };
}
