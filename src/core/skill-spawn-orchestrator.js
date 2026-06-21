/**
 * Skill pipeline orchestrators: /launch (marketing_agency) and /deck (brand_aligned_presentations).
 */
import {
  bumpSpawnJobAfterChild,
  completeSkillSpawnJob,
  createChildRun,
  createMultitaskParentRun,
  createSkillSpawnJob,
  ensureSubagentProfilesAvailable,
  estimateAgentRunCostUsd,
  findResumableSkillSpawnJob,
  getSpawnJobRow,
  markAgentRunComplete,
  markAgentRunStarted,
  markSkillSpawnJobRunning,
  parseSkillMergedOutput,
  setSpawnJobMergedOutput,
  setSpawnJobStatus,
} from './subagent-spawn-d1.js';
import {
  appendSubagentProfileToSystemPrompt,
  filterToolsForSubagentProfile,
} from './subagent-profile-resolve.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { resolveRuntimeProfile, toolsManifestFromCompiledRows } from './runtime-profile.js';
import { pollApprovalQueue } from './agent-approval-gate.js';

export const SKILL_SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

const DECK_EDIT_RE = /\b(change|update|edit)\b.{0,24}\bslide\s+\d+\b/i;

/** @returns {Record<string, unknown>} */
export function emptyLaunchMergedOutput() {
  return {
    phase: 'domain',
    brand_brief: '',
    keywords: [],
    chosen_domain: '',
    page_ids: [],
    content_ids: [],
    logo_r2_key: '',
    phases_completed: [],
  };
}

/** @returns {Record<string, unknown>} */
export function emptyDeckMergedOutput() {
  return {
    phase: 'research',
    topic: '',
    slide_count: 10,
    research_brief: null,
    deck_spec: [],
    pptx_r2_key: '',
    pending_approval: null,
    approval_id: null,
  };
}

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
function extractJsonArray(text) {
  const s = String(text || '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {string} msg
 */
export function isApprovalReply(msg) {
  return /^(yes|yep|approve|approved|continue|looks good|lgtm|proceed|go ahead)\b/i.test(
    String(msg || '').trim(),
  );
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
function buildLaunchChildUserMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'launch_domain_advisor') {
    return (
      `Research domain candidates for this launch.\n\n` +
      `Task: ${base}\n\n` +
      'Return JSON: {"chosen_domain":"...","keywords":[],"brand_brief":"..."}'
    );
  }
  if (slug === 'launch_website_builder') {
    return (
      `Build CMS pages for this launch.\n\n` +
      `Domain: ${merged.chosen_domain || '(TBD)'}\n` +
      `Brand brief:\n${merged.brand_brief || base}\n\n` +
      'Create homepage, about, product/service, contact as draft cms_pages. Return page IDs.'
    );
  }
  if (slug === 'launch_marketing_writer') {
    return (
      `Write marketing copy for this launch.\n\n` +
      `Brand brief:\n${merged.brand_brief || base}\n` +
      `Page IDs: ${JSON.stringify(merged.page_ids || [])}\n\n` +
      'Return artifact/content IDs created.'
    );
  }
  if (slug === 'launch_logo_gen') {
    return (
      `Generate logo variants for this brand.\n\n` +
      `Brand brief:\n${merged.brand_brief || base}\n\n` +
      'Upload 3 variants to R2 and brand_assets. Return best logo R2 key.'
    );
  }
  return base;
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildDeckChildUserMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'deck_researcher') {
    return (
      `Research this presentation topic.\n\n` +
      `Topic: ${merged.topic || base}\n` +
      `Target slides: ${merged.slide_count || 10}\n\n` +
      'Return research brief JSON: { topic, key_findings[], sources[], internal_refs[], slide_themes[] }'
    );
  }
  if (slug === 'deck_outline_writer') {
    return (
      `Create a slide-by-slide outline from this approved research brief.\n\n` +
      `${JSON.stringify(merged.research_brief || {}, null, 2)}\n\n` +
      'Return DeckSpec JSON array: [{ slide_num, title, layout_hint, bullet_points[], speaker_notes, needs_image, source_citations[] }]'
    );
  }
  if (slug === 'deck_slide_renderer') {
    return (
      `Render the approved deck to PPTX.\n\n` +
      `DeckSpec:\n${JSON.stringify(merged.deck_spec || [], null, 2).slice(0, 12000)}\n\n` +
      'Write presentations/{workspace_id}/{job_id}/deck.pptx to R2 and cms_assets row. Return pptx R2 key.'
    );
  }
  if (slug === 'deck_editor') {
    return (
      `Apply a surgical edit to this deck.\n\n` +
      `User edit request: ${base}\n\n` +
      `DeckSpec:\n${JSON.stringify(merged.deck_spec || [], null, 2).slice(0, 12000)}\n\n` +
      `Current PPTX key: ${merged.pptx_r2_key || '(none)'}\n` +
      'Patch only affected slides, re-upload PPTX to same key.'
    );
  }
  return base;
}

