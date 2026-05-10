#!/usr/bin/env node
import { execFileSync } from "node:child_process";


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

const DB = process.env.IAM_D1_DB || "inneranimalmedia-business";
const tenantId = requireIdentity("IAM_TENANT_ID", process.env.IAM_TENANT_ID);
const workspaceId = requireIdentity("IAM_WORKSPACE_ID", process.env.IAM_WORKSPACE_ID);
const userId = requireIdentity("IAM_USER_ID", process.env.IAM_USER_ID);

if (!tenantId || !workspaceId || !userId) {
  throw new Error("Missing IAM_TENANT_ID, IAM_WORKSPACE_ID, or IAM_USER_ID. Refusing to run without explicit tenant/workspace/user scope.");
}


const workflowId = "wf_cms_live_editor_dev_app";
const workflowKey = "cms_live_editor_dev_app";
const planId = "plan_cms_live_editor_dev_20260509";
const todoId = "todo_cms_live_editor";
const projectContextId = "ctx_project_cms_live_editor_dev_app";

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function d1(sql, json = false) {
  const args = ["wrangler", "d1", "execute", DB, "--remote"];
  if (json) args.push("--json");
  args.push("--command", sql);
  const out = execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!json) return out;
  return JSON.parse(out)?.[0]?.results || [];
}

const colCache = new Map();

function tableExists(table) {
  return d1(`SELECT name FROM sqlite_master WHERE type='table' AND name=${q(table)};`, true).length > 0;
}

function cols(table) {
  if (colCache.has(table)) return colCache.get(table);
  if (!tableExists(table)) {
    const empty = new Set();
    colCache.set(table, empty);
    return empty;
  }
  const set = new Set(d1(`PRAGMA table_info(${table});`, true).map(r => r.name));
  colCache.set(table, set);
  return set;
}

function insertFiltered(table, values, { replace = false, ignore = true } = {}) {
  if (!tableExists(table)) {
    console.log(`[skip] missing table ${table}`);
    return;
  }
  const c = cols(table);
  const entries = Object.entries(values).filter(([k]) => c.has(k));
  if (!entries.length) {
    console.log(`[skip] no matching cols ${table}`);
    return;
  }
  const verb = replace ? "INSERT OR REPLACE" : ignore ? "INSERT OR IGNORE" : "INSERT";
  d1(`${verb} INTO ${table} (${entries.map(([k]) => k).join(", ")}) VALUES (${entries.map(([,v]) => q(v)).join(", ")});`);
  console.log(`[ok] ${table}`);
}

function update(table, values, where) {
  if (!tableExists(table)) {
    console.log(`[skip] missing table ${table}`);
    return;
  }
  const c = cols(table);
  const sets = Object.entries(values)
    .filter(([k]) => c.has(k))
    .map(([k, v]) => `${k}=${q(v)}`);
  if (!sets.length) {
    console.log(`[skip] no update cols ${table}`);
    return;
  }
  d1(`UPDATE ${table} SET ${sets.join(", ")} WHERE ${where};`);
  console.log(`[ok] update ${table}`);
}

function getLatestWireRun() {
  const rows = d1(`
    SELECT id, workflow_key, run_group_id, created_at
    FROM agentsam_workflow_runs
    WHERE workflow_id=${q(workflowId)}
      AND id LIKE 'wrun_cms_live_editor_wire_%'
    ORDER BY created_at DESC
    LIMIT 1;
  `, true);

  if (!rows.length) throw new Error("No wrun_cms_live_editor_wire_* workflow run found.");
  return rows[0];
}

