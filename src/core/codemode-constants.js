/**
 * Codemode routing constants — no @cloudflare/codemode import (safe for Node smoke/tests).
 */
export const CODEMODE_TOOL_NAME = 'codemode';

/**
 * @param {import('@cloudflare/workers-types').Env} env
 * @param {{ agentLikeTooling?: boolean }} ctx
 */
export function shouldUseCodemodeTooling(env, ctx = {}) {
  return Boolean(env?.LOADER && env?.DB && ctx.agentLikeTooling);
}

/**
 * Pre-normalization task_type check (tool_chain_planning / subagent_dispatch collapse in normalizeCanonicalTaskType).
 *
 * @param {import('@cloudflare/workers-types').Env} env
 * @param {{
 *   agentLikeTooling?: boolean,
 *   resolvedRoutingTaskType?: string,
 *   rawBodyTaskType?: string,
 * }} ctx
 */
export function shouldUseCodemodeForRequest(env, ctx = {}) {
  if (!shouldUseCodemodeTooling(env, { agentLikeTooling: ctx.agentLikeTooling })) return false;
  const raw = ctx.rawBodyTaskType != null ? String(ctx.rawBodyTaskType).trim().toLowerCase() : '';
  const resolved = ctx.resolvedRoutingTaskType != null
    ? String(ctx.resolvedRoutingTaskType).trim().toLowerCase()
    : '';
  if (resolved === 'multitask') return true;
  if (raw === 'tool_chain_planning' || raw === 'subagent_dispatch') return true;
  if (resolved === 'agent' && raw === 'tool_chain_planning') return true;
  return false;
}
