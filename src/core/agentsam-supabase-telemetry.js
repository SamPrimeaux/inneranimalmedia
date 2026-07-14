/**
 * Hyperdrive companion writes for AgentSam Supabase observability tables.
 * D1 remains the Workers-hot SSOT for agent_run / tool logs; these mirror OS telemetry.
 */
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';
import { resolveSupabaseWorkspaceId } from './rag-lanes.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Deterministic UUID from D1 agent_run id so tool/error rows join the same workflow_run. */
export async function uuidFromD1AgentRunId(d1AgentRunId) {
  const raw = trim(d1AgentRunId);
  if (!raw) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`agentsam_workflow_run:${raw}`),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function resolveWsUuid(env, d1WorkspaceId) {
  if (!isHyperdriveUsable(env)) return null;
  return resolveSupabaseWorkspaceId(env, d1WorkspaceId);
}

/**
 * @param {any} env
 * @param {ExecutionContext|null|undefined} ctx
 * @param {() => Promise<unknown>} work
 */
function wait(env, ctx, work) {
  const p = Promise.resolve()
    .then(work)
    .catch((e) => console.warn('[supabase-telemetry]', e?.message ?? e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  return p;
}

/**
 * Mirror chat agent_run start → agentsam.agentsam_workflow_runs
 */
export function scheduleSupabaseWorkflowRunStart(env, ctx, opts = {}) {
  return wait(env, ctx, async () => {
    const d1Ws = trim(opts.workspaceId || opts.workspace_id);
    const d1RunId = trim(opts.agentRunId || opts.d1_agent_run_id);
    if (!d1Ws || !d1RunId) return;
    const wsUuid = await resolveWsUuid(env, d1Ws);
    if (!wsUuid) return;
    const runUuid = await uuidFromD1AgentRunId(d1RunId);
    const workflowKey = trim(opts.workflowKey || opts.taskType || 'agent_chat') || 'agent_chat';
    const model = trim(opts.modelKey || opts.model_used) || null;
    const inputJson = JSON.stringify({
      d1_agent_run_id: d1RunId,
      task_type: opts.taskType || null,
      mode: opts.mode || null,
      session_id: opts.sessionId || null,
    });
    await runHyperdriveQuery(
      env,
      `INSERT INTO agentsam.agentsam_workflow_runs (
         id, workspace_id, workflow_key, status, input_json, model_used,
         input_tokens, output_tokens, cost_usd, started_at, created_at, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, 'running', $4::jsonb, $5,
         0, 0, 0, now(), now(), now()
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         model_used = COALESCE(EXCLUDED.model_used, agentsam.agentsam_workflow_runs.model_used),
         updated_at = now()`,
      [runUuid, wsUuid, workflowKey, inputJson, model],
    );
  });
}

/**
 * Tool execution companion → agentsam.agentsam_tool_call_events
 */
export function scheduleSupabaseToolCallEvent(env, ctx, opts = {}) {
  return wait(env, ctx, async () => {
    const d1Ws = trim(opts.workspaceId || opts.workspace_id);
    const toolKey = trim(opts.toolName || opts.tool_key);
    if (!d1Ws || !toolKey) return;
    const wsUuid = await resolveWsUuid(env, d1Ws);
    if (!wsUuid) return;
    const runUuid = trim(opts.agentRunId || opts.d1_agent_run_id)
      ? await uuidFromD1AgentRunId(opts.agentRunId || opts.d1_agent_run_id)
      : null;
    const status = opts.success === false || opts.status === 'error' ? 'error' : 'completed';
    const durationMs =
      opts.durationMs != null && Number.isFinite(Number(opts.durationMs))
        ? Math.max(0, Math.round(Number(opts.durationMs)))
        : null;
    await runHyperdriveQuery(
      env,
      `INSERT INTO agentsam.agentsam_tool_call_events (
         id, workspace_id, run_id, tool_key, tool_category, status,
         denial_reason, duration_ms, cost_usd, input_tokens, output_tokens, created_at
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5,
         $6, $7, $8::real, $9::int, $10::int, now()
       )`,
      [
        wsUuid,
        runUuid,
        toolKey,
        trim(opts.toolCategory || opts.tool_category) || null,
        status,
        opts.errorMessage ? String(opts.errorMessage).slice(0, 2000) : null,
        durationMs,
        Number(opts.costUsd) || 0,
        Number(opts.inputTokens) || 0,
        Number(opts.outputTokens) || 0,
      ],
    );
  });
}

/**
 * Complete/fail workflow run + optional usage row.
 */
export function scheduleSupabaseWorkflowRunFinish(env, ctx, opts = {}) {
  return wait(env, ctx, async () => {
    const d1Ws = trim(opts.workspaceId || opts.workspace_id);
    const d1RunId = trim(opts.agentRunId || opts.d1_agent_run_id);
    if (!d1Ws || !d1RunId) return;
    const wsUuid = await resolveWsUuid(env, d1Ws);
    if (!wsUuid) return;
    const runUuid = await uuidFromD1AgentRunId(d1RunId);
    const ok = opts.success !== false;
    const status = ok ? 'completed' : 'failed';
    const durationMs =
      opts.durationMs != null && Number.isFinite(Number(opts.durationMs))
        ? Math.max(0, Math.round(Number(opts.durationMs)))
        : null;
    const errMsg = opts.errorMessage ? String(opts.errorMessage).slice(0, 4000) : null;
    await runHyperdriveQuery(
      env,
      `UPDATE agentsam.agentsam_workflow_runs
       SET status = $2,
           error_message = COALESCE($3, error_message),
           input_tokens = GREATEST(input_tokens, $4::int),
           output_tokens = GREATEST(output_tokens, $5::int),
           cost_usd = GREATEST(cost_usd, $6::real),
           duration_ms = COALESCE($7, duration_ms),
           completed_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      [
        runUuid,
        status,
        errMsg,
        Number(opts.inputTokens) || 0,
        Number(opts.outputTokens) || 0,
        Number(opts.costUsd) || 0,
        durationMs,
      ],
    );

    const tenantId = trim(opts.tenantId || opts.tenant_id) || 'default';
    await runHyperdriveQuery(
      env,
      `INSERT INTO agentsam.agentsam_usage_events (
         id, d1_id, ref_table, ref_id, tenant_id, workspace_id, user_id, session_id,
         run_id, agent_name, provider, model, tokens_in, tokens_out, cost_usd,
         status, reason, metadata_json, created_at
       ) VALUES (
         gen_random_uuid(), $1, 'agentsam_agent_run', $1, $2, $3, $4, $5,
         $6::uuid, 'agent_sam', $7, $8, $9::int, $10::int, $11::numeric,
         $12, $13, $14::jsonb, now()
       )
       ON CONFLICT DO NOTHING`,
      [
        d1RunId,
        tenantId,
        d1Ws,
        trim(opts.userId) || null,
        trim(opts.sessionId) || null,
        runUuid,
        trim(opts.provider) || null,
        trim(opts.modelKey) || null,
        Number(opts.inputTokens) || 0,
        Number(opts.outputTokens) || 0,
        Number(opts.costUsd) || 0,
        ok ? 'ok' : 'error',
        ok ? 'loop_complete' : 'loop_failed',
        JSON.stringify({ source: 'agentsam_supabase_telemetry' }),
      ],
    ).catch(() => {});
  });
}

/**
 * Loop / spine error → agentsam.agentsam_error_events
 */
export function scheduleSupabaseErrorEvent(env, ctx, opts = {}) {
  return wait(env, ctx, async () => {
    const d1Ws = trim(opts.workspaceId || opts.workspace_id);
    const msg = trim(opts.errorMessage || opts.message);
    if (!d1Ws || !msg) return;
    const wsUuid = await resolveWsUuid(env, d1Ws);
    if (!wsUuid) return;
    const runUuid = trim(opts.agentRunId || opts.d1_agent_run_id)
      ? await uuidFromD1AgentRunId(opts.agentRunId || opts.d1_agent_run_id)
      : null;
    const severity = trim(opts.severity) || 'error';
    const contextJson = JSON.stringify({
      d1_agent_run_id: opts.agentRunId || null,
      source: opts.source || 'agent_tool_loop',
      ...(opts.context && typeof opts.context === 'object' ? opts.context : {}),
    });
    await runHyperdriveQuery(
      env,
      `INSERT INTO agentsam.agentsam_error_events (
         id, workspace_id, run_id, error_code, error_message, context_json,
         severity, resolved, created_at
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::jsonb,
         $6, false, now()
       )`,
      [
        wsUuid,
        runUuid,
        trim(opts.errorCode || opts.error_code) || null,
        msg.slice(0, 4000),
        contextJson,
        severity,
      ],
    );
  });
}

/**
 * Latest daily_memory_pipeline briefing for chat preflight (Hyperdrive).
 * @returns {Promise<string>}
 */
export async function fetchLatestDailyMemoryBriefing(env, d1WorkspaceId, opts = {}) {
  const d1Ws = trim(d1WorkspaceId);
  if (!d1Ws || !isHyperdriveUsable(env)) return '';
  const wsUuid = await resolveSupabaseWorkspaceId(env, d1Ws);
  if (!wsUuid) return '';

  const userFilter = trim(opts.userId);
  let sql = `
    SELECT title, content, memory_key, created_at
      FROM agentsam.agentsam_memory_oai3large_1536
     WHERE workspace_id = $1::uuid
       AND source = 'daily_memory_pipeline'
  `;
  const params = [wsUuid];
  if (userFilter) {
    sql += ` AND (
      metadata->>'user_id' = $2
      OR memory_key LIKE '%' || $2 || '%'
    )`;
    params.push(userFilter);
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;

  const r = await runHyperdriveQuery(env, sql, params);
  if (!r?.ok || !r.rows?.length) return '';
  const row = r.rows[0];
  const title = trim(row.title) || 'Daily memory';
  const body = trim(row.content);
  if (!body) return '';
  const clipped = body.length > 3500 ? `${body.slice(0, 3500)}\n…` : body;
  return `## Daily briefing (memory lane)\n\n**${title}**\n\n${clipped}`;
}
