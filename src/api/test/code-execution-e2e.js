/**
 * src/api/test/code-execution-e2e.js
 *
 * DB-driven E2E test for Anthropic code_execution_20260120 (programmatic tool calling).
 * Schema-aligned with live D1 agentsam_* tables (PRAGMA-filtered inserts).
 *
 * Tables written:
 *   agentsam_tool_chain   — tool_status, result_json / input_json (no model_used / raw_result_json / created_at)
 *   agentsam_usage_events — tokens + cost_usd + ref → tool_chain id
 *   agentsam_command_run  — overall run record
 *
 * Config read from DB:
 *   agentsam_model_catalog — model_key, anthropic_model_id, cost_per_1k_in, cost_per_1k_out
 *   agentsam_bootstrap     — workspace_id, tenant_id, user_id (env=production, is_active=1)
 *
 * Auth:  X-IAM-Test-Secret == env.IAM_TEST_SECRET ?? env.PTY_AUTH_TOKEN
 * Route: POST /api/test/code-execution-e2e  (production only; see src/index.js)
 *
 * Body:
 *   model_preference  "sonnet"|"haiku"|"opus"  (default "sonnet")
 *   opus_gated        true  — required to unlock opus
 *   dry_run           true  — validates + returns rows, no D1 writes
 */

import { resolveCanonicalUserId } from '../auth.js';
import { pragmaTableInfo } from '../../core/retention.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const CODE_EXEC_TOOL_VERSION = 'code_execution_20260120';

const INSERTABLE_TABLES = new Set(['agentsam_tool_chain', 'agentsam_usage_events', 'agentsam_command_run']);

// Maps UI preference → agentsam_model_catalog tier
const TIER_MAP = {
  sonnet: { provider: 'anthropic', tier: 'power' },
  haiku: { provider: 'anthropic', tier: 'standard' },
  opus: { provider: 'anthropic', tier: 'reasoning', gated: true },
};

