import { jsonResponse } from '../responses.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';
import { executeRwsSpawnFanout, shouldRunRwsFanout } from '../rws-spawn-fanout.js';
import { hydrateSkillRowFromR2 } from '../agentsam-skill-r2.js';
import {
  formatPlanIntakeQuestionsForUi,
  generatePlanIntakeQuestions,
  insertPlanIntakeBatch,
  newPlanIntakeBatchId,
  runPlanIntakeExplore,
  supersedePendingBatchesForSession,
} from '../agentsam-plan-intake.js';
import { scheduleMirrorAgentsamPlanEmbeddingToSupabase } from '../agentsam-plan-supabase-public-sync.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

const PLAN_SKILL_ID = 'skill_plan_and_execute';

/**
 * @param {any} env
 */
async function loadPlanModeSkillMarkdown(env) {
  if (!env?.DB) return { markdown: '', skill_ids: [] };
  try {
    const row = await env.DB.prepare(
      `SELECT id, name, content_markdown, retrieval_strategy, file_path, metadata_json
       FROM agentsam_skill WHERE id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(PLAN_SKILL_ID)
      .first();
    if (!row?.id) return { markdown: '', skill_ids: [] };
    const hydrated = await hydrateSkillRowFromR2(env, row);
    const md = String(hydrated?.content_markdown || '').trim();
    return { markdown: md, skill_ids: [String(row.id)] };
  } catch (e) {
    console.warn('[plan-controller] skill_load_failed', e?.message ?? e);
    return { markdown: '', skill_ids: [] };
  }
}

/**
 * @param {{ plan_title?: string, tasks?: Array<{ title?: string }>, goal?: string }} plan
 * @param {string} goal
 */
function buildPlanSummaryText(plan, goal) {
  const title = String(plan?.plan_title || '').trim();
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const taskHint = tasks
    .slice(0, 3)
    .map((t) => String(t?.title || '').trim())
    .filter(Boolean)
    .join('; ');
  if (title && taskHint) return `${title} — ${taskHint}${tasks.length > 3 ? '…' : ''}`;
  if (title) return title;
  return String(goal || 'Plan').slice(0, 240);
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {(type: string, payload: Record<string, unknown>) => void} emit
 * @param {{
 *   message: string,
 *   userId: string|null,
 *   tenantId: string|null,
 *   workspaceId: string|null,
 *   sessionId: string|null,
 *   planningSkillMarkdown: string,
 * }} input
 */
async function runPlanCreationPipeline(env, ctx, emit, input) {
  const { createPlan, startAgentChatPlanWorkflowRun } = await import('../agentsam-planner.js');

  const wfBoot = await startAgentChatPlanWorkflowRun(env, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    sessionId: input.sessionId,
    goal: input.message,
  });

  const plan = await createPlan(env, {
    goal: input.message,
    userId: input.userId,
    workspaceId: input.workspaceId,
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    workflowRunId: wfBoot.workflowRunId,
    ctx,
    planningSkillMarkdown: input.planningSkillMarkdown,
  });

  const planId = plan.plan_id;
  const r2Url = plan.plan_markdown?.public_url ? String(plan.plan_markdown.public_url).trim() : '';
  const filename = `plan-${planId}.md`;

  if (r2Url) {
    emit('monaco_file_generated', {
      type: 'monaco_file_generated',
      surface: 'monaco',
      plan_id: planId,
      filename,
      path: `plans/${filename}`,
      language: 'markdown',
      r2_url: r2Url,
    });
  }

  const summary = buildPlanSummaryText(plan, input.message);
  scheduleMirrorAgentsamPlanEmbeddingToSupabase(env, ctx, {
    planId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    title: plan.plan_title,
    summary,
    r2Url,
  });

  emit('plan_created', {
    plan_id: planId,
    plan_title: plan.plan_title,
    workflow_run_id: plan.workflow_run_id,
    task_count: plan.tasks.length,
    auto_execute: false,
    summary,
    plan_markdown: plan.plan_markdown ?? null,
  });

  emit('text', {
    text: `**${plan.plan_title || 'Plan'}** — ${summary}. Edit the plan in the editor, then use **Run plan** when ready.`,
  });
}

/**
 * Plan controller
 * - execution_kind: plan_pipeline
 * - explore → optional Questions batch → createPlan (via intake submit)
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ request?: Request, message: string, profile: import('../runtime-profile.types.js').RuntimeProfile, session?: any, modelOverride?: string|null }} input
 */
export async function executePlanTurn(env, ctx, input) {
  const profile = input.profile;
  const body = /** @type {Record<string, unknown>} */ (input.body || {});
  const refinePlanId = String(body.plan_id ?? body.planId ?? '').trim();
  const isRefine = body.refine_plan === true || body.refinePlan === true;
  if (profile.execution_kind !== 'plan_pipeline') {
    return jsonResponse(
      { error: 'plan_controller_execution_kind_mismatch', execution_kind: profile.execution_kind },
      400,
    );
  }
  if (shouldRunRwsFanout(profile)) {
    return executeRwsSpawnFanout(env, ctx, input);
  }

  const message = String(input.message || '');
  if (isRefine && refinePlanId && message) {
    const session = input.session || {};
    const userId = session.userId != null ? String(session.userId) : null;
    const tenantId = session.tenantId != null ? String(session.tenantId) : null;
    const workspaceId = session.workspaceId != null ? String(session.workspaceId) : null;
    const sessionId = session.sessionId != null ? String(session.sessionId) : null;
    const skillLoad = await loadPlanModeSkillMarkdown(env);
    const { startPlanRefineSseResponse } = await import('../plan-refine-stream.js');
    return startPlanRefineSseResponse(env, ctx, {
      planId: refinePlanId,
      refinement: message,
      userId,
      tenantId,
      workspaceId,
      sessionId,
      planningSkillMarkdown: skillLoad.markdown,
    });
  }

  const session = input.session || {};
  const userId = session.userId != null ? String(session.userId) : null;
  const tenantId = session.tenantId != null ? String(session.tenantId) : null;
  const workspaceId = session.workspaceId != null ? String(session.workspaceId) : null;
  const sessionId = session.sessionId != null ? String(session.sessionId) : null;

  const encoder = new TextEncoder();
  const { readable: planReadable, writable: planWritable } = new TransformStream();
  const planWriter = planWritable.getWriter();
  const emit = (type, payload) => {
    try {
      planWriter.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  emit('runtime_context', runtimeContextPayload(profile, { modelOverride: input.modelOverride ?? null }));
  emit('context', legacyContextPayload(profile, { toolsCount: 0, modelOverride: input.modelOverride ?? null }));

  (async () => {
    try {
      const skillLoad = await loadPlanModeSkillMarkdown(env);
      if (skillLoad.skill_ids.length) {
        emit('skills_loaded', {
          skill_ids: skillLoad.skill_ids,
          route_key: 'plan',
          task_type: 'plan_pipeline',
        });
      }

      emit('plan_explore_start', { message: 'Exploring codebase and context…' });
      emit('plan_thinking', { message: 'Exploring codebase and context…' });

      const explore = await runPlanIntakeExplore(env, {
        goal: message,
        workspaceId: workspaceId || '',
        intent: 'mixed',
      });

      for (const step of explore.steps || []) {
        emit('plan_explore_step', {
          kind: step.kind || 'file',
          label: step.label || '',
          lane: step.lane || null,
        });
      }

      emit('plan_explore_progress', {
        files_searched: explore.files_searched,
        searches: explore.searches,
        synthesis: explore.synthesis,
        message: explore.synthesis,
        findings: (explore.findings || []).slice(0, 8).map((f) => ({
          path: f.path,
          title: f.title,
          lane: f.lane,
        })),
      });

      const intake = await generatePlanIntakeQuestions(env, {
        goal: message,
        explore,
        phase: 'pre_plan',
        userId,
        workspaceId,
      });

      if (intake.needs_questions) {
        await supersedePendingBatchesForSession(env, { workspaceId, sessionId });
        const batchId = newPlanIntakeBatchId();
        const questionsUi = formatPlanIntakeQuestionsForUi(intake.questions);

        await insertPlanIntakeBatch(env, {
          id: batchId,
          tenant_id: tenantId || env?.TENANT_ID || '',
          workspace_id: workspaceId || '',
          user_id: userId,
          session_id: sessionId,
          phase: 'pre_plan',
          status: 'pending',
          goal_text: message,
          explore_summary_json: JSON.stringify({ ...explore, synthesis: intake.synthesis }),
          questions_json: JSON.stringify(intake.questions),
        });

        emit('plan_questions_batch', {
          batch_id: batchId,
          phase: 'pre_plan',
          explore_summary: {
            synthesis: intake.synthesis || explore.synthesis,
            files_searched: explore.files_searched,
            searches: explore.searches,
          },
          questions: questionsUi,
          allow_skip: true,
        });
        emit('done', {});
        return;
      }

      emit('plan_thinking', { message: 'Creating plan…' });
      await runPlanCreationPipeline(env, ctx, emit, {
        message,
        userId,
        tenantId,
        workspaceId,
        sessionId,
        planningSkillMarkdown: skillLoad.markdown,
      });
      emit('done', {});
    } catch (e) {
      emit('text', { text: `**Plan error:** ${e?.message ?? String(e)}` });
      emit('done', {});
    } finally {
      planWriter.close().catch(() => {});
    }
  })();

  return new Response(planReadable, { headers: SSE_HEADERS });
}
