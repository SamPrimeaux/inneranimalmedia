/**
 * Read → Write → Summarize spawn pipeline (agentsam_spawn_job + 3 child runs).
 * Shared by agent, debug, plan, and multitask mode controllers.
 */
import { runtimeContextPayload, legacyContextPayload } from './mode-controllers/runtime-context.js';
import {
  ensureSubagentProfilesAvailable,
  createMultitaskParentRun,
  createSpawnJob,
  createChildRun,
  markAgentRunComplete,
  markAgentRunStarted,
  estimateAgentRunCostUsd,
  bumpSpawnJobAfterChild,
  finalizeSpawnJob,
} from './subagent-spawn-d1.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { resolveRuntimeProfile, toolsManifestFromCompiledRows } from './runtime-profile.js';
import {
  appendSubagentProfileToSystemPrompt,
  filterToolsForSubagentProfile,
  pickRwsSubagentProfiles,
} from './subagent-profile-resolve.js';
import {
  READONLY_REPO_AUDIT_ROUTE_KEY,
  assessRequiredEvidenceToolsPresent,
  extractRequestedRepoPaths,
  filterReportChildOrchestrationTools,
  isReadonlyRepoAuditContext,
  resolveActiveCoreEvidenceToolNames,
} from './readonly-repo-audit-tools.js';

import {
  buildRwsChildUserMessage,
  getRwsChildCompileOverrides,
  shouldRunRwsFanout,
} from './rws-spawn-pipeline.js';

export { shouldRunRwsFanout, buildRwsChildUserMessage, getRwsChildCompileOverrides, RWS_SPAWN_MODES } from './rws-spawn-pipeline.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

function modelFacingToolNames(tools) {
  return (tools || []).map((t) => String(t?.name || t?.tool_name || '').trim()).filter(Boolean);
}

function emitChildToolContractLog(emit, payload) {
  console.log('[agentsam_subagent_child_tool_contract]', JSON.stringify(payload));
  emit('agentsam_subagent_child_tool_contract', payload);
}

async function resolveChildLoopTelemetry(env, loopResult, childProfile, durationMs) {
  const usage = loopResult?.totalUsage && typeof loopResult.totalUsage === 'object' ? loopResult.totalUsage : {};
  const inputTokens = Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(usage.output_tokens) || 0));
  const modelKey =
    loopResult?.modelKey != null && String(loopResult.modelKey).trim()
      ? String(loopResult.modelKey).trim()
      : childProfile?.model_key != null
        ? String(childProfile.model_key).trim()
        : null;
  const costUsd = await estimateAgentRunCostUsd(env, modelKey, inputTokens, outputTokens);
  return {
    modelKey,
    provider: childProfile?.selected_provider != null ? String(childProfile.selected_provider) : '',
    routingArmId: childProfile?.routing_arm_id != null ? String(childProfile.routing_arm_id) : null,
    mode: childProfile?.mode != null ? String(childProfile.mode) : 'agent',
    taskType: childProfile?.routing_task_type != null ? String(childProfile.routing_task_type) : 'multitask',
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
    toolCalls: Math.max(0, Math.floor(Number(loopResult?.toolCallsUsed) || 0)),
  };
}

function emitUserSummary(emit, fanoutId, summaryText, okCount, total) {
  const trimmed = String(summaryText || '').trim();
  if (!trimmed) {
    emit('text', { text: `**Pipeline complete** (${okCount}/${total} steps succeeded) — no summary returned.` });
    return;
  }
  const lines = trimmed.split('\n');
  if (lines.length > 14 || trimmed.length >= 1200) {
    const path = `agent-output/${fanoutId}/rws-summary.md`;
    emit('monaco_file_generated', {
      files: [{ path, filename: 'rws-summary.md', content: trimmed }],
    });
    emit('text', {
      text:
        `**Here's what happened** (${okCount}/${total} steps OK)\n\n` +
        `${lines.slice(0, 12).join('\n')}\n\n` +
        `_(Full summary in Monaco: \`${path}\`)_`,
    });
    return;
  }
  emit('text', { text: `**Here's what happened** (${okCount}/${total} steps OK)\n\n${trimmed}` });
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} input
 */
