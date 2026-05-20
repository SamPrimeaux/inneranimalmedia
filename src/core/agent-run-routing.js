/**
 * Persist chat SSE runs to agentsam_agent_run; mirrors routing decisions to Supabase.
 * Uses PRAGMA table_info for forward-compatible inserts/updates.
 */

import {
  patchSupabaseRoutingDecision,
  writeSupabaseRoutingDecision,
} from '../integrations/supabase.js';
import { deriveProvider } from './memory.js';
import { estimateCostUsdFromCatalog } from './model-catalog-cost.js';
import { scheduleEtoFromAgentRun } from './performance-eto.js';
import { resolveRoutingArmByModelKey } from './routing.js';
import { pragmaTableInfo } from './retention.js';

/**
 * Canonical D1 `agentsam_routing_arms.id` for Supabase mirror + learning views.
 * Never synthesize arm_* hashes — resolve from explicit id or model_key lookup.
 *
 * @param {any} env
 * @param {{
 *   routingArmId?: string | null,
 *   modelKey?: string | null,
 *   selectedModel?: string | null,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   workspaceId?: string | null,
 * }} p
 */
export async function resolveD1RoutingArmIdForDecision(env, p) {
  const direct = p.routingArmId != null ? String(p.routingArmId).trim() : '';
  if (direct) return direct;

  const mk =
    p.selectedModel != null && String(p.selectedModel).trim() !== ''
      ? String(p.selectedModel).trim()
      : p.modelKey != null && String(p.modelKey).trim() !== ''
        ? String(p.modelKey).trim()
        : '';
  if (!mk || !env?.DB) return null;

  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  const lookup = await resolveRoutingArmByModelKey(env, {
    modelKey: mk,
    taskType: p.taskType != null && String(p.taskType).trim() !== '' ? String(p.taskType).trim() : 'chat',
    mode: p.mode != null && String(p.mode).trim() !== '' ? String(p.mode).trim() : 'agent',
    workspaceId: ws,
  });
  return lookup?.armId != null ? String(lookup.armId).trim() : null;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} p
 */
async function buildChatRoutingDecisionPayload(env, p) {
  const runGroupId = p.run_group_id ?? p.runGroupId ?? p.runId ?? null;
  const tenantId = p.tenantId != null ? String(p.tenantId).trim() : null;
  const workspaceId = p.workspaceId != null ? String(p.workspaceId).trim() : null;
  const selectedModel =
    p.selectedModel != null
      ? String(p.selectedModel)
      : p.modelKey != null
        ? String(p.modelKey)
        : null;

  const armId = await resolveD1RoutingArmIdForDecision(env, {
    routingArmId: p.routingArmId,
    modelKey: p.modelKey,
    selectedModel: p.selectedModel,
    taskType: p.taskType ?? p.task_type,
    mode: p.mode,
    workspaceId,
  });

  let arm = null;
  if (armId && env?.DB) {
    try {
      arm = await env.DB.prepare(
        `SELECT task_type, provider, model_key FROM agentsam_routing_arms WHERE id = ? LIMIT 1`,
      )
        .bind(armId)
        .first();
    } catch (_) {
      /* non-fatal */
    }
  }

  let catalog = null;
  if (selectedModel && env?.DB) {
    try {
      catalog = await env.DB.prepare(
        `SELECT provider, api_platform FROM agentsam_ai_models WHERE model_key = ? LIMIT 1`,
      )
        .bind(selectedModel.slice(0, 200))
        .first();
    } catch (_) {
      /* non-fatal */
    }
  }

  const provider =
    p.provider != null && String(p.provider).trim() !== ''
      ? String(p.provider).trim()
      : arm?.provider != null && String(arm.provider).trim() !== ''
        ? String(arm.provider).trim()
        : catalog?.provider != null && String(catalog.provider).trim() !== ''
          ? String(catalog.provider).trim()
          : deriveProvider(selectedModel ?? arm?.model_key ?? p.modelKey) ?? 'unknown';

  return {
    run_group_id: runGroupId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    task_type: p.taskType ?? p.task_type ?? arm?.task_type ?? null,
    mode: p.mode ?? null,
    intent: p.intent ?? null,
    requested_model: p.requestedModel ?? p.requested_model ?? null,
    resolved_requested_model: p.resolvedRequestedModel ?? p.resolved_requested_model ?? null,
    selected_model: selectedModel ?? arm?.model_key ?? null,
    provider,
    api_platform: p.apiPlatform ?? p.api_platform ?? catalog?.api_platform ?? null,
    tools_required: p.requiresTools ?? p.tools_required ?? false,
    supports_tools_required: p.modelSupportsTools ?? p.supports_tools_required ?? true,
    routing_strategy: p.routingStrategy ?? p.routing_strategy ?? 'default',
    routing_arm_id: armId || null,
    override_happened: p.overrideHappened ?? p.override_happened ?? false,
    override_reason: p.overrideReason ?? p.override_reason ?? null,
    fallback_used: p.fallbackUsed ?? p.fallback_used ?? false,
    fallback_reason: p.fallbackReason ?? p.fallback_reason ?? null,
    estimated_cost_usd: p.estimatedCostUsd ?? p.estimated_cost_usd ?? 0,
    success: p.success !== false,
    latency_ms: p.routingLatencyMs ?? p.latency_ms ?? null,
    plan_id: p.planId ?? p.plan_id ?? null,
    task_id: p.taskId ?? p.task_id ?? null,
    source_tool: p.sourceTool ?? p.source_tool ?? 'agent_chat',
    metadata: p.metadata && typeof p.metadata === 'object' ? p.metadata : {},
  };
}

