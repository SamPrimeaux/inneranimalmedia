/**
 * SSE stream for agentsam plan execution (full plan or single-task resume).
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {any} env
 * @param {any} ctx
 * @param {Record<string, unknown>} opts
 * @returns {Response}
 */
export function startPlanExecuteSseResponse(env, ctx, opts) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (event, data) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: event, ...data })}\n\n`));
    } catch (_) {}
  };

  (async () => {
    try {
      emit('plan_execute_start', {
        plan_id: opts.planId,
        only_task_id: opts.onlyTaskId ?? null,
      });
      const { executePlan } = await import('./agentsam-task-executor.js');
      await executePlan(env, {
        planId: opts.planId,
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        tenantId: opts.tenantId,
        emit,
        ctx,
        onlyTaskId: opts.onlyTaskId ?? null,
        sessionId: opts.sessionId ?? null,
        skipPlanAggregate: Boolean(opts.skipPlanAggregate),
        workflowRunId: opts.workflowRunId ?? null,
      });
      emit('done', {});
    } catch (e) {
      emit('text', { text: `**Plan execute error:** ${e?.message ?? String(e)}` });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}
