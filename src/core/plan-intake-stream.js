/**
 * POST /api/agent/plan/intake/submit — resume planning after Questions card Continue/Skip.
 */

import {
  buildEnrichedGoalFromIntakeBatch,
  getPlanIntakeBatch,
  submitPlanIntakeBatch,
} from './agentsam-plan-intake.js';
import { scheduleMirrorAgentsamPlanEmbeddingToSupabase } from './agentsam-plan-supabase-public-sync.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

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
 * @param {{
 *   batchId: string,
 *   selections?: Record<string, string>,
 *   optionalDetails?: string,
 *   skip?: boolean,
 *   userId?: string|null,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   sessionId?: string|null,
 * }} input
 */
export async function startPlanIntakeSubmitSseResponse(env, ctx, input) {
  const batchId = String(input.batchId || '').trim();
  const submitted = await submitPlanIntakeBatch(env, batchId, {
    selections: input.selections,
    optionalDetails: input.optionalDetails,
    skipped: input.skip === true,
  });

  // quickstart_intake batches (Quickstart-card first turn) don't produce a Plan — resume
  // the original agent/ask/debug turn with the enriched goal and stream that back directly.
  if (submitted.ok && String(submitted.batch.phase || '') === 'quickstart_intake') {
    return resumeQuickstartIntakeTurn(env, ctx, { batch: submitted.batch, input });
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  (async () => {
    try {
      if (!submitted.ok) {
        emit('text', { text: `**Plan intake error:** ${submitted.error}` });
        emit('done', {});
        return;
      }

      const batch = submitted.batch;
      const goal = buildEnrichedGoalFromIntakeBatch(batch);
      const tenantId = input.tenantId != null ? String(input.tenantId) : String(batch.tenant_id || '');
      const workspaceId =
        input.workspaceId != null ? String(input.workspaceId) : String(batch.workspace_id || '');
      const userId = input.userId != null ? String(input.userId) : String(batch.user_id || '');
      const sessionId = input.sessionId != null ? String(input.sessionId) : String(batch.session_id || '');

      emit('plan_thinking', { message: 'Creating plan from your answers…' });

      const { createPlan, startAgentChatPlanWorkflowRun } = await import('./agentsam-planner.js');
      const wfBoot = await startAgentChatPlanWorkflowRun(env, {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        goal,
      });

      const plan = await createPlan(env, {
        goal,
        userId,
        workspaceId,
        tenantId,
        sessionId,
        workflowRunId: wfBoot.workflowRunId,
        ctx,
        planningSkillMarkdown: '',
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

      const summary = buildPlanSummaryText(plan, goal);
      scheduleMirrorAgentsamPlanEmbeddingToSupabase(env, ctx, {
        planId,
        tenantId,
        workspaceId,
        title: plan.plan_title,
        summary,
        r2Url,
      });

      if (env?.DB && batchId) {
        await env.DB.prepare(`UPDATE agentsam_plan_intake_batches SET plan_id = ? WHERE id = ?`)
          .bind(planId, batchId)
          .run()
          .catch(() => {});
      }

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
      emit('done', {});
    } catch (e) {
      emit('text', { text: `**Plan error:** ${e?.message ?? String(e)}` });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

/**
 * Emit a roadblock question batch mid-plan (called from executor when blocked).
 * @param {any} env
 * @param {any} ctx
 * @param {(type: string, payload: Record<string, unknown>) => void} emit
 * @param {{
 *   planId: string,
 *   workflowRunId?: string|null,
 *   tenantId: string,
 *   workspaceId: string,
 *   userId?: string|null,
 *   sessionId?: string|null,
 *   goal: string,
 *   roadblock: Record<string, unknown>,
 * }} opts
 */
export async function emitPlanRoadblockQuestions(env, ctx, emit, opts) {
  const {
    generatePlanIntakeQuestions,
    formatPlanIntakeQuestionsForUi,
    insertPlanIntakeBatch,
    runPlanIntakeExplore,
    supersedePendingBatchesForSession,
  } = await import('./agentsam-plan-intake.js');

  await supersedePendingBatchesForSession(env, {
    workspaceId: opts.workspaceId,
    sessionId: opts.sessionId,
  });

  const explore = await runPlanIntakeExplore(env, {
    goal: opts.goal,
    workspaceId: opts.workspaceId,
    intent: 'mixed',
  });

  const intake = await generatePlanIntakeQuestions(env, {
    goal: opts.goal,
    explore,
    phase: 'roadblock',
    roadblock: opts.roadblock,
    userId: opts.userId,
    workspaceId: opts.workspaceId,
  });

  if (!intake.needs_questions) return { emitted: false };

  const questionsUi = formatPlanIntakeQuestionsForUi(intake.questions);
  const batchId = (await import('./agentsam-plan-intake.js')).newPlanIntakeBatchId();

  await insertPlanIntakeBatch(env, {
    id: batchId,
    tenant_id: opts.tenantId,
    workspace_id: opts.workspaceId,
    user_id: opts.userId,
    session_id: opts.sessionId,
    phase: 'roadblock',
    status: 'pending',
    goal_text: opts.goal,
    plan_id: opts.planId,
    workflow_run_id: opts.workflowRunId,
    explore_summary_json: JSON.stringify({ ...explore, synthesis: intake.synthesis }),
    questions_json: JSON.stringify(intake.questions),
    roadblock_context_json: JSON.stringify(opts.roadblock),
  });

  emit('plan_questions_batch', {
    batch_id: batchId,
    phase: 'roadblock',
    plan_id: opts.planId,
    explore_summary: {
      synthesis: intake.synthesis || explore.synthesis,
      files_searched: explore.files_searched,
      searches: explore.searches,
    },
    questions: questionsUi,
    allow_skip: true,
  });

  return { emitted: true, batch_id: batchId };
}

/**
 * Resume an agent/ask/debug turn after a quickstart_intake plan_questions_batch is
 * answered (Continue/Skip on the Questions tab). Re-resolves the RuntimeProfile using
 * the route_key/task_type/model_key stashed at intake time (roadblock_context_json --
 * not optional_details, which submitPlanIntakeBatch overwrites with the user's
 * free-text "Anything else?" answer) and re-runs runSharedProfileToolLoop with the
 * enriched goal as a fresh first message. Returns that turn's SSE Response directly.
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ batch: Record<string, unknown>, input: Record<string, unknown> }} args
 */
async function resumeQuickstartIntakeTurn(env, ctx, { batch, input }) {
  const { resolveRuntimeProfile } = await import('./runtime-profile.js');
  const { loadProjectContextSystemBlock } = await import('./project-context-budget.js');
  const { runSharedProfileToolLoop } = await import('./mode-controllers/agent-controller.js');

  const goal = buildEnrichedGoalFromIntakeBatch(batch);

  let resumeCtx = {};
  try {
    resumeCtx = JSON.parse(String(batch.roadblock_context_json || '{}'));
  } catch {
    resumeCtx = {};
  }

  const tenantId = input.tenantId != null ? String(input.tenantId) : String(batch.tenant_id || '');
  const workspaceId =
    input.workspaceId != null ? String(input.workspaceId) : String(batch.workspace_id || '');
  const userId = input.userId != null ? String(input.userId) : String(batch.user_id || '');
  const sessionId = input.sessionId != null ? String(input.sessionId) : String(batch.session_id || '');

  const requestedMode = String(resumeCtx.requested_mode || 'agent');
  const modelOverride =
    resumeCtx.model_key != null && String(resumeCtx.model_key).trim().toLowerCase() !== 'auto'
      ? String(resumeCtx.model_key).trim()
      : null;

  const profile = await resolveRuntimeProfile(env, {
    mode: requestedMode,
    message: goal,
    session: { userId, workspaceId, tenantId, conversationId: sessionId },
    overrides: {
      model_key: modelOverride,
      subagent_slug: resumeCtx.subagent_slug || null,
      route_key: resumeCtx.route_key || null,
      task_type: resumeCtx.task_type || null,
    },
    compile_lane: 'live',
  });
  profile.source.compile_lane = 'live';

  const projectContextBlock = await loadProjectContextSystemBlock(env, workspaceId);

  return runSharedProfileToolLoop(env, ctx, {
    body: { messages: [{ role: 'user', content: goal }] },
    message: goal,
    profile,
    session: {
      userId,
      workspaceId,
      tenantId,
      sessionId,
      authUser: { id: userId, tenant_id: tenantId },
    },
    modelOverride,
    quickstartBatch: '',
    activeFileEnvelope: null,
    subagentProfileRow: null,
    browserContextPayload: null,
    handoffResume: null,
    agentChatResolvedContext: null,
    projectContextBlock,
  });
}