export async function executeRwsSpawnFanout(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '');
  const session = input.session || {};
  const userId = session.userId != null ? String(session.userId).trim() : '';
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = session.workspaceId != null ? String(session.workspaceId).trim() : '';
  const sessionId = session.sessionId != null ? String(session.sessionId).trim() : null;
  const conversationId = sessionId;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  emit('runtime_context', runtimeContextPayload(profile, { modelOverride: input.modelOverride ?? null }));
  emit('context', legacyContextPayload(profile, { toolsCount: 0, modelOverride: input.modelOverride ?? null }));
  emit('rws_pipeline_started', {
    mode: profile.mode,
    pipeline: ['read', 'write', 'summarize'],
    spawn_table: 'agentsam_spawn_job',
  });

  (async () => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const fanoutId = `rws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const mergeStrategy = 'rws_pipeline';

    try {
      if (!profile.parallel_policy?.enabled) {
        emit('agentsam_subagent_action_required', {
          fanout_id: fanoutId,
          required_action: 'user_input',
          reason: 'subagent_spawn_disabled_by_policy',
          action: {
            action_id: 'enable_subagent_spawn',
            label: 'Enable subagent spawn',
            kind: 'user_input',
            payload: {
              message:
                'Subagent spawn is disabled (agentsam_user_policy.allow_subagent_spawn = 0). Enable it to use the read/write/summarize pipeline.',
            },
          },
          created_at_unix: nowUnix,
        });
        emit('done', {});
        return;
      }

      const prof = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const chosen = pickRwsSubagentProfiles(prof.profiles || []);
      if (!prof.ok || chosen.length < 3) {
        emit('text', {
          text: `**RWS pipeline blocked:** need 3 subagent profiles (read/write/summarize). Reason: ${prof.reason || 'missing_profiles'}`,
        });
        emit('done', {});
        return;
      }

      const parentTrigger = `${profile.mode}_rws_spine`;
      const parentRun = await createMultitaskParentRun(env, ctx, {
        userId,
        workspaceId,
        tenantId,
        conversationId,
        sessionId,
        mode: profile.mode,
        taskType: profile.routing_task_type || profile.mode,
        trigger: parentTrigger,
        routingArmId: profile.routing_arm_id,
        modelKey: profile.model_key,
        provider: profile.selected_provider,
      });
      const parentRunId = parentRun.ok ? parentRun.runId : null;

      const spawnJob = parentRunId
        ? await createSpawnJob(env, ctx, {
            masterRunId: parentRunId,
            masterAgentSlug: 'agent-sam',
            userId,
            workspaceId,
            tenantId,
            taskDescription: message,
            chunkCount: 3,
            orchestratorSlug: 'agent-sam',
            mergeStrategy: 'rws_pipeline',
          })
        : { ok: false, spawnJobId: null, reason: parentRun.reason || 'parent_run_failed' };

      emit('agentsam_subagent_fanout_started', {
        fanout_id: fanoutId,
        spawn_job_id: spawnJob.spawnJobId,
        pipeline: 'read_write_summarize',
        parent: {
          agent_run_id: parentRunId,
          mode: profile.mode,
          execution_kind: profile.execution_kind,
        },
        policy: { max_subagents: 3, merge_strategy: mergeStrategy },
        created_at_unix: nowUnix,
      });

      if (!spawnJob.ok) {
        emit('text', { text: `**Spawn job failed:** ${spawnJob.reason || 'unknown'}` });
        emit('done', {});
        return;
      }

      if (!profile.parallel_policy?.execution_enabled) {
        emit('text', {
          text:
            '**RWS pipeline queued but not executed:** enable `allow_fanout_execution` in user policy to run read/write/summarize subagents.',
        });
        if (parentRunId) {
          await markAgentRunComplete(env, ctx, {
            runId: parentRunId,
            status: 'failed',
            latencyMs: 0,
            errorMessage: 'fanout execution disabled (allow_fanout_execution=0)',
            modelKey: profile.model_key,
            provider: profile.selected_provider,
            routingArmId: profile.routing_arm_id,
            mode: profile.mode,
            taskType: profile.routing_task_type || profile.mode,
          });
        }
        emit('done', {});
        return;
      }

      const childSpecs = [];
      for (let i = 0; i < chosen.length; i++) {
        const row = chosen[i];
        const role = String(row._rws_role || ['read', 'write', 'summarize'][i] || 'read');
        const slug = String(row.slug || role).trim();
        const subagentRunId = `sar_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const child = parentRunId
          ? await createChildRun(env, ctx, {
              parentRunId,
              userId,
              workspaceId,
              tenantId,
              conversationId,
              sessionId,
              subagentSlug: `${role}:${slug}`,
              taskType: `rws_${role}`,
            })
          : { ok: false, runId: null };
        childSpecs.push({ i, row, role, slug, subagentRunId, childRunId: child.ok ? child.runId : null });
        emit('agentsam_subagent_run_started', {
          fanout_id: fanoutId,
          subagent_run_id: subagentRunId,
          subagent_index: i,
          subagent_slug: slug,
          rws_role: role,
          task: { title: `RWS ${role}`, goal: message, task_type: `rws_${role}` },
          child: { agent_run_id: child.ok ? child.runId : null },
          created_at_unix: nowUnix,
        });
      }

      if (parentRunId) {
        await markAgentRunStarted(env, ctx, {
          runId: parentRunId,
          modelKey: profile.model_key,
          provider: profile.selected_provider,
          routingArmId: profile.routing_arm_id,
          mode: profile.mode,
          taskType: profile.routing_task_type || profile.mode,
        });
      }

      const { buildSystemPrompt, runAgentToolLoop } = await import('../api/agent.js');
      const userPolicy =
        input.userPolicy ||
        (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);
      const readonlyAuditChild = isReadonlyRepoAuditContext(message);
      const activeFileEnvelope = input.activeFileEnvelope ?? null;
      const agentChatResolvedContext = input.agentChatResolvedContext ?? null;

      const prior = { read: '', write: '' };
      const results = [];
      let okCount = 0;
      let errCount = 0;
      let rollupInputTokens = 0;
      let rollupOutputTokens = 0;
      let rollupCostUsd = 0;
      let rollupLatencyMs = 0;
      let userFacingSummary = '';

      for (const c of childSpecs) {
        const t0 = Date.now();
        const role = c.role;

        emit('agentsam_subagent_run_progress', {
          fanout_id: fanoutId,
          subagent_run_id: c.subagentRunId,
          rws_role: role,
          phase: 'starting',
          message: `Running ${role} subagent…`,
          created_at_unix: Math.floor(Date.now() / 1000),
        });

        let childProfile;
        try {
          const compileOverrides = {
            ...getRwsChildCompileOverrides(role, profile),
            subagent_slug: c.slug,
            model_key: profile.model_key,
          };
          if (role === 'read' && readonlyAuditChild) {
            compileOverrides.route_key = READONLY_REPO_AUDIT_ROUTE_KEY;
          }
          childProfile = await resolveRuntimeProfile(env, {
            mode: compileOverrides.mode || 'ask',
            message,
            session: { userId, workspaceId, tenantId, conversationId: sessionId },
            overrides: compileOverrides,
            compile_lane: 'live',
          });
        } catch (e) {
          results.push({
            ok: false,
            role,
            slug: c.slug,
            status: 'error',
            error: e?.message ?? String(e),
            output: '',
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            durationMs: Date.now() - t0,
          });
          errCount += 1;
          continue;
        }

        const promptRouteRow = childProfile._prompt_route_row ?? null;
        let toolsAll = toolsManifestFromCompiledRows(childProfile._compiled_tool_rows || []);
        let tools = filterToolsForSubagentProfile(toolsAll, c.row);
        if (role === 'read' || role === 'summarize') {
          tools = filterReportChildOrchestrationTools(tools);
        }
        if (role === 'summarize') {
          tools = [];
        }

        const modelFacingNames = modelFacingToolNames(tools);
        if (role === 'read' && readonlyAuditChild) {
          const requiredEvidenceNames = await resolveActiveCoreEvidenceToolNames(env, workspaceId);
          const evidenceAssessment = assessRequiredEvidenceToolsPresent(modelFacingNames, requiredEvidenceNames);
          emitChildToolContractLog(emit, {
            child_slug: c.slug,
            rws_role: role,
            compiled_tool_names: modelFacingToolNames(toolsAll),
            filtered_tool_names: modelFacingNames,
            required_evidence_tools_present: evidenceAssessment.required_evidence_tools_present,
            missing_evidence_tools: evidenceAssessment.missing,
            requested_files: extractRequestedRepoPaths(message),
          });
          if (!evidenceAssessment.required_evidence_tools_present) {
            results.push({
              ok: false,
              role,
              slug: c.slug,
              status: 'error',
              error: `READ_TOOL_CONTRACT_MISSING:${evidenceAssessment.missing.join(',')}`,
              output: '',
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
              durationMs: Date.now() - t0,
            });
            errCount += 1;
            continue;
          }
        }

        let systemPrompt;
        try {
          systemPrompt = await buildSystemPrompt(env, tenantId, childProfile.mode, '', null, promptRouteRow, {
            request: input.request,
            sessionId,
            message,
            taskType: childProfile.routing_task_type,
            workspaceId,
            userId,
            minimalAsk: role === 'summarize',
          });
        } catch {
          systemPrompt = 'You are Agent Sam.';
        }
        systemPrompt = appendSubagentProfileToSystemPrompt(systemPrompt, c.row);
        if (role === 'summarize') {
          systemPrompt +=
            '\n\n## Summarizer role\nReply in simple English for a non-technical user. No tool calls.';
        }
        if (role === 'write' && profile.mode === 'plan') {
          systemPrompt +=
            '\n\n## Plan mode write step\nProduce a structured plan (numbered tasks). Do not execute deploys.';
        }
        if (role === 'write' && profile.mode === 'debug') {
          systemPrompt +=
            '\n\n## Debug mode write step\nFix root cause with minimal diffs. Prefer evidence-backed changes.';
        }

        const userContent = buildRwsChildUserMessage(role, message, prior);
        const textChunks = [];
        let toolCalls = 0;
        let blocked = null;
        const sink = (type, payload) => {
          if (type === 'text' && payload?.text) textChunks.push(String(payload.text));
          if (type === 'tool_call') toolCalls += 1;
          if (type === 'tool_blocked') blocked = payload?.reason ? String(payload.reason) : 'blocked';
        };

        if (c.childRunId) {
          await markAgentRunStarted(env, ctx, {
            runId: c.childRunId,
            modelKey: childProfile.model_key,
            provider: childProfile.selected_provider,
            routingArmId: childProfile.routing_arm_id,
            mode: childProfile.mode,
            taskType: childProfile.routing_task_type,
          });
        }

        let loopResult = null;
        try {
          loopResult = await runAgentToolLoop(env, ctx, sink, {
            request: input.request,
            messages: [{ role: 'user', content: userContent }],
            tools,
            systemPrompt,
            modelKey: childProfile.model_key,
            temperature: role === 'summarize' ? 0.4 : childProfile.temperature,
            maxToolCalls: role === 'summarize' ? 0 : childProfile.max_tool_calls,
            mode: childProfile.mode,
            modeConfig: {
              max_runtime_ms: childProfile.max_runtime_ms,
              max_turns: role === 'summarize' ? 2 : childProfile.max_turns,
              max_tool_calls: role === 'summarize' ? 0 : childProfile.max_tool_calls,
              temperature: childProfile.temperature,
            },
            userPolicy,
            sessionId,
            tenantId,
            userId,
            workspaceId,
            routingTaskType: childProfile.routing_task_type,
            mcpRuntimeContext: {
              userId,
              tenantId,
              workspaceId,
              sessionId,
              taskType: childProfile.routing_task_type,
              routeKey: childProfile.refined_route_key || childProfile.mode,
              writePolicy: childProfile.write_policy,
              userMessage: message,
              runtimeProfile: childProfile,
            },
            routingArmId: childProfile.routing_arm_id,
            agentSlug: c.row?.id ?? null,
            dispatchSpine: c.childRunId
              ? { agent_run_id: c.childRunId, routing_arm_id: childProfile.routing_arm_id, mode: childProfile.mode }
              : null,
            chatAgentRunId: c.childRunId,
            activeFileEnvelope,
            resolvedContext: agentChatResolvedContext,
            maxRuntimeMs: childProfile.max_runtime_ms,
            runtimeProfile: childProfile,
          });
        } catch (e) {
          const telemetry = await resolveChildLoopTelemetry(env, loopResult, childProfile, Date.now() - t0);
          const output = textChunks.join('').trim();
          if (role === 'read') prior.read = output;
          if (role === 'write') prior.write = output;
          results.push({
            ok: false,
            role,
            slug: c.slug,
            childRunId: c.childRunId,
            status: blocked ? 'blocked' : 'error',
            error: blocked || (e?.message ?? String(e)),
            output,
            ...telemetry,
          });
          errCount += 1;
          if (c.childRunId) {
            await markAgentRunComplete(env, ctx, {
              runId: c.childRunId,
              status: 'failed',
              latencyMs: telemetry.durationMs,
              inputTokens: telemetry.inputTokens,
              outputTokens: telemetry.outputTokens,
              costUsd: telemetry.costUsd,
              errorMessage: blocked || e?.message,
              modelKey: telemetry.modelKey,
              provider: telemetry.provider,
              routingArmId: telemetry.routingArmId,
              mode: telemetry.mode,
              taskType: telemetry.taskType,
            });
          }
          await bumpSpawnJobAfterChild(env, ctx, {
            spawnJobId: spawnJob.spawnJobId,
            ok: false,
            inputTokens: telemetry.inputTokens,
            outputTokens: telemetry.outputTokens,
            costUsd: telemetry.costUsd,
            latencyMs: telemetry.durationMs,
          });
          continue;
        }

        const telemetry = await resolveChildLoopTelemetry(env, loopResult, childProfile, Date.now() - t0);
        const output = textChunks.join('').trim();
        const ok = !blocked;
        if (ok) okCount += 1;
        else errCount += 1;

        if (role === 'read') prior.read = output;
        if (role === 'write') prior.write = output;
        if (role === 'summarize') userFacingSummary = output;

        rollupInputTokens += telemetry.inputTokens;
        rollupOutputTokens += telemetry.outputTokens;
        rollupCostUsd += telemetry.costUsd;
        rollupLatencyMs += telemetry.durationMs;

        if (c.childRunId) {
          await markAgentRunComplete(env, ctx, {
            runId: c.childRunId,
            status: ok ? 'completed' : 'failed',
            latencyMs: telemetry.durationMs,
            inputTokens: telemetry.inputTokens,
            outputTokens: telemetry.outputTokens,
            costUsd: telemetry.costUsd,
            errorMessage: ok ? null : blocked,
            modelKey: telemetry.modelKey,
            provider: telemetry.provider,
            routingArmId: telemetry.routingArmId,
            mode: telemetry.mode,
            taskType: telemetry.taskType,
          });
        }
        await bumpSpawnJobAfterChild(env, ctx, {
          spawnJobId: spawnJob.spawnJobId,
          ok,
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          costUsd: telemetry.costUsd,
          latencyMs: telemetry.durationMs,
        });

        results.push({
          ok,
          role,
          slug: c.slug,
          childRunId: c.childRunId,
          status: ok ? 'ok' : 'blocked',
          error: blocked,
          output,
          toolCalls: telemetry.toolCalls || toolCalls,
          ...telemetry,
        });

        emit('agentsam_subagent_run_result', {
          fanout_id: fanoutId,
          subagent_run_id: c.subagentRunId,
          rws_role: role,
          subagent_slug: c.slug,
          status: ok ? 'ok' : 'error',
          summary: ok ? `${role} step completed.` : String(blocked || 'failed'),
          metrics: { duration_ms: telemetry.durationMs, tool_calls: telemetry.toolCalls },
          created_at_unix: Math.floor(Date.now() / 1000),
        });
      }

      const mergedParts = results.map(
        (r) => `## ${r.role} (${r.slug})\n\n${r.output || (r.ok ? '_No output._' : `_Error: ${r.error}_`)}`,
      );
      const mergedOutput = userFacingSummary || mergedParts.join('\n\n---\n\n');

      await finalizeSpawnJob(env, ctx, {
        spawnJobId: spawnJob.spawnJobId,
        mergedOutput,
        subagentsFailed: errCount,
        subagentsSucceeded: okCount,
      });

      if (parentRunId) {
        const parentStatus = errCount === 0 ? 'completed' : okCount > 0 ? 'partial' : 'failed';
        await markAgentRunComplete(env, ctx, {
          runId: parentRunId,
          status: parentStatus,
          latencyMs: rollupLatencyMs,
          inputTokens: rollupInputTokens,
          outputTokens: rollupOutputTokens,
          costUsd: rollupCostUsd,
          errorMessage: errCount > 0 ? `${errCount}/3 RWS steps failed` : null,
          modelKey: profile.model_key,
          provider: profile.selected_provider,
          routingArmId: profile.routing_arm_id,
          mode: profile.mode,
          taskType: profile.routing_task_type || profile.mode,
        });
      }

      console.log(
        '[rws_spawn_telemetry]',
        JSON.stringify({
          fanout_id: fanoutId,
          spawn_job_id: spawnJob.spawnJobId,
          parent_run_id: parentRunId,
          mode: profile.mode,
          ok: okCount,
          error: errCount,
          rollup_cost_usd: rollupCostUsd,
        }),
      );

      emit('agentsam_subagent_fanout_result', {
        fanout_id: fanoutId,
        spawn_job_id: spawnJob.spawnJobId,
        pipeline: 'read_write_summarize',
        status: errCount === 0 ? 'ok' : okCount > 0 ? 'partial' : 'error',
        results: { ok: okCount, error: errCount },
        created_at_unix: Math.floor(Date.now() / 1000),
      });

      emitUserSummary(emit, fanoutId, userFacingSummary || mergedOutput, okCount, childSpecs.length);
      emit('done', {});
    } catch (e) {
      console.warn('[rws-spawn-fanout] failed', e?.message ?? e);
      emit('error', { message: e?.message ?? 'RWS pipeline failed', code: 'rws_pipeline_error' });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}
