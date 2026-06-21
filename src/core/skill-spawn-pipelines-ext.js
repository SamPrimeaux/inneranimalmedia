/**
 * Extended skill pipelines: /blog, /research, /vto, /dataeng
 */
import {
  completeSkillSpawnJob,
  createMultitaskParentRun,
  createSkillSpawnJob,
  ensureSubagentProfilesAvailable,
  findResumableSkillSpawnJob,
  getSpawnJobRow,
  markAgentRunComplete,
  markAgentRunStarted,
  markSkillSpawnJobRunning,
  parseSkillMergedOutput,
  setSpawnJobMergedOutput,
  setSpawnJobStatus,
} from './subagent-spawn-d1.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import {
  isApprovalReply,
  runSkillChildStep,
  SKILL_SSE_HEADERS,
} from './skill-spawn-orchestrator.js';

const BLOG_EDIT_RE = /\b(revise|rewrite|edit|fix|change|update)\b.{0,40}\b(post|draft|section|intro|conclusion)\b/i;
const DATAENG_TROUBLE_RE = /\b(troubleshoot|debug|failed|failure|error|broken|fix pipeline)\b/i;
const DATAENG_TRANSFORM_RE = /\b(transform|enrich|join|aggregate|cast|pivot)\b/i;

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

function stripSlash(msg, slash) {
  return String(msg || '')
    .replace(new RegExp(`^\\/${slash}\\s*`, 'i'), '')
    .trim();
}

/** @returns {Record<string, unknown>} */
function emptyBlogMerged() {
  return {
    phase: 'plan',
    topic: '',
    outline: '',
    content_item_id: '',
    revision_number: 1,
    pending_approval: null,
    social_content_ids: [],
    r2_key: '',
  };
}

/** @returns {Record<string, unknown>} */
function emptyResearchMerged() {
  return {
    phase: 'plan',
    topic: '',
    plan: null,
    plan_approved: false,
    outline: [],
    sections: [],
    sources: [],
    followups: [],
    search_iterations: 0,
    report_r2_key: '',
    content_item_id: '',
    pending_approval: null,
  };
}

/** @returns {Record<string, unknown>} */
function emptyCommerceMerged() {
  return {
    phase: 'route',
    pipeline: '',
    inputs: {},
    output_r2_keys: [],
    validation_score: 0,
    validation_passed: false,
    retry_count: 0,
  };
}

/** @returns {Record<string, unknown>} */
function emptyDataengMerged() {
  return {
    phase: 'build',
    intent: 'pipeline_builder',
    pipeline_id: '',
    script_id: '',
    run_id: '',
    quality_score: 0,
    quality_passed: false,
    pending_approval: null,
  };
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildBlogChildMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'blog_planner') {
    return `Plan a technical blog post.\n\nTopic: ${merged.topic || base}\n\nReturn markdown outline.`;
  }
  if (slug === 'blog_writer') {
    return (
      `Write the full blog post from this approved outline.\n\n` +
      `${merged.outline || base}\n\nReturn content_items id when saved.`
    );
  }
  if (slug === 'blog_editor') {
    return (
      `Revise the blog draft.\n\nFeedback:\n${base}\n\n` +
      `Content item: ${merged.content_item_id || '(from prior step)'}\n` +
      `Revision: ${merged.revision_number || 1}`
    );
  }
  if (slug === 'blog_social_writer') {
    return `Generate LinkedIn, X, and dev.to teasers for this post.\n\nPost body excerpt:\n${String(merged.outline || base).slice(0, 4000)}`;
  }
  if (slug === 'blog_exporter') {
    return `Export published blog to R2.\n\ncontent_items.id: ${merged.content_item_id || '(from writer)'}`;
  }
  return base;
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildResearchChildMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'research_planner') {
    return `Create a research plan with [RESEARCH] and [DELIVERABLE] goals.\n\nTopic: ${merged.topic || base}`;
  }
  if (slug === 'research_outliner') {
    return `Convert approved plan to report outline.\n\nPlan:\n${JSON.stringify(merged.plan || {}, null, 2).slice(0, 8000)}`;
  }
  if (slug === 'section_researcher') {
    const section = merged._current_section || {};
    return (
      `Research this outline section.\n\n` +
      `${JSON.stringify(section, null, 2)}\n\n` +
      'Return findings JSON with sources.'
    );
  }
  if (slug === 'research_critic') {
    const section = merged._current_section || {};
    return (
      `Critique section research quality.\n\n` +
      `Section: ${JSON.stringify(section)}\n` +
      `Findings: ${JSON.stringify(section.findings || {}, null, 2).slice(0, 4000)}`
    );
  }
  if (slug === 'report_composer') {
    return (
      `Compose final cited markdown report.\n\n` +
      `Outline: ${JSON.stringify(merged.outline || [], null, 2).slice(0, 4000)}\n` +
      `Sections: ${JSON.stringify(merged.sections || [], null, 2).slice(0, 8000)}\n` +
      `Sources: ${JSON.stringify(merged.sources || [], null, 2).slice(0, 4000)}`
    );
  }
  return base;
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildCommerceChildMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'commerce_router') {
    return `Classify commerce media intent and inputs.\n\nRequest: ${base}`;
  }
  if (slug === 'vto_video_gen') {
    return `Generate VTO video framings.\n\nInputs: ${JSON.stringify(merged.inputs || {})}`;
  }
  if (slug === 'product_spin_gen') {
    return `Generate product spin video.\n\nInputs: ${JSON.stringify(merged.inputs || {})}`;
  }
  if (slug === 'catalog_searcher') {
    return `Search product catalog.\n\nQuery: ${merged.topic || base}`;
  }
  if (slug === 'commerce_validator') {
    return (
      `Validate generated commerce media.\n\n` +
      `Pipeline: ${merged.pipeline}\n` +
      `Outputs: ${JSON.stringify(merged.output_r2_keys || [])}`
    );
  }
  return base;
}

