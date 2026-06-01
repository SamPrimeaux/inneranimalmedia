import { jsonResponse } from '../responses.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';
import {
  ensureSubagentProfilesAvailable,
  createMultitaskParentRun,
  createSpawnJob,
  createChildRun,
  markAgentRunComplete,
  bumpSpawnJobAfterChild,
  finalizeSpawnJob,
} from '../subagent-spawn-d1.js';
import { loadAgentSamUserPolicy } from '../agent-policy.js';
import { resolveRuntimeProfile, toolsManifestFromCompiledRows } from '../runtime-profile.js';
import {
  appendSubagentProfileToSystemPrompt,
  filterToolsForSubagentProfile,
  pickMultitaskSubagentProfiles,
} from '../subagent-profile-resolve.js';
import {
  READONLY_REPO_AUDIT_ROUTE_KEY,
  assessRequiredEvidenceToolsPresent,
  extractRequestedRepoPaths,
  filterReportChildOrchestrationTools,
  isReadonlyRepoAuditContext,
  resolveActiveCoreEvidenceToolNames,
} from '../readonly-repo-audit-tools.js';

function buildChildUserMessage(fullMessage, index, total, slug) {
  return (
    `You are subagent ${index + 1}/${total} (\`${slug}\`) in a multitask fanout.\n` +
    `Complete your slice of the parent task using read-only evidence tools when files or D1 context are needed.\n` +
    `You MUST call fs_read_file, github_file, or fs_search_files for any src/ path in the task before claiming TOOLING_MISSING.\n` +
    `If ### Open file (editor) content is present in the parent message, treat it as authoritative.\n\n` +
    `---\n\n${String(fullMessage || '').trim()}`
  );
}

/**
 * @param {Array<Record<string, unknown>>} tools
 */
function modelFacingToolNames(tools) {
  return (tools || []).map((t) => String(t?.name || t?.tool_name || '').trim()).filter(Boolean);
}

/**
 * @param {any} emit
 * @param {Record<string, unknown>} payload
 */
function emitChildToolContractLog(emit, payload) {
  console.log('[agentsam_subagent_child_tool_contract]', JSON.stringify(payload));
  emit('agentsam_subagent_child_tool_contract', payload);
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} c
 * @param {string} message
 * @param {string} missingTools
 * @param {number} t0
 */
async function returnReadToolContractMissing(env, ctx, input, c, message, missingTools, t0) {
  const err = `READ_TOOL_CONTRACT_MISSING:${missingTools.join(',')}`;
  if (c.childRunId) {
    await markAgentRunComplete(env, ctx, {
      runId: c.childRunId,
      status: 'failed',
      errorMessage: err,
      outputSummary: err,
    }).catch(() => {});
  }
  return {
    ok: false,
    subagentRunId: c.subagentRunId,
    slug: c.slug,
    childRunId: c.childRunId,
    status: 'error',
    error: err,
    durationMs: Date.now() - t0,
    toolCalls: 0,
    output: `READ_TOOL_CONTRACT_MISSING — required evidence tools not compiled: ${missingTools.join(', ')}. This is a runtime/config bug, not missing repo files.`,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
}

function emitParentMultitaskSummary(emit, fanoutId, mergedOutput, okCount, total) {
  const trimmed = String(mergedOutput || '').trim();
  const lines = trimmed ? trimmed.split('\n') : [];
  const openMonaco = lines.length > 10 || trimmed.length >= 800;
  if (openMonaco && trimmed) {
    const path = `agent-output/${fanoutId}/multitask-report.md`;
    emit('monaco_file_generated', {
      files: [{ path, filename: 'multitask-report.md', content: trimmed }],
    });
    emit('text', {
      text:
        `**Multitask complete** (${okCount}/${total} subagents succeeded).\n\n` +
        `${lines.slice(0, 10).join('\n')}\n\n` +
        `_(Full report opened in Monaco: \`${path}\`)_`,
    });
    return;
  }
  if (trimmed) {
    emit('text', { text: `**Multitask complete** (${okCount}/${total})\n\n${trimmed}` });
    return;
  }
  emit('text', { text: `**Multitask complete** (${okCount}/${total}) — no consolidated output returned.` });
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Multitask controller (stub)
 * - execution_kind: multitask_fanout
 * - purpose: subagent orchestration
 * - MUST NOT silently fall back to agent
 *
 * Minimum stub:
 * - emit runtime_context
 * - emit multitask_started
 * - return structured "recognized; orchestrator pending" response
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ message: string, profile: import('../runtime-profile.types.js').RuntimeProfile, modelOverride?: string|null }} input
 */
