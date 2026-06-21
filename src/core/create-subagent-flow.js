/**
 * Two-turn /create-subagent flow (Cursor-like intake, D1 write via agentsam_create_subagent).
 * Also hosts on_brand_genmedia skill spawn orchestrator (Sprint 2B).
 */

import {
  bumpSpawnJobAfterChild,
  completeSkillSpawnJob,
  createChildRun,
  createMultitaskParentRun,
  createSkillSpawnJob,
  emptyGenmediaMergedOutput,
  ensureSubagentProfilesAvailable,
  estimateAgentRunCostUsd,
  getBrandScoreThreshold,
  getSpawnJobRow,
  markAgentRunComplete,
  markAgentRunStarted,
  markSkillSpawnJobRunning,
  parseGenmediaMergedOutput,
  setSpawnJobMergedOutput,
} from './subagent-spawn-d1.js';
import {
  appendSubagentProfileToSystemPrompt,
  filterToolsForSubagentProfile,
} from './subagent-profile-resolve.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { resolveRuntimeProfile, toolsManifestFromCompiledRows } from './runtime-profile.js';

export const CREATE_SUBAGENT_TOOL_NAME = 'agentsam_create_subagent';

export const CREATE_SUBAGENT_KICKOFF_QUESTION = 'What do you want this subagent to do?';

/**
 * @param {any[]} tools
 * @returns {any[]}
 */
export function pickCreateSubagentTools(tools) {
  const fromManifest = (Array.isArray(tools) ? tools : []).filter(
    (t) => String(t?.name || '') === CREATE_SUBAGENT_TOOL_NAME,
  );
  return fromManifest.length ? fromManifest : [{ name: CREATE_SUBAGENT_TOOL_NAME }];
}

const CREATE_SUBAGENT_SLASH_RE = /\/create-subagent\b/i;

/**
 * @param {unknown} messages
 * @returns {{ role: string, content: string }[]}
 */
export function normalizeCreateSubagentMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const role = String(m.role || '').toLowerCase();
      if (role !== 'user' && role !== 'assistant') return null;
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .map((p) => (p && typeof p === 'object' && p.text != null ? String(p.text) : ''))
                .join('')
            : m.content != null
              ? String(m.content)
              : '';
      return { role, content };
    })
    .filter(Boolean);
}

/**
 * @param {unknown} messages
 * @returns {boolean}
 */
export function messageStartsCreateSubagentFlow(message) {
  return CREATE_SUBAGENT_SLASH_RE.test(String(message || ''));
}

/**
 * @param {unknown} messages
 * @returns {{ active: boolean, phase: 'kickoff' | 'execute' | null }}
 */
export function resolveCreateSubagentFlow(messages) {
  const msgs = normalizeCreateSubagentMessages(messages);
  if (!msgs.length) return { active: false, phase: null };

  let kickoffIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === 'user' && CREATE_SUBAGENT_SLASH_RE.test(msgs[i].content)) {
      kickoffIdx = i;
      break;
    }
  }
  if (kickoffIdx < 0) return { active: false, phase: null };

  const afterKickoff = msgs.slice(kickoffIdx + 1);
  const questionIdx = afterKickoff.findIndex((m) => m.role === 'assistant');
  const last = msgs[msgs.length - 1];

  if (last.role === 'user' && CREATE_SUBAGENT_SLASH_RE.test(last.content) && questionIdx < 0) {
    return { active: true, phase: 'kickoff' };
  }

  if (questionIdx >= 0 && last.role === 'user' && !CREATE_SUBAGENT_SLASH_RE.test(last.content)) {
    const afterQuestion = afterKickoff.slice(questionIdx + 1);
    const intentReplies = afterQuestion.filter((m) => m.role === 'user');
    if (intentReplies.length === 1 && intentReplies[0] === last) {
      return { active: true, phase: 'execute' };
    }
  }

  return { active: false, phase: null };
}

/**
 * @param {'kickoff' | 'execute'} phase
 */
