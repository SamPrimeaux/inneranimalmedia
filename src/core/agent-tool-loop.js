import { dispatchStream, resolveModelMeta } from './provider.js';
import { appendChatMessage, markChatTurnStatus } from './agentsam-chat-sessions.js';
import { evaluateGuardrails } from './guardrails.js';
import { pragmaTableInfo } from './retention.js';
import {
  aggregateAnthropicUsageTokens,
  extractCompactionFromAnthropicUsage,
  scheduleCompactionFromAnthropicUsage,
} from './agent-costs.js';
import {
  normalizeChatDispatchSpine,
} from './agent-run-routing.js';
import {
  scheduleRoutingArmBanditUpdate,
  scheduleRoutingArmQualityUpdate,
  applyRoutingArmUsageFeedback,
} from './routing.js';
import {
  executeAgentHandoffFromLoop,
  patchAgentRunBudgetProgress,
} from './agent-handoff.js';
import {
  CMS_SPAWN_SESSION_TURN_THRESHOLD,
  maybeSpawnCmsSessionHandoff,
} from './cms-spawn-bridge.js';
import { scheduleRecordMcpToolExecution, recordMcpToolOtlpSpan } from './mcp-tool-execution.js';
import { writeTelemetry } from '../api/telemetry.js';
import { resolveProviderForModelKey } from './usage-event-writer.js';
import { assertSpendKillSwitch } from './spend-ledger-canonical.js';
import {
  createAgentRunAbortScope,
  consumeReadableWithAbort,
  isAgentRunAbortError,
} from './agent-run-abort-scope.js';
import { notifySam } from './notifications.js';
import { loadAgentsamToolRow } from './agentsam-tools-catalog.js';
import {
  CODEMODE_TOOL_NAME,
  enqueueCodemodePendingActions,
} from './codemode-agent-bridge.js';
import { isImageGenerationTool, streamImageGenerationSse } from '../tools/image_generation.js';
import { imageGenerationShouldPersist } from './image-draft-store.js';
import { mergeResolvedContextIntoRunContext } from './agent-chat-resolved-context.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { fireForgetAgentToolChainRow } from '../api/command-run-telemetry.js';
import { fetchModelCostUsd } from './agent-model-resolver.js';
import {
  consumeOpenAIChatCompletionsSse,
  consumeOpenAIResponsesSse,
  tryEmitCodeDiffFromToolOutput,
} from './agent-sse-consumer.js';
import { tryBroadcastMonacoPatchFromToolOutput } from './collab-broadcast.js';
import {
  validateToolCall,
  dispatchToolCallWithBudget,
  resolveToolExecutionBudgetMs,
  formatToolApprovalPreview,
  chatToolSessionSseBase,
  createChatToolSessionLedger,
  appendChatToolSessionLedgerStep,
  finalizeChatToolSessionLedger,
} from './agent-tool-validator.js';
import {
  needsApproval,
  createApprovalRequest,
  auditToolDecision,
} from './agent-approval-gate.js';
import {
  scheduleAgentsamToolCallLog,
  toolLogFieldsFromValidation,
  extractLastAssistantPlainText,
  inferArtifactFromAssistantText,
  scheduleAgentsamArtifactFromChatOutput,
} from './agent-prompt-builder.js';
import { extractToolExecUsage } from './tool-exec-telemetry.js';
import {
  shouldOpenChatToolSessionLedger,
  TOOL_OUTPUT_SSE_MAX,
} from './agent-tool-loader.js';

/** @param {string} toolName @param {string} toolOutput */
function cadToolSseExtrasFromOutput(toolName, toolOutput) {
  const n = String(toolName || '').toLowerCase();
  if (!/^(meshyai_|designstudio_|cad_)/.test(n) && !/meshy|openscad|blender|freecad/.test(n)) {
    return {};
  }
  try {
    const p = JSON.parse(String(toolOutput || '{}'));
    const jobId = p.job_id ?? p.cad_job_id;
    if (!jobId) return {};
    const st = String(p.status || '').toLowerCase();
    const pendingPolish = p.pending_polish === true;
    const pct = Number(p.progress_pct ?? p.progress);
    const inFlight =
      pendingPolish ||
      ['pending', 'running', 'queued', 'accepted'].includes(st) ||
      (Number.isFinite(pct) && pct > 0 && pct < 100);
    return {
      job_id: String(jobId),
      cad_job_live: inFlight,
    };
  } catch {
    return {};
  }
}

