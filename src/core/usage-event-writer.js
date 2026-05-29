/**
 * usage-event-writer.js
 * Single canonical writer for agentsam_usage_events.
 * Call once per AI model invocation after streaming completes.
 * One row = one model call.
 */
import { scheduleMirrorUsageEventToSupabase } from './hyperdrive-write.js';

/**
 * Resolve billing provider for a dispatched model_key (catalog / agentsam_ai), not routing arm default.
 * @param {any} env
 * @param {string|null|undefined} modelKey
 * @param {string|null|undefined} armProvider
 */
export async function resolveProviderForModelKey(env, modelKey, armProvider = null) {
  const mk = modelKey != null ? String(modelKey).trim() : '';
  if (!mk || !env?.DB) {
    return armProvider != null ? String(armProvider).trim() : 'unknown';
  }
  try {
    const aiRow = await env.DB.prepare(
      `SELECT provider FROM agentsam_ai WHERE model_key = ? LIMIT 1`,
    )
      .bind(mk)
      .first();
    if (aiRow?.provider) return String(aiRow.provider).trim();
  } catch (_) {}
  try {
    const catRow = await env.DB.prepare(
      `SELECT provider FROM agentsam_model_catalog WHERE model_key = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(mk)
      .first();
    if (catRow?.provider) return String(catRow.provider).trim();
  } catch (_) {}
  return armProvider != null ? String(armProvider).trim() : 'unknown';
}

/** Mirror tokens_in/out → input_tokens/output_tokens for analytics queries. */
export function syncUsageTokenColumns(tokensIn, tokensOut) {
  const tin = Math.max(0, Math.floor(Number(tokensIn) || 0));
  const tout = Math.max(0, Math.floor(Number(tokensOut) || 0));
  return {
    tokens_in: tin,
    tokens_out: tout,
    input_tokens: tin,
    output_tokens: tout,
    total_tokens: tin + tout,
  };
}

/**
 * Optional extra INSERT columns when schema has attribution / token mirror cols.
 * @param {Set<string>} cols - pragma_table_info names (lowercase)
 */
export function usageEventExtraColumnSql(cols, { tokens_in, tokens_out, task_type, mode }) {
  const synced = syncUsageTokenColumns(tokens_in, tokens_out);
  const names = [];
  const placeholders = [];
  const binds = [];

  if (cols.has('input_tokens')) {
    names.push('input_tokens');
    placeholders.push('?');
    binds.push(synced.input_tokens);
  }
  if (cols.has('output_tokens')) {
    names.push('output_tokens');
    placeholders.push('?');
    binds.push(synced.output_tokens);
  }
  const tt = task_type != null ? String(task_type).trim() : '';
  if (cols.has('task_type') && tt) {
    names.push('task_type');
    placeholders.push('?');
    binds.push(tt.slice(0, 120));
  }
  const md = mode != null ? String(mode).trim() : '';
  if (cols.has('mode') && md) {
    names.push('mode');
    placeholders.push('?');
    binds.push(md.slice(0, 64));
  }
  return { names, placeholders, binds };
}

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
 * @param {string} [params.task_type]    - canonical task type from classifyIntent
 * @param {string} [params.mode]         - execution mode (ask, agent, auto, …)
 */
export async function writeUsageEvent(env, params, ctx = null) {
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
    task_type    = null,
    mode         = null,
  } = params;

  // hard requirement — skip silently rather than throw
  if (!workspace_id || !tenant_id) {
    console.warn('[writeUsageEvent] missing workspace_id or tenant_id — skipped');
    return null;
  }

  const tokens = syncUsageTokenColumns(tokens_in, tokens_out);
  const taskTypeVal = task_type != null ? String(task_type).trim().slice(0, 120) : null;
  const modeVal = mode != null ? String(mode).trim().slice(0, 64) : null;
  const resolvedModelKey = model_key != null ? String(model_key).trim() : '';
  const actualProvider = await resolveProviderForModelKey(
    env,
    resolvedModelKey || model,
    provider,
  );

  try {
    const result = await env.DB.prepare(`
      INSERT INTO agentsam_usage_events (
        tenant_id, workspace_id, user_id, session_id,
        provider, model, model_key,
        tokens_in, tokens_out, input_tokens, output_tokens, total_tokens, cost_usd, duration_ms,
        event_type, tool_name, status, reason,
        ref_table, ref_id, routing_arm_id, plan_id,
        task_type, mode,
        agent_name, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        'agent-sam', unixepoch()
      )
    `).bind(
      tenant_id, workspace_id, user_id, session_id,
      actualProvider, model, model_key || resolvedModelKey || model,
      tokens.tokens_in, tokens.tokens_out, tokens.input_tokens, tokens.output_tokens,
      tokens.total_tokens, cost_usd, duration_ms,
      event_type, tool_name, status, reason,
      ref_table, ref_id, routing_arm_id, plan_id,
      taskTypeVal, modeVal,
    ).run();

    let d1Id = null;
    try {
      const row = await env.DB.prepare(
        `SELECT id, created_at FROM agentsam_usage_events WHERE rowid = last_insert_rowid() LIMIT 1`,
      ).first();
      d1Id = row?.id != null ? String(row.id) : null;
    } catch (_) {}

    scheduleMirrorUsageEventToSupabase(env, ctx, {
      d1_id: d1Id,
      tenant_id,
      workspace_id,
      user_id,
      session_id,
      provider: actualProvider,
      model,
      model_key: model_key || resolvedModelKey || model,
      tokens_in: tokens.tokens_in,
      tokens_out: tokens.tokens_out,
      input_tokens: tokens.input_tokens,
      output_tokens: tokens.output_tokens,
      cost_usd,
      status,
      tool_name,
      ref_table,
      ref_id,
      event_type,
      created_at: Math.floor(Date.now() / 1000),
    });

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
  task_type,
  mode,
}, ctx = null) {
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
    task_type,
    mode,
    status: 'ok',
  }, ctx);
}