/**
 * @param {{ label?: string | null }} [opts] Optional stable prefix (e.g. anthropic_smoketest_quickstart).
 */
export function newChatAgentRunId(opts = {}) {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const raw = opts?.label != null ? String(opts.label).trim() : '';
  const label = raw
    ? raw
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48)
    : '';
  if (label) return `arun_${label}_${hex}`;
  return `arun_${hex}`;
}

/**
 * Insert `status = running` for POST /api/agent/chat traceability; finalized via
 * {@link scheduleAgentsamChatAgentRunInsert} with the same `runId`.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId: string,
 *   userId: string,
 *   tenantId: string | null,
 *   workspaceId: string,
 *   conversationId: string | null,
 *   routingArmId: string | null,
 *   modelKey: string | null,
 *   agentId?: string | null,
 *   personUuid?: string | null,
 *   commandId?: string | null,
 *   workSessionId?: string | null,
 *   run_group_id?: string | null,
 *   taskType?: string | null,
 *   mode?: string | null,
 *   intent?: string | null,
 *   requestedModel?: string | null,
 *   resolvedRequestedModel?: string | null,
 *   selectedModel?: string | null,
 *   provider?: string | null,
 *   apiPlatform?: string | null,
 *   requiresTools?: boolean,
 *   modelSupportsTools?: boolean,
 *   routingStrategy?: string | null,
 *   overrideHappened?: boolean,
 *   overrideReason?: string | null,
 *   fallbackUsed?: boolean,
 *   fallbackReason?: string | null,
 *   estimatedCostUsd?: number,
 *   routingLatencyMs?: number | null,
 *   planId?: string | null,
 *   taskId?: string | null,
 *   sourceTool?: string | null,
 *   trigger?: string | null,
 *   metadata?: Record<string, unknown>,
 * }} p
 */
