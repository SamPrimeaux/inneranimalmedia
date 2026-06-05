/**
 * SSE for POST /api/agent/plan/refine
 */

import { refineAgentsamPlan } from './agentsam-plan-refine.js';
import { scheduleMirrorAgentsamPlanEmbeddingToSupabase } from './agentsam-plan-supabase-public-sync.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {{ plan_title?: string, tasks?: Array<{ title?: string }> }} plan
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
 * @param {Record<string, unknown>} input
 */
export function startPlanRefineSseResponse(env, ctx, input) {
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
      emit('plan_thinking', { message: 'Refining plan…' });
      const out = await refineAgentsamPlan(env, {
        planId: String(input.planId || ''),
        refinement: String(input.refinement || ''),
        userId: String(input.userId || ''),
        tenantId: String(input.tenantId || ''),
        workspaceId: String(input.workspaceId || ''),
        sessionId: input.sessionId != null ? String(input.sessionId) : null,
        planningSkillMarkdown: String(input.planningSkillMarkdown || ''),
      }, ctx);

      const r2Url = out.plan_markdown?.public_url ? String(out.plan_markdown.public_url).trim() : '';
      const filename = `plan-${out.plan_id}.md`;
      if (r2Url) {
        emit('monaco_file_generated', {
          type: 'monaco_file_generated',
          surface: 'monaco',
          plan_id: out.plan_id,
          filename,
          path: `plans/${filename}`,
          language: 'markdown',
          r2_url: r2Url,
        });
      }

      const summary = buildPlanSummaryText(out, String(input.refinement || ''));
      scheduleMirrorAgentsamPlanEmbeddingToSupabase(env, ctx, {
        planId: out.plan_id,
        tenantId: String(input.tenantId || ''),
        workspaceId: String(input.workspaceId || ''),
        title: out.plan_title,
        summary,
        r2Url,
      });

      emit('plan_created', {
        plan_id: out.plan_id,
        plan_title: out.plan_title,
        task_count: out.task_count,
        auto_execute: false,
        summary,
        refined: true,
        plan_markdown: out.plan_markdown ?? null,
      });
      emit('text', {
        text: `**Plan refined** — ${summary}. Review in Monaco, then **Run plan** when ready.`,
      });
      emit('done', {});
    } catch (e) {
      emit('text', { text: `**Plan refine error:** ${e?.message ?? String(e)}` });
      emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}