export function buildCreateSubagentFlowSystemPromptLine(phase) {
  if (phase === 'kickoff') {
    return (
      'Create subagent (step 1 of 2): The user typed /create-subagent. ' +
      `Reply with exactly one clarifying question — "${CREATE_SUBAGENT_KICKOFF_QUESTION}" — and stop. ` +
      'Do NOT call tools on this turn. Do NOT list existing subagents, probe GitHub/repos, or run d1_query.'
    );
  }
  return (
    'Create subagent (step 2 of 2): The user answered your clarifying question. ' +
    `Call \`${CREATE_SUBAGENT_TOOL_NAME}\` once with display_name, slug, description, and instructions_markdown from their answer. ` +
    'Do NOT list or get existing subagents first. If the tool returns slug_already_exists, retry once with a different slug. ' +
    'Do NOT use github_*, terminal, d1_query, or any tool other than agentsam_create_subagent.'
  );
}

// ─── on_brand_genmedia skill spawn (Sprint 2B) ─────────────────────────────────

const GENMEDIA_SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

const GENMEDIA_INITIAL_PIPELINE = [
  'genmedia_prompt_enrichment',
  'genmedia_image_gen',
  'genmedia_scoring',
];

/**
 * @param {string} text
 */
function extractJsonObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 */
function extractR2Key(text) {
  const m = String(text || '').match(/(?:brand\/genmedia\/[^\s"'`]+|r2:\/\/[^\s"'`]+|static\/[^\s"'`]+\.(?:png|jpg|webp))/i);
  return m ? m[0] : '';
}

/**
 * @param {Array<Record<string, unknown>>} profiles
 * @param {string} slug
 */
function profileBySlug(profiles, slug) {
  const want = String(slug || '').trim();
  return (profiles || []).find((p) => String(p.slug || '').trim() === want) || null;
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildGenmediaChildUserMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'genmedia_prompt_enrichment') {
    return `Enrich this image generation prompt with workspace brand context. Return one enriched prompt string.\n\n${base}`;
  }
  if (slug === 'genmedia_image_gen') {
    const prompt = String(merged.enriched_prompt || base).trim();
    const feedback = String(merged.last_feedback || '').trim();
    return (
      `Generate a brand-aligned image.\n\nEnriched prompt:\n${prompt}\n\n` +
      (feedback ? `Iteration feedback:\n${feedback}\n\n` : '') +
      'Upload via agentsam_cf_images_upload and return the R2 key.'
    );
  }
  if (slug === 'genmedia_scoring') {
    const r2 = String(merged.current_r2_key || '').trim();
    return (
      `Score this generated image against brand policy (source_type=policy).\n` +
      `R2 key: ${r2 || '(from prior step)'}\n` +
      `Return JSON only: {"score":0-100,"feedback":"...","passed":bool,"r2_key":"..."}`
    );
  }
  return base;
}

/**
 * Programmatic checker — reads merged_output; re-spawn or complete (Sprint 2B).
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   spawnJobId: string,
 *   parentRunId: string,
 *   maxIterations: number,
 *   workspaceId: string,
 *   userId: string,
 *   tenantId: string|null,
 *   conversationId: string|null,
 *   sessionId: string|null,
 *   profiles: Array<Record<string, unknown>>,
 *   taskDescription: string,
 *   request: Request,
 *   userPolicy: any,
 *   runChildStep: Function,
 * }} p
 */
export async function handleGenmediaCheckerContinuation(env, ctx, p) {
  const job = await getSpawnJobRow(env, p.spawnJobId);
  if (!job?.id) return { done: true, reason: 'job_missing', merged: emptyGenmediaMergedOutput() };

  const merged = parseGenmediaMergedOutput(job.merged_output);
  const threshold = await getBrandScoreThreshold(env, p.workspaceId);
  const maxIter = Math.max(1, Math.floor(Number(p.maxIterations) || Number(job.chunk_count) || 3));
  const iterCount = Array.isArray(merged.iterations) ? merged.iterations.length : 0;
  const lastIter = Array.isArray(merged.iterations) ? merged.iterations[merged.iterations.length - 1] : null;
  const passed = lastIter?.passed === true || Number(merged.best_score) >= threshold;

  if (passed || iterCount >= maxIter) {
    await completeSkillSpawnJob(env, ctx, {
      spawnJobId: p.spawnJobId,
      status: passed ? 'completed' : 'partial',
      bestR2Key: merged.best_r2_key || merged.current_r2_key || null,
    });
    return { done: true, reason: passed ? 'passed' : 'max_iterations', merged, threshold };
  }

  merged.last_feedback = String(lastIter?.feedback || merged.last_feedback || '').trim();
  await setSpawnJobMergedOutput(env, p.spawnJobId, merged);
  await markSkillSpawnJobRunning(env, p.spawnJobId, 'genmedia_image_gen');

  for (const slug of ['genmedia_image_gen', 'genmedia_scoring']) {
    const out = await p.runChildStep(slug, merged);
    if (!out.ok) break;
    Object.assign(merged, out.mergedPatch || {});
    await setSpawnJobMergedOutput(env, p.spawnJobId, merged);
  }

  return handleGenmediaCheckerContinuation(env, ctx, p);
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeGenmediaSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = session.userId != null ? String(session.userId).trim() : '';
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = session.workspaceId != null ? String(session.workspaceId).trim() : '';
  const sessionId = session.sessionId != null ? String(session.sessionId).trim() : null;
  const conversationId = sessionId;
  const pipeline = Array.isArray(skillRoute.pipeline) ? skillRoute.pipeline : GENMEDIA_INITIAL_PIPELINE;
  const maxIterations = Math.max(1, Math.floor(Number(skillRoute.max_iterations) || 3));
  const masterSlug = String(skillRoute.master_agent_slug || 'on_brand_genmedia').trim();

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = null;
    let merged = emptyGenmediaMergedOutput();
    const brandScoreThreshold = await getBrandScoreThreshold(env, workspaceId);
    try {
      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      const parent = await createMultitaskParentRun(env, ctx, {
        userId,
        workspaceId,
        tenantId,
        conversationId,
        sessionId,
        mode: 'agent',
        taskType: 'agent',
        trigger: 'genmedia_skill',
        routingArmId: profile?.routing_arm_id,
        modelKey: profile?.model_key,
        provider: profile?.selected_provider,
      });
      parentRunId = parent.ok ? parent.runId : null;
      if (!parentRunId) {
        emit('error', { message: parent.reason || 'parent_run_failed' });
        emit('done', {});
        return;
      }

      const sj = await createSkillSpawnJob(env, ctx, {
        skillId: String(skillRoute.skill_id || 'skill_on_brand_genmedia'),
        parentRunId,
        userId,
        workspaceId,
        tenantId,
        taskDescription: message,
        masterAgentSlug: masterSlug,
        pipeline,
        maxIterations,
      });
      spawnJobId = sj.ok ? sj.spawnJobId : null;
      if (!spawnJobId) {
        emit('error', { message: sj.reason || 'spawn_job_failed' });
        emit('done', {});
        return;
      }

      emit('context', {
        agent_run_id: parentRunId,
        skill_id: skillRoute.skill_id,
        spawn_job_id: spawnJobId,
        chain_root_id: parentRunId,
      });

      await markAgentRunStarted(env, ctx, {
        runId: parentRunId,
        modelKey: profile?.model_key,
        provider: profile?.selected_provider,
        routingArmId: profile?.routing_arm_id,
        mode: 'agent',
        taskType: 'agent',
      });
      await markSkillSpawnJobRunning(env, spawnJobId, pipeline[0] || 'genmedia_prompt_enrichment');

      const { buildSystemPrompt, runAgentToolLoop } = await import('../api/agent.js');

      const runChildStep = async (slug, stateIn) => {
        const row = profileBySlug(profiles, slug);
        if (!row) return { ok: false, reason: `profile_missing:${slug}`, mergedPatch: {} };

        const child = await createChildRun(env, ctx, {
          parentRunId,
          userId,
          workspaceId,
          tenantId,
          conversationId,
          sessionId,
          subagentSlug: slug,
          taskType: 'agent',
        });
        const childRunId = child.ok ? child.runId : null;
        emit('agentsam_subagent_run_started', {
          subagent_run_id: childRunId,
          subagent_slug: slug,
          parent_run_id: parentRunId,
          spawn_job_id: spawnJobId,
        });

        let childProfile;
        try {
          childProfile = await resolveRuntimeProfile(env, {
            mode: 'agent',
            task_type: 'agent',
            route_key: 'agent_general',
            workspace_id: workspaceId,
            tenant_id: tenantId,
            user_id: userId,
            subagent_slug: slug,
          });
        } catch {
          return { ok: false, reason: 'profile_compile_failed', mergedPatch: {} };
        }

        let tools = toolsManifestFromCompiledRows(childProfile._compiled_tool_rows || []);
        tools = filterToolsForSubagentProfile(tools, row);
        let systemPrompt = 'You are Agent Sam subagent.';
        try {
          systemPrompt = await buildSystemPrompt(env, tenantId, 'agent', '', null, null, {
            request: input.request,
            sessionId,
            message,
            taskType: 'agent',
            workspaceId,
            userId,
          });
        } catch {
          /* default */
        }
        systemPrompt = appendSubagentProfileToSystemPrompt(systemPrompt, row);

        const textChunks = [];
        const t0 = Date.now();
        if (childRunId) {
          await markAgentRunStarted(env, ctx, {
            runId: childRunId,
            modelKey: childProfile.model_key,
            provider: childProfile.selected_provider,
            mode: 'agent',
            taskType: 'agent',
          });
        }

        let loopResult = null;
        try {
          loopResult = await runAgentToolLoop(env, ctx, (type, payload) => {
            if (type === 'text' && payload?.text) textChunks.push(String(payload.text));
          }, {
            request: input.request,
            messages: [{ role: 'user', content: buildGenmediaChildUserMessage(slug, message, stateIn) }],
            tools,
            systemPrompt,
            modelKey: childProfile.model_key,
            temperature: childProfile.temperature,
            maxToolCalls: childProfile.max_tool_calls,
            mode: 'agent',
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
            routingTaskType: 'agent',
            agentRunId: childRunId,
            parentRunId,
          });
        } catch (e) {
          if (childRunId) {
            await markAgentRunComplete(env, ctx, {
              runId: childRunId,
              status: 'failed',
              latencyMs: Date.now() - t0,
              errorMessage: e?.message ?? String(e),
            });
          }
          await bumpSpawnJobAfterChild(env, ctx, { spawnJobId, ok: false });
          return { ok: false, reason: e?.message ?? String(e), mergedPatch: {} };
        }

        const outText = textChunks.join('\n').trim();
        const usage = loopResult?.totalUsage || {};
        const inputTokens = Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
        const outputTokens = Math.max(0, Math.floor(Number(usage.output_tokens) || 0));
        const costUsd = await estimateAgentRunCostUsd(env, childProfile.model_key, inputTokens, outputTokens);
        const latencyMs = Date.now() - t0;

        if (childRunId) {
          await markAgentRunComplete(env, ctx, {
            runId: childRunId,
            status: 'completed',
            latencyMs,
            inputTokens,
            outputTokens,
            costUsd,
            modelKey: childProfile.model_key,
            mode: 'agent',
            taskType: 'agent',
          });
        }
        await bumpSpawnJobAfterChild(env, ctx, {
          spawnJobId,
          ok: true,
          inputTokens,
          outputTokens,
          costUsd,
          latencyMs,
        });

        /** @type {Record<string, unknown>} */
        const mergedPatch = { ...stateIn };
        if (slug === 'genmedia_prompt_enrichment') {
          mergedPatch.enriched_prompt = outText.slice(0, 8000) || message;
        }
        if (slug === 'genmedia_image_gen') {
          const r2 = extractR2Key(outText);
          if (r2) {
            mergedPatch.current_r2_key = r2;
            if (!mergedPatch.best_r2_key) mergedPatch.best_r2_key = r2;
          }
        }
        if (slug === 'genmedia_scoring') {
          const scored = extractJsonObject(outText) || {};
          const score = Number(scored.score);
          const r2Key = String(scored.r2_key || mergedPatch.current_r2_key || '').trim();
          const feedback = String(scored.feedback || '').trim();
          const passed =
            scored.passed === true || (Number.isFinite(score) && score >= brandScoreThreshold);
          const n =
            (Array.isArray(mergedPatch.iterations) ? mergedPatch.iterations.length : 0) + 1;
          mergedPatch.iteration = n;
          mergedPatch.current_r2_key = r2Key || mergedPatch.current_r2_key;
          mergedPatch.last_feedback = feedback;
          if (Number.isFinite(score)) {
            const prevBest = Number(mergedPatch.best_score) || 0;
            if (score >= prevBest) {
              mergedPatch.best_score = score;
              mergedPatch.best_r2_key = r2Key || mergedPatch.current_r2_key || mergedPatch.best_r2_key;
            }
          }
          const iterations = Array.isArray(mergedPatch.iterations) ? [...mergedPatch.iterations] : [];
          iterations.push({
            n,
            r2_key: r2Key || mergedPatch.current_r2_key,
            score: Number.isFinite(score) ? score : null,
            passed,
            feedback,
          });
          mergedPatch.iterations = iterations;
        }

        emit('agentsam_subagent_run_result', {
          subagent_slug: slug,
          status: 'ok',
          child_run_id: childRunId,
        });

        return { ok: true, mergedPatch };
      };

      for (const slug of GENMEDIA_INITIAL_PIPELINE) {
        await markSkillSpawnJobRunning(env, spawnJobId, slug);
        const step = await runChildStep(slug, merged);
        if (step.mergedPatch) merged = { ...merged, ...step.mergedPatch };
        await setSpawnJobMergedOutput(env, spawnJobId, merged);
        if (!step.ok) break;
      }

      const checker = await handleGenmediaCheckerContinuation(env, ctx, {
        spawnJobId,
        parentRunId,
        maxIterations,
        workspaceId,
        userId,
        tenantId,
        conversationId,
        sessionId,
        profiles,
        taskDescription: message,
        request: input.request,
        userPolicy,
        runChildStep,
      });
      merged = checker.merged || merged;

      await markAgentRunComplete(env, ctx, {
        runId: parentRunId,
        status: checker.done ? 'completed' : 'partial',
        latencyMs: 0,
        modelKey: profile?.model_key,
        mode: 'agent',
        taskType: 'agent',
      });

      const finalUrl = merged.best_r2_key || merged.current_r2_key || '';
      emit('text', {
        text: finalUrl
          ? `**GenMedia complete** — best score ${merged.best_score || 0}. Artifact: \`${finalUrl}\``
          : `**GenMedia finished** — best score ${merged.best_score || 0}.`,
      });
      if (finalUrl) {
        emit('image_generation_complete', {
          type: 'image_generation_complete',
          r2_key: finalUrl,
          best_score: merged.best_score,
          spawn_job_id: spawnJobId,
          parent_run_id: parentRunId,
        });
      }
      emit('done', {});
    } catch (e) {
      emit('error', { message: e?.message ?? String(e) });
      if (parentRunId) {
        await markAgentRunComplete(env, ctx, {
          runId: parentRunId,
          status: 'failed',
          errorMessage: e?.message ?? String(e),
        });
      }
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: GENMEDIA_SSE_HEADERS });
}