/**
 * @param {Record<string, unknown>} mergedPatch
 * @param {string} slug
 * @param {string} outText
 * @param {string} message
 */
function patchLaunchMergedFromStep(mergedPatch, slug, outText, message) {
  if (slug === 'launch_domain_advisor') {
    const parsed = extractJsonObject(outText) || {};
    if (parsed.chosen_domain) mergedPatch.chosen_domain = String(parsed.chosen_domain).trim();
    if (parsed.brand_brief) mergedPatch.brand_brief = String(parsed.brand_brief).trim();
    if (Array.isArray(parsed.keywords)) mergedPatch.keywords = parsed.keywords;
    if (!mergedPatch.brand_brief) mergedPatch.brand_brief = outText.slice(0, 4000) || message;
    mergedPatch.phase = 'website';
    mergedPatch.phases_completed = [...(mergedPatch.phases_completed || []), 'domain'];
  }
  if (slug === 'launch_website_builder') {
    const ids = extractJsonObject(outText)?.page_ids || extractJsonArray(outText);
    if (Array.isArray(ids)) mergedPatch.page_ids = ids;
    mergedPatch.phase = 'marketing';
    mergedPatch.phases_completed = [...(mergedPatch.phases_completed || []), 'website'];
  }
  if (slug === 'launch_marketing_writer') {
    const ids = extractJsonObject(outText)?.content_ids || extractJsonArray(outText);
    if (Array.isArray(ids)) mergedPatch.content_ids = ids;
    mergedPatch.phases_completed = [...(mergedPatch.phases_completed || []), 'marketing'];
  }
  if (slug === 'launch_logo_gen') {
    const r2 =
      String(extractJsonObject(outText)?.logo_r2_key || '').trim() ||
      (outText.match(/(?:brand\/[^\s"'`]+|presentations\/[^\s"'`]+|static\/[^\s"'`]+\.(?:png|svg|webp))/i) ||
        [])[0] ||
      '';
    if (r2) mergedPatch.logo_r2_key = r2;
    mergedPatch.phase = 'completed';
    mergedPatch.phases_completed = [...(mergedPatch.phases_completed || []), 'logo'];
  }
}

/**
 * @param {Record<string, unknown>} mergedPatch
 * @param {string} slug
 * @param {string} outText
 * @param {string} message
 */
function patchDeckMergedFromStep(mergedPatch, slug, outText, message) {
  if (slug === 'deck_researcher') {
    mergedPatch.research_brief = extractJsonObject(outText) || { summary: outText.slice(0, 8000) || message };
    mergedPatch.phase = 'research_review';
    mergedPatch.pending_approval = 'research';
  }
  if (slug === 'deck_outline_writer') {
    mergedPatch.deck_spec = extractJsonArray(outText) || extractJsonObject(outText)?.deck_spec || [];
    mergedPatch.phase = 'outline_review';
    mergedPatch.pending_approval = 'outline';
  }
  if (slug === 'deck_slide_renderer') {
    const r2 =
      String(extractJsonObject(outText)?.pptx_r2_key || extractJsonObject(outText)?.r2_key || '').trim() ||
      (outText.match(/presentations\/[^\s"'`]+\.pptx/i) || [])[0] ||
      '';
    if (r2) mergedPatch.pptx_r2_key = r2;
    mergedPatch.phase = 'completed';
    mergedPatch.pending_approval = null;
  }
  if (slug === 'deck_editor') {
    const r2 =
      String(extractJsonObject(outText)?.pptx_r2_key || extractJsonObject(outText)?.r2_key || '').trim() ||
      String(mergedPatch.pptx_r2_key || '').trim();
    if (r2) mergedPatch.pptx_r2_key = r2;
    const spec = extractJsonArray(outText) || extractJsonObject(outText)?.deck_spec;
    if (Array.isArray(spec) && spec.length) mergedPatch.deck_spec = spec;
  }
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} p
 */
export async function runSkillChildStep(env, ctx, p) {
  const {
    slug,
    message,
    merged,
    profiles,
    parentRunId,
    spawnJobId,
    userId,
    workspaceId,
    tenantId,
    sessionId,
    userPolicy,
    request,
    buildUserMessage,
    emit,
  } = p;

  const row = profileBySlug(profiles, slug);
  if (!row) return { ok: false, reason: `profile_missing:${slug}`, mergedPatch: {} };

  const child = await createChildRun(env, ctx, {
    parentRunId,
    userId,
    workspaceId,
    tenantId,
    conversationId: sessionId,
    sessionId,
    subagentSlug: slug,
    taskType: 'agent',
  });
  const childRunId = child.ok ? child.runId : null;
  emit('agentsam_subagent_run_started', {
    subagent_run_id: childRunId,
    subagent_slug: slug,
    parent_run_id: parentRunId,
    spawnJobId: spawnJobId,
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
  const { buildSystemPrompt, runAgentToolLoop } = await import('../api/agent.js');
  let systemPrompt = 'You are Agent Sam subagent.';
  try {
    systemPrompt = await buildSystemPrompt(env, tenantId, 'agent', '', null, null, {
      request,
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
    loopResult = await runAgentToolLoop(
      env,
      ctx,
      (type, payload) => {
        if (type === 'text' && payload?.text) textChunks.push(String(payload.text));
      },
      {
        request,
        messages: [{ role: 'user', content: buildUserMessage(slug, message, merged) }],
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
      },
    );
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
  const mergedPatch = { ...merged };
  return { ok: true, mergedPatch, outText, slug };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeLaunchSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = session.userId != null ? String(session.userId).trim() : '';
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = session.workspaceId != null ? String(session.workspaceId).trim() : '';
  const sessionId = session.sessionId != null ? String(session.sessionId).trim() : null;
  const pipeline = Array.isArray(skillRoute.pipeline)
    ? skillRoute.pipeline
    : [
        'launch_domain_advisor',
        'launch_website_builder',
        'launch_marketing_writer',
        'launch_logo_gen',
      ];
  const masterSlug = String(skillRoute.master_agent_slug || 'marketing_agency').trim();

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = null;
    let merged = emptyLaunchMergedOutput();
    try {
      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      const parent = await createMultitaskParentRun(env, ctx, {
        userId,
        workspaceId,
        tenantId,
        conversationId: sessionId,
        sessionId,
        mode: 'agent',
        taskType: 'agent',
        trigger: 'launch_skill',
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
        skillId: String(skillRoute.skill_id || 'skill_marketing_agency'),
        parentRunId,
        userId,
        workspaceId,
        tenantId,
        taskDescription: message,
        masterAgentSlug: masterSlug,
        pipeline,
        maxIterations: 1,
        initialMerged: merged,
      });
      spawnJobId = sj.ok ? sj.spawnJobId : null;
      if (!spawnJobId) {
        emit('error', { message: sj.reason || 'spawnJob_failed' });
        emit('done', {});
        return;
      }

      emit('context', {
        agent_run_id: parentRunId,
        skill_id: skillRoute.skill_id,
        spawnJobId: spawnJobId,
        chain_root_id: parentRunId,
      });

      await markAgentRunStarted(env, ctx, {
        runId: parentRunId,
        modelKey: profile?.model_key,
        provider: profile?.selected_provider,
        mode: 'agent',
        taskType: 'agent',
      });

      const runStep = async (slug) => {
        await markSkillSpawnJobRunning(env, spawnJobId, slug);
        const step = await runSkillChildStep(env, ctx, {
          slug,
          message,
          merged,
          profiles,
          parentRunId,
          spawnJobId,
          userId,
          workspaceId,
          tenantId,
          sessionId,
          userPolicy,
          request: input.request,
          buildUserMessage: buildLaunchChildUserMessage,
          emit,
        });
        if (step.ok && step.mergedPatch) {
          patchLaunchMergedFromStep(step.mergedPatch, slug, step.outText || '', message);
          merged = { ...merged, ...step.mergedPatch };
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
        }
        emit('agentsam_subagent_run_result', { subagent_slug: slug, status: step.ok ? 'ok' : 'failed' });
        return step;
      };

      const sequential = ['launch_domain_advisor', 'launch_website_builder'];
      for (const slug of sequential.filter((s) => pipeline.includes(s))) {
        const step = await runStep(slug);
        if (!step.ok) break;
      }

      const parallel = ['launch_marketing_writer', 'launch_logo_gen'].filter((s) => pipeline.includes(s));
      if (parallel.length) {
        await markSkillSpawnJobRunning(env, spawnJobId, parallel.join('+'));
        const results = await Promise.all(parallel.map((slug) => runStep(slug)));
        if (results.some((r) => !r.ok)) {
          emit('error', { message: 'parallel_launch_step_failed' });
        }
      }

      await completeSkillSpawnJob(env, ctx, {
        spawnJobId,
        status: merged.logo_r2_key ? 'completed' : 'partial',
        bestR2Key: merged.logo_r2_key || null,
      });

      await markAgentRunComplete(env, ctx, {
        runId: parentRunId,
        status: 'completed',
        latencyMs: 0,
        modelKey: profile?.model_key,
        mode: 'agent',
        taskType: 'agent',
      });

      emit('text', {
        text:
          `**Launch pipeline complete**\n` +
          `- Domain: \`${merged.chosen_domain || 'n/a'}\`\n` +
          `- Pages: ${(merged.page_ids || []).length}\n` +
          `- Marketing artifacts: ${(merged.content_ids || []).length}\n` +
          (merged.logo_r2_key ? `- Logo: \`${merged.logo_r2_key}\`` : ''),
      });
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

  return new Response(readable, { headers: SKILL_SSE_HEADERS });
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeDeckSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = session.userId != null ? String(session.userId).trim() : '';
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = session.workspaceId != null ? String(session.workspaceId).trim() : '';
  const sessionId = session.sessionId != null ? String(session.sessionId).trim() : null;
  const pauseForApproval = skillRoute.pause_for_approval !== false;
  const masterSlug = String(skillRoute.master_agent_slug || 'brand_aligned_presentations').trim();
  const pipeline = Array.isArray(skillRoute.pipeline)
    ? skillRoute.pipeline
    : ['deck_researcher', 'deck_outline_writer', 'deck_slide_renderer'];

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = skillRoute.spawnJobId ? String(skillRoute.spawnJobId).trim() : null;
    let merged = emptyDeckMergedOutput();
    let resumeMode = skillRoute.resume === true;

    try {
      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      if (skillRoute.resume_mode === 'deck_editor' || (DECK_EDIT_RE.test(message) && !resumeMode)) {
        const completedJob = await findResumableSkillSpawnJob(env, {
          conversationId: sessionId || '',
          workspaceId,
          masterAgentSlug: masterSlug,
          statuses: ['completed', 'partial'],
        });
        if (completedJob?.id) {
          spawnJobId = String(completedJob.id);
          merged = parseSkillMergedOutput(completedJob.merged_output, emptyDeckMergedOutput());
          resumeMode = true;
          skillRoute.resume_phase = 'deck_editor';
        }
      }

      if (resumeMode && spawnJobId) {
        const job = await getSpawnJobRow(env, spawnJobId);
        if (job?.merged_output) {
          merged = parseSkillMergedOutput(job.merged_output, emptyDeckMergedOutput());
        }
        parentRunId = job?.master_run_id ? String(job.master_run_id) : null;
      } else {
        merged.topic = message.replace(/^\/deck\s*/i, '').trim() || message;
        const parent = await createMultitaskParentRun(env, ctx, {
          userId,
          workspaceId,
          tenantId,
          conversationId: sessionId,
          sessionId,
          mode: 'agent',
          taskType: 'agent',
          trigger: 'deck_skill',
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
          skillId: String(skillRoute.skill_id || 'skill_brand_aligned_presentations'),
          parentRunId,
          userId,
          workspaceId,
          tenantId,
          taskDescription: message,
          masterAgentSlug: masterSlug,
          pipeline,
          maxIterations: 1,
          initialMerged: merged,
        });
        spawnJobId = sj.ok ? sj.spawnJobId : null;
      }

      if (!spawnJobId || !parentRunId) {
        emit('error', { message: 'spawnJob_unavailable' });
        emit('done', {});
        return;
      }

      emit('context', {
        agent_run_id: parentRunId,
        skill_id: skillRoute.skill_id,
        spawnJobId: spawnJobId,
        chain_root_id: parentRunId,
        resume: resumeMode,
      });

      await markAgentRunStarted(env, ctx, {
        runId: parentRunId,
        modelKey: profile?.model_key,
        provider: profile?.selected_provider,
        mode: 'agent',
        taskType: 'agent',
      });
      await setSpawnJobStatus(env, spawnJobId, 'running');

      const runStep = async (slug) => {
        await markSkillSpawnJobRunning(env, spawnJobId, slug);
        const step = await runSkillChildStep(env, ctx, {
          slug,
          message,
          merged,
          profiles,
          parentRunId,
          spawnJobId,
          userId,
          workspaceId,
          tenantId,
          sessionId,
          userPolicy,
          request: input.request,
          buildUserMessage: buildDeckChildUserMessage,
          emit,
        });
        if (step.ok && step.mergedPatch) {
          patchDeckMergedFromStep(step.mergedPatch, slug, step.outText || '', message);
          merged = { ...merged, ...step.mergedPatch };
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
        }
        emit('agentsam_subagent_run_result', { subagent_slug: slug, status: step.ok ? 'ok' : 'failed' });
        return step;
      };

      /** @type {string[]} */
      let stepsToRun = [];

      if (skillRoute.resume_phase === 'deck_editor') {
        stepsToRun = ['deck_editor'];
      } else if (resumeMode) {
        const pending = String(merged.pending_approval || '').trim();
        let approved = isApprovalReply(message);
        if (!approved && merged.approval_id) {
          approved = await pollApprovalQueue(env, String(merged.approval_id), 3);
        }
        if (!approved) {
          emit('text', {
            text: `Deck paused at **${pending || merged.phase}** approval. Reply **approve** to continue.`,
          });
          await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
          emit('skill_approval_gate', {
            spawnJobId: spawnJobId,
            phase: pending || merged.phase,
            pending_approval: merged.pending_approval,
          });
          emit('done', {});
          return;
        }
        merged.pending_approval = null;
        if (pending === 'research' || merged.phase === 'research_review') {
          stepsToRun = ['deck_outline_writer'];
        } else if (pending === 'outline' || merged.phase === 'outline_review') {
          stepsToRun = ['deck_slide_renderer'];
        } else {
          stepsToRun = ['deck_slide_renderer'];
        }
      } else {
        stepsToRun = ['deck_researcher'];
      }

      for (const slug of stepsToRun) {
        const step = await runStep(slug);
        if (!step.ok) break;

        if (
          pauseForApproval &&
          (slug === 'deck_researcher' || slug === 'deck_outline_writer') &&
          merged.pending_approval
        ) {
          emit('text', {
            text:
              slug === 'deck_researcher'
                ? `**Research brief ready.** Review below, then reply **approve** to generate the outline.\n\n\`\`\`json\n${JSON.stringify(merged.research_brief, null, 2).slice(0, 6000)}\n\`\`\``
                : `**Deck outline ready.** Reply **approve** to render the PPTX.\n\n\`\`\`json\n${JSON.stringify(merged.deck_spec, null, 2).slice(0, 6000)}\n\`\`\``,
          });
          await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
          emit('skill_approval_gate', {
            spawnJobId: spawnJobId,
            phase: merged.pending_approval,
            research_brief: slug === 'deck_researcher' ? merged.research_brief : undefined,
            deck_spec: slug === 'deck_outline_writer' ? merged.deck_spec : undefined,
          });
          await markAgentRunComplete(env, ctx, {
            runId: parentRunId,
            status: 'partial',
            latencyMs: 0,
            modelKey: profile?.model_key,
            mode: 'agent',
            taskType: 'agent',
          });
          emit('done', {});
          return;
        }
      }

      if (merged.pptx_r2_key || skillRoute.resume_phase === 'deck_editor') {
        await completeSkillSpawnJob(env, ctx, {
          spawnJobId,
          status: merged.pptx_r2_key ? 'completed' : 'partial',
          bestR2Key: merged.pptx_r2_key || null,
        });
      } else if (!merged.pending_approval) {
        await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
      }

      await markAgentRunComplete(env, ctx, {
        runId: parentRunId,
        status: merged.pptx_r2_key ? 'completed' : 'partial',
        latencyMs: 0,
        modelKey: profile?.model_key,
        mode: 'agent',
        taskType: 'agent',
      });

      if (merged.pptx_r2_key) {
        emit('text', {
          text: `**Deck complete** — download key: \`${merged.pptx_r2_key}\``,
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

  return new Response(readable, { headers: SKILL_SSE_HEADERS });
}