export function scheduleAgentsamChatAgentRunStart(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const uid = p.userId != null ? String(p.userId).trim() : '';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  const rid = p.runId != null ? String(p.runId).trim() : '';
  if (!uid || !ws || !rid) return;

  buildChatRoutingDecisionPayload(env, p)
    .then((routingDecisionPayload) => writeSupabaseRoutingDecision(env, routingDecisionPayload))
    .catch(() => {});

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
      if (!cols.size) return;

      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };

      add('id', rid);
      add('user_id', uid);
      add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : null);
      add('workspace_id', ws);
      add('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
      add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);
      add('task_type', p.taskType != null ? String(p.taskType).slice(0, 120) : null);
      add(
        'trigger',
        p.trigger != null && String(p.trigger).trim() !== '' ? String(p.trigger).slice(0, 80) : 'chat_sse',
      );
      add('status', 'running');
      add('ai_model_ref', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('model_id', p.modelKey != null ? String(p.modelKey).slice(0, 200) : null);
      add('input_tokens', 0);
      add('output_tokens', 0);
      add('cost_usd', 0);
      add('agent_id', p.agentId != null ? String(p.agentId).trim().slice(0, 200) : null);
      add('person_uuid', p.personUuid != null ? String(p.personUuid).trim().slice(0, 120) : null);
      add('command_id', p.commandId != null ? String(p.commandId).trim().slice(0, 200) : null);
      add('work_session_id', p.workSessionId != null ? String(p.workSessionId).slice(0, 200) : null);

      const isoNow = new Date().toISOString();
      if (cols.has('started_at')) {
        parts.push('started_at');
        binds.push(isoNow);
      }
      if (cols.has('created_at')) {
        parts.push('created_at');
        binds.push(isoNow);
      }

      if (parts.length < 3) return;

      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        console.warn('[agentsam_agent_run] chat start insert', e?.message ?? e);
      }
    })(),
  );
}

/**
 * Finalize a row created by {@link scheduleAgentsamChatAgentRunStart} (`runId`), or legacy one-shot INSERT when `runId` is omitted.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   runId?: string | null,
 *   userId: string,
 *   tenantId: string | null,
 *   workspaceId: string,
 *   conversationId: string | null,
 *   routingArmId: string | null,
 *   modelKey: string | null,
 *   taskType: string,
 *   success: boolean,
 *   inputTokens: number,
 *   outputTokens: number,
 *   costUsd: number,
 *   durationMs: number,
 *   errorMessage: string | null,
 *   workflowRunId?: string | null,
 *   chainRootId?: string | null,
 *   timedOut?: boolean,
 *   mode?: string | null,
 *   routeKey?: string | null,
 *   fallbackUsed?: boolean,
 *   fallbackReason?: string | null,
 *   modelsTried?: string[],
 *   quickstartBatch?: string | null,
 * }} p
 */
