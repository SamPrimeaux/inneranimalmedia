#!/usr/bin/env node


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const DB = process.env.IAM_D1_DB || "inneranimalmedia-business";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const workspaceId = requireIdentity("IAM_WORKSPACE_ID", process.env.IAM_WORKSPACE_ID);
const tenantId = requireIdentity("IAM_TENANT_ID", process.env.IAM_TENANT_ID);
const userId = requireIdentity("IAM_USER_ID", process.env.IAM_USER_ID);

const stamp = Date.now();
const workflowKey = "openai_graph_e2e_smoke";
const workflowId = "wf_openai_graph_e2e_smoke";
const runId = `wrun_openai_e2e_${stamp}`;
const runGroupId = `rg_openai_e2e_${stamp}`;
const sessionId = `sess_openai_e2e_${stamp}`;

const MODEL_COST = {
  "gpt-5.4-nano": { in: 0.0002, out: 0.00125 },
  "gpt-5.4-mini": { in: 0.00075, out: 0.0045 },
};

const nodes = [
  {
    nodeKey: "route_classification",
    nodeType: "agent",
    model: "gpt-5.4-nano",
    toolName: "openai.responses.route_classification",
    userInput: "Classify an Agent Sam request into a route_key.",
    prompt: `Return JSON only.
Classify this Agent Sam request into one route_key:
chat, code, db_query, deploy, cms_edit, workflow_run, security_audit, r2_ops.

Request:
"Check D1 schema, patch Worker route, run smoke tests, then deploy if safe."

Expected JSON fields:
route_key, confidence, requires_tools, risk_level, reason`,
  },
  {
    nodeKey: "db_safety_check",
    nodeType: "agent",
    model: "gpt-5.4-mini",
    toolName: "openai.responses.db_safety_check",
    userInput: "Evaluate whether a destructive D1 query is safe.",
    prompt: `Return JSON only.
Analyze this SQL:
DROP TABLE agentsam_usage_events;

Expected JSON fields:
safe_to_run, risk_level, why, safer_alternative, requires_approval`,
  },
];

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function n(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(fallback);
}

function d1(command, json = false) {
  const args = ["wrangler", "d1", "execute", DB, "--remote"];
  if (json) args.push("--json");
  args.push("--command", command);

  const out = execFileSync("npx", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!json) return out;

  const parsed = JSON.parse(out);
  return parsed?.[0]?.results || [];
}

