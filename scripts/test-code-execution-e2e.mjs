#!/usr/bin/env node
/**
 * E2E Test: Anthropic Code Execution + Programmatic Tool Calling
 * Validates row shapes for agentsam_tool_chain / agentsam_command_run (local only — no D1 write).
 *
 * Env is loaded from `.env.cloudflare` when present (same pattern as scripts/ingest-docs.js):
 *   KEY=value lines; does not override variables already set in the shell.
 *   Optional: `export KEY=value` lines (quotes stripped) — same as mcp-smoke.mjs.
 *
 * Usage:
 *   npm run smoke:code-execution-e2e
 *   node scripts/test-code-execution-e2e.mjs
 *   MODEL=haiku npm run smoke:code-execution-e2e
 *   MODEL=opus OPUS_GATED=true npm run smoke:code-execution-e2e
 *
 * Deps: Node 18+ (native fetch). No SDK required.
 */


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function loadEnvCloudflare() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('export ')) {
      const m = trimmed.match(/^export\s+([A-Z0-9_]+)=(.*)/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadEnvCloudflare();

// ─── Model gating ────────────────────────────────────────────────────────────

const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-8', // gated — requires OPUS_GATED=true
};

const CODE_EXEC_TOOL_VERSION = 'code_execution_20260120'; // supports programmatic calling

function resolveModel() {
  const req = (process.env.MODEL || 'sonnet').toLowerCase();
  if (req === 'opus') {
    if (process.env.OPUS_GATED !== 'true') {
      console.error('[gate] Opus requested but OPUS_GATED=true not set. Falling back to sonnet.');
      return MODELS.sonnet;
    }
    console.log('[gate] Opus unlocked via OPUS_GATED=true');
    return MODELS.opus;
  }
  if (req === 'haiku') return MODELS.haiku;
  return MODELS.sonnet;
}

// ─── agentsam_tool_chain row shape ───────────────────────────────────────────
// Mirrors the live table columns used by fireForgetAgentToolChainRow.
// All fields present; nullable ones default to null.

function buildToolChainRow({
  toolName,
  status, // 'completed' | 'failed'
  durationMs,
  cost = null,
  workflowRunId = null,
  executionStepId = null,
  parentChainId = null,
  errorMessage = null,
  errorCode = null,
  sessionId,
  workspaceId,
  tenantId,
  userId,
  modelUsed,
  inputTokens = 0,
  outputTokens = 0,
  rawResult = null,
}) {
  const now = Date.now();
  const startedAt = Math.floor((now - durationMs) / 1000);
  const completedAt = Math.floor(now / 1000);

  return {
    id: `atc_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    workspace_id: workspaceId,
    tenant_id: tenantId ?? null,
    user_id: userId ?? null,
    session_id: sessionId,
    tool_name: toolName,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    cost_usd: cost,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    model_used: modelUsed,
    workflow_run_id: workflowRunId,
    execution_step_id: executionStepId,
    parent_chain_id: parentChainId,
    mcp_execution_id: null,
    terminal_session_id: null,
    error_message: errorMessage,
    error_code: errorCode,
    raw_result_json: rawResult ? JSON.stringify(rawResult) : null,
    created_at: completedAt,
  };
}

// ─── agentsam_command_run row shape ──────────────────────────────────────────
// Used when the code execution tool runs a bash command.

function buildCommandRunRow({
  commandName = 'code_execution_run',
  sessionId,
  workspaceId,
  tenantId,
  userId,
  durationMs,
  exitCode = 0,
  stdout = '',
  stderr = '',
  toolChainId = null,
}) {
  const now = Date.now();
  return {
    id: `acr_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    workspace_id: workspaceId,
    tenant_id: tenantId ?? null,
    user_id: userId ?? null,
    session_id: sessionId,
    command_name: commandName,
    status: exitCode === 0 ? 'completed' : 'failed',
    exit_code: exitCode,
    stdout_preview: stdout.slice(0, 500),
    stderr_preview: stderr.slice(0, 500),
    duration_ms: durationMs,
    tool_chain_id: toolChainId,
    created_at: Math.floor(now / 1000),
  };
}

// ─── Anthropic API helpers ────────────────────────────────────────────────────

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

async function anthropicPost(path, body) {
  const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
// A simple sample tool callable from code execution.
// In production this maps to a real IAM tool (r2_read, d1_query, etc.).

const SAMPLE_TOOL = {
  name: 'query_workspace_stats',
  description: [
    'Returns workspace usage statistics as a JSON object with fields:',
    '{ workspace_id: string, total_sessions: number, total_tool_calls: number,',
    '  avg_latency_ms: number, model_breakdown: { [model]: number } }',
    'Use this to aggregate stats before reporting — do not call it more than once.',
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      workspace_id: { type: 'string', description: 'Workspace to query' },
      since_days: { type: 'number', description: 'Look-back window in days (1-90)' },
    },
    required: ['workspace_id'],
  },
  // Programmatic: only callable from within code execution
  allowed_callers: [CODE_EXEC_TOOL_VERSION],
};

// Fake tool handler — replace with real D1 query in production
function handleQueryWorkspaceStats(input) {
  return JSON.stringify({
    workspace_id: input.workspace_id,
    total_sessions: 42,
    total_tool_calls: 187,
    avg_latency_ms: 312,
    model_breakdown: {
      'claude-sonnet-4-6': 103,
      'claude-haiku-4-5-20251001': 84,
    },
  });
}

// ─── Multi-turn loop ──────────────────────────────────────────────────────────

async function runProgrammaticLoop(model, messages, tools, containerId = null) {
  const toolCallLog = []; // collects tool_use blocks for telemetry
  let iterations = 0;
  const MAX_ITER = 10;

  while (iterations++ < MAX_ITER) {
    const reqBody = {
      model,
      max_tokens: 2048,
      messages,
      tools,
    };
    if (containerId) reqBody.container = containerId;

    const response = await anthropicPost('/messages', reqBody);
    containerId = response.container?.id ?? containerId;

    // Collect any tool_use blocks
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    toolCallLog.push(...toolUseBlocks);

    if (response.stop_reason === 'end_turn') {
      return { response, toolCallLog, containerId };
    }

    if (response.stop_reason !== 'tool_use') {
      throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }

    // Build tool results
    const toolResults = toolUseBlocks.map((block) => {
      let result;
      if (block.name === 'query_workspace_stats') {
        result = handleQueryWorkspaceStats(block.input);
      } else {
        result = JSON.stringify({ error: `Unknown tool: ${block.name}` });
      }
      console.log(`  → tool call: ${block.name}`, block.input, `caller: ${block.caller?.type}`);
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
      };
    });

    // Append assistant turn + tool results
    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  throw new Error('Exceeded max iterations in programmatic loop');
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateToolChainRow(row) {
  const required = [
    'id',
    'workspace_id',
    'session_id',
    'tool_name',
    'status',
    'started_at',
    'completed_at',
    'duration_ms',
    'input_tokens',
    'output_tokens',
    'model_used',
    'created_at',
  ];
  const errors = [];

  for (const f of required) {
    if (row[f] == null) errors.push(`missing required field: ${f}`);
  }

  if (row.id && !row.id.startsWith('atc_')) errors.push(`id must start with atc_, got: ${row.id}`);

  if (!['completed', 'failed'].includes(row.status)) errors.push(`invalid status: ${row.status}`);

  if (typeof row.duration_ms !== 'number' || row.duration_ms < 0)
    errors.push(`invalid duration_ms: ${row.duration_ms}`);

  if (row.started_at > row.completed_at) errors.push('started_at must be <= completed_at');

  return errors;
}

function validateCommandRunRow(row) {
  const required = [
    'id',
    'workspace_id',
    'session_id',
    'command_name',
    'status',
    'exit_code',
    'duration_ms',
    'created_at',
  ];
  const errors = [];

  for (const f of required) {
    if (row[f] == null) errors.push(`missing required field: ${f}`);
  }

  if (row.id && !row.id.startsWith('acr_')) errors.push(`id must start with acr_, got: ${row.id}`);

  return errors;
}

// ─── Main test ────────────────────────────────────────────────────────────────

async function runTest() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[fatal] ANTHROPIC_API_KEY not set (add to .env.cloudflare or export in shell)');
    process.exit(1);
  }

  const model = resolveModel();
  const sessionId = `sess_test_${Date.now()}`;
  const workspaceId =
    (process.env.WORKSPACE_ID || process.env.CODE_EXEC_E2E_WORKSPACE_ID || 'ws_inneranimalmedia').trim();
  const tenantId = (process.env.TENANT_ID || process.env.CODE_EXEC_E2E_TENANT_ID || 'tenant_sam_primeaux').trim();
  const userId = (
    process.env.CODE_EXEC_E2E_USER_ID ||
    process.env.AGENT_SESSION_USER_ID ||
    'au_sam_iam'
  ).trim(); // canonical au_* format for row shape checks

  console.log('\n══════════════════════════════════════════════════');
  console.log(' IAM Code Execution E2E Test');
  console.log('══════════════════════════════════════════════════');
  console.log(` model:       ${model}`);
  console.log(` tool:        ${CODE_EXEC_TOOL_VERSION}`);
  console.log(` session:     ${sessionId}`);
  console.log(` workspace:   ${workspaceId}`);
  console.log('──────────────────────────────────────────────────\n');

  const tools = [{ type: CODE_EXEC_TOOL_VERSION, name: 'code_execution' }, SAMPLE_TOOL];

  const messages = [
    {
      role: 'user',
      content: [
        `Use code execution to call query_workspace_stats for workspace "${workspaceId}"`,
        'with a 7-day window. Then compute: what percentage of tool calls used Sonnet vs Haiku?',
        'Return a JSON object: { sonnet_pct: number, haiku_pct: number, total_calls: number }',
      ].join(' '),
    },
  ];

  const t0 = Date.now();
  let finalResponse;
  let toolCallLog;
  let containerId;

  try {
    ({ response: finalResponse, toolCallLog, containerId } = await runProgrammaticLoop(
      model,
      messages,
      tools,
    ));
  } catch (err) {
    console.error('[FAIL] API loop error:', err.message);
    process.exit(1);
  }

  const durationMs = Date.now() - t0;

  // Extract token usage
  const usage = finalResponse.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;

  // Rough cost estimate (sonnet-4-6: $3/$15 per M tokens)
  const costPerMIn = model.includes('haiku') ? 0.8 : model.includes('opus') ? 15.0 : 3.0;
  const costPerMOut = model.includes('haiku') ? 4.0 : model.includes('opus') ? 75.0 : 15.0;
  const costUsd = (inputTokens * costPerMIn + outputTokens * costPerMOut) / 1_000_000;

  // ── Extract final text response ──────────────────────────────────────────
  const textBlock = finalResponse.content.find((b) => b.type === 'text');
  console.log('─── Model response ───────────────────────────────');
  console.log(textBlock?.text ?? '[no text block]');
  console.log('──────────────────────────────────────────────────\n');

  // ── Build agentsam_tool_chain row ────────────────────────────────────────
  const toolChainRow = buildToolChainRow({
    toolName: 'code_execution',
    status: 'completed',
    durationMs,
    cost: costUsd,
    sessionId,
    workspaceId,
    tenantId,
    userId,
    modelUsed: model,
    inputTokens,
    outputTokens,
    workflowRunId: null,
    executionStepId: null,
    rawResult: {
      stop_reason: finalResponse.stop_reason,
      tool_calls: toolCallLog.length,
      container_id: containerId,
    },
  });

  // ── Build agentsam_command_run rows (one per bash invocation) ────────────
  // In production: extracted from code_execution_tool_result blocks.
  // Here: one synthetic row representing the full code execution run.
  const commandRunRow = buildCommandRunRow({
    commandName: 'code_execution_run',
    sessionId,
    workspaceId,
    tenantId,
    userId,
    durationMs,
    exitCode: 0,
    stdout: textBlock?.text ?? '',
    stderr: '',
    toolChainId: toolChainRow.id,
  });

  // ── Validate row shapes ──────────────────────────────────────────────────
  console.log('─── agentsam_tool_chain row ──────────────────────');
  console.log(JSON.stringify(toolChainRow, null, 2));

  console.log('\n─── agentsam_command_run row ─────────────────────');
  console.log(JSON.stringify(commandRunRow, null, 2));

  const chainErrors = validateToolChainRow(toolChainRow);
  const commandErrors = validateCommandRunRow(commandRunRow);

  console.log('\n─── Validation ───────────────────────────────────');
  if (chainErrors.length === 0) {
    console.log('  ✓ agentsam_tool_chain: valid');
  } else {
    chainErrors.forEach((e) => console.error('  ✗ agentsam_tool_chain:', e));
  }

  if (commandErrors.length === 0) {
    console.log('  ✓ agentsam_command_run: valid');
  } else {
    commandErrors.forEach((e) => console.error('  ✗ agentsam_command_run:', e));
  }

  // ── Tool call log ────────────────────────────────────────────────────────
  console.log('\n─── Tool calls (programmatic) ────────────────────');
  if (toolCallLog.length === 0) {
    console.log('  (none — model answered from code execution stdout only)');
  } else {
    toolCallLog.forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.name} — caller: ${t.caller?.type ?? 'direct'}`);
      console.log(`       input: ${JSON.stringify(t.input)}`);
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const allValid = chainErrors.length === 0 && commandErrors.length === 0;
  console.log('\n══════════════════════════════════════════════════');
  console.log(allValid ? ' ✓ PASS — all rows valid' : ' ✗ FAIL — validation errors above');
  console.log(`  model:         ${model}`);
  console.log(`  tool_calls:    ${toolCallLog.length}`);
  console.log(`  container_id:  ${containerId ?? 'n/a'}`);
  console.log(`  tokens:        ${inputTokens} in / ${outputTokens} out`);
  console.log(`  cost_est:      $${costUsd.toFixed(6)}`);
  console.log(`  duration_ms:   ${durationMs}`);
  console.log('══════════════════════════════════════════════════\n');

  process.exit(allValid ? 0 : 1);
}

runTest().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