export async function runAgentToolLoop(env, ctx, emit, params) {
  const {
    request,
    messages, tools, systemPrompt, modelKey,
    temperature, maxToolCalls,
    mode, modeConfig, userPolicy,
    sessionId, tenantId, userId,
    workspaceId,
    authUser: authUserParam = null,
    routingTaskType,
    qualityScore,
    mcpRuntimeContext,
    routingArmId: routingArmIdParam,
    agentSlug: agentSlugParam = null,
    thompsonModelKey: thompsonModelKeyParam,
    runStartedAt: runStartedAtParam,
    maxRuntimeMs: maxRuntimeMsParam,
    chatAgentRunId,
    dispatchSpine: dispatchSpineParam = null,
    codemodeRuntime: codemodeRuntimeParam = null,
    /** @type {Record<string, unknown>|null|undefined} */
    promptAuditContext: promptAuditContextParam,
    cacheWriteTtl: cacheWriteTtlParam,
    activeFileEnvelope: activeFileEnvelopeParam = null,
    resolvedContext: resolvedContextParam = null,
    handoffDepth: handoffDepthParam = 0,
    rootSessionId: rootSessionIdParam = null,
    signal: abortSignalParam = null,
  } = params;
  const cacheWriteTtlForBilling =
    cacheWriteTtlParam != null && String(cacheWriteTtlParam).trim() !== ''
      ? String(cacheWriteTtlParam).trim()
      : '5m';
  const routingWs = workspaceId != null ? String(workspaceId).trim() : '';
  const loopT0 = Date.now();
  const runStartedAt = runStartedAtParam != null ? Number(runStartedAtParam) : loopT0;
  const maxRunMs =
    Number(modeConfig?.max_runtime_ms) ||
    Number(maxRuntimeMsParam) ||
    90000;
  const maxTurns = Math.max(1, Math.min(20, Number(modeConfig?.max_turns) || 6));
  const doneGuard = params.doneGuard ?? { emitted: false };
  const safeDone = (payload) => {
    if (doneGuard.emitted) return;
    doneGuard.emitted = true;
    emit('done', payload);
  };
  const dispatchSpine = normalizeChatDispatchSpine(
    dispatchSpineParam && typeof dispatchSpineParam === 'object'
      ? dispatchSpineParam
      : {
          agent_run_id: chatAgentRunId,
          routing_arm_id: routingArmIdParam,
          mode,
        },
  );
  const routingArmIdStr = dispatchSpine.routing_arm_id || '';
  const openWebBudget = { turnCalls: 0, runCalls: 0 };
  const runSpineIds = {
    agent_run_id: dispatchSpine.agent_run_id,
    conversation_id: sessionId != null ? String(sessionId).trim() : null,
    routing_arm_id: routingArmIdStr || null,
    openWebBudget,
    activeFileEnvelope: activeFileEnvelopeParam,
    resolvedContext: resolvedContextParam,
    ctx,
  };

  const attributedRoutingArmId = () => routingArmIdStr || null;
  const ledgerAgentId =
    String(params.agentId ?? params.agent_id ?? agentSlugParam ?? '').trim() || null;
  const ledgerSourceTool =
    String(
      params.sourceTool ?? params.source_tool ?? params.chatRouteKey ?? 'dashboard_chat',
    ).trim() || 'dashboard_chat';
  const ledgerIdentityFields = {
    agentId: ledgerAgentId,
    sourceTool: ledgerSourceTool,
  };

  const abortScope = createAgentRunAbortScope({
    request,
    externalSignal: abortSignalParam,
    env,
    agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
  });

  const routeArmOutcome = (success) => {
    const aid = attributedRoutingArmId();
    if (aid) {
      ctx.waitUntil?.(
        applyRoutingArmUsageFeedback(env, {
          armId: aid,
          success,
          costUsd: 0,
          durationMs: Math.max(0, Date.now() - loopT0),
        }),
      );
    } else if (routingWs) {
      scheduleRoutingArmBanditUpdate(env, ctx, {
        taskType: routingTaskType || 'ask',
        mode: mode || 'ask',
        modelKey,
        workspaceId: routingWs,
        success,
        lastChainId: null,
      });
    }
  };

  /** Treat explicit 0 as zero tool turns (minimal-ask / fast-path); `||` would wrongly upgrade 0 → 15. */
  const modeMax = (() => {
    if (maxToolCalls === 0 || maxToolCalls === '0') return 0;
    const n = Number(maxToolCalls);
    if (Number.isFinite(n) && n > 0) return Math.max(1, Math.floor(n));
    return Math.max(1, Math.floor(Number(maxToolCalls) || 15));
  })();
  const polMax = Math.floor(Number(userPolicy?.max_tool_chain_depth));
  const effectiveMaxToolCalls =
    Number.isFinite(polMax) && polMax > 0 ? Math.min(modeMax, polMax) : modeMax;

  const mcpBase =
    mcpRuntimeContext && typeof mcpRuntimeContext === 'object' ? { ...mcpRuntimeContext } : {};
  if (!mcpBase.authUser && authUserParam) {
    mcpBase.authUser = authUserParam;
  }
  if (params.chatRouteKey != null && String(params.chatRouteKey).trim() !== '') {
    mcpBase.routeKey = String(params.chatRouteKey).trim();
  }
  const mcpCtx = mcpBase;

  const conversationMessages = [...messages];
  let toolCallsUsed = 0;
  const executedToolNames = [];
  let totalUsage    = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turnCount     = 0;
  let chatToolLedger = null;
  let toolChainRootId = null;
  let ledgerLoopThrew = false;
  let ledgerErrorMsg = null;
  let openaiPreviousResponseId = null;

  let telemetryFlushed = false;
  const scheduleLoopUsageTelemetry = (success = true) => {
    if (telemetryFlushed) return;
    if (!totalUsage.input_tokens && !totalUsage.output_tokens && turnCount <= 0) return;
    telemetryFlushed = true;
    const aid = attributedRoutingArmId();
    ctx.waitUntil?.(
      (async () => {
        try {
          const telemetryProvider = await resolveProviderForModelKey(env, modelKey, null);
          const out = await writeTelemetry(
            env,
            {
              sessionId,
              tenantId,
              workspaceId: routingWs || undefined,
              userId,
              provider: telemetryProvider,
              model: modelKey,
              inputTokens: totalUsage.input_tokens,
              outputTokens: totalUsage.output_tokens,
              cacheReadTokens: totalUsage.cache_read_input_tokens,
              cacheWriteTokens: totalUsage.cache_creation_input_tokens,
              cacheWriteTtl: cacheWriteTtlForBilling,
              toolCallCount: toolCallsUsed,
              success,
              routingArmId: aid,
              latencyMs: Date.now() - loopT0,
              taskType: routingTaskType || 'ask',
              mode: mode || 'agent',
              executionCtx: ctx,
            },
            null,
          );
          if (aid && success) {
            await applyRoutingArmUsageFeedback(env, {
              armId: aid,
              success: true,
              costUsd: Number(out?.estimatedCostUsd) || 0,
              durationMs: Date.now() - loopT0,
            });
          }
        } catch (te) {
          console.warn('[agent] loop_usage_telemetry', te?.message ?? te);
        }
      })(),
    );
  };

  const shouldStopRun = async () => {
    if (abortScope.isAborted()) return true;
    try {
      await abortScope.throwIfAborted();
      return false;
    } catch {
      return true;
    }
  };

  const exitCancelled = () => {
    abortScope.dispose();
    scheduleLoopUsageTelemetry(false);
    emit('error', { message: 'Stopped by user', code: 'agent_run_cancelled' });
    safeDone({
      tool_calls_used: toolCallsUsed,
      turns: turnCount,
      code: 'agent_run_cancelled',
      cancelled: true,
    });
    return {
      totalUsage,
      toolCallsUsed,
      executedToolNames,
      modelKey,
      turnCount,
      cancelled: true,
      workflowRunId: null,
      agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
      chainRootId: toolChainRootId,
    };
  };

  try {
  while (turnCount < maxTurns) {
    turnCount++;
    if (await shouldStopRun()) {
      return exitCancelled();
    }
    if (Date.now() - runStartedAt > maxRunMs) {
      scheduleLoopUsageTelemetry(false);
      emit('error', { message: 'Agent run timed out', code: 'agent_run_timeout' });
      safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount, code: 'agent_run_timeout' });
      return {
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        modelKey,
        turnCount,
        timedOut: true,
        workflowRunId: null,
        agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
        chainRootId: toolChainRootId,
      };
    }
    const spendGate = await assertSpendKillSwitch(env, {
      tenantId,
      workspaceId: routingWs || workspaceId,
      userId,
      sessionId,
      modelKey,
    });
    if (!spendGate.ok) {
      scheduleLoopUsageTelemetry(false);
      emit('error', {
        message: spendGate.message || 'Spend cap reached',
        code: spendGate.error || 'spend_cap_exceeded',
        spent_usd: spendGate.spent_usd ?? null,
        cap_usd: spendGate.cap_usd ?? null,
      });
      safeDone({
        tool_calls_used: toolCallsUsed,
        turns: turnCount,
        code: spendGate.error || 'spend_cap_exceeded',
        spend_blocked: true,
      });
      return {
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        modelKey,
        turnCount,
        spendBlocked: true,
        workflowRunId: null,
        agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
        chainRootId: toolChainRootId,
      };
    }
    const modelT0 = Date.now();
    let stream;
    let isWorkersAiStream = false;
    try {
      const loopProvider = await resolveProviderForModelKey(env, modelKey, null);
      emit('runtime_context', {
        model_key: modelKey,
        model: modelKey,
        provider: loopProvider,
        turn: turnCount,
        agent_run_id: chatAgentRunId ?? null,
      });
      if (chatAgentRunId && env?.DB) {
        ctx.waitUntil?.(
          (async () => {
            try {
              const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
              const sets = [];
              const binds = [];
              if (cols.has('ai_model_ref')) {
                sets.push('ai_model_ref = ?');
                binds.push(String(modelKey).slice(0, 200));
              }
              if (cols.has('model_id')) {
                sets.push('model_id = ?');
                binds.push(String(modelKey).slice(0, 200));
              }
              if (cols.has('model_key')) {
                sets.push('model_key = ?');
                binds.push(String(modelKey).slice(0, 200));
              }
              if (cols.has('provider')) {
                sets.push('provider = ?');
                binds.push(String(loopProvider).slice(0, 80));
              }
              if (!sets.length) return;
              binds.push(String(chatAgentRunId));
              await env.DB.prepare(
                `UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`,
              )
                .bind(...binds)
                .run();
            } catch (pe) {
              console.warn('[agent] run_model_attribution', pe?.message ?? pe);
            }
          })(),
        );
      }
      const grModel = await evaluateGuardrails(env, ctx, {
        applies_to: 'model',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        request_id:
          chatAgentRunId != null ? String(chatAgentRunId) : sessionId,
        run_group_id: chatAgentRunId != null ? String(chatAgentRunId) : null,
        route_path: '/api/agent/chat',
        model_key: modelKey,
      });
      if (grModel.blocked) {
        throw new Error(`GUARDRAIL_BLOCKED:${grModel.decision?.reason || 'model_blocked'}`);
      }
      // Provider resolved inside dispatchStream from agentsam_ai.api_platform (Workers AI → OAI-shaped SSE).
      stream = await dispatchStream(env, request, {
        modelKey,
        systemPrompt,
        messages: conversationMessages,
        tools,
        reasoningEffort:
          dispatchSpineParam?.routing_decision?.reasoning_effort ??
          modeConfig?.gate_reasoning_effort ??
          null,
        temperature,
        userId,
        tenantId,
        workspaceId: routingWs || null,
        agentRunId: chatAgentRunId ?? null,
        routingArmId: routingArmIdParam ?? dispatchSpine.routing_arm_id ?? null,
        taskType: routingTaskType || 'ask',
        // `auto` is UI-only; tool loop always continues as a concrete mode.
        mode: (dispatchSpineParam?.routing_decision?.mode ?? mode) || 'agent',
        lane:
          dispatchSpineParam?.routing_decision?.lane ??
          (['debug', 'plan'].includes(
            String((dispatchSpineParam?.routing_decision?.mode ?? mode) || '').toLowerCase(),
          )
            ? 'premium'
            : null),
        signal: abortScope.signal,
        openaiPreviousResponseId,
        promptAuditContext:
          promptAuditContextParam && typeof promptAuditContextParam === 'object'
            ? { ...promptAuditContextParam, loop_turn: turnCount }
            : promptAuditContextParam,
      });
      isWorkersAiStream = false;
    } catch (e) {
      if (isAgentRunAbortError(e)) return exitCancelled();
      console.warn('[agent] model call failed:', e?.message ?? e);
      routeArmOutcome(false);
      const detail = e?.message != null ? String(e.message).slice(0, 8000) : String(e).slice(0, 8000);
      emit('error', { message: detail || 'Model call failed', detail });

      const eidFail = String(params.chatAgentRunId || sessionId || 'unknown').slice(0, 200);
      const lat = Math.max(0, Date.now() - modelT0);
      const errPayload = JSON.stringify({ model_key: modelKey, message: detail.slice(0, 4000) });
      ctx.waitUntil?.(
        (async () => {
          try {
            const cols = await pragmaTableInfo(env.DB, 'agentsam_execution_steps');
            if (!cols.has('execution_id') || !cols.has('node_key')) return;
            const parts = [];
            const vals = [];
            const binds = [];
            const q = (name, val) => {
              if (!cols.has(name)) return;
              parts.push(name);
              vals.push('?');
              binds.push(val);
            };
            q('execution_id', eidFail);
            q('agent_run_id', runSpineIds.agent_run_id);
            q('node_key', 'model_dispatch_failed');
            q('node_type', 'model');
            q('status', 'failed');
            if (cols.has('error_json')) {
              parts.push('error_json');
              vals.push('?');
              binds.push(errPayload);
            } else if (cols.has('output_json')) {
              parts.push('output_json');
              vals.push('?');
              binds.push(errPayload);
            }
            q('latency_ms', lat);
            const nowSec = Math.floor(Date.now() / 1000);
            q('started_at', nowSec);
            q('completed_at', nowSec);
            if (cols.has('created_at')) {
              parts.push('created_at');
              vals.push(`datetime('now')`);
            }
            if (cols.has('created_at_unix')) {
              parts.push('created_at_unix');
              vals.push('?');
              binds.push(nowSec);
            }
            await env.DB.prepare(
              `INSERT INTO agentsam_execution_steps (${parts.join(', ')}) VALUES (${vals.join(', ')})`,
            )
              .bind(...binds)
              .run();
          } catch (_) {}
        })(),
      );

      const fail = new Error('MODEL_DISPATCH_FAILED');
      fail.code = 'MODEL_DISPATCH_FAILED';
      throw fail;
    }

    const pendingToolCalls = [];
    let stopReason = null, turnUsage = null, containerId = null;
    const assistantContent = [];
    let assistantReasoningContent = '';

    const extractWorkersAiLineToken = (obj) => {
      if (!obj || typeof obj !== 'object') return '';
      const c0 = Array.isArray(obj.choices) ? obj.choices[0] : null;
      const t =
        c0?.delta?.content ??
        c0?.text ??
        (typeof obj.response === 'string' ? obj.response : obj.response != null ? String(obj.response) : '') ??
        '';
      return typeof t === 'string' ? t : String(t || '');
    };

    const consumeWorkersAiText = async (readable) => {
      const decoder = new TextDecoder();
      let buf = '';
      await consumeReadableWithAbort(readable, (value) => {
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const t = line.trim();
          if (!t) continue;
          let piece = '';
          try {
            piece = extractWorkersAiLineToken(JSON.parse(t));
          } catch {
            piece = t;
          }
          if (!piece) continue;
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }, { throwIfAborted: () => abortScope.throwIfAborted() });
      const tail = buf.trim();
      if (tail) {
        let piece = '';
        try {
          piece = extractWorkersAiLineToken(JSON.parse(tail));
        } catch {
          piece = tail;
        }
        if (piece) {
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }
    };

    const consumeSseText = async (readable) => {
      const decoder = new TextDecoder();
      let buf = '';
      await consumeReadableWithAbort(readable, (value) => {
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n').map(l => l.trim()).filter(Boolean);
          const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
          if (!dataLines.length) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const text =
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.text ??
              json?.response ??
              json?.text ??
              '';
            if (text) {
              const last = assistantContent.findLast(b => b.type === 'text');
              if (last) last.text += text;
              emit('text', { text });
            }
          } catch {
            // ignore non-JSON SSE frames
          }
        }
      }, { throwIfAborted: () => abortScope.throwIfAborted() });
    };

    if (stream instanceof Response) {
      if (!stream.ok) {
        const detailRaw = await stream.text().catch(() => '');
        let detailMsg = String(detailRaw || '').slice(0, 8000);
        try {
          const j = JSON.parse(detailRaw);
          const m = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : null) ?? j?.message ?? j?.detail;
          if (m) detailMsg = String(m).slice(0, 8000);
        } catch {
          /* keep detailRaw slice */
        }
        console.warn('[agent] model stream HTTP error', stream.status, detailMsg.slice(0, 500));
        routeArmOutcome(false);
        emit('error', {
          message: detailMsg || 'Model stream failed',
          status: stream.status,
          detail: detailRaw.slice(0, 8000),
        });
        const hard = new Error('__IAM_PROVIDER_HTTP__');
        hard.code = 'IAM_PROVIDER_HTTP';
        hard.status = stream.status;
        hard.detail = detailRaw.slice(0, 8000);
        throw hard;
      }
      const streamMeta = await resolveModelMeta(env, modelKey);
      const platform = String(streamMeta?.api_platform || '').toLowerCase();
      const useOpenAIResponses = platform === 'openai_responses' || platform === 'responses';
      const useOpenAIChatCompletions =
        platform === 'openai' || platform === 'openai_chat_completions' || platform === 'deepseek';
      const useOpenAiShapedToolStream =
        tools.length > 0 &&
        (useOpenAIChatCompletions || platform === 'gemini_api');

      const applyNormalizedOpenAI = (parsed) => {
        const textBlock = assistantContent[assistantContent.length - 1];
        if (textBlock && textBlock.type === 'text') textBlock.text = parsed.text || '';
        assistantReasoningContent = String(parsed.reasoningContent || '').trim();
        for (const tc of parsed.pendingToolCalls) {
          const linkId = String(tc.call_id || tc.id || '').trim() || tc.id;
          assistantContent.push({
            type: 'tool_use',
            id: linkId,
            name: tc.name,
            input: tc.input,
            ...(tc.gemini_thought_signature
              ? { gemini_thought_signature: tc.gemini_thought_signature }
              : {}),
          });
          pendingToolCalls.push({ ...tc, id: linkId, _done: true, _server: false });
        }
        const fr = parsed.finishReason || '';
        stopReason =
          fr === 'tool_use' || fr === 'tool_calls'
            ? 'tool_use'
            : fr === 'stop' || fr === '' || fr === 'end_turn' || fr === 'completed'
              ? 'end_turn'
              : fr || 'end_turn';
        if (parsed.input_tokens || parsed.output_tokens || parsed.cache_read_input_tokens) {
          totalUsage.input_tokens += parsed.input_tokens || 0;
          totalUsage.output_tokens += parsed.output_tokens || 0;
          totalUsage.cache_read_input_tokens += parsed.cache_read_input_tokens || 0;
          totalUsage.cache_creation_input_tokens += parsed.cache_creation_input_tokens || 0;
        }
      };

      if (stream.body && useOpenAIResponses) {
        assistantContent.push({ type: 'text', text: '' });
        const parsed = await consumeOpenAIResponsesSse(stream.body, emit, {
          throwIfAborted: () => abortScope.throwIfAborted(),
        });
        if (parsed.input_tokens || parsed.output_tokens) {
          totalUsage.input_tokens  += parsed.input_tokens;
          totalUsage.output_tokens += parsed.output_tokens;
        }
        applyNormalizedOpenAI(parsed);
        if (parsed.responseId) openaiPreviousResponseId = parsed.responseId;
      } else if (stream.body && useOpenAiShapedToolStream) {
        assistantContent.push({ type: 'text', text: '' });
        const parsed = await consumeOpenAIChatCompletionsSse(stream.body, emit, {
          throwIfAborted: () => abortScope.throwIfAborted(),
        });
        applyNormalizedOpenAI(parsed);
      } else if (stream.body) {
        assistantContent.push({ type: 'text', text: '' });
        await consumeSseText(stream.body);
        stopReason = 'end_turn';
      } else {
        assistantContent.push({ type: 'text', text: '' });
        stopReason = 'end_turn';
      }
    } else if (
      stream &&
      typeof stream[Symbol.asyncIterator] === 'function' &&
      !(stream instanceof ReadableStream)
    ) {
      const handleAnthropicChunk = (chunk) => {
        if (chunk.type === 'message_start') {
          if (chunk.message?.id) emit('id', { id: chunk.message.id });
          if (chunk.message?.container?.id) containerId = chunk.message.container.id;
        }
        if (chunk.type === 'message_stop' && chunk.message?.container?.id) {
          containerId = chunk.message.container.id;
        }
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'thinking') emit('thinking_start', {});
          if (chunk.content_block?.type === 'compaction') {
            assistantContent.push({ ...chunk.content_block });
            emit('compaction', { phase: 'block_start' });
          }
          if (chunk.content_block?.type === 'tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: false });
            assistantContent.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
          }
          if (chunk.content_block?.type === 'server_tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: true });
            assistantContent.push({
              type: 'server_tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
            });
          }
          {
            const cb = chunk.content_block;
            const passthroughResults = new Set([
              'tool_search_tool_result',
              'code_execution_tool_result',
              'bash_code_execution_tool_result',
              'text_editor_code_execution_tool_result',
            ]);
            if (cb && passthroughResults.has(cb.type)) {
              assistantContent.push({ ...cb });
            }
          }
          if (chunk.content_block?.type === 'text') assistantContent.push({ type: 'text', text: '' });
        }
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta;
          if (delta.type === 'text_delta') {
            const last = assistantContent.findLast(b => b.type === 'text');
            if (last) last.text += delta.text;
            emit('text', { text: delta.text });
          }
          if (delta.type === 'thinking_delta') emit('thinking', { text: delta.thinking });
          if (delta.type === 'input_json_delta') {
            const call = pendingToolCalls.findLast(c => !c._done);
            if (call) call._args += delta.partial_json;
          }
          if (delta.type === 'signature_delta') emit('signature', { signature: delta.signature });
        }
        if (chunk.type === 'content_block_stop') {
          const call = pendingToolCalls.findLast(c => !c._done);
          if (call) {
            call._done = true;
            try { call.input = JSON.parse(call._args || '{}'); } catch { call.input = {}; }
            const blk = assistantContent.find(
              (b) => (b.type === 'tool_use' || b.type === 'server_tool_use') && b.id === call.id,
            );
            if (blk) blk.input = call.input;
          }
        }
        if (chunk.type === 'message_delta') {
          if (chunk.usage) turnUsage = chunk.usage;
          if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
          if (chunk.delta?.container?.id) containerId = chunk.delta.container.id;
        }
      };
      const compactionMeta = {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        modelKey,
        provider: 'anthropic',
      };
      const mergeTurnUsage = () => {
        if (!turnUsage) return;
        const u = aggregateAnthropicUsageTokens(turnUsage);
        totalUsage.input_tokens += u.input_tokens;
        totalUsage.output_tokens += u.output_tokens;
        totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
        totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
        if (scheduleCompactionFromAnthropicUsage(env, ctx, turnUsage, compactionMeta)) {
          const compacted = extractCompactionFromAnthropicUsage(turnUsage);
          emit('compaction', {
            phase: 'recorded',
            tokens_before: compacted?.tokens_before ?? null,
            tokens_after: compacted?.tokens_after ?? null,
          });
        }
        turnUsage = null;
      };
      const drainAnthropicStream = async (s) => {
        stopReason = null;
        turnUsage = null;
        for await (const chunk of s) {
          await abortScope.throwIfAborted();
          handleAnthropicChunk(chunk);
        }
        mergeTurnUsage();
      };
      await drainAnthropicStream(stream);
      // Anthropic code execution may stop with pause_turn; continue via SDK (same model/tools/system as dispatchStream → chatWithAnthropic).
      const PAUSE_TURN_MAX = 8;
      let pauseIterations = 0;
      while (stopReason === 'pause_turn' && containerId && pauseIterations < PAUSE_TURN_MAX) {
        if (await shouldStopRun()) return exitCancelled();
        pauseIterations += 1;
        console.log(`[agent] pause_turn continuation ${pauseIterations} container=${containerId}`);
        emit('pause_turn', { container_id: containerId, iteration: pauseIterations });
        let continueMessages;
        try {
          continueMessages = [...conversationMessages, { role: 'assistant', content: JSON.parse(JSON.stringify(assistantContent)) }];
        } catch {
          continueMessages = [...conversationMessages, { role: 'assistant', content: assistantContent }];
        }
        pendingToolCalls.length = 0;
        let nextStream;
        try {
          nextStream = await dispatchStream(env, request, {
            modelKey,
            systemPrompt,
            messages: continueMessages,
            tools,
            reasoningEffort: modeConfig?.gate_reasoning_effort || null,
            temperature,
            userId,
            tenantId,
            workspaceId: routingWs || null,
            agentRunId: chatAgentRunId ?? null,
            routingArmId: routingArmIdParam ?? null,
            taskType: routingTaskType || 'ask',
            // `auto` is UI-only; pause_turn continuation is always an agent/tool path.
            mode: mode || 'agent',
            lane:
              dispatchSpineParam?.routing_decision?.lane ??
              (['debug', 'plan'].includes(String(mode || '').toLowerCase()) ? 'premium' : null),
            signal: abortScope.signal,
            anthropicContainerId: containerId,
            promptAuditContext:
              promptAuditContextParam && typeof promptAuditContextParam === 'object'
                ? {
                    ...promptAuditContextParam,
                    loop_turn: turnCount,
                    pause_turn_continuation: true,
                  }
                : promptAuditContextParam,
          });
        } catch (e) {
          console.warn('[agent] pause_turn continuation request failed:', e?.message ?? e);
          break;
        }
        if (!nextStream || typeof nextStream[Symbol.asyncIterator] !== 'function') {
          console.warn('[agent] pause_turn: continuation stream is not async-iterable');
          break;
        }
        await drainAnthropicStream(nextStream);
      }
      if (pauseIterations >= PAUSE_TURN_MAX && stopReason === 'pause_turn') {
        console.warn('[agent] pause_turn max iterations reached, forcing end_turn');
        stopReason = 'end_turn';
      }
    } else if (stream && typeof stream.getReader === 'function') {
      assistantContent.push({ type: 'text', text: '' });
      if (isWorkersAiStream) {
        await consumeWorkersAiText(stream);
      } else {
        await consumeSseText(stream);
      }
      stopReason = 'end_turn';
    } else if (stream != null) {
      const ctor = stream.constructor ? stream.constructor.name : typeof stream;
      console.warn('[agent] stream not iterable/reader/Response:', ctor, Object.prototype.toString.call(stream));
    }

    if (turnUsage) {
      const u = aggregateAnthropicUsageTokens(turnUsage);
      totalUsage.input_tokens += u.input_tokens;
      totalUsage.output_tokens += u.output_tokens;
      totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
      totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
      scheduleCompactionFromAnthropicUsage(env, ctx, turnUsage, {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        modelKey,
        provider: 'anthropic',
      });
    }

    conversationMessages.push({
      role: 'assistant',
      content: assistantContent,
      ...(assistantReasoningContent ? { reasoning_content: assistantReasoningContent } : {}),
    });

    if (await shouldStopRun()) return exitCancelled();

    if (chatAgentRunId && routingWs && env?.DB) {
      const progressCost = await fetchModelCostUsd(
        env,
        modelKey,
        totalUsage.input_tokens,
        totalUsage.output_tokens,
        totalUsage.cache_read_input_tokens,
      );
      ctx.waitUntil?.(
        patchAgentRunBudgetProgress(env, String(chatAgentRunId), {
          inputTokens: totalUsage.input_tokens,
          outputTokens: totalUsage.output_tokens,
          costUsd: progressCost,
          status: 'running',
        }),
      );
      const handoffResult = await executeAgentHandoffFromLoop(env, ctx, emit, safeDone, {
        chatAgentRunId,
        modelKey,
        workspaceId: routingWs,
        routingTaskType,
        mode,
        agentSlug: agentSlugParam,
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        turnCount,
        conversationMessages,
        goal: messages?.[0]?.content ?? null,
        userId,
        tenantId,
        toolChainRootId,
        sessionId,
        rootSessionId: rootSessionIdParam ?? sessionId,
        handoffDepth: Number(handoffDepthParam) || 0,
      });
      if (handoffResult) return handoffResult;
    }

    const clientToolCalls = pendingToolCalls.filter((c) => !c._server);
    if (!clientToolCalls.length) {
      if (routingWs) {
        const qs = Number(qualityScore);
        if (Number.isFinite(qs)) {
          scheduleRoutingArmQualityUpdate(env, ctx, {
            taskType: routingTaskType || 'ask',
            mode: mode || 'ask',
            modelKey,
            workspaceId: routingWs,
            qualityScore: qs,
          });
        }
      }
      break;
    }

    const toolResults = [];
    let previousToolChainId = null;
    let chatHaltedForApproval = false;
    for (const call of clientToolCalls) {
      if (chatHaltedForApproval) break;
      if (await shouldStopRun()) {
        return exitCancelled();
      }
      if (toolCallsUsed >= effectiveMaxToolCalls) {
        emit('tool_blocked', { tool: call.name, reason: 'max_tool_calls_reached' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Tool call limit reached.' });
        continue;
      }
      if (call.input && typeof call.input === 'object' && call.input.__parse_error === true) {
        const raw = String(call.raw_input != null ? call.raw_input : call.input.__raw || '').slice(0, 2000);
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: null,
          input_json: JSON.stringify({ __parse_error: true, __raw: raw }),
          success: false,
          error_message: 'tool_arguments_json_parse_error',
          duration_ms: 0,
          status: 'error',
          ...runSpineIds,
        });
        emit('tool_error', { tool: call.name, error: 'tool_arguments_json_parse_error' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Tool arguments are not valid JSON (repairable). Raw: ${raw}`,
          is_error: true,
        });
        continue;
      }
      const validation = await validateToolCall(
        env,
        mcpCtx?.runtimeProfile || mode,
        call,
        mcpCtx,
        userPolicy,
      );
      if (!validation.allowed) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: validation.reason,
          duration_ms: 0,
          status: 'error',
          ...runSpineIds,
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: validation.reason,
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
          routingArmId: attributedRoutingArmId(),
          ...toolLogFieldsFromValidation(validation),
          ...runSpineIds,
          ...ledgerIdentityFields,
        });
        await auditToolDecision(env, {
          tenantId,
          workspaceId,
          userId,
          toolName: call.name,
          eventType: 'tool_blocked',
          message: `Blocked: ${call.name} — ${validation.reason}`,
          riskLevel: 'blocked',
          reason: validation.reason,
        });
        emit('tool_blocked', { tool: call.name, reason: validation.reason });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Tool not available in ${mode} mode: ${validation.reason}` });
        continue;
      }
      const grTool = await evaluateGuardrails(env, ctx, {
        applies_to: 'mcp_tool',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        request_id:
          chatAgentRunId != null
            ? String(chatAgentRunId)
            : toolChainRootId != null
              ? String(toolChainRootId)
              : sessionId,
        run_group_id: chatAgentRunId != null ? String(chatAgentRunId) : null,
        route_path: '/api/agent/chat',
        tool_name: call.name,
        tool_input: call.input,
        model_key: modelKey,
      });
      if (grTool.blocked) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: grTool.decision?.reason || 'guardrail_blocked',
          duration_ms: 0,
          status: 'blocked',
          ...runSpineIds,
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: grTool.decision?.reason || 'guardrail_blocked',
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
          routingArmId: attributedRoutingArmId(),
          ...toolLogFieldsFromValidation(validation),
          ...runSpineIds,
          ...ledgerIdentityFields,
        });
        await auditToolDecision(env, {
          tenantId,
          workspaceId,
          userId,
          toolName: call.name,
          eventType: 'tool_blocked',
          message: `Guardrail blocked: ${call.name}`,
          riskLevel: 'blocked',
          reason: grTool.decision?.reason || 'guardrail',
        });
        emit('tool_blocked', { tool: call.name, reason: grTool.decision?.reason || 'guardrail' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: grTool.decision?.reason || 'Blocked by guardrail.',
          is_error: true,
        });
        continue;
      }
      if (needsApproval(validation, { ...modeConfig, mode }, userPolicy)) {
        const proposalId = await createApprovalRequest(env, ctx, {
          tenantId,
          sessionId,
          userId,
          workspaceId,
          personUuid: mcpCtx.personUuid,
          toolName: call.name,
          toolArgs: call.input,
          toolCallId: call.id,
          riskLevel: validation.riskLevel,
          rationale: `Agent requested ${call.name} (${validation.riskLevel} risk)`,
          ledgerExtras: toolLogFieldsFromValidation(validation),
          ...runSpineIds,
        });
        let toolDescription = `Agent requested ${call.name} (${validation.riskLevel} risk)`;
        try {
          const catalogRow = await loadAgentsamToolRow(env, call.name);
          if (catalogRow?.description && String(catalogRow.description).trim()) {
            toolDescription = String(catalogRow.description).trim();
          }
        } catch {
          /* non-fatal */
        }
        const preview = formatToolApprovalPreview(call.name, call.input);
        const serverLabel =
          validation.serverKey != null && String(validation.serverKey).trim() !== ''
            ? String(validation.serverKey).trim()
            : 'inneranimalmedia';
        notifySam(env, { subject: `Approval required: ${call.name}`, body: `Tool: ${call.name}\nRisk: ${validation.riskLevel}\nArgs: ${JSON.stringify(call.input||{}).slice(0,500)}\n\nApprove: ${(env.IAM_ORIGIN||'').replace(/\/$/,'')}/dashboard/overview?proposal=${proposalId}`, category: 'approval' }).catch(() => {});
        emit('approval_required', {
          proposal_id: proposalId,
          approval_id: proposalId,
          tool_name: call.name,
          tool_args: call.input,
          command_preview: preview,
          action_summary: toolDescription,
          risk_level: validation.riskLevel,
          message: 'This action requires your approval.',
        });
        emit('tool_approval_request', {
          tool: {
            name: call.name,
            description: toolDescription,
            parameters: call.input && typeof call.input === 'object' ? call.input : {},
            preview,
            approval_id: proposalId,
            proposal_id: proposalId,
            risk_level: validation.riskLevel,
            server_display_name: serverLabel,
          },
        });
        chatHaltedForApproval = true;
        break;
      }
      if (
        shouldOpenChatToolSessionLedger({
          chatAgentRunId,
          mode,
          tools,
          chatToolLedger,
        })
      ) {
        try {
          chatToolLedger = createChatToolSessionLedger({
            tenantId,
            workspaceId,
            userId,
            sessionId,
            modelKey,
            stepsTotal: effectiveMaxToolCalls,
            chatAgentRunId,
            routingArmId: attributedRoutingArmId(),
            requestedMode: mode,
          });
          if (chatToolLedger) {
            emit('workflow_start', {
              ...chatToolSessionSseBase(chatToolLedger),
              steps_total: chatToolLedger.stepsTotal,
            });
          }
        } catch (e) {
          console.warn('[agent] chat_tool_session_ledger_create', e?.message ?? e);
        }
      }
      toolCallsUsed++;
      executedToolNames.push(call.name);
      emit('tool_call', { tool: call.name, args: call.input });
      await auditToolDecision(env, {
        tenantId,
        workspaceId,
        userId,
        toolName: call.name,
        eventType: 'tool_executed',
        message: `Executing: ${call.name}`,
        riskLevel: validation.riskLevel,
        reason: 'allowed',
      });
      const toolT0 = Date.now();
      const toolStartNs = toolT0 * 1_000_000;
      let toolOutput = '';
      let execErr = null;
      const inputPreviewMax =
        /terminal|shell|pty|bash|run_command/i.test(String(call.name || '')) ? 4000 : 200;
      emit('tool_start', {
        tool_name: call.name,
        tool_call_id: call.id,
        input_preview: JSON.stringify(call.input || {}).slice(0, inputPreviewMax),
      });
      try {
        const { emitBrowserLiveSessionSse } = await import('../integrations/agent-live-browser-session.js');
        emitBrowserLiveSessionSse(emit, 'start', call.name, null);
      } catch {
        /* non-fatal */
      }
      let toolRows = null;
      let execResult = null;
      const toolBudgetMs = resolveToolExecutionBudgetMs(call.name, call.input);
      try {
        if (call.name === CODEMODE_TOOL_NAME && codemodeRuntimeParam?.execute) {
          execResult = await codemodeRuntimeParam.execute(call.input || {});
          if (execResult?.ok === false) {
            execErr = new Error(String(execResult.error || 'codemode_execution_failed'));
          }
          if (execResult?.pending_actions?.length) {
            const proposalIds = await enqueueCodemodePendingActions(
              env,
              ctx,
              {
                tenantId,
                workspaceId,
                userId,
                sessionId,
                agent_run_id: chatAgentRunId,
                conversationId: sessionId,
              },
              execResult.pending_actions,
            );
            if (proposalIds.length) {
              emit('approval_required', {
                proposal_ids: proposalIds,
                tool_name: CODEMODE_TOOL_NAME,
                message: 'Codemode queued actions require approval.',
              });
            }
          }
        } else if (isImageGenerationTool(call.name)) {
          const toolInput =
            call.input && typeof call.input === 'object' ? { ...call.input } : {};
          if (!imageGenerationShouldPersist(toolInput)) {
            toolInput.persist = false;
          }
          execResult = await abortScope.race(
            streamImageGenerationSse(emit, env, call.name, toolInput, {
              authUser: { id: userId },
              workspaceId,
              tenantId,
              userId,
              origin: (env.IAM_ORIGIN || request?.url ? new URL(request.url).origin : '').replace(/\/$/, ''),
            }),
          );
        } else {
          let toolInput = call.input && typeof call.input === 'object' ? { ...call.input } : {};
          if (call.name === 'fs_search_files') {
            const { normalizeFsSearchFilesParams } = await import('../core/fs-search-files.js');
            toolInput = normalizeFsSearchFilesParams(toolInput, {
              userMessage: mcpCtx.userMessage ?? mcpCtx.message ?? null,
              activeFileEnvelope: activeFileEnvelopeParam ?? null,
            });
          } else if (activeFileEnvelopeParam) {
            const { applyActiveFileDefaultsToToolInput } = await import('../core/active-file-envelope.js');
            toolInput = applyActiveFileDefaultsToToolInput(call.name, toolInput, activeFileEnvelopeParam);
          }
          execResult = await abortScope.race(
            dispatchToolCallWithBudget(
            env,
            call.name,
            toolInput,
              mergeResolvedContextIntoRunContext(
              {
                sessionId,
                tenantId,
                userId,
                workspaceId,
                authUser: mcpCtx.authUser ?? authUserParam ?? null,
                personUuid: mcpCtx.personUuid,
                isSuperadmin: mcpCtx.isSuperadmin,
                request,
                activeFileEnvelope: activeFileEnvelopeParam,
                selectedGithubRepoContext: mcpCtx.selectedGithubRepoContext ?? mcpCtx.github_repo_context ?? null,
                github_repo_context: mcpCtx.github_repo_context ?? mcpCtx.selectedGithubRepoContext ?? null,
                userMessage: mcpCtx.userMessage ?? mcpCtx.message ?? null,
                client_surface: mcpCtx.client_surface ?? mcpCtx.clientSurface ?? null,
                clientSurface: mcpCtx.clientSurface ?? mcpCtx.client_surface ?? null,
                exec_lane: mcpCtx.exec_lane ?? mcpCtx.execLane ?? null,
                execLane: mcpCtx.execLane ?? mcpCtx.exec_lane ?? null,
                platform_operator_lane:
                  mcpCtx.platform_operator_lane === true || mcpCtx.platformOperatorLane === true,
                platformOperatorLane:
                  mcpCtx.platformOperatorLane === true || mcpCtx.platform_operator_lane === true,
                // TELEMETRY-001 Layer 2 — loop owns agentsam_tool_call_log for this dispatch.
                // Catalog finalizeTelemetry must skip INSERT when this flag is set.
                skipToolCallLog: true,
                ledgerOwner: 'tool_loop',
                ...(mcpCtx.mcp_panel_slug != null && String(mcpCtx.mcp_panel_slug).trim() !== ''
                  ? { mcp_panel_slug: String(mcpCtx.mcp_panel_slug).trim() }
                  : {}),
                ...runSpineIds,
              },
              resolvedContextParam,
            ),
            toolBudgetMs,
          ),
          );
        }
        if (execResult && typeof execResult === 'object') {
          if (Array.isArray(execResult.rows)) toolRows = execResult.rows;
          else if (Array.isArray(execResult.results)) toolRows = execResult.results;
        }
        toolOutput = typeof execResult === 'string' ? execResult : JSON.stringify(execResult);
        const BROWSER_VERIFY_FAIL_TOOLS = new Set([
          'browser_navigate',
          'cdt_navigate_page',
          'browser_verify_current_page',
          'browser_content',
        ]);
        if (
          !execErr &&
          execResult &&
          typeof execResult === 'object' &&
          BROWSER_VERIFY_FAIL_TOOLS.has(call.name)
        ) {
          const verificationFailed =
            execResult.ok === false ||
            execResult.verified === false ||
            execResult.url_verified === false ||
            execResult.live_view_verified === false ||
            execResult.verification_failed === true;
          if (verificationFailed) {
            const detail =
              typeof execResult.error === 'string' && execResult.error.trim()
                ? execResult.error.trim()
                : 'Navigation was requested but not verified.';
            execErr = Object.assign(new Error(detail), { code: 'verification_failed' });
            emit('browser_verification_failed', {
              tool_name: call.name,
              tool_call_id: call.id,
              agent_run_id:
                execResult.agent_run_id ??
                execResult.smoke_debug?.agent_run_id ??
                runSpineIds?.agent_run_id ??
                null,
              session_id:
                execResult.session_id ?? execResult.smoke_debug?.session_id ?? null,
              target_id: execResult.target_id ?? null,
              requested_url:
                execResult.requested_url ?? execResult.expected_url ?? null,
              url: execResult.url ?? null,
              verified: false,
              code: 'verification_failed',
            });
            emit('tool_error', {
              tool: call.name,
              tool_call_id: call.id,
              error: detail,
              code: 'verification_failed',
            });
          }
        }
        if (
          execResult &&
          typeof execResult === 'object' &&
          (execResult.code === 'browser_origin_not_trusted' ||
            String(execResult.error || '').includes('Browser origin not trusted'))
        ) {
          emit('browser_trust_required', {
            origin: execResult.origin ?? null,
            tool_name: call.name,
            message:
              'Trust this origin in the IAM browser consent modal (Browser tab), then retry.',
          });
        }
        if (call.name === 'excalidraw_plan_map_create') {
          try {
            const parsed =
              execResult && typeof execResult === 'object'
                ? execResult
                : JSON.parse(String(toolOutput || '{}'));
            if (
              parsed &&
              !parsed.error &&
              parsed.open_draw &&
              (parsed.artifact_id || parsed.public_url)
            ) {
              const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '') || '';
              const loadUrl =
                typeof parsed.public_url === 'string' && parsed.public_url.trim()
                  ? parsed.public_url.trim()
                  : origin && parsed.artifact_id
                    ? `${origin}/api/artifacts/${encodeURIComponent(String(parsed.artifact_id))}/content`
                    : '';
              emit('surface_open', {
                surface: 'excalidraw',
                reason: 'excalidraw_plan_map_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
              });
              emit('agent_surface_open', {
                surface: 'excalidraw',
                reason: 'excalidraw_plan_map_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
              });
            }
          } catch (_) {
            /* ignore malformed tool JSON */
          }
        }
        if (call.name === 'illustration_create') {
          try {
            const parsed =
              execResult && typeof execResult === 'object'
                ? execResult
                : JSON.parse(String(toolOutput || '{}'));
            if (!parsed || parsed.error || parsed.ok === false) {
              /* skip surface open */
            } else if (parsed.open_draw && (parsed.artifact_id || parsed.public_url)) {
              const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '') || '';
              const loadUrl =
                typeof parsed.public_url === 'string' && parsed.public_url.trim()
                  ? parsed.public_url.trim()
                  : origin && parsed.artifact_id
                    ? `${origin}/api/artifacts/${encodeURIComponent(String(parsed.artifact_id))}/content`
                    : '';
              emit('surface_open', {
                surface: 'excalidraw',
                reason: 'illustration_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
                lane: parsed.lane ?? 'excalidraw',
                engine: parsed.engine ?? null,
              });
              emit('agent_surface_open', {
                surface: 'excalidraw',
                reason: 'illustration_create',
                artifact_id: parsed.artifact_id ?? null,
                load_url: loadUrl,
                artifact_type: 'excalidraw',
                lane: parsed.lane ?? 'excalidraw',
                engine: parsed.engine ?? null,
              });
            } else if (parsed.open_designstudio && (parsed.job_id || parsed.cad_job_id)) {
              const jobId = parsed.job_id ?? parsed.cad_job_id;
              emit('surface_open', {
                surface: 'designstudio',
                reason: 'illustration_create',
                job_id: jobId != null ? String(jobId) : null,
                lane: parsed.lane ?? 'cad',
                engine: parsed.engine ?? null,
                cad_job_live: true,
              });
              emit('agent_surface_open', {
                surface: 'designstudio',
                reason: 'illustration_create',
                job_id: jobId != null ? String(jobId) : null,
                lane: parsed.lane ?? 'cad',
                engine: parsed.engine ?? null,
                cad_job_live: true,
              });
            }
          } catch (_) {
            /* ignore malformed tool JSON */
          }
        }
        if (!execErr) {
          const surfaceFromTool = (() => {
            const input =
              call.input && typeof call.input === 'object'
                ? /** @type {Record<string, unknown>} */ (call.input)
                : {};
            const result =
              execResult && typeof execResult === 'object'
                ? /** @type {Record<string, unknown>} */ (execResult)
                : {};
            if (call.name === 'browser_navigate' || call.name === 'cdt_navigate_page') {
              const navUrl =
                (typeof input.url === 'string' && input.url.trim()) ||
                (typeof result.url === 'string' && result.url.trim()) ||
                '';
              const target = navUrl.startsWith('http://localhost')
                ? { kind: 'localhost', port: Number(navUrl.match(/:(\d+)/)?.[1]) || undefined }
                : navUrl
                  ? { kind: 'url', url: navUrl }
                  : null;
              return {
                surface: 'browser',
                reason: call.name,
                tool_name: call.name,
                url: navUrl || undefined,
                target,
              };
            }
            if (call.name === 'monaco_open' || call.name === 'monaco_open_file') {
              const path =
                (typeof input.path === 'string' && input.path.trim()) ||
                (typeof input.file_path === 'string' && input.file_path.trim()) ||
                '';
              return {
                surface: 'monaco',
                reason: call.name,
                tool_name: call.name,
                workspace_path: path || undefined,
                target: path ? { kind: 'local_file', workspace_path: path } : { kind: 'surface_only', surface: 'code' },
              };
            }
            if (call.name === 'excalidraw_open') {
              return { surface: 'excalidraw', reason: 'excalidraw_open', tool_name: call.name };
            }
            if (
              call.name === 'cms_read' ||
              call.name === 'cms_write' ||
              call.name === 'cms_publish' ||
              call.name === 'agentsam_cms_read' ||
              call.name === 'agentsam_cms_write' ||
              call.name === 'agentsam_cms_publish' ||
              call.name === 'agentsam_cms_save_site_shell' ||
              call.name === 'agentsam_cms_publish_site_shell' ||
              call.name === 'cms_pipeline_prototype' ||
              call.name === 'cms_pipeline_extract' ||
              call.name === 'cms_pipeline_inject' ||
              call.name === 'cms_pipeline_bootstrap'
            ) {
              const slug =
                (typeof input.project_slug === 'string' && input.project_slug.trim()) ||
                (typeof result.project_slug === 'string' && result.project_slug.trim()) ||
                '';
              const pageId =
                (typeof input.page_id === 'string' && input.page_id.trim()) ||
                (typeof result.page_id === 'string' && result.page_id.trim()) ||
                '';
              const previewUrl =
                (typeof result.preview_url === 'string' && result.preview_url.trim()) ||
                (typeof result.public_url === 'string' && result.public_url.trim()) ||
                '';
              if (previewUrl) {
                return {
                  surface: 'browser',
                  reason: call.name,
                  tool_name: call.name,
                  url: previewUrl,
                  page_id: pageId || undefined,
                  project_slug: slug || undefined,
                  target: { kind: 'cms_preview_url', url: previewUrl, page_id: pageId || undefined },
                };
              }
              if (slug) {
                return {
                  surface: 'cms',
                  reason: call.name,
                  tool_name: call.name,
                  project_slug: slug,
                  page_id: pageId || undefined,
                  target: { kind: 'cms_panel', project_slug: slug, page_id: pageId || undefined },
                };
              }
            }
            if (call.name === 'image_generate' || isImageGenerationTool(call.name)) {
              return { surface: 'image', reason: call.name, tool_name: call.name };
            }
            return null;
          })();
          if (surfaceFromTool) {
            emit('surface_open', surfaceFromTool);
            emit('agent_surface_open', surfaceFromTool);
          }
        }
      } catch (e) {
        if (isAgentRunAbortError(e)) return exitCancelled();
        execErr = e;
        const isTimeout =
          e &&
          typeof e === 'object' &&
          'code' in e &&
          /** @type {{ code?: string }} */ (e).code === 'tool_timeout';
        const detail = isTimeout
          ? `Tool timed out after ${toolBudgetMs}ms`
          : e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
            ? e.message
            : String(e ?? 'unknown_error');
        toolOutput = `Tool execution failed: ${detail}`;
        console.warn('[agent] tool_error', call.name, detail);
        emit('tool_error', {
          tool: call.name,
          error: detail,
          ...(isTimeout ? { code: 'tool_timeout' } : {}),
        });
      }
      const toolDurMs = Date.now() - toolT0;
      let toolDoneExtra = {};
      if (!execErr && call.name === 'excalidraw_plan_map_create') {
        try {
          const parsed = JSON.parse(String(toolOutput || '{}'));
          if (parsed && parsed.artifact_id && !parsed.error) {
            toolDoneExtra = {
              artifact_type: 'excalidraw',
              artifact_id: String(parsed.artifact_id),
              public_url: parsed.public_url != null ? String(parsed.public_url) : null,
            };
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (!execErr && call.name === 'illustration_create') {
        try {
          const parsed = JSON.parse(String(toolOutput || '{}'));
          if (parsed && !parsed.error && parsed.ok !== false) {
            toolDoneExtra = {
              schema: parsed.schema ?? 'iam.illustration.v1',
              lane: parsed.lane ?? null,
              engine: parsed.engine ?? null,
              surface: parsed.surface ?? null,
              ...(parsed.artifact_id
                ? {
                    artifact_type: parsed.artifact_type ?? 'excalidraw',
                    artifact_id: String(parsed.artifact_id),
                    public_url: parsed.public_url != null ? String(parsed.public_url) : null,
                  }
                : {}),
              ...(parsed.job_id || parsed.cad_job_id
                ? { job_id: String(parsed.job_id ?? parsed.cad_job_id) }
                : {}),
            };
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (!execErr) {
        const cadExtras = cadToolSseExtrasFromOutput(call.name, toolOutput);
        if (cadExtras.job_id) {
          toolDoneExtra = { ...toolDoneExtra, ...cadExtras };
        }
      }
      if (call.name === 'search_web') {
        try {
          const parsed = (() => {
            if (execResult && typeof execResult === 'object') return execResult;
            return JSON.parse(String(toolOutput || '{}'));
          })();
          const tel = parsed?.telemetry;
          if (tel && typeof tel === 'object') {
            toolDoneExtra = {
              lane: 'open_web_search',
              backend: tel.backend ?? parsed.provider ?? 'tavily',
              cache_hit: !!parsed.cache_hit,
              search_depth: tel.search_depth ?? 'basic',
              result_count: tel.result_count ?? 0,
              estimated_credits: tel.estimated_credits ?? 1,
            };
            console.log(
              '[agent] execution_lane_selected',
              JSON.stringify({
                lane: 'open_web_search',
                backend: toolDoneExtra.backend,
                reason: parsed.cache_hit ? 'tavily_cache_hit' : 'tavily_search_complete',
                cache_hit: toolDoneExtra.cache_hit,
                max_results: parsed.max_results ?? 5,
                search_depth: toolDoneExtra.search_depth,
                query_hash: tel.query_hash ?? null,
                duration_ms: tel.duration_ms ?? toolDurMs,
              }),
            );
            if (!execErr) {
              emit('execution_lane_selected', {
                lane: 'open_web_search',
                backend: toolDoneExtra.backend,
                reason: parsed.cache_hit ? 'tavily_cache_hit' : 'tavily_search_complete',
                cache_hit: toolDoneExtra.cache_hit,
                max_results: parsed.max_results ?? 5,
                search_depth: toolDoneExtra.search_depth,
              });
            }
          }
        } catch (_) {
          /* ignore */
        }
      }
      emit('tool_output', {
        tool_name: call.name,
        chunk: String(toolOutput || '').slice(0, TOOL_OUTPUT_SSE_MAX),
      });
      emit('tool_done', {
        tool_name: call.name,
        tool_call_id: call.id,
        status: execErr ? 'error' : 'ok',
        duration_ms: toolDurMs,
        rows: toolRows ?? null,
        ...toolDoneExtra,
        ...(execErr
          ? {
              error:
                execErr && typeof execErr === 'object' && 'message' in execErr
                  ? String(execErr.message || '').slice(0, 4000)
                  : String(execErr || '').slice(0, 4000),
            }
          : {}),
      });
      if (!execErr) {
        try {
          const { emitBrowserLiveSessionSse } = await import('../integrations/agent-live-browser-session.js');
          const parsedForBrowser =
            execResult && typeof execResult === 'object'
              ? execResult
              : (() => {
                  try {
                    return JSON.parse(String(toolOutput || 'null'));
                  } catch {
                    return null;
                  }
                })();
          emitBrowserLiveSessionSse(emit, 'done', call.name, parsedForBrowser);
        } catch {
          /* non-fatal */
        }
      }
      if (!execErr) {
        try {
          const parsed = JSON.parse(String(toolOutput || 'null'));
          if (parsed && typeof parsed === 'object') {
            const url =
              isImageGenerationTool(call.name)
                ? null
                : typeof parsed.screenshot_url === 'string' && parsed.screenshot_url.trim()
                  ? parsed.screenshot_url.trim()
                  : typeof parsed.result_url === 'string' && parsed.result_url.trim()
                    ? parsed.result_url.trim()
                    : typeof parsed.image_url === 'string'
                      ? parsed.image_url
                      : typeof parsed.public_url === 'string'
                        ? parsed.public_url
                        : typeof parsed.url === 'string' && /^(https?:|data:)/i.test(parsed.url)
                          ? parsed.url
                          : null;
            if (url && url.length < 8000) {
              emit('preview_artifact', {
                artifact: {
                  id: `sse_${call.id || crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
                  kind: 'image',
                  title: call.name,
                  imageUrl: url,
                },
              });
            }
            tryEmitCodeDiffFromToolOutput(emit, call.name, toolOutput);
            if (workspaceId) {
              void tryBroadcastMonacoPatchFromToolOutput(env, workspaceId, toolOutput).catch(() => {});
            }
          }
        } catch (_) {
          /* not JSON — skip preview */
        }
      }
      if (chatToolLedger) {
        try {
          await appendChatToolSessionLedgerStep(env, emit, chatToolLedger, {
            tool_name: call.name,
            ok: !execErr,
            duration_ms: toolDurMs,
            output_preview: String(toolOutput || '').slice(0, 8000),
            error: execErr ? String(execErr.message || execErr).slice(0, 2000) : null,
            input_json:
              call.input && typeof call.input === 'object'
                ? call.input
                : call.input != null
                  ? { value: call.input }
                  : {},
          });
        } catch (e) {
          console.warn('[agent] chat_tool_session_ledger_step', e?.message ?? e);
        }
      }
      // TELEMETRY-001: extract from execResult (SSOT = tool-exec-telemetry.js).
      // Honest 0 when tool returns no usage (free tools). Blocked paths above stay literal 0.
      const toolUsage = extractToolExecUsage(execResult);
      scheduleAgentsamToolCallLog(env, ctx, {
        tenantId,
        sessionId,
        toolName: call.name,
        status: execErr
          ? execErr &&
              typeof execErr === 'object' &&
              'code' in execErr &&
              /** @type {{ code?: string }} */ (execErr).code === 'tool_timeout'
            ? 'timeout'
            : 'error'
          : 'success',
        durationMs: toolDurMs,
        costUsd: toolUsage.totalCostUsd,
        inputTokens: toolUsage.inputTokens,
        outputTokens: toolUsage.outputTokens,
        inputCostUsd: toolUsage.inputCostUsd,
        outputCostUsd: toolUsage.outputCostUsd,
        userId,
        workspaceId,
        errorMessage: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
        routingArmId: attributedRoutingArmId(),
        ...toolLogFieldsFromValidation(validation),
        ...runSpineIds,
        ...ledgerIdentityFields,
      });
      const mcpExecId = scheduleRecordMcpToolExecution(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        session_id: sessionId,
        tool_name: call.name,
        tool_id: validation.mcpToolId ?? null,
        input_json: JSON.stringify(call.input || {}),
        output_json: toolOutput.slice(0, 50000),
        success: !execErr,
        error_message: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        duration_ms: toolDurMs,
        user_id: userId,
        invoked_by: userId || 'iam_agent',
        status: execErr ? 'error' : 'completed',
        skip_tool_chain_row: true,
        ...runSpineIds,
      });
      const canonicalToolChainUserId = await resolveCanonicalUserId(userId, env);
      previousToolChainId = await fireForgetAgentToolChainRow(env, {
        toolName: call.name,
        agentSessionId: sessionId,
        workspaceId,
        userId: canonicalToolChainUserId,
        error: execErr,
        costUsd: toolUsage.totalCostUsd,
        inputTokens: toolUsage.inputTokens,
        outputTokens: toolUsage.outputTokens,
        mcpToolCallId: mcpExecId,
        durationMs: toolDurMs,
        terminalSessionId: null,
        tenantId,
        parentChainId: previousToolChainId,
        toolInputJson: JSON.stringify(call.input || {}),
        workflowRunId: null,
        executionStepId: null,
        ...runSpineIds,
        ctx,
      });
      if (previousToolChainId && !toolChainRootId) toolChainRootId = previousToolChainId;
      recordMcpToolOtlpSpan(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        toolName: call.name,
        start_time_unix_nano: toolStartNs,
        end_time_unix_nano: Date.now() * 1_000_000,
        execErr,
      });
      emit('tool_result', { tool: call.name, output: toolOutput.slice(0, TOOL_OUTPUT_SSE_MAX) });
      const tr = { type: 'tool_result', tool_use_id: call.id, content: toolOutput };
      if (execErr) tr.is_error = true;
      toolResults.push(tr);

      if (Date.now() - runStartedAt > maxRunMs) {
        scheduleLoopUsageTelemetry(false);
        emit('error', { message: 'Agent run timed out', code: 'agent_run_timeout' });
        if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });
        safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount, code: 'agent_run_timeout' });
        return {
          totalUsage,
          toolCallsUsed,
          executedToolNames,
          modelKey,
          turnCount,
          timedOut: true,
          workflowRunId: null,
          agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
          chainRootId: toolChainRootId,
        };
      }
    }
    if (chatHaltedForApproval) {
      safeDone({ halted_for_approval: true, tool_calls_used: toolCallsUsed, turns: turnCount });
      return {
        totalUsage,
        toolCallsUsed,
        executedToolNames,
        modelKey,
        turnCount,
        haltedForApproval: true,
        workflowRunId: null,
        agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
        chainRootId: toolChainRootId,
      };
    }
    if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });

    if (routingWs) {
      if (!attributedRoutingArmId()) {
        scheduleRoutingArmBanditUpdate(env, ctx, {
          taskType: routingTaskType || 'ask',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          success: true,
          lastChainId: previousToolChainId,
        });
      }
      const qs = Number(qualityScore);
      if (Number.isFinite(qs)) {
        scheduleRoutingArmQualityUpdate(env, ctx, {
          taskType: routingTaskType || 'ask',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          qualityScore: qs,
        });
      }
    }

    if (stopReason === 'end_turn') break;
  }
  } catch (e) {
    if (isAgentRunAbortError(e)) {
      return exitCancelled();
    }
    ledgerLoopThrew = true;
    ledgerErrorMsg = e?.message != null ? String(e.message) : String(e);
    throw e;
  } finally {
    if (chatToolLedger?.runId) {
      try {
        await finalizeChatToolSessionLedger(env, ctx, emit, chatToolLedger, {
          ok: !ledgerLoopThrew,
          errorMessage: ledgerErrorMsg,
        });
      } catch (fe) {
        console.warn('[agent] chat_tool_session_ledger_finalize', fe?.message ?? fe);
      }
    }
    abortScope.dispose();
  }

  scheduleLoopUsageTelemetry(true);

  const assistantText = extractLastAssistantPlainText(conversationMessages);
  if (assistantText && inferArtifactFromAssistantText(assistantText)) {
    scheduleAgentsamArtifactFromChatOutput(env, ctx, {
      outputText: assistantText,
      userId,
      tenantId,
      workspaceId: routingWs || workspaceId,
      sourceAgentRunId: chatAgentRunId,
      sourceSessionId: sessionId,
    });
  }

  if (
    routingTaskType === 'cms_edit' &&
    turnCount >= CMS_SPAWN_SESSION_TURN_THRESHOLD &&
    chatAgentRunId &&
    sessionId
  ) {
    ctx.waitUntil(
      maybeSpawnCmsSessionHandoff(env, ctx, {
        userId,
        workspaceId: routingWs || workspaceId,
        tenantId,
        parentRunId: String(chatAgentRunId),
        parentSessionId: String(sessionId),
        turnCount,
        goal: 'Continue CMS edit — apply section changes and redeploy',
        messages: conversationMessages,
      }).catch(() => {}),
    );
  }

  // Persist user turn + assistant turns to conversation DO (non-blocking)
  if (sessionId && userId) {
    const turnId = params.chatTurnMeta?.turnId ?? null;
    const assistantMessageId = params.chatTurnMeta?.assistantMessageId ?? null;
    const userMsg = messages?.[0];
    const userContent = typeof userMsg?.content === 'string'
      ? userMsg.content
      : (Array.isArray(userMsg?.content) ? userMsg.content.filter(b => b.type === 'text').map(b => b.text).join('') : '');
    if (userContent) {
      appendChatMessage(env, sessionId, {
        role: 'user',
        content: userContent,
        turn_id: turnId,
        model_key: modelKey ?? null,
        tokens_in: 0,
        tokens_out: 0,
      }).catch((e) => console.warn('[tool-loop] appendChatMessage user', e?.message ?? e));
    }
    const assistantText = conversationMessages
      .filter(m => m.role === 'assistant')
      .flatMap(m => Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    if (assistantText) {
      appendChatMessage(env, sessionId, {
        id: assistantMessageId ?? undefined,
        turn_id: turnId,
        role: 'assistant',
        content: assistantText,
        status: 'complete',
        model_key: modelKey ?? null,
        tokens_in: totalUsage.input_tokens ?? 0,
        tokens_out: totalUsage.output_tokens ?? 0,
      })
        .then(() =>
          markChatTurnStatus(env, sessionId, 'completed', null, {
            assistantMessageId,
            output_tokens: totalUsage.output_tokens ?? 0,
            content: assistantText,
          }),
        )
        .catch((e) => console.warn('[tool-loop] appendChatMessage assistant', e?.message ?? e));
    }
  }

  safeDone({ tool_calls_used: toolCallsUsed, turns: turnCount });
  return {
    totalUsage,
    toolCallsUsed,
    executedToolNames,
    modelKey,
    turnCount,
    timedOut: false,
    workflowRunId: null,
    agentRunId: chatAgentRunId != null ? String(chatAgentRunId) : null,
    chainRootId: toolChainRootId,
  };
}

