/**
 * Re-save plan markdown (+ optional map) to ARTIFACTS R2 — Cursor "Save to workspace".
 * Keys: user/{user_id}/plan/{artifact_id}.md via writeWorkspaceArtifact.
 */

import { createPlanMarkdownArtifact, createPlanExcalidrawArtifact } from './agentsam-plan-excalidraw-artifact.js';

/**
 * @param {any} env
 * @param {any} ctx
 * @param {{
 *   planId: string,
 *   userId: string,
 *   tenantId: string,
 *   workspaceId: string,
 *   includeMap?: boolean,
 *   authUser?: Record<string, unknown>|null,
 *   sourceSessionId?: string|null,
 * }} opts
 */
export async function savePlanToWorkspaceArtifacts(env, ctx, opts) {
  const planId = String(opts?.planId || '').trim();
  const userId = String(opts?.userId || '').trim();
  const tenantId = String(opts?.tenantId || '').trim();
  const workspaceId = String(opts?.workspaceId || '').trim();
  if (!planId) throw new Error('plan_id required');
  if (!userId) throw new Error('user_id required');
  if (!tenantId) throw new Error('tenant_id required');
  if (!workspaceId) throw new Error('workspace_id required');

  const md = await createPlanMarkdownArtifact(
    env,
    {
      planId,
      userId,
      tenantId,
      workspaceId,
      sourceSessionId: opts.sourceSessionId ?? null,
      authUser: opts.authUser ?? null,
    },
    ctx,
  );

  let map = null;
  if (opts.includeMap !== false) {
    try {
      map = await createPlanExcalidrawArtifact(
        env,
        {
          planId,
          userId,
          tenantId,
          workspaceId,
          sourceSessionId: opts.sourceSessionId ?? null,
          authUser: opts.authUser ?? null,
        },
        ctx,
      );
    } catch (e) {
      console.warn('[plan-save-workspace] map_optional_failed', e?.message ?? e);
    }
  }

  return {
    ok: true,
    plan_id: planId,
    markdown: {
      artifact_id: md?.artifact_id ?? null,
      r2_key: md?.r2_key ?? null,
      public_url: md?.public_url ?? null,
      skipped_r2: Boolean(md?.skipped_r2),
      path: `plans/plan-${planId}.md`,
    },
    plan_map: map
      ? {
          artifact_id: map.artifact_id ?? null,
          r2_key: map.r2_key ?? null,
          public_url: map.public_url ?? null,
          skipped_r2: Boolean(map.skipped_r2),
        }
      : null,
    bucket: 'artifacts',
    message: 'Plan saved to workspace ARTIFACTS (user/{user_id}/plan/…).',
  };
}