async function callOpenAI(model, input) {
  const started = performance.now();

  const body = {
    model,
    input,
    max_output_tokens: 300,
    store: false,
  };

  if (/^gpt-5/.test(model)) {
    body.reasoning = { effort: "low" };
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const elapsed = Math.round(performance.now() - started);
  const raw = await res.text();

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {}

  if (!res.ok) {
    throw new Error(`${model} failed ${res.status}: ${json?.error?.message || raw.slice(0, 400)}`);
  }

  const outputText =
    json.output_text ||
    (json.output || [])
      .flatMap((item) => item.content || [])
      .map((c) => c.text || "")
      .join("")
      .trim();

  const usage = json.usage || {};
  const tokensIn = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const tokensOut = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? tokensIn + tokensOut;
  const rate = MODEL_COST[model] || { in: 0, out: 0 };
  const costUsd = tokensIn * rate.in / 1000 + tokensOut * rate.out / 1000;

  let jsonValid = 0;
  try {
    JSON.parse(outputText);
    jsonValid = 1;
  } catch {}

  return {
    responseId: json.id || null,
    outputText,
    outputJson: jsonValid ? outputText : JSON.stringify({ raw: outputText }),
    tokensIn,
    tokensOut,
    totalTokens,
    costUsd,
    durationMs: elapsed,
    jsonValid,
  };
}

function ensureWorkflow() {
  d1(`
    INSERT OR IGNORE INTO agentsam_workflows (
      id,
      tenant_id,
      workspace_id,
      workflow_key,
      display_name,
      description,
      workflow_type,
      trigger_type,
      default_mode,
      default_task_type,
      risk_level,
      requires_approval,
      max_concurrent_nodes,
      timeout_ms,
      quality_gate_json,
      metadata_json,
      is_active,
      is_platform_global
    )
    VALUES (
      ${q(workflowId)},
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(workflowKey)},
      'OpenAI Graph E2E Smoke',
      'Minimal live-write smoke proving workflow_run to steps to tool_chain to usage to metrics.',
      'agentic',
      'manual',
      'agent',
      'workflow_run',
      'low',
      0,
      1,
      120000,
      '{}',
      ${q(JSON.stringify({ smoke: true, source: "scripts/smoke-agentsam-openai-graph-e2e.mjs" }))},
      1,
      0
    );
  `);

  d1(`
    INSERT OR IGNORE INTO agentsam_workflow_nodes (
      workflow_id,
      node_key,
      node_type,
      title,
      description,
      handler_key,
      input_schema_json,
      output_schema_json,
      timeout_ms,
      risk_level,
      requires_approval,
      is_active,
      sort_order
    )
    VALUES
    (${q(workflowId)}, 'route_classification', 'agent', 'Route Classification', 'Classify request route with gpt-5.4-nano.', 'openai.responses', '{}', '{}', 30000, 'low', 0, 1, 10),
    (${q(workflowId)}, 'db_safety_check', 'agent', 'D1 Safety Check', 'Check destructive SQL safety with gpt-5.4-mini.', 'openai.responses', '{}', '{}', 30000, 'medium', 0, 1, 20);
  `);

  d1(`
    INSERT OR IGNORE INTO agentsam_workflow_edges (
      workflow_id,
      from_node_key,
      to_node_key,
      condition_json,
      condition_type,
      priority,
      is_fallback,
      label
    )
    VALUES (
      ${q(workflowId)},
      'route_classification',
      'db_safety_check',
      '{}',
      'always',
      0,
      0,
      'route_then_safety'
    );
  `);
}

function createWorkflowRun() {
  d1(`
    INSERT INTO agentsam_workflow_runs (
      id,
      workflow_id,
      workflow_key,
      display_name,
      tenant_id,
      workspace_id,
      user_id,
      session_id,
      run_group_id,
      trigger_type,
      status,
      input_json,
      output_json,
      step_results_json,
      steps_completed,
      steps_total,
      environment,
      git_branch,
      metadata_json,
      graph_mode,
      current_node_key,
      max_runtime_ms,
      max_cost_usd,
      max_total_tokens
    )
    VALUES (
      ${q(runId)},
      ${q(workflowId)},
      ${q(workflowKey)},
      'OpenAI Graph E2E Smoke Run',
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(sessionId)},
      ${q(runGroupId)},
      'manual',
      'running',
      ${q(JSON.stringify({ smoke: true, models: nodes.map(n => n.model) }))},
      '{}',
      '[]',
      0,
      ${nodes.length},
      'production',
      'main',
      ${q(JSON.stringify({ smoke: true, created_by: "smoke-agentsam-openai-graph-e2e" }))},
      1,
      ${q(nodes[0].nodeKey)},
      120000,
      0.25,
      20000
    );
  `);
}

function createStep(node) {
  const stepId = `estep_openai_${node.nodeKey}_${stamp}`;

  d1(`
    INSERT INTO agentsam_execution_steps (
      id,
      execution_id,
      node_key,
      node_type,
      status,
      input_json,
      output_json,
      error_json,
      started_at,
      tokens_in,
      tokens_out,
      cost_usd,
      gate_results_json,
      attempt
    )
    VALUES (
      ${q(stepId)},
      ${q(runId)},
      ${q(node.nodeKey)},
      ${q(node.nodeType)},
      'running',
      ${q(JSON.stringify({ prompt: node.prompt, model: node.model }))},
      '{}',
      '{}',
      unixepoch(),
      0,
      0,
      0,
      '{}',
      1
    );
  `);

  return stepId;
}

function createCommandRun(node, result) {
  const commandRunId = `run_openai_${node.nodeKey}_${stamp}`;

  d1(`
    INSERT INTO agentsam_command_run (
      id,
      workspace_id,
      session_id,
      conversation_id,
      user_input,
      normalized_intent,
      intent_category,
      tier_used,
      model_id,
      commands_json,
      result_json,
      output_text,
      confidence_score,
      success,
      exit_code,
      duration_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      selected_command_slug,
      risk_level,
      requires_confirmation,
      approval_status,
      tenant_id,
      user_id
    )
    VALUES (
      ${q(commandRunId)},
      ${q(workspaceId)},
      ${q(sessionId)},
      ${q(runGroupId)},
      ${q(node.userInput)},
      ${q(node.nodeKey)},
      ${q(node.nodeKey === "db_safety_check" ? "db" : "misc")},
      1,
      ${q(node.model)},
      ${q(JSON.stringify([{ model: node.model, task: node.nodeKey }]))},
      ${q(result.outputJson)},
      ${q(result.outputText.slice(0, 2000))},
      ${result.jsonValid ? 0.9 : 0.5},
      1,
      0,
      ${n(result.durationMs)},
      ${n(result.tokensIn)},
      ${n(result.tokensOut)},
      ${n(result.costUsd)},
      ${q(node.nodeKey)},
      ${q(node.nodeKey === "db_safety_check" ? "critical" : "medium")},
      ${node.nodeKey === "db_safety_check" ? 1 : 0},
      ${q(node.nodeKey === "db_safety_check" ? "required" : "not_required")},
      ${q(tenantId)},
      ${q(userId)}
    );
  `);

  return commandRunId;
}

function createExecution(node, stepId, commandRunId, result) {
  const execId = `exec_openai_${node.nodeKey}_${stamp}`;

  d1(`
    INSERT INTO agentsam_executions (
      id,
      tenant_id,
      workspace_id,
      user_id,
      command_run_id,
      workflow_run_id,
      execution_step_id,
      task_id,
      execution_type,
      command,
      node_key,
      model_key,
      provider,
      output,
      duration_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      quality_score,
      status
    )
    VALUES (
      ${q(execId)},
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(commandRunId)},
      ${q(runId)},
      ${q(stepId)},
      ${q(runId)},
      'workflow',
      ${q(node.toolName)},
      ${q(node.nodeKey)},
      ${q(node.model)},
      'openai',
      ${q(result.outputText.slice(0, 2000))},
      ${n(result.durationMs)},
      ${n(result.tokensIn)},
      ${n(result.tokensOut)},
      ${n(result.costUsd)},
      ${result.jsonValid ? 0.9 : 0.45},
      'completed'
    );
  `);

  return execId;
}

function createToolChain(node, stepId, commandRunId, result, parentChainId = null) {
  const chainId = `atc_openai_${node.nodeKey}_${stamp}`;

  d1(`
    INSERT INTO agentsam_tool_chain (
      id,
      tenant_id,
      workspace_id,
      user_id,
      command_run_id,
      parent_chain_id,
      depth,
      tool_name,
      tool_status,
      input_json,
      output_summary,
      result_json,
      duration_ms,
      input_tokens,
      output_tokens,
      cost_usd,
      requires_approval,
      started_at,
      completed_at,
      execution_step_id,
      workflow_run_id
    )
    VALUES (
      ${q(chainId)},
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(commandRunId)},
      ${q(parentChainId)},
      ${parentChainId ? 1 : 0},
      ${q(node.toolName)},
      'completed',
      ${q(JSON.stringify({ model: node.model, prompt: node.prompt }))},
      ${q(result.outputText.slice(0, 500))},
      ${q(result.outputJson)},
      ${n(result.durationMs)},
      ${n(result.tokensIn)},
      ${n(result.tokensOut)},
      ${n(result.costUsd)},
      ${node.nodeKey === "db_safety_check" ? 1 : 0},
      unixepoch(),
      unixepoch(),
      ${q(stepId)},
      ${q(runId)}
    );
  `);

  return chainId;
}

function createUsageEvent(node, chainId, result) {
  const usageId = `ue_openai_${node.nodeKey}_${stamp}`;

  d1(`
    INSERT OR IGNORE INTO agentsam_usage_events (
      id,
      tenant_id,
      workspace_id,
      user_id,
      session_id,
      agent_name,
      provider,
      model,
      tokens_in,
      tokens_out,
      cost_usd,
      status,
      tool_name,
      reason,
      ref_table,
      ref_id,
      ai_model_id,
      event_type,
      model_key,
      duration_ms,
      total_tokens
    )
    VALUES (
      ${q(usageId)},
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(sessionId)},
      'agent-sam',
      'openai',
      ${q(node.model)},
      ${n(result.tokensIn)},
      ${n(result.tokensOut)},
      ${n(result.costUsd)},
      'ok',
      ${q(node.toolName)},
      'openai_graph_e2e_smoke',
      'agentsam_tool_chain',
      ${q(chainId)},
      NULL,
      'openai_graph_e2e_smoke',
      ${q(node.model)},
      ${n(result.durationMs)},
      ${n(result.totalTokens)}
    );
  `);
}

function completeStep(stepId, node, result) {
  d1(`
    UPDATE agentsam_execution_steps
    SET
      status = 'success',
      output_json = ${q(result.outputJson)},
      completed_at = unixepoch(),
      latency_ms = ${n(result.durationMs)},
      tokens_in = ${n(result.tokensIn)},
      tokens_out = ${n(result.tokensOut)},
      cost_usd = ${n(result.costUsd)},
      quality_score = ${result.jsonValid ? 0.9 : 0.45},
      edge_taken = ${q(node.nodeKey === "route_classification" ? "db_safety_check" : null)}
    WHERE id = ${q(stepId)};
  `);
}

function createDependency(chainId, dependsOnChainId) {
  if (!dependsOnChainId) return;

  d1(`
    INSERT OR IGNORE INTO agentsam_execution_dependency_graph (
      tenant_id,
      workspace_id,
      user_id,
      run_group_id,
      workflow_run_id,
      chain_id,
      depends_on_chain_id,
      dependency_type,
      condition_json,
      status,
      metadata_json
    )
    VALUES (
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(runGroupId)},
      ${q(runId)},
      ${q(chainId)},
      ${q(dependsOnChainId)},
      'sequential',
      '{}',
      'satisfied',
      ${q(JSON.stringify({ smoke: true }))}
    );
  `);
}

function createPerformanceMetric(node, chainId, result) {
  const date = new Date().toISOString().slice(0, 10);

  d1(`
    INSERT OR IGNORE INTO agentsam_execution_performance_metrics (
      tenant_id,
      workspace_id,
      user_id,
      metric_date,
      metric_grain,
      source_table,
      tool_name,
      workflow_id,
      workflow_run_id,
      chain_id,
      task_type,
      trigger_key,
      model_key,
      provider,
      execution_count,
      success_count,
      failure_count,
      avg_duration_ms,
      min_duration_ms,
      max_duration_ms,
      success_rate_percent,
      total_tokens_consumed,
      input_tokens,
      output_tokens,
      total_cost_usd,
      avg_cost_usd,
      avg_quality_score,
      status_counts_json,
      metadata_json,
      first_seen_at,
      last_seen_at,
      node_key
    )
    VALUES (
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(userId)},
      ${q(date)},
      'daily',
      'agentsam_tool_chain',
      ${q(node.toolName)},
      ${q(workflowId)},
      ${q(runId)},
      ${q(chainId)},
      ${q(node.nodeKey)},
      'openai_graph_e2e_smoke',
      ${q(node.model)},
      'openai',
      1,
      1,
      0,
      ${n(result.durationMs)},
      ${n(result.durationMs)},
      ${n(result.durationMs)},
      100,
      ${n(result.totalTokens)},
      ${n(result.tokensIn)},
      ${n(result.tokensOut)},
      ${n(result.costUsd)},
      ${n(result.costUsd)},
      ${result.jsonValid ? 0.9 : 0.45},
      '{"completed":1}',
      ${q(JSON.stringify({ smoke: true }))},
      unixepoch(),
      unixepoch(),
      ${q(node.nodeKey)}
    );
  `);
}

async function main() {
  console.log(`Starting Agent Sam OpenAI graph E2E smoke: ${runId}`);

  ensureWorkflow();
  createWorkflowRun();

  const stepResults = [];
  let parentChainId = null;
  let totals = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: 0,
    modelUsed: null,
  };

  for (const node of nodes) {
    console.log(`Calling ${node.model} for ${node.nodeKey}`);

    d1(`
      UPDATE agentsam_workflow_runs
      SET current_node_key = ${q(node.nodeKey)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${q(runId)};
    `);

    const stepId = createStep(node);
    const result = await callOpenAI(node.model, node.prompt);
    const commandRunId = createCommandRun(node, result);
    createExecution(node, stepId, commandRunId, result);
    const chainId = createToolChain(node, stepId, commandRunId, result, parentChainId);
    createUsageEvent(node, chainId, result);
    completeStep(stepId, node, result);
    createDependency(chainId, parentChainId);
    createPerformanceMetric(node, chainId, result);

    parentChainId = chainId;

    totals.inputTokens += result.tokensIn;
    totals.outputTokens += result.tokensOut;
    totals.costUsd += result.costUsd;
    totals.durationMs += result.durationMs;
    totals.modelUsed = node.model;

    stepResults.push({
      node_key: node.nodeKey,
      model: node.model,
      step_id: stepId,
      command_run_id: commandRunId,
      chain_id: chainId,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: Number(result.costUsd.toFixed(8)),
      duration_ms: result.durationMs,
      json_valid: result.jsonValid === 1,
    });

    d1(`
      UPDATE agentsam_workflow_runs
      SET
        steps_completed = steps_completed + 1,
        step_results_json = ${q(JSON.stringify(stepResults))},
        input_tokens = ${n(totals.inputTokens)},
        output_tokens = ${n(totals.outputTokens)},
        cost_usd = ${n(totals.costUsd)},
        duration_ms = ${n(totals.durationMs)},
        model_used = ${q(totals.modelUsed)},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${q(runId)};
    `);
  }

  d1(`
    UPDATE agentsam_workflow_runs
    SET
      status = 'completed',
      output_json = ${q(JSON.stringify({ pass: true, smoke: "openai_graph_e2e", step_results: stepResults }))},
      completed_at = unixepoch(),
      current_node_key = NULL,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ${q(runId)};
  `);

  const verify = d1(`
    SELECT
      r.id AS workflow_run_id,
      r.status,
      r.steps_completed,
      r.steps_total,
      r.input_tokens,
      r.output_tokens,
      r.cost_usd,
      COUNT(DISTINCT s.id) AS step_rows,
      COUNT(DISTINCT tc.id) AS tool_chain_rows,
      COUNT(DISTINCT u.id) AS usage_rows,
      COUNT(DISTINCT cr.id) AS command_run_rows,
      COUNT(DISTINCT edg.id) AS dependency_rows,
      COUNT(DISTINCT epm.id) AS metric_rows
    FROM agentsam_workflow_runs r
    LEFT JOIN agentsam_execution_steps s
      ON s.execution_id = r.id
    LEFT JOIN agentsam_tool_chain tc
      ON tc.workflow_run_id = r.id
    LEFT JOIN agentsam_usage_events u
      ON u.ref_table = 'agentsam_tool_chain'
     AND u.ref_id = tc.id
    LEFT JOIN agentsam_command_run cr
      ON cr.id = tc.command_run_id
    LEFT JOIN agentsam_execution_dependency_graph edg
      ON edg.workflow_run_id = r.id
    LEFT JOIN agentsam_execution_performance_metrics epm
      ON epm.workflow_run_id = r.id
    WHERE r.id = ${q(runId)}
    GROUP BY r.id;
  `, true);

  console.log(JSON.stringify({
    pass: true,
    workflow_run_id: runId,
    workflow_key: workflowKey,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    totals,
    stepResults,
    verify: verify[0] || null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  try {
    d1(`
      UPDATE agentsam_workflow_runs
      SET status = 'failed',
          error_message = ${q(err.message)},
          completed_at = unixepoch(),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${q(runId)};
    `);
  } catch {}
  process.exit(1);
});
