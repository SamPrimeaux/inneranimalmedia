/**
 * Codemode routing constants — no @cloudflare/codemode import (safe for Node smoke/tests).
 */
export const CODEMODE_TOOL_NAME = 'codemode';

/** Routes that use a fixed native tool allowlist — never replace with codemode hybrid manifest. */
export const CODEMODE_EXEMPT_ROUTE_KEYS = new Set([
  'design_intake',
  'cad_generation',
  'design_studio',
  'cms_code_pass',
  'mcp_panel',
]);

/**
 * @param {import('@cloudflare/workers-types').Env} env
 * @param {{ agentLikeTooling?: boolean }} ctx
 */
export function shouldUseCodemodeTooling(env, ctx = {}) {
  return Boolean(env?.LOADER && env?.DB && ctx.agentLikeTooling);
}

/**
 * @param {string|null|undefined} routeKey
 * @param {string|null|undefined} taskType
 */
export function isCodemodeExemptRoute(routeKey, taskType) {
  const rk = routeKey != null ? String(routeKey).trim().toLowerCase() : '';
  const tt = taskType != null ? String(taskType).trim().toLowerCase() : '';
  if (rk && CODEMODE_EXEMPT_ROUTE_KEYS.has(rk)) return true;
  if (tt && CODEMODE_EXEMPT_ROUTE_KEYS.has(tt)) return true;
  return false;
}

/**
 * Pre-normalization task_type check (tool_chain_planning / subagent_dispatch collapse in normalizeCanonicalTaskType).
 *
 * @param {import('@cloudflare/workers-types').Env} env
 * @param {{
 *   agentLikeTooling?: boolean,
 *   resolvedRoutingTaskType?: string,
 *   rawBodyTaskType?: string,
 *   routeKey?: string|null,
 *   routeKeyPin?: string|null,
 * }} ctx
 */
export function shouldUseCodemodeForRequest(env, ctx = {}) {
  if (!shouldUseCodemodeTooling(env, { agentLikeTooling: ctx.agentLikeTooling })) return false;
  if (isCodemodeExemptRoute(ctx.routeKey, ctx.routeKeyPin)) return false;
  if (isCodemodeExemptRoute(ctx.resolvedRoutingTaskType, ctx.rawBodyTaskType)) return false;
  const raw = ctx.rawBodyTaskType != null ? String(ctx.rawBodyTaskType).trim().toLowerCase() : '';
  const resolved = ctx.resolvedRoutingTaskType != null
    ? String(ctx.resolvedRoutingTaskType).trim().toLowerCase()
    : '';
  if (isCodemodeExemptRoute(resolved, raw)) return false;
  if (resolved === 'multitask') return true;
  if (raw === 'tool_chain_planning' || raw === 'subagent_dispatch') return true;
  if (resolved === 'agent' && raw === 'tool_chain_planning') return true;
  return false;
}