function newId(prefix) {
  const hex = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}${hex.slice(0, 16)}`;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request, env) {
  const secret = env.IAM_TEST_SECRET ?? env.PTY_AUTH_TOKEN ?? '';
  return !!secret && (request.headers.get('X-IAM-Test-Secret') ?? '') === String(secret);
}

// ─── DB: agentsam_model_catalog ───────────────────────────────────────────────

async function resolveModel(env, pref = 'sonnet', opusGated = false) {
  const map = TIER_MAP[pref] ?? TIER_MAP.sonnet;
  if (map.gated && !opusGated) {
    console.warn('[e2e] opus_gated not true — falling back to sonnet');
    return resolveModel(env, 'sonnet', false);
  }
  try {
    const row = await env.DB.prepare(
      `
      SELECT model_key, anthropic_model_id, display_name,
             cost_per_1k_in, cost_per_1k_out
      FROM   agentsam_model_catalog
      WHERE  provider  = ?
        AND  tier      = ?
        AND  is_active = 1
        AND  anthropic_model_id IS NOT NULL
        AND  trim(anthropic_model_id) != ''
      LIMIT  1
    `,
    )
      .bind(map.provider, map.tier)
      .first();
    if (row?.anthropic_model_id) return { ...row, _source: 'agentsam_model_catalog' };
  } catch (err) {
    console.error('[e2e] agentsam_model_catalog:', err.message);
  }
  return {
    model_key: 'claude-sonnet-4-6',
    anthropic_model_id: 'claude-sonnet-4-6',
    display_name: 'Claude Sonnet 4.6 (fallback)',
    cost_per_1k_in: 0.003,
    cost_per_1k_out: 0.015,
    _source: 'fallback',
  };
}

// ─── DB: agentsam_bootstrap ───────────────────────────────────────────────────

async function resolveBootstrap(env) {
  try {
    const row = await env.DB.prepare(
      `
      SELECT workspace_id, tenant_id, user_id
      FROM   agentsam_bootstrap
      WHERE  is_active   = 1
        AND  environment = 'production'
      LIMIT  1
    `,
    ).first();
    if (row?.workspace_id) return { ...row, _source: 'agentsam_bootstrap' };
  } catch (err) {
    console.error('[e2e] agentsam_bootstrap:', err.message);
  }
  return {
    workspace_id: 'ws_inneranimalmedia',
    tenant_id: 'tenant_sam_primeaux',
    user_id: 'usr_sam_iam',
    _source: 'fallback',
  };
}

// ─── Tool (callable from code execution) ─────────────────────────────────────

const SAMPLE_TOOL = {
  name: 'query_workspace_stats',
  description: [
    'Returns workspace usage stats as JSON:',
    '{ workspace_id:string, total_sessions:number, total_tool_calls:number,',
    '  avg_latency_ms:number, model_breakdown:{ [model_key]:number } }.',
    'Call once only.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string' },
      since_days: { type: 'number' },
    },
    required: ['workspace_id'],
  },
  allowed_callers: [CODE_EXEC_TOOL_VERSION],
};

async function handleSampleTool(env, input) {
  void env;
  return JSON.stringify({
    workspace_id: input.workspace_id,
    total_sessions: 42,
    total_tool_calls: 187,
    avg_latency_ms: 312,
    model_breakdown: { 'claude-sonnet-4-6': 103, 'claude-haiku-4-5': 84 },
  });
}

// ─── Anthropic API + multi-turn loop ─────────────────────────────────────────

async function anthropicPost(apiKey, body) {
  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json);
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }
  return json;
}

async function runLoop(apiKey, env, modelId, messages, tools, containerId = null) {
  const toolCallLog = [];
  for (let i = 0; i < 10; i++) {
    const body = { model: modelId, max_tokens: 2048, messages, tools };
    if (containerId) body.container = containerId;
    const resp = await anthropicPost(apiKey, body);
    containerId = resp.container?.id ?? containerId;
    const uses = (resp.content ?? []).filter((b) => b.type === 'tool_use');
    toolCallLog.push(...uses);
    if (resp.stop_reason === 'end_turn') return { response: resp, toolCallLog, containerId };
    if (resp.stop_reason !== 'tool_use') throw new Error(`stop_reason: ${resp.stop_reason}`);
    const results = await Promise.all(
      uses.map(async (b) => ({
        type: 'tool_result',
        tool_use_id: b.id,
        content:
          b.name === 'query_workspace_stats'
            ? await handleSampleTool(env, b.input)
            : JSON.stringify({ error: `unknown: ${b.name}` }),
      })),
    );
    messages = [...messages, { role: 'assistant', content: resp.content }, { role: 'user', content: results }];
  }
  throw new Error('max iterations exceeded');
}

// ─── Row builders — agentsam_* column names ──────────────────────────────────

function buildToolChainRow({
  chainId,
  tenantId,
  workspaceId,
  userId,
  agentSessionId,
  modelKey,
  durationMs,
  inputTokens,
  outputTokens,
  costUsd,
  toolCallCount,
  containerId,
}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: chainId,
    tenant_id: tenantId ?? null,
    workspace_id: workspaceId,
    user_id: userId ?? null,
    agent_id: null,
    work_session_id: null,
    agent_session_id: agentSessionId,
    agent_message_id: null,
    parent_chain_id: null,
    depth: 0,
    tool_name: 'code_execution',
    tool_id: null,
    mcp_tool_ref: null,
    mcp_tool_call_id: null,
    terminal_session_id: null,
    command_execution_id: null,
    tool_status: 'completed',
    input_json: JSON.stringify({ model_key: modelKey, tool_calls: toolCallCount }),
    output_summary: `${toolCallCount} programmatic tool call(s) via code_execution`,
    result_json: JSON.stringify({ container_id: containerId }),
    error_message: null,
    error_type: null,
    retry_count: 0,
    max_retries: 2,
    duration_ms: durationMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    timed_out: 0,
    sla_breach: 0,
    timeout_ms: 30000,
    requires_approval: 0,
    approved_by: null,
    approved_at: null,
    started_at: now - Math.max(1, Math.floor(durationMs / 1000)),
    completed_at: now,
    execution_step_id: null,
    workflow_run_id: null,
  };
}

function buildUsageEventRow({
  usageId,
  tenantId,
  workspaceId,
  userId,
  agentSessionId,
  modelKey,
  anthropicModelId,
  inputTokens,
  outputTokens,
  costUsd,
  durationMs,
  toolChainId,
}) {
  return {
    id: usageId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId ?? null,
    session_id: agentSessionId,
    agent_name: 'agent-sam',
    provider: 'anthropic',
    model: anthropicModelId,
    model_key: modelKey,
    tokens_in: inputTokens,
    tokens_out: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_usd: costUsd,
    status: 'ok',
    tool_name: 'code_execution',
    reason: null,
    ref_table: 'agentsam_tool_chain',
    ref_id: toolChainId,
    duration_ms: durationMs,
    event_type: 'code_execution_e2e_test',
    created_at: Math.floor(Date.now() / 1000),
  };
}

function buildCommandRunRow({
  runId,
  workspaceId,
  tenantId,
  userId,
  agentSessionId,
  modelKey,
  durationMs,
  inputTokens,
  outputTokens,
  costUsd,
  outputText,
}) {
  return {
    id: runId,
    workspace_id: workspaceId,
    tenant_id: tenantId ?? null,
    user_id: userId ?? null,
    session_id: agentSessionId,
    conversation_id: null,
    user_input: 'E2E: code_execution_20260120 programmatic tool call test',
    normalized_intent: 'code_execution_e2e',
    intent_category: 'misc',
    tier_used: 0,
    model_id: modelKey,
    commands_json: '[]',
    result_json: '{}',
    output_text: (outputText ?? '').slice(0, 2000) || null,
    confidence_score: 1.0,
    success: 1,
    exit_code: 0,
    duration_ms: durationMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    error_message: null,
    selected_command_id: null,
    selected_command_slug: 'code_execution_e2e',
    risk_level: 'low',
    requires_confirmation: 0,
    approval_status: 'not_required',
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateToolChain(row) {
  const errors = [];
  for (const f of ['tenant_id', 'workspace_id', 'tool_name', 'tool_status', 'started_at', 'completed_at', 'duration_ms']) {
    if (row[f] == null) errors.push(`missing: ${f}`);
  }
  const valid = ['pending', 'running', 'completed', 'failed', 'skipped', 'cancelled', 'timeout'];
  if (!valid.includes(row.tool_status)) errors.push(`bad tool_status: ${row.tool_status}`);
  if ((row.started_at ?? 0) > (row.completed_at ?? 0)) errors.push('started_at > completed_at');
  return errors;
}

function validateUsageEvent(row) {
  const errors = [];
  for (const f of ['tenant_id', 'workspace_id', 'provider', 'model', 'tokens_in', 'tokens_out']) {
    if (row[f] == null) errors.push(`missing: ${f}`);
  }
  if (!['ok', 'blocked', 'error', 'timeout'].includes(row.status)) errors.push(`bad status: ${row.status}`);
  return errors;
}

// ─── D1 writes (PRAGMA-filtered) ─────────────────────────────────────────────

async function insertRow(env, table, row) {
  if (!INSERTABLE_TABLES.has(table)) throw new Error('invalid table');
  const cols = await pragmaTableInfo(env.DB, table);
  const entries = Object.entries(row).filter(([k, v]) => cols.has(k.toLowerCase()) && v !== undefined);
  if (!entries.length) throw new Error(`no matching columns for ${table}`);
  const names = entries.map(([k]) => k);
  const placeholders = names.map(() => '?').join(', ');
  await env.DB.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${placeholders})`)
    .bind(...entries.map(([, v]) => v))
    .run();
}