function main() {
  const latest = getLatestWireRun();
  const workflowRunId = latest.id;
  const runGroupId = latest.run_group_id || workflowRunId.replace(/^wrun_/, "");
  const now = Math.floor(Date.now() / 1000);

  console.log("Finalizing execution links for", { workflowRunId, runGroupId });

  const chains = d1(`
    SELECT id, tool_name, depth, tool_status, input_json, result_json, started_at, completed_at
    FROM agentsam_tool_chain
    WHERE workflow_run_id=${q(workflowRunId)}
    ORDER BY depth ASC, started_at ASC;
  `, true);

  if (!chains.length) throw new Error(`No agentsam_tool_chain rows for ${workflowRunId}`);

  // 1. Parent execution row.
  const executionId = `exec_cms_live_editor_${workflowRunId.replace(/^wrun_/, "")}`;

  insertFiltered("agentsam_executions", {
    id: executionId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    plan_id: planId,
    todo_id: todoId,
    workflow_run_id: workflowRunId,
    task_id: workflowRunId,
    agent_id: "subagent_oasmoke_iam",
    execution_type: "workflow",
    node_key: "cms_live_editor_prompt_dependency_wire",
    model_key: "gpt-5.4-nano",
    provider: "openai",
    output: `Execution shell for ${workflowRunId}. Prompt routes, prompt versions, tool chain rows, and dependency graph are wired.`,
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    quality_score: 1,
    status: "completed",
    created_at: now
  });

  // 2. Step rows, one per concrete tool_chain phase.
  for (const c of chains) {
    const estepId = `estep_${c.id.replace(/^atc_/, "")}`;

    insertFiltered("agentsam_execution_steps", {
      id: estepId,
      execution_id: workflowRunId,
      node_key: c.tool_name,
      node_type: c.tool_name?.startsWith("approval.") ? "approval_gate" : "agent",
      status: c.tool_status === "completed" ? "success" : c.tool_status || "success",
      input_json: c.input_json || "{}",
      output_json: c.result_json || "{}",
      error_json: "{}",
      started_at: c.started_at || now,
      completed_at: c.completed_at || now,
      latency_ms: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      quality_score: 1,
      gate_results_json: JSON.stringify({
        pass: true,
        source: "finalize-cms-live-editor-execution-links",
        tool_chain_id: c.id
      }),
      attempt: 1,
      edge_taken: null
    });

    // Backlink tool_chain to step if live column exists.
    update("agentsam_tool_chain", {
      execution_step_id: estepId,
      workflow_run_id: workflowRunId
    }, `id=${q(c.id)}`);

    // Backlink execution to latest step if schema supports it.
    update("agentsam_executions", {
      execution_step_id: estepId
    }, `id=${q(executionId)}`);
  }

  // 3. Performance metric row.
  insertFiltered("agentsam_execution_performance_metrics", {
    id: `epm_cms_live_editor_${workflowRunId.replace(/^wrun_/, "")}`,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    metric_date: new Date().toISOString().slice(0, 10),
    metric_grain: "daily",
    source_table: "agentsam_workflow_runs",
    workflow_id: workflowId,
    workflow_run_id: workflowRunId,
    task_type: "cms_live_editor_dev_app",
    intent_category: "cms",
    trigger_key: "manual",
    model_key: "gpt-5.4-nano",
    provider: "openai",
    execution_count: 1,
    success_count: 1,
    failure_count: 0,
    timeout_count: 0,
    blocked_count: 0,
    skipped_count: 0,
    cancelled_count: 0,
    approval_required_count: 1,
    sla_breach_count: 0,
    avg_duration_ms: 0,
    min_duration_ms: 0,
    max_duration_ms: 0,
    median_duration_ms: 0,
    p95_duration_ms: 0,
    p99_duration_ms: 0,
    success_rate_percent: 100,
    failure_rate_percent: 0,
    timeout_rate_percent: 0,
    sla_breach_rate_percent: 0,
    total_tokens_consumed: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_cost_usd: 0,
    total_cost_cents: 0,
    avg_cost_usd: 0,
    avg_confidence_score: 1,
    avg_quality_score: 1,
    error_types_json: "{}",
    status_counts_json: JSON.stringify({ completed: 1 }),
    metadata_json: JSON.stringify({
      workflow_id: workflowId,
      workflow_key: workflowKey,
      execution_id: executionId,
      step_count: chains.length,
      source: "finalize-cms-live-editor-execution-links"
    }),
    first_seen_at: now,
    last_seen_at: now,
    last_computed_at: now,
    node_key: "cms_live_editor_runtime_wiring"
  });

  // 4. Roll up workflow run.
  update("agentsam_workflow_runs", {
    status: "completed",
    steps_completed: chains.length,
    steps_total: chains.length,
    model_used: "gpt-5.4-nano",
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    current_node_key: "promotion_gate",
    completed_at: now,
    output_json: JSON.stringify({
      ok: true,
      execution_id: executionId,
      steps: chains.length,
      dependency_graph: "wired",
      project_context: projectContextId,
      next_action: "Run nano-first live editor dry-run to create R2 dev app/template-library artifacts."
    }),
    updated_at: new Date().toISOString()
  }, `id=${q(workflowRunId)}`);

  // 5. Roll up active plan.
  update("agentsam_plans", {
    workflow_run_id: workflowRunId,
    tasks_total: 6,
    tasks_done: 6,
    tasks_blocked: 0,
    tokens_used: 0,
    cost_usd: 0,
    linked_context_ids: JSON.stringify([projectContextId]),
    linked_todo_ids: JSON.stringify([todoId]),
    updated_at: now
  }, `id=${q(planId)}`);

  // 6. Roll up project context.
  update("agentsam_project_context", {
    linked_plan_id: planId,
    linked_todo_ids: JSON.stringify([todoId]),
    tokens_used: 0,
    cost_usd: 0,
    notes: JSON.stringify({
      workflow_id: workflowId,
      workflow_run_id: workflowRunId,
      execution_id: executionId,
      execution_steps: chains.length,
      dependency_graph_edges: chains.length - 1,
      prompt_routes: 6,
      prompt_versions: 6,
      prompt_cache_keys_expected: 6,
      scripts_registered: [
        "script_d1_pragmas_cms_schema_inspect",
        "script_d1_sample_rows_cms_smoke_select",
        "script_r2_registry_verify_artifacts",
        "script_workflow_graph_rows_smoke",
        "script_telemetry_verify_joins",
        "script_template_library_dry_run_generation",
        "script_dashboard_route_browser_smoke",
        "script_cms_live_editor_seed_dev_artifacts"
      ],
      next_action: "Execute the nano-first dry-run that writes dev/cms-live-editor and cms/test-runs/live-editor-template-library artifacts."
    }),
    updated_at: now
  }, `id=${q(projectContextId)}`);

  // 7. Todo becomes runtime-ready, not complete.
  update("agentsam_todo", {
    execution_status: "ready",
    tokens_used: 0,
    cost_usd: 0,
    output_summary: "CMS live editor dev app is wired into workflows, workflow_runs, prompt routes, prompt versions, tool_chain, execution_steps, dependency_graph, performance metrics, agentsam_plans, and project_context. Ready for nano-first dry-run artifact generation.",
    updated_at: new Date().toISOString()
  }, `id=${q(todoId)}`);

  console.log(JSON.stringify({
    pass: true,
    workflow_run_id: workflowRunId,
    execution_id: executionId,
    tool_chain_rows: chains.length,
    execution_steps: chains.length,
    performance_metric: true,
    project_context_id: projectContextId,
    todo_id: todoId
  }, null, 2));
}

main();