/**
 * @param {string} slug
 * @param {string} task
 * @param {Record<string, unknown>} merged
 */
function buildDataengChildMessage(slug, task, merged) {
  const base = String(task || '').trim();
  if (slug === 'dataeng_pipeline_builder') {
    return `Design a data pipeline.\n\nRequest: ${base}`;
  }
  if (slug === 'dataeng_troubleshooter') {
    return `Troubleshoot pipeline failure.\n\nContext: ${base}\nPipeline: ${merged.pipeline_id || 'unknown'}`;
  }
  if (slug === 'dataeng_transformer') {
    return `Design SQL/JS transformation.\n\nRequest: ${base}`;
  }
  if (slug === 'dataeng_quality_checker') {
    return `Run data quality checks after transformation.\n\nRun: ${merged.run_id || merged.pipeline_id || 'latest'}`;
  }
  return base;
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} p
 */
async function initSkillRun(env, ctx, p) {
  const profilesRes = await ensureSubagentProfilesAvailable(env, p.scope);
  const profiles = profilesRes.profiles || [];
  const userPolicy =
    p.userPolicy ||
    (p.userId && p.workspaceId ? await loadAgentSamUserPolicy(env, p.userId, p.workspaceId) : null);

  const parent = await createMultitaskParentRun(env, ctx, {
    userId: p.userId,
    workspaceId: p.workspaceId,
    tenantId: p.tenantId,
    conversationId: p.sessionId,
    sessionId: p.sessionId,
    mode: 'agent',
    taskType: 'agent',
    trigger: p.trigger,
    routingArmId: p.profile?.routing_arm_id,
    modelKey: p.profile?.model_key,
    provider: p.profile?.selected_provider,
  });
  if (!parent.ok || !parent.runId) {
    return { ok: false, reason: parent.reason || 'parent_run_failed' };
  }

  const sj = await createSkillSpawnJob(env, ctx, {
    skillId: p.skillId,
    parentRunId: parent.runId,
    userId: p.userId,
    workspaceId: p.workspaceId,
    tenantId: p.tenantId,
    taskDescription: p.message,
    masterAgentSlug: p.masterSlug,
    pipeline: p.pipeline,
    maxIterations: p.maxIterations || 3,
    initialMerged: p.initialMerged,
  });
  if (!sj.ok || !sj.spawnJobId) {
    return { ok: false, reason: sj.reason || 'spawnJob_failed' };
  }

  await markAgentRunStarted(env, ctx, {
    runId: parent.runId,
    modelKey: p.profile?.model_key,
    provider: p.profile?.selected_provider,
    mode: 'agent',
    taskType: 'agent',
  });

  return {
    ok: true,
    parentRunId: parent.runId,
    spawnJobId: sj.spawnJobId,
    profiles,
    userPolicy,
  };
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 */
export async function executeBlogSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = String(session.userId || '').trim();
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = String(session.workspaceId || '').trim();
  const sessionId = String(session.sessionId || '').trim();
  const pauseOutline = skillRoute.pause_for_outline_approval !== false;
  const masterSlug = 'blogger_agent';

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = skillRoute.spawnJobId ? String(skillRoute.spawnJobId) : null;
    let merged = emptyBlogMerged();
    const resume = skillRoute.resume === true;

    try {
      if (resume && spawnJobId) {
        const job = await getSpawnJobRow(env, spawnJobId);
        merged = parseSkillMergedOutput(job?.merged_output, emptyBlogMerged());
        parentRunId = job?.master_run_id ? String(job.master_run_id) : null;
      } else {
        merged.topic = stripSlash(message, 'blog');
        const init = await initSkillRun(env, ctx, {
          profile,
          message,
          userId,
          workspaceId,
          tenantId,
          sessionId,
          skillId: String(skillRoute.skill_id || 'skill_blogger_agent'),
          masterSlug,
          pipeline: skillRoute.pipeline || [
            'blog_planner',
            'blog_writer',
            'blog_social_writer',
            'blog_exporter',
          ],
          maxIterations: skillRoute.max_write_iterations || 3,
          initialMerged: merged,
          trigger: 'blog_skill',
          scope: { userId, workspaceId, tenantId },
        });
        if (!init.ok) {
          emit('error', { message: init.reason });
          emit('done', {});
          return;
        }
        parentRunId = init.parentRunId;
        spawnJobId = init.spawnJobId;
      }

      emit('context', { agent_run_id: parentRunId, spawnJobId, skill_id: skillRoute.skill_id });

      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

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
          buildUserMessage: buildBlogChildMessage,
          emit,
        });
        if (step.ok) {
          const out = step.outText || '';
          if (slug === 'blog_planner') {
            merged.outline = out.slice(0, 12000);
            merged.pending_approval = 'outline';
            merged.phase = 'outline_review';
          }
          if (slug === 'blog_writer') {
            const parsed = extractJsonObject(out) || {};
            merged.content_item_id = String(parsed.content_item_id || parsed.id || merged.content_item_id || '').trim();
            merged.phase = 'draft_review';
          }
          if (slug === 'blog_editor') {
            merged.revision_number = Math.max(1, Number(merged.revision_number) || 1) + 1;
          }
          if (slug === 'blog_social_writer') {
            const ids = extractJsonArray(out) || extractJsonObject(out)?.content_ids;
            if (Array.isArray(ids)) merged.social_content_ids = ids;
          }
          if (slug === 'blog_exporter') {
            const parsed = extractJsonObject(out) || {};
            merged.r2_key =
              String(parsed.r2_key || parsed.r2Key || '').trim() ||
              (out.match(/content\/[^\s"'`]+\.md/i) || [])[0] ||
              '';
            merged.phase = 'completed';
          }
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
        }
        return step;
      };

      /** @type {string[]} */
      let steps = [];
      if (skillRoute.resume_mode === 'blog_editor' || BLOG_EDIT_RE.test(message)) {
        steps = ['blog_editor'];
      } else if (resume) {
        if (!isApprovalReply(message)) {
          emit('text', { text: 'Reply **approve** to continue the blog pipeline.' });
          emit('done', {});
          return;
        }
        merged.pending_approval = null;
        if (merged.phase === 'outline_review') steps = ['blog_writer'];
        else if (merged.phase === 'draft_review') steps = ['blog_social_writer', 'blog_exporter'];
        else steps = ['blog_exporter'];
      } else {
        steps = ['blog_planner'];
      }

      for (const slug of steps) {
        const step = await runStep(slug);
        if (!step.ok) break;
        if (
          pauseOutline &&
          slug === 'blog_planner' &&
          merged.pending_approval === 'outline' &&
          !resume
        ) {
          emit('text', {
            text: `**Blog outline ready.** Reply **approve** to write the draft.\n\n${String(merged.outline || '').slice(0, 6000)}`,
          });
          await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
          emit('skill_approval_gate', { spawnJobId, phase: 'outline' });
          emit('done', {});
          return;
        }
        if (slug === 'blog_writer' && pauseOutline) {
          emit('text', { text: '**Draft ready.** Reply **approve** to generate social copy and export.' });
          await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
          emit('skill_approval_gate', { spawnJobId, phase: 'draft' });
          emit('done', {});
          return;
        }
      }

      if (merged.r2_key || merged.phase === 'completed') {
        await completeSkillSpawnJob(env, ctx, {
          spawnJobId,
          status: 'completed',
          bestR2Key: merged.r2_key || null,
        });
      }

      await markAgentRunComplete(env, ctx, {
        runId: parentRunId,
        status: merged.r2_key ? 'completed' : 'partial',
        latencyMs: 0,
        modelKey: profile?.model_key,
        mode: 'agent',
        taskType: 'agent',
      });

      emit('text', {
        text: merged.r2_key
          ? `**Blog published** — \`${merged.r2_key}\``
          : `**Blog pipeline paused** — phase \`${merged.phase}\``,
      });
      emit('done', {});
    } catch (e) {
      emit('error', { message: e?.message ?? String(e) });
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
export async function executeResearchSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = String(session.userId || '').trim();
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = String(session.workspaceId || '').trim();
  const sessionId = String(session.sessionId || '').trim();
  const maxSearchIter = Math.max(1, Number(skillRoute.max_search_iterations) || 5);
  const masterSlug = 'deep_search';

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = skillRoute.spawnJobId ? String(skillRoute.spawnJobId) : null;
    let merged = emptyResearchMerged();
    const resume = skillRoute.resume === true;

    try {
      if (resume && spawnJobId) {
        const job = await getSpawnJobRow(env, spawnJobId);
        merged = parseSkillMergedOutput(job?.merged_output, emptyResearchMerged());
        parentRunId = job?.master_run_id ? String(job.master_run_id) : null;
      } else {
        merged.topic = stripSlash(message, 'research');
        const init = await initSkillRun(env, ctx, {
          profile,
          message,
          userId,
          workspaceId,
          tenantId,
          sessionId,
          skillId: String(skillRoute.skill_id || 'skill_deep_search'),
          masterSlug,
          pipeline: skillRoute.pipeline || [
            'research_planner',
            'research_outliner',
            'section_researcher',
            'research_critic',
            'report_composer',
          ],
          maxIterations: maxSearchIter,
          initialMerged: merged,
          trigger: 'research_skill',
          scope: { userId, workspaceId, tenantId },
        });
        if (!init.ok) {
          emit('error', { message: init.reason });
          emit('done', {});
          return;
        }
        parentRunId = init.parentRunId;
        spawnJobId = init.spawnJobId;
      }

      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      const runStep = async (slug, extra = {}) => {
        await markSkillSpawnJobRunning(env, spawnJobId, slug);
        const step = await runSkillChildStep(env, ctx, {
          slug,
          message,
          merged: { ...merged, ...extra },
          profiles,
          parentRunId,
          spawnJobId,
          userId,
          workspaceId,
          tenantId,
          sessionId,
          userPolicy,
          request: input.request,
          buildUserMessage: buildResearchChildMessage,
          emit,
        });
        return step;
      };

      /** @type {string[]} */
      let steps = [];
      if (resume) {
        if (!isApprovalReply(message) && !merged.plan_approved) {
          emit('text', { text: 'Reply **approve** to start Phase 2 research.' });
          emit('done', {});
          return;
        }
        merged.plan_approved = true;
        merged.pending_approval = null;
        steps = ['research_outliner'];
      } else {
        steps = ['research_planner'];
      }

      for (const slug of steps) {
        const step = await runStep(slug);
        if (!step.ok) break;
        const out = step.outText || '';
        if (slug === 'research_planner') {
          merged.plan = extractJsonObject(out) || { goals: out.slice(0, 8000) };
          merged.pending_approval = 'plan';
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
          emit('text', {
            text: `**Research plan ready.** Reply **approve** to begin execution.\n\n\`\`\`json\n${JSON.stringify(merged.plan, null, 2).slice(0, 6000)}\n\`\`\``,
          });
          await setSpawnJobStatus(env, spawnJobId, 'awaiting_approval');
          emit('skill_approval_gate', { spawnJobId, phase: 'plan' });
          emit('done', {});
          return;
        }
        if (slug === 'research_outliner') {
          merged.outline = extractJsonArray(out) || extractJsonObject(out)?.sections || [];
          merged.phase = 'research';
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
        }
      }

      const outline = Array.isArray(merged.outline) ? merged.outline : [];
      /** @type {Array<Record<string, unknown>>} */
      const sections = [];
      for (let i = 0; i < outline.length; i += 1) {
        const section = typeof outline[i] === 'object' ? { ...outline[i], idx: i } : { title: String(outline[i]), idx: i };
        merged._current_section = section;
        const researchStep = await runStep('section_researcher', { _current_section: section });
        if (!researchStep.ok) continue;
        const findings = extractJsonObject(researchStep.outText || '') || { summary: researchStep.outText };
        section.findings = findings;
        if (Array.isArray(findings.sources)) {
          merged.sources = [...(merged.sources || []), ...findings.sources];
        }
        const criticStep = await runStep('research_critic', { _current_section: section });
        const critique = extractJsonObject(criticStep.outText || '') || {};
        section.passed = critique.passed !== false;
        if (critique.needs_retry) {
          merged.search_iterations = Math.max(0, Number(merged.search_iterations) || 0) + 1;
          merged.followups = [...(merged.followups || []), ...(critique.followups || [])];
        }
        sections.push(section);
        if (Number(merged.search_iterations) >= maxSearchIter) break;
      }
      merged.sections = sections;
      await setSpawnJobMergedOutput(env, spawnJobId, merged);

      const compose = await runStep('report_composer');
      if (compose.ok) {
        const parsed = extractJsonObject(compose.outText || '') || {};
        merged.report_r2_key =
          String(parsed.report_r2_key || parsed.r2_key || '').trim() ||
          (compose.outText.match(/reports\/[^\s"'`]+\.md/i) || [])[0] ||
          '';
        merged.content_item_id = String(parsed.content_item_id || parsed.id || '').trim();
        merged.phase = 'completed';
        await setSpawnJobMergedOutput(env, spawnJobId, merged);
        await completeSkillSpawnJob(env, ctx, {
          spawnJobId,
          status: 'completed',
          bestR2Key: merged.report_r2_key || null,
        });
      }

      await markAgentRunComplete(env, ctx, {
        runId: parentRunId,
        status: merged.report_r2_key ? 'completed' : 'partial',
        latencyMs: 0,
        modelKey: profile?.model_key,
        mode: 'agent',
        taskType: 'agent',
      });

      emit('text', {
        text: merged.report_r2_key
          ? `**Research report complete** — \`${merged.report_r2_key}\` (${(merged.sources || []).length} sources)`
          : '**Research pipeline finished** (partial output).',
      });
      emit('done', {});
    } catch (e) {
      emit('error', { message: e?.message ?? String(e) });
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
export async function executeCommerceSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = String(session.userId || '').trim();
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = String(session.workspaceId || '').trim();
  const sessionId = String(session.sessionId || '').trim();
  const maxRetries = Math.max(1, Number(skillRoute.max_validation_retries) || 3);
  const masterSlug = 'genmedia_commerce';

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = null;
    let merged = emptyCommerceMerged();
    merged.topic = stripSlash(message, 'vto');

    try {
      const init = await initSkillRun(env, ctx, {
        profile,
        message,
        userId,
        workspaceId,
        tenantId,
        sessionId,
        skillId: String(skillRoute.skill_id || 'skill_genmedia_commerce'),
        masterSlug,
        pipeline: skillRoute.pipeline || [
          'commerce_router',
          'vto_video_gen',
          'product_spin_gen',
          'commerce_validator',
          'catalog_searcher',
        ],
        maxIterations: maxRetries,
        initialMerged: merged,
        trigger: 'commerce_skill',
        scope: { userId, workspaceId, tenantId },
      });
      if (!init.ok) {
        emit('error', { message: init.reason });
        emit('done', {});
        return;
      }
      parentRunId = init.parentRunId;
      spawnJobId = init.spawnJobId;

      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      const runStep = async (slug) => {
        await markSkillSpawnJobRunning(env, spawnJobId, slug);
        return runSkillChildStep(env, ctx, {
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
          buildUserMessage: buildCommerceChildMessage,
          emit,
        });
      };

      const routeStep = await runStep('commerce_router');
      if (routeStep.ok) {
        const parsed = extractJsonObject(routeStep.outText || '') || {};
        merged.pipeline = String(parsed.pipeline || parsed.intent || 'catalog_search').trim();
        merged.inputs = parsed.inputs && typeof parsed.inputs === 'object' ? parsed.inputs : {};
        await setSpawnJobMergedOutput(env, spawnJobId, merged);
      }

      const pipeline = String(merged.pipeline || 'catalog_search').trim();
      /** @type {string[]} */
      let genSlugs = [];
      if (pipeline === 'catalog_search') genSlugs = ['catalog_searcher'];
      else if (pipeline === 'product_spin') genSlugs = ['product_spin_gen'];
      else genSlugs = ['vto_video_gen'];

      for (const slug of genSlugs) {
        const step = await runStep(slug);
        if (!step.ok) break;
        const parsed = extractJsonObject(step.outText || '') || {};
        const keys = parsed.output_r2_keys || parsed.r2_keys || parsed.r2_key;
        if (Array.isArray(keys)) merged.output_r2_keys = keys;
        else if (keys) merged.output_r2_keys = [String(keys)];
        await setSpawnJobMergedOutput(env, spawnJobId, merged);
      }

      if (genSlugs[0] !== 'catalog_searcher') {
        let passed = false;
        while (Number(merged.retry_count) < maxRetries && !passed) {
          const val = await runStep('commerce_validator');
          const parsed = extractJsonObject(val.outText || '') || {};
          merged.validation_passed = parsed.passed === true;
          merged.validation_score = Number(parsed.score) || 0;
          passed = merged.validation_passed;
          if (!passed) {
            merged.retry_count = Math.max(0, Number(merged.retry_count) || 0) + 1;
            merged.last_failure = String(parsed.reason || parsed.feedback || '').trim();
            for (const slug of genSlugs) {
              await runStep(slug);
            }
          }
          await setSpawnJobMergedOutput(env, spawnJobId, merged);
        }
      }

      await completeSkillSpawnJob(env, ctx, {
        spawnJobId,
        status: merged.validation_passed || genSlugs[0] === 'catalog_searcher' ? 'completed' : 'partial',
        bestR2Key: (merged.output_r2_keys || [])[0] || null,
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
          genSlugs[0] === 'catalog_searcher'
            ? `**Catalog search complete** — see tool output for matches.`
            : `**Commerce media complete** — outputs: ${JSON.stringify(merged.output_r2_keys || [])}`,
      });
      emit('done', {});
    } catch (e) {
      emit('error', { message: e?.message ?? String(e) });
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
export async function executeDataengSkillSpawn(env, ctx, input) {
  const profile = input.profile;
  const message = String(input.message || '').trim();
  const skillRoute = input.skillRoute || {};
  const session = input.session || {};
  const userId = String(session.userId || '').trim();
  const tenantId = session.tenantId != null ? String(session.tenantId).trim() : null;
  const workspaceId = String(session.workspaceId || '').trim();
  const sessionId = String(session.sessionId || '').trim();
  const masterSlug = 'data_engineering';

  let intent = 'dataeng_pipeline_builder';
  if (DATAENG_TROUBLE_RE.test(message)) intent = 'dataeng_troubleshooter';
  else if (DATAENG_TRANSFORM_RE.test(message)) intent = 'dataeng_transformer';

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, data) => {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`)).catch(() => {});
  };

  void (async () => {
    let parentRunId = null;
    let spawnJobId = null;
    let merged = emptyDataengMerged();
    merged.intent = intent;
    merged.topic = stripSlash(message, 'dataeng');

    try {
      const init = await initSkillRun(env, ctx, {
        profile,
        message,
        userId,
        workspaceId,
        tenantId,
        sessionId,
        skillId: String(skillRoute.skill_id || 'skill_data_engineering'),
        masterSlug,
        pipeline: [intent, 'dataeng_quality_checker'],
        maxIterations: 1,
        initialMerged: merged,
        trigger: 'dataeng_skill',
        scope: { userId, workspaceId, tenantId },
      });
      if (!init.ok) {
        emit('error', { message: init.reason });
        emit('done', {});
        return;
      }
      parentRunId = init.parentRunId;
      spawnJobId = init.spawnJobId;

      const profilesRes = await ensureSubagentProfilesAvailable(env, { userId, workspaceId, tenantId });
      const profiles = profilesRes.profiles || [];
      const userPolicy =
        input.userPolicy || (userId && workspaceId ? await loadAgentSamUserPolicy(env, userId, workspaceId) : null);

      for (const slug of [intent, 'dataeng_quality_checker']) {
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
          buildUserMessage: buildDataengChildMessage,
          emit,
        });
        if (!step.ok) break;
        const parsed = extractJsonObject(step.outText || '') || {};
        if (parsed.pipeline_id) merged.pipeline_id = String(parsed.pipeline_id);
        if (parsed.script_id) merged.script_id = String(parsed.script_id);
        if (parsed.run_id) merged.run_id = String(parsed.run_id);
        if (slug === 'dataeng_quality_checker') {
          merged.quality_score = Number(parsed.quality_score || parsed.score) || 0;
          merged.quality_passed = parsed.passed === true || merged.quality_score >= 70;
        }
        await setSpawnJobMergedOutput(env, spawnJobId, merged);
      }

      await completeSkillSpawnJob(env, ctx, {
        spawnJobId,
        status: merged.quality_passed !== false ? 'completed' : 'partial',
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
          `**Data engineering run complete** — intent \`${intent}\`, ` +
          `quality ${merged.quality_passed ? 'PASS' : 'REVIEW'} (${merged.quality_score || 0})`,
      });
      emit('done', {});
    } catch (e) {
      emit('error', { message: e?.message ?? String(e) });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SKILL_SSE_HEADERS });
}

/** @type {Record<string, (env: any, ctx: any, input: any) => Promise<Response>>} */
const SKILL_EXECUTORS = {
  skill_blogger_agent: executeBlogSkillSpawn,
  skill_deep_search: executeResearchSkillSpawn,
  skill_genmedia_commerce: executeCommerceSkillSpawn,
  skill_data_engineering: executeDataengSkillSpawn,
  blogger_agent: executeBlogSkillSpawn,
  deep_search: executeResearchSkillSpawn,
  genmedia_commerce: executeCommerceSkillSpawn,
  data_engineering: executeDataengSkillSpawn,
};

/**
 * @param {any} env
 * @param {any} ctx
 * @param {any} input
 * @returns {Promise<Response|null>}
 */
export async function executeSkillSpawnByRoute(env, ctx, input) {
  const skillRoute = input.skillRoute || {};
  const key =
    String(skillRoute.skill_id || skillRoute.skillId || '').trim() ||
    String(skillRoute.master_agent_slug || '').trim();
  const fn = SKILL_EXECUTORS[key];
  if (fn) return fn(env, ctx, input);
  return null;
}

/**
 * @param {any} env
 * @param {string} sessionId
 * @param {string} workspaceId
 * @param {string} message
 */
export async function resolveExtendedSkillResume(env, sessionId, workspaceId, message) {
  if (!env?.DB || !sessionId || !workspaceId) return null;
  if (BLOG_EDIT_RE.test(message)) {
    const job = await findResumableSkillSpawnJob(env, {
      conversationId: sessionId,
      workspaceId,
      masterAgentSlug: 'blogger_agent',
      statuses: ['awaiting_approval', 'partial', 'completed'],
    });
    if (job?.id) {
      return { skill_id: 'skill_blogger_agent', resume: true, resume_mode: 'blog_editor', spawnJobId: job.id };
    }
  }
  if (isApprovalReply(message)) {
    for (const slug of ['blogger_agent', 'deep_search', 'brand_aligned_presentations']) {
      const job = await findResumableSkillSpawnJob(env, {
        conversationId: sessionId,
        workspaceId,
        masterAgentSlug: slug,
        statuses: ['awaiting_approval'],
      });
      if (job?.id) {
        const skillId =
          slug === 'blogger_agent'
            ? 'skill_blogger_agent'
            : slug === 'deep_search'
              ? 'skill_deep_search'
              : 'skill_brand_aligned_presentations';
        return { skill_id: skillId, resume: true, spawnJobId: job.id };
      }
    }
  }
  return null;
}