export function scheduleAgentsamChatAgentRunInsert(env, ctx, p) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const uid = p.userId != null ? String(p.userId).trim() : '';
  const ws = p.workspaceId != null ? String(p.workspaceId).trim() : '';
  if (!uid || !ws) return;

  const runId = p.runId != null && String(p.runId).trim() !== '' ? String(p.runId).trim() : '';

  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
      if (!cols.size) return;

      const tin = Math.max(0, Math.floor(Number(p.inputTokens) || 0));
      const tout = Math.max(0, Math.floor(Number(p.outputTokens) || 0));
      let costUsd = Number(p.costUsd) || 0;
      const mk = p.modelKey != null ? String(p.modelKey).slice(0, 200) : null;
      if (!costUsd && (tin > 0 || tout > 0) && mk) {
        costUsd = await estimateCostUsdFromCatalog(env.DB, mk, tin, tout);
      }

      if (runId) {
        const outcomeArmId = await resolveD1RoutingArmIdForDecision(env, {
          routingArmId: p.routingArmId,
          modelKey: mk,
          selectedModel: mk,
          taskType: p.taskType,
          mode: p.mode,
          workspaceId: ws,
        });

        const sets = [];
        const binds = [];
        const pushSet = (name, val) => {
          if (!cols.has(name)) return;
          sets.push(`${name} = ?`);
          binds.push(val);
        };
        pushSet('status', p.success ? 'completed' : 'failed');
        pushSet('ai_model_ref', mk);
        pushSet('model_id', mk);
        pushSet('input_tokens', tin);
        pushSet('output_tokens', tout);
        pushSet('cost_usd', costUsd);
        pushSet('error_message', p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null);
        pushSet(
          'routing_arm_id',
          outcomeArmId != null
            ? String(outcomeArmId).slice(0, 120)
            : p.routingArmId != null
              ? String(p.routingArmId).slice(0, 120)
              : null,
        );
        pushSet('task_type', p.taskType != null ? String(p.taskType).slice(0, 120) : null);
        pushSet('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
        if (p.workflowRunId != null && String(p.workflowRunId).trim() !== '') {
          pushSet('workflow_run_id', String(p.workflowRunId).trim().slice(0, 120));
        }
        if (p.chainRootId != null && String(p.chainRootId).trim() !== '') {
          pushSet('chain_root_id', String(p.chainRootId).trim().slice(0, 120));
        }
        if (p.timedOut === true && cols.has('timed_out')) {
          pushSet('timed_out', 1);
        }
        const isoNow = new Date().toISOString();
        if (cols.has('completed_at')) {
          sets.push('completed_at = ?');
          binds.push(isoNow);
        }
        if (!sets.length) return;
        binds.push(runId);
        try {
          await env.DB.prepare(`UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
        } catch (e) {
          console.warn('[agentsam_agent_run] chat finalize update', e?.message ?? e);
        }
        const supabasePatch = {
          success: !!p.success,
          routing_arm_id: outcomeArmId,
          selected_model: mk,
          fallback_used: !!p.fallbackUsed,
          fallback_reason: p.fallbackReason != null ? String(p.fallbackReason).slice(0, 500) : null,
        };
        if (!p.success) {
          supabasePatch.failure_reason =
            p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : 'agent_run_failed';
        }
        if (Array.isArray(p.modelsTried) && p.modelsTried.length) {
          supabasePatch.metadata = {
            models_tried: p.modelsTried.map((m) => String(m)).slice(0, 12),
          };
        }
        patchSupabaseRoutingDecision(env, runId, supabasePatch).catch(() => {});

        scheduleEtoFromAgentRun(env, ctx, {
          tenantId: p.tenantId,
          workspaceId: ws,
          userId: uid,
          agentRunId: runId,
          routingArmId: outcomeArmId ?? p.routingArmId,
          routeKey: p.routeKey,
          taskType: p.taskType,
          mode: p.mode,
          modelKey: mk,
          workflowRunId: p.workflowRunId,
          executionId: runId,
          success: !!p.success,
          timedOut: p.timedOut === true,
          slaBreach: false,
          latencyMs: Math.max(0, Math.floor(Number(p.durationMs) || 0)),
          inputTokens: tin,
          outputTokens: tout,
          costUsd,
          eventStatus: p.success ? 'completed' : 'failed',
          quickstartBatch: p.quickstartBatch ?? null,
        });
        return;
      }

      const id = newChatAgentRunId();
      const parts = [];
      const binds = [];
      const add = (name, val) => {
        if (!cols.has(name)) return;
        parts.push(name);
        binds.push(val);
      };

      add('id', id);
      add('user_id', uid);
      add('tenant_id', p.tenantId != null ? String(p.tenantId).trim() : null);
      add('workspace_id', ws);
      add('conversation_id', p.conversationId != null ? String(p.conversationId).slice(0, 200) : null);
      add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);
      add('task_type', p.taskType != null ? String(p.taskType).slice(0, 120) : null);
      add('trigger', 'chat_sse');
      add('status', p.success ? 'completed' : 'failed');
      add('ai_model_ref', mk);
      add('model_id', mk);
      add('input_tokens', tin);
      add('output_tokens', tout);
      add('cost_usd', costUsd);
      add('error_message', p.errorMessage != null ? String(p.errorMessage).slice(0, 8000) : null);

      const dur = Math.max(0, Math.floor(Number(p.durationMs) || 0));
      const isoNow = new Date().toISOString();
      const isoStart = new Date(Date.now() - dur).toISOString();
      if (cols.has('started_at')) {
        parts.push('started_at');
        binds.push(isoStart);
      }
      if (cols.has('completed_at')) {
        parts.push('completed_at');
        binds.push(isoNow);
      }
      if (cols.has('created_at')) {
        parts.push('created_at');
        binds.push(isoNow);
      }

      if (parts.length < 3) return;

      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_agent_run (${parts.join(', ')}) VALUES (${parts.map(() => '?').join(', ')})`,
        )
          .bind(...binds)
          .run();
      } catch (e) {
        console.warn('[agentsam_agent_run] chat insert', e?.message ?? e);
      }
    })(),
  );
}
