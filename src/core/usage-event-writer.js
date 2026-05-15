/**
 * usage-event-writer.js
 * Single canonical writer for agentsam_usage_events.
 * Call once per AI model invocation after streaming completes.
 * One row = one model call.
 */

/**
 * @param {Object} env - Worker env bindings (env.DB required)
 * @param {Object} params
 * @param {string} params.model          - model name e.g. "gemini-2.5-flash"
 * @param {string} params.model_key      - routing key e.g. "gemini-2.5-flash-lite"
 * @param {string} params.provider       - "google" | "openai" | "anthropic" | "workers_ai" | "ollama"
 * @param {string} params.workspace_id
 * @param {string} params.tenant_id
 * @param {string} [params.user_id]
 * @param {string} [params.session_id]
 * @param {string} [params.routing_arm_id]
 * @param {string} [params.event_type]   - "chat" | "tool_call" | "embed" | "eval" | "cron"
 * @param {number} [params.tokens_in]    - input tokens
 * @param {number} [params.tokens_out]   - output tokens
 * @param {number} [params.cost_usd]     - estimated cost
 * @param {number} [params.duration_ms]  - wall clock ms
 * @param {string} [params.ref_table]    - originating table e.g. "agentsam_workflow_runs"
 * @param {string} [params.ref_id]       - originating row id
 * @param {string} [params.tool_name]    - if event_type=tool_call
 * @param {string} [params.status]       - "ok" | "error" | "timeout"
 * @param {string} [params.reason]       - error message if status=error
 */
export async function writeUsageEvent(env, params) {
  const {
    model        = 'unknown',
    model_key    = null,
    provider     = 'unknown',
    workspace_id,
    tenant_id,
    user_id      = null,
    session_id   = null,
    routing_arm_id = null,
    plan_id      = null,
    event_type   = 'chat',
    tokens_in    = 0,
    tokens_out   = 0,
    cost_usd     = 0,
    duration_ms  = null,
    ref_table    = null,
    ref_id       = null,
    tool_name    = null,
    status       = 'ok',
    reason       = null,
  } = params;

  // hard requirement — skip silently rather than throw
  if (!workspace_id || !tenant_id) {
    console.warn('[writeUsageEvent] missing workspace_id or tenant_id — skipped');
    return null;
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO agentsam_usage_events (
        tenant_id, workspace_id, user_id, session_id,
        provider, model, model_key,
        tokens_in, tokens_out, total_tokens, cost_usd, duration_ms,
        event_type, tool_name, status, reason,
        ref_table, ref_id, routing_arm_id, plan_id,
        agent_name, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        'agent-sam', unixepoch()
      )
    `).bind(
      tenant_id, workspace_id, user_id, session_id,
      provider, model, model_key,
      tokens_in, tokens_out, (tokens_in + tokens_out), cost_usd, duration_ms,
      event_type, tool_name, status, reason,
      ref_table, ref_id, routing_arm_id, plan_id
    ).run();

    return result?.meta?.last_row_id ?? null;
  } catch (e) {
    // never throw — telemetry must not break the main path
    console.warn('[writeUsageEvent] insert failed:', e.message);
    return null;
  }
}

/**
 * Convenience: call after an SSE stream completes.
 * Pulls values from the standard streaming response context.
 */
export async function writeUsageEventFromStream(env, {
  workspace_id, tenant_id, user_id, session_id,
  model, model_key, provider, routing_arm_id, plan_id,
  usage,          // { input_tokens, output_tokens } from provider response
  cost_usd,       // pre-calculated by your cost estimator
  duration_ms,    // Date.now() - start_time
  ref_table, ref_id,
}) {
  return writeUsageEvent(env, {
    workspace_id, tenant_id, user_id, session_id,
    model, model_key, provider, routing_arm_id, plan_id,
    event_type:  'chat',
    tokens_in:   usage?.input_tokens  ?? usage?.tokens_in  ?? 0,
    tokens_out:  usage?.output_tokens ?? usage?.tokens_out ?? 0,
    cost_usd:    cost_usd ?? 0,
    duration_ms,
    ref_table,
    ref_id,
    status: 'ok',
  });
}
