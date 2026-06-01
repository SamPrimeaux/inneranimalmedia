import { jsonResponse } from '../responses.js';
import { runtimeContextPayload, legacyContextPayload } from './runtime-context.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

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

  // Always emit runtime context first for dashboard proof.
  emit('runtime_context', runtimeContextPayload(profile, { modelOverride: input.modelOverride ?? null }));
  emit('context', legacyContextPayload(profile, { toolsCount: 0, modelOverride: input.modelOverride ?? null }));

  (async () => {
    try {
      const { createPlan, startAgentChatPlanWorkflowRun } = await import('../agentsam-planner.js');
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
      });

      emit('plan_created', {
        plan_id: plan.plan_id,
        plan_title: plan.plan_title,
        workflow_run_id: plan.workflow_run_id,
        task_count: plan.tasks.length,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          order_index: t.order_index,
          status: 'todo',
        })),
      });

      emit('text', {
        text: '_Plan mode: tasks stay as **todo**. Switch to **Agent** or **Multitask** to execute._',
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