async function persistE2eRows(env, toolChainRow, usageRow, commandRunRow) {
  const dbResults = { tool_chain: 'skipped', usage_event: 'skipped', command_run: 'skipped' };
  for (const [key, table, row] of [
    ['tool_chain', 'agentsam_tool_chain', toolChainRow],
    ['usage_event', 'agentsam_usage_events', usageRow],
    ['command_run', 'agentsam_command_run', commandRunRow],
  ]) {
    try {
      await insertRow(env, table, row);
      dbResults[key] = 'written';
    } catch (err) {
      dbResults[key] = `error: ${err.message}`;
      console.error(`[e2e] ${table}:`, err.message);
    }
  }
  return dbResults;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function handleCodeExecutionE2E(request, env, ctx) {
  void ctx;
  if (!isAuthorized(request, env)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }
  if (!env.DB) {
    return Response.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  const pref = String(body.model_preference ?? 'sonnet').toLowerCase();
  const [modelRow, bootstrap] = await Promise.all([
    resolveModel(env, pref === 'opus' ? 'opus' : pref === 'haiku' ? 'haiku' : 'sonnet', body.opus_gated === true),
    resolveBootstrap(env),
  ]);

  const userId = await resolveCanonicalUserId(bootstrap.user_id, env);
  const agentSessionId = `asess_e2e_${Date.now()}`;
  const dryRun = body.dry_run === true;

  const chainId = newId('atc_');
  const usageId = newId('ue_');
  const runId = newId('run_');

  const tools = [{ type: CODE_EXEC_TOOL_VERSION, name: 'code_execution' }, SAMPLE_TOOL];
  const messages = [
    {
      role: 'user',
      content: `Use code execution to call query_workspace_stats for workspace "${bootstrap.workspace_id}" with since_days=7. Compute percentage breakdown per model. Return JSON only: { model_breakdown_pct: { [model_key]: number }, total_calls: number }`,
    },
  ];

  const t0 = Date.now();
  let finalResponse;
  let toolCallLog;
  let containerId;
  try {
    ({ response: finalResponse, toolCallLog, containerId } = await runLoop(
      env.ANTHROPIC_API_KEY,
      env,
      modelRow.anthropic_model_id,
      messages,
      tools,
    ));
  } catch (err) {
    return Response.json({ error: 'api_loop_failed', detail: err.message }, { status: 502 });
  }

  const durationMs = Date.now() - t0;
  const usage = finalResponse.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const costUsd =
    (inputTokens * Number(modelRow.cost_per_1k_in ?? 0)) / 1000 +
    (outputTokens * Number(modelRow.cost_per_1k_out ?? 0)) / 1000;

  const textBlock = (finalResponse.content ?? []).find((b) => b.type === 'text');

  const toolChainRow = buildToolChainRow({
    chainId,
    tenantId: bootstrap.tenant_id,
    workspaceId: bootstrap.workspace_id,
    userId,
    agentSessionId,
    modelKey: modelRow.model_key,
    durationMs,
    inputTokens,
    outputTokens,
    costUsd,
    toolCallCount: toolCallLog.length,
    containerId,
  });

  const usageRow = buildUsageEventRow({
    usageId,
    tenantId: bootstrap.tenant_id,
    workspaceId: bootstrap.workspace_id,
    userId,
    agentSessionId,
    modelKey: modelRow.model_key,
    anthropicModelId: modelRow.anthropic_model_id,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    toolChainId: chainId,
  });

  const commandRunRow = buildCommandRunRow({
    runId,
    workspaceId: bootstrap.workspace_id,
    tenantId: bootstrap.tenant_id,
    userId,
    agentSessionId,
    modelKey: modelRow.model_key,
    durationMs,
    inputTokens,
    outputTokens,
    costUsd,
    outputText: textBlock?.text,
  });

  const chainErrors = validateToolChain(toolChainRow);
  const usageErrors = validateUsageEvent(usageRow);
  const allValid = chainErrors.length === 0 && usageErrors.length === 0;

  let dbResults = { tool_chain: 'skipped', usage_event: 'skipped', command_run: 'skipped' };
  if (dryRun) {
    dbResults = { tool_chain: 'dry_run', usage_event: 'dry_run', command_run: 'dry_run' };
  } else if (allValid) {
    dbResults = await persistE2eRows(env, toolChainRow, usageRow, commandRunRow);
  }

  const modelMeta = { ...modelRow };
  delete modelMeta._source;
  const workspaceMeta = { ...bootstrap };
  delete workspaceMeta._source;

  return Response.json({
    pass: allValid,
    dry_run: dryRun,
    validation: { tool_chain_errors: chainErrors, usage_event_errors: usageErrors },
    db_writes: dbResults,
    model: { ...modelMeta, source: modelRow._source },
    workspace: { ...workspaceMeta, user_id: userId, source: bootstrap._source },
    run: {
      tool_chain_id: chainId,
      usage_event_id: usageId,
      command_run_id: runId,
      agent_session_id: agentSessionId,
      container_id: containerId,
      duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      tool_calls: toolCallLog.map((t) => ({ name: t.name, caller_type: t.caller?.type ?? 'direct' })),
    },
    model_response: textBlock?.text ?? null,
    rows: { tool_chain: toolChainRow, usage_event: usageRow, command_run: commandRunRow },
  });
}