export async function executeMultitaskTurn(env, ctx, input) {
  const profile = input.profile;
  if (profile.execution_kind !== 'multitask_fanout') {
    return jsonResponse(
      { error: 'multitask_controller_execution_kind_mismatch', execution_kind: profile.execution_kind },
      400,
    );
  }

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

  (async () => {
    try {
      const maxSubagents = Math.max(
        0,
        Math.min(3, Math.floor(Number(profile.parallel_policy?.max_subagents) || 0) || 3),
      );
      const mergeStrategy = profile.parallel_policy?.merge_strategy === 'report' ? 'report' : 'synthesize';
      const nowUnix = Math.floor(Date.now() / 1000);
      const fanoutId = `saf_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const allowSpawn = profile.parallel_policy?.enabled === true;

      if (!allowSpawn) {
        // Policy gate: do not create spawn_job or child runs when spawn is disabled.
        emit('agentsam_subagent_fanout_started', {
          fanout_id: fanoutId,
          parent: {
            profile_id: profile.profile_id,
            profile_hash: profile.profile_hash,
            mode: profile.mode,
            mode_controller: profile.mode_controller,
            execution_kind: profile.execution_kind,
          },
          policy: { max_subagents: 0, merge_strategy: mergeStrategy },
          requested: { subtasks_count: 0 },
          created_at_unix: nowUnix,
        });
        emit('agentsam_subagent_action_required', {
          fanout_id: fanoutId,
          subagent_run_id: null,
          required_action: 'user_input',
          reason: 'subagent_spawn_disabled_by_policy',
          action: {
            action_id: 'enable_subagent_spawn',
            label: 'Enable subagent spawn',
            kind: 'user_input',
            payload: {
              message:
                'This user is not permitted to spawn subagents (agentsam_user_policy.allow_subagent_spawn = 0). Enable it in workspace user policy to use Multitask fanout.',
            },
          },
          created_at_unix: nowUnix,
        });
        emit('done', {});
        return;
      }

      // (1) Ensure subagent profiles exist (seamless install).
      const prof = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      if (!prof.ok || prof.profiles.length === 0) {
        emit('agentsam_subagent_fanout_started', {
          fanout_id: fanoutId,
          parent: {
            profile_id: profile.profile_id,
            profile_hash: profile.profile_hash,
            mode: profile.mode,
            mode_controller: profile.mode_controller,
            execution_kind: profile.execution_kind,
          },
          policy: { max_subagents: maxSubagents, merge_strategy: mergeStrategy },
          requested: { subtasks_count: 0 },
          created_at_unix: nowUnix,
        });
        emit('agentsam_subagent_action_required', {
          fanout_id: fanoutId,
          subagent_run_id: null,
          required_action: 'user_input',
          reason: `no_subagent_profiles:${prof.reason || 'unknown'}`,
          action: {
            action_id: 'configure_subagents',
            label: 'Configure subagents',
            kind: 'user_input',
            payload: { message: 'No subagent profiles available; open Settings → Subagents.' },
          },
          created_at_unix: nowUnix,
        });
        emit('done', {});
        return;
      }

      // (2) Create a parent agentsam_agent_run for this multitask turn.
      const parentRun = await createMultitaskParentRun(env, ctx, {
        userId,
        workspaceId,
        tenantId,
        conversationId,
        sessionId,
        mode: profile.mode,
        taskType: profile.routing_task_type || 'multitask',
        trigger: 'multitask_spine',
        routingArmId: profile.routing_arm_id,
        modelKey: profile.model_key,
        provider: profile.selected_provider,
      });
      const parentRunId = parentRun.ok ? parentRun.runId : null;

      // (3) Create spawn job row (one job per fanout).
      const spawnJob = parentRunId
        ? await createSpawnJob(env, ctx, {
            masterRunId: parentRunId,
            masterAgentSlug: 'agent-sam',
            userId,
            workspaceId,
            tenantId,
            taskDescription: message,
            chunkCount: maxSubagents,
            orchestratorSlug: 'agent-sam',
            mergeStrategy: mergeStrategy === 'report' ? 'concat' : 'custom',
          })
        : { ok: false, spawnJobId: null, reason: parentRun.reason || 'parent_run_failed' };

      emit('agentsam_subagent_fanout_started', {
        fanout_id: fanoutId,
        parent: {
          agent_run_id: parentRunId,
          profile_id: profile.profile_id,
          profile_hash: profile.profile_hash,
          mode: profile.mode,
          mode_controller: profile.mode_controller,
          execution_kind: profile.execution_kind,
        },
        policy: {
          max_subagents: maxSubagents,
          merge_strategy: mergeStrategy,
        },
        requested: { subtasks_count: maxSubagents },
        created_at_unix: nowUnix,
      });

      if (!spawnJob.ok) {
        emit('agentsam_subagent_action_required', {
          fanout_id: fanoutId,
          subagent_run_id: null,
          required_action: 'resume',
          reason: `spawn_job_create_failed:${spawnJob.reason || 'unknown'}`,
          action: {
            action_id: 'resume',
            label: 'Resume with context',
            kind: 'resume',
            payload: {
              resume_token: fanoutId,
              needed_context: ['check D1 connectivity and retry'],
            },
          },
          created_at_unix: nowUnix,
        });
        emit('done', {});
        return;
      }

      // (4) Create queued child runs — task-aware profile pick (not sort_order-only).
      const chosen = pickMultitaskSubagentProfiles(prof.profiles, maxSubagents, message);
      const execEnabled = profile.parallel_policy?.execution_enabled === true;

      const childSpecs = [];
      for (let i = 0; i < chosen.length; i++) {
        const row = chosen[i];
        const slug = String(row.slug || 'primary').trim();
        const subagentRunId = `sar_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const child = parentRunId
          ? await createChildRun(env, ctx, {
              parentRunId,
              userId,
              workspaceId,
              tenantId,
              conversationId,
              sessionId,
              subagentSlug: slug,
              taskType: 'multitask',
            })
          : { ok: false, runId: null, reason: 'no_parent_run' };
        childSpecs.push({ i, row, slug, subagentRunId, childRunId: child.ok ? child.runId : null });
      }

      // Always emit "run_started" so UI is visible whenever multitask uses subagents.
      for (const c of childSpecs) {
        emit('agentsam_subagent_run_started', {
          fanout_id: fanoutId,
          subagent_run_id: c.subagentRunId,
          subagent_index: c.i,
          subagent_slug: c.slug,
          task: { title: `Subtask ${c.i + 1}`, goal: message, task_type: 'multitask' },
          child: { agent_run_id: c.childRunId },
          child_profile: {
            profile_id: null,
            profile_hash: null,
            mode: 'agent',
            mode_controller: 'agent_controller',
            execution_kind: 'agent_tool_loop',
            tool_policy: { allowlist_count: 0, denylist_count: 0, max_tool_calls: null },
            write_policy: profile.write_policy,
            model_key: profile.model_key,
          },
          created_at_unix: nowUnix,
        });
      }

      if (!execEnabled) {
        for (const c of childSpecs) {
          emit('agentsam_subagent_run_resume_required', {
            fanout_id: fanoutId,
            subagent_run_id: c.subagentRunId,
            resume_token: c.subagentRunId,
            needed_context: ['fanout execution disabled by policy (allow_fanout_execution=0)'],
            created_at_unix: nowUnix,
          });
        }
        emit('agentsam_subagent_fanout_result', {
          fanout_id: fanoutId,
          spawn_job_id: spawnJob.spawnJobId,
          status: 'partial',
          merge_strategy: mergeStrategy,
          results: { ok: 0, error: 0, blocked: 0, requires_approval: 0 },
          created_at_unix: nowUnix,
        });
        emit('done', {});
        return;
      }

      const { buildSystemPrompt, runAgentToolLoop } = await import('../../api/agent.js');
      const userPolicy =
        input.userPolicy ||
        (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);
      const readonlyAuditChild = isReadonlyRepoAuditContext(message);
      const childCompileMode =
        mergeStrategy === 'report' || readonlyAuditChild ? 'ask' : 'agent';
      const activeFileEnvelope = input.activeFileEnvelope ?? null;
      const agentChatResolvedContext = input.agentChatResolvedContext ?? null;

      const results = await Promise.all(
        childSpecs.map(async (c) => {
          const t0 = Date.now();
          emit('agentsam_subagent_run_progress', {
            fanout_id: fanoutId,
            subagent_run_id: c.subagentRunId,
            phase: 'starting',
            message: 'Compiling child profile…',
            progress: { tool_calls_used: 0, tool_calls_max: null },
            created_at_unix: Math.floor(Date.now() / 1000),
          });

          let childProfile;
          try {
            const childOverrides = {
              subagent_slug: c.slug,
              task_type: childCompileMode === 'ask' ? 'ask' : 'multitask',
              model_key: profile.model_key,
            };
            if (readonlyAuditChild) {
              childOverrides.route_key = READONLY_REPO_AUDIT_ROUTE_KEY;
            }
            childProfile = await resolveRuntimeProfile(env, {
              mode: childCompileMode,
              message,
              session: { userId, workspaceId, tenantId, conversationId: sessionId },
              overrides: childOverrides,
              compile_lane: 'live',
            });
          } catch (e) {
            return {
              ok: false,
              subagentRunId: c.subagentRunId,
              slug: c.slug,
              childRunId: c.childRunId,
              status: 'error',
              error: `profile_compile_failed:${e?.message ?? String(e)}`,
              durationMs: Date.now() - t0,
              toolCalls: 0,
              output: '',
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
            };
          }

          const promptRouteRow = childProfile._prompt_route_row ?? null;
          const toolsAll = toolsManifestFromCompiledRows(childProfile._compiled_tool_rows || []);
          const compiledToolNames = modelFacingToolNames(toolsAll);
          let tools = filterToolsForSubagentProfile(toolsAll, c.row);
          if (readonlyAuditChild || mergeStrategy === 'report') {
            tools = filterReportChildOrchestrationTools(tools);
          }
          const filteredToolNames = modelFacingToolNames(tools);
          const modelFacingNames = filteredToolNames;

          const requiredEvidenceNames = readonlyAuditChild
            ? await resolveActiveCoreEvidenceToolNames(env, workspaceId)
            : [];
          const evidenceAssessment = readonlyAuditChild
            ? assessRequiredEvidenceToolsPresent(modelFacingNames, requiredEvidenceNames)
            : { required_evidence_tools_present: true, missing: [], present: [] };

          emitChildToolContractLog(emit, {
            child_slug: c.slug,
            child_display_name: c.row?.display_name ?? c.slug,
            child_route_key: childProfile.refined_route_key || childProfile.source?.route_requirements_id || READONLY_REPO_AUDIT_ROUTE_KEY,
            child_mode: childProfile.mode,
            child_execution_kind: childProfile.execution_kind,
            requested_files: extractRequestedRepoPaths(message),
            compiled_tool_names: compiledToolNames,
            filtered_tool_names: filteredToolNames,
            model_facing_tool_names: modelFacingNames,
            required_evidence_tools_present: evidenceAssessment.required_evidence_tools_present,
            missing_evidence_tools: evidenceAssessment.missing,
          });

          if (readonlyAuditChild && !evidenceAssessment.required_evidence_tools_present) {
            emit('agentsam_subagent_run_progress', {
              fanout_id: fanoutId,
              subagent_run_id: c.subagentRunId,
              phase: 'blocked',
              message: `READ_TOOL_CONTRACT_MISSING: ${evidenceAssessment.missing.join(', ')}`,
              progress: { tool_calls_used: 0, tool_calls_max: childProfile.max_tool_calls },
              created_at_unix: Math.floor(Date.now() / 1000),
            });
            return returnReadToolContractMissing(
              env,
              ctx,
              input,
              c,
              message,
              evidenceAssessment.missing,
              t0,
            );
          }

          const minimalAsk =
            childProfile.max_tools === 0 &&
            !childProfile.context_policy.include_rag &&
            !childProfile.context_policy.include_memory;

          let systemPrompt;
          try {
            systemPrompt = await buildSystemPrompt(
              env,
              tenantId,
              childProfile.mode,
              '',
              null,
              promptRouteRow,
              {
                request: input.request,
                sessionId,
                planId: input.body?.planId ?? input.body?.plan_id ?? null,
                taskId: input.body?.taskId ?? input.body?.task_id ?? null,
                message,
                taskType: childProfile.routing_task_type,
                workspaceId,
                userId,
                minimalAsk,
              },
            );
          } catch (e) {
            systemPrompt = 'You are Agent Sam. Be direct and helpful.';
          }
          systemPrompt = appendSubagentProfileToSystemPrompt(systemPrompt, c.row);

          const textChunks = [];
          let toolCalls = 0;
          let blocked = null;
          const sink = (type, payload) => {
            if (type === 'text' && payload?.text) textChunks.push(String(payload.text));
            if (type === 'tool_call') toolCalls += 1;
            if (type === 'tool_blocked') blocked = payload?.reason ? String(payload.reason) : 'blocked';
          };

          emit('agentsam_subagent_run_progress', {
            fanout_id: fanoutId,
            subagent_run_id: c.subagentRunId,
            phase: 'working',
            message: 'Running subagent tool loop…',
            progress: { tool_calls_used: 0, tool_calls_max: childProfile.max_tool_calls },
            created_at_unix: Math.floor(Date.now() / 1000),
          });

          try {
            await runAgentToolLoop(env, ctx, sink, {
              request: input.request,
              messages: [{ role: 'user', content: buildChildUserMessage(message, c.i, childSpecs.length, c.slug) }],
              tools,
              systemPrompt,
              modelKey: childProfile.model_key,
              temperature: childProfile.temperature,
              maxToolCalls: childProfile.max_tool_calls,
              mode: childProfile.mode,
              modeConfig: {
                max_runtime_ms: childProfile.max_runtime_ms,
                max_turns: childProfile.max_turns,
                max_tool_calls: childProfile.max_tool_calls,
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
              dispatchSpine: c.childRunId ? { agent_run_id: c.childRunId, routing_arm_id: childProfile.routing_arm_id, mode: childProfile.mode } : null,
              chatAgentRunId: c.childRunId,
              activeFileEnvelope,
              resolvedContext: agentChatResolvedContext,
              maxRuntimeMs: childProfile.max_runtime_ms,
              runtimeProfile: childProfile,
            });
          } catch (e) {
            return {
              ok: false,
              subagentRunId: c.subagentRunId,
              slug: c.slug,
              childRunId: c.childRunId,
              status: blocked ? 'blocked' : 'error',
              error: blocked || (e?.message ?? String(e)),
              durationMs: Date.now() - t0,
              toolCalls,
              output: textChunks.join('').trim(),
              inputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
            };
          }

          return {
            ok: !blocked,
            subagentRunId: c.subagentRunId,
            slug: c.slug,
            childRunId: c.childRunId,
            status: blocked ? 'blocked' : 'ok',
            error: blocked,
            durationMs: Date.now() - t0,
            toolCalls,
            output: textChunks.join('').trim(),
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          };
        }),
      );

      let okCount = 0;
      let errCount = 0;
      const mergedParts = [];
      for (const r of results) {
        const ok = r.status === 'ok';
        if (ok) okCount += 1;
        else errCount += 1;

        const fullOutput = String(r.output || '').trim();
        const outputLines = fullOutput ? fullOutput.split('\n') : [];
        const shouldOpenMonaco = outputLines.length > 10 || fullOutput.length >= 2500;
        if (shouldOpenMonaco) {
          const filename = `subagent-${r.slug}-${fanoutId}.md`;
          const path = `agent-output/${fanoutId}/${filename}`;
          emit('monaco_file_generated', {
            files: [
              {
                path,
                filename,
                content: fullOutput,
              },
            ],
          });
        }

        if (r.childRunId) {
          await markAgentRunComplete(env, ctx, {
            runId: r.childRunId,
            status: ok ? 'completed' : 'failed',
            latencyMs: r.durationMs,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            errorMessage: ok ? null : r.error,
          });
        }
        await bumpSpawnJobAfterChild(env, ctx, {
          spawnJobId: spawnJob.spawnJobId,
          ok,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: r.durationMs,
        });

        emit('agentsam_subagent_run_result', {
          fanout_id: fanoutId,
          subagent_run_id: r.subagentRunId,
          subagent_slug: r.slug,
          status: r.status,
          summary: ok ? 'Completed.' : `Failed: ${String(r.error || 'unknown')}`,
          output: {
            format: 'markdown',
            content: shouldOpenMonaco
              ? `${outputLines.slice(0, 10).join('\n')}\n\n_(Truncated to 10 lines. Full output opened in Monaco: \`${`agent-output/${fanoutId}/subagent-${r.slug}-${fanoutId}.md`}\`)_`
              : fullOutput,
          },
          artifacts: { files_touched: [], patches: [], commands_run: [], urls_visited: [], screenshots: [] },
          metrics: { duration_ms: r.durationMs, tool_calls: r.toolCalls },
          error: ok
            ? null
            : {
                code: r.status === 'blocked' ? 'TOOL_DENIED' : 'EXCEPTION',
                message: String(r.error || 'unknown'),
                retryable: true,
                blocked_by_policy: r.status === 'blocked',
                details: {},
              },
          actions: ok
            ? []
            : [
                {
                  action_id: 'retry',
                  label: 'Retry',
                  kind: 'retry',
                  enabled: true,
                  retry: { strategy: 'reduced_scope', max_attempts: 1 },
                },
              ],
          created_at_unix: Math.floor(Date.now() / 1000),
        });

        mergedParts.push(`## ${r.slug}\n\n${fullOutput || (ok ? '_No output._' : `_Error: ${r.error}_`)}`);
      }

      const mergedOutput = mergedParts.join('\n\n---\n\n');
      await finalizeSpawnJob(env, ctx, {
        spawnJobId: spawnJob.spawnJobId,
        mergedOutput,
        subagentsFailed: errCount,
        subagentsSucceeded: okCount,
      });

      emit('agentsam_subagent_fanout_result', {
        fanout_id: fanoutId,
        spawn_job_id: spawnJob.spawnJobId,
        status: errCount === 0 ? 'ok' : okCount > 0 ? 'partial' : 'error',
        merge_strategy: mergeStrategy,
        results: { ok: okCount, error: errCount, blocked: 0, requires_approval: 0 },
        created_at_unix: Math.floor(Date.now() / 1000),
      });

      emitParentMultitaskSummary(emit, fanoutId, mergedOutput, okCount, childSpecs.length);

      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

