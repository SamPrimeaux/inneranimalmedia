/**
 * Canonical routing decision — resolveModelForTask called once per request path.
 * Pass the frozen object to dispatch, usage, and ETO consumers.
 */
import { resolveModelForTask } from './resolveModel.js';

/**
 * @param {import('./resolveModel.js').ResolvedModel} r
 */
function resolvedProviderModelId(r) {
  switch (r.provider) {
    case 'openai':
      return r.openai_model_id || r.model_key;
    case 'anthropic':
      return r.anthropic_model_id || r.model_key;
    case 'google':
      return r.google_model_id || r.model_key;
    case 'workers_ai':
      return r.workers_ai_model_id || r.model_key;
    default:
      return r.model_key;
  }
}

/**
 * Build and freeze the canonical routing decision for one request.
 * workspace_id and tenant_id must come from auth context — never hardcoded.
 *
 * @param {any} env
 * @param {{
 *   task_type: string,
 *   mode?: string,
 *   requested_model_key?: string|null,
 *   routing_arm_id?: string|null,
 *   workspace_id: string,
 *   tenant_id?: string|null,
 *   tool_required?: boolean,
 *   route_key?: string|null,
 *   lane?: string|null,
 *   fallback_chain?: string[],
 * }} opts
 */
export async function buildRoutingDecision(env, opts) {
  const resolved = await resolveModelForTask(env, {
    task_type: opts.task_type,
    mode: opts.mode,
    requested_model_key: opts.requested_model_key ?? null,
    routing_arm_id: opts.routing_arm_id ?? null,
    workspace_id: opts.workspace_id,
    tenant_id: opts.tenant_id ?? undefined,
    require_tools: opts.tool_required ?? false,
  });

  return Object.freeze({
    routing_decision_id: `rd_${crypto.randomUUID().replace(/-/g, '')}`,
    routing_trace_id: `rtrc_${Date.now().toString(36)}`,
    selected_arm_id: resolved.routing_arm_id ?? null,
    source: resolved.resolution_source,
    mode: opts.mode,
    task_type: opts.task_type,
    route_key: opts.route_key ?? null,
    provider: resolved.provider,
    model_key: resolved.model_key,
    provider_model_id: resolvedProviderModelId(resolved),
    lane:
      opts.lane ??
      (['debug', 'plan'].includes(String(opts.mode || '').toLowerCase())
        ? 'premium'
        : (resolved.routing_lane ?? null)),
    tool_required: opts.tool_required ?? false,
    fallback_chain: opts.fallback_chain ?? [],
    reasoning_effort: resolved.reasoning_effort ?? null,
    _resolved: resolved,
  });
}
