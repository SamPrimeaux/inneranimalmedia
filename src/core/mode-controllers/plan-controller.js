import { jsonResponse } from '../responses.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';
import { executeRwsSpawnFanout, shouldRunRwsFanout } from '../rws-spawn-fanout.js';
import { hydrateSkillRowFromR2 } from '../agentsam-skill-r2.js';

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
 * Plan controller
 * - execution_kind: plan_pipeline
 * - writes: never
 * - end state: plan_created then stop (no auto-execute)
 *
 * @param {any} env
 * @param {any} ctx
 * @param {{ request?: Request, message: string, profile: import('../runtime-profile.types.js').RuntimeProfile, session?: any, modelOverride?: string|null }} input
 */
export async function executePlanTurn(env, ctx, input) {
  const profile = input.profile;
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
      const { createPlan, startAgentChatPlanWorkflowRun } = await import('../agentsam-planner.js');
      const skillLoad = await loadPlanModeSkillMarkdown(env);
      if (skillLoad.skill_ids.length) {
        emit('skills_loaded', {
          skill_ids: skillLoad.skill_ids,
          route_key: 'plan',
          task_type: 'plan_pipeline',
        });
        console.info(
          '[plan-controller] skills_loaded',
          JSON.stringify({ skill_ids: skillLoad.skill_ids, chars: skillLoad.markdown.length }),
        );
      }

      emit('plan_thinking', { message: 'Breaking down your goal into tasks...' });

      const wfBoot = await startAgentChatPlanWorkflowRun(env, {
        tenantId,
        workspaceId,
        userId,
        sessionId,
        goal: message,
      });

      const plan = await createPlan(env, {
        goal: message,
        userId,
        workspaceId,
        tenantId,
        sessionId,
        workflowRunId: wfBoot.workflowRunId,
        ctx,
        planningSkillMarkdown: skillLoad.markdown,
      });

      emit('plan_created', {
        plan_id: plan.plan_id,
        plan_title: plan.plan_title,
        workflow_run_id: plan.workflow_run_id,
        task_count: plan.tasks.length,
        auto_execute: false,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          order_index: t.order_index,
          parent_task_id: t.parent_task_id ?? null,
          status: 'todo',
        })),
        visual_map: plan.visual_map ?? null,
        plan_markdown: plan.plan_markdown ?? null,
      });

      emit('text', {
        text: '_Plan ready. Use **Run plan** to execute tasks without switching modes._',
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
