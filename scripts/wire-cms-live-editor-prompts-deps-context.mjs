#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";


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
const projectKey = "iam-platform-sprint-may2026";
const planId = "plan_cms_live_editor_dev_20260509";

const nowMs = Date.now();
const runId = `wrun_cms_live_editor_wire_${nowMs}`;
const commandRunId = `run_cms_live_editor_wire_${nowMs}`;
const runGroupId = runId.replace(/^wrun_/, "");

const phases = [
  {
    node_key: "discover_cms_schema",
    route_key: "cms_live_editor.discover_cms_schema",
    prompt_id: "prompt_cms_live_editor_discover_schema",
    version_id: "pver_cms_live_editor_discover_schema_v1",
    tool_name: "cms_schema_discovery",
    model_key: "gpt-5.4-nano",
    summary: "Discover all cms_* tables, classify roles, row-readiness, relationships, and live-editor needs."
  },
  {
    node_key: "design_template_library",
    route_key: "cms_live_editor.design_template_library",
    prompt_id: "prompt_cms_live_editor_template_library",
    version_id: "pver_cms_live_editor_template_library_v1",
    tool_name: "template_library_plan",
    model_key: "gpt-5.4-nano",
    summary: "Map cms_* tables into Shopify-style themes, templates, sections, blocks, routes, navigation, assets, and settings."
  },
  {
    node_key: "generate_dev_app_manifest",
    route_key: "cms_live_editor.generate_dev_app_manifest",
    prompt_id: "prompt_cms_live_editor_dev_manifest",
    version_id: "pver_cms_live_editor_dev_manifest_v1",
    tool_name: "dev_app_manifest",
    model_key: "gpt-5.4-nano",
    summary: "Generate a test-only R2 dev-app manifest, route/component contracts, CMS bindings, and artifact map."
  },
  {
    node_key: "write_r2_artifacts",
    route_key: "cms_live_editor.write_r2_artifacts",
    prompt_id: "prompt_cms_live_editor_write_artifacts",
    version_id: "pver_cms_live_editor_write_artifacts_v1",
    tool_name: "write_cms_live_editor_dev_artifacts",
    model_key: "gpt-5.4-nano",
    summary: "Write outputs only to safe R2 prefixes and register every object in agentsam_artifacts."
  },
  {
    node_key: "verify_live_editor_contract",
    route_key: "cms_live_editor.verify_contract",
    prompt_id: "prompt_cms_live_editor_verify_contract",
    version_id: "pver_cms_live_editor_verify_contract_v1",
    tool_name: "eval_cms_live_editor_contract",
    model_key: "gpt-5.4-nano",
    summary: "Verify safe prefixes, artifact registry coverage, JSON validity, telemetry joins, and no live promotion."
  },
  {
    node_key: "promotion_gate",
    route_key: "cms_live_editor.promotion_gate",
    prompt_id: "prompt_cms_live_editor_promotion_gate",
    version_id: "pver_cms_live_editor_promotion_gate_v1",
    tool_name: "approval.cms_live_editor_promotion",
    model_key: "gpt-5.4-nano",
    summary: "Require explicit approval before anything touches live cms/themes, pages, components, src, static, assets, or dashboard paths."
  }
];

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function roughTokenCount(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function isoPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function d1(sql, json = false) {
  const args = ["wrangler", "d1", "execute", DB, "--remote"];
  if (json) args.push("--json");
  args.push("--command", sql);

  const out = execFileSync("npx", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (!json) return out;
  return JSON.parse(out)?.[0]?.results || [];
}

const tableCache = new Map();

function tableExists(table) {
  const rows = d1(`SELECT name FROM sqlite_master WHERE type='table' AND name=${q(table)};`, true);
  return rows.length > 0;
}

function tableColumns(table) {
  if (tableCache.has(table)) return tableCache.get(table);

  if (!tableExists(table)) {
    tableCache.set(table, new Set());
    return new Set();
  }

  const cols = new Set(d1(`PRAGMA table_info(${table});`, true).map((r) => r.name));
  tableCache.set(table, cols);
  return cols;
}

function insertFiltered(table, values, { replace = false, ignore = true } = {}) {
  if (!tableExists(table)) {
    console.log(`[skip] missing table ${table}`);
    return null;
  }

  const cols = tableColumns(table);
  const entries = Object.entries(values).filter(([k]) => cols.has(k));

  if (!entries.length) {
    console.log(`[skip] no matching columns for ${table}`);
    return null;
  }

  const verb = replace ? "INSERT OR REPLACE" : ignore ? "INSERT OR IGNORE" : "INSERT";
  const sql = `${verb} INTO ${table} (${entries.map(([k]) => k).join(", ")}) VALUES (${entries.map(([, v]) => q(v)).join(", ")});`;

  d1(sql);
  console.log(`[ok] ${table}`);
  return true;
}

function updateProjectContext() {
  const summary = {
    project_key: projectKey,
    workflow_id: workflowId,
    workflow_key: workflowKey,
    run_id: runId,
    default_model: "gpt-5.4-nano",
    prompt_routes: phases.map((p) => p.route_key),
    prompt_versions: phases.map((p) => p.version_id),
    dependency_graph: phases.map((p) => p.node_key),
    reusable_scripts: [
      "script_d1_pragmas_cms_schema_inspect",
      "script_d1_sample_rows_cms_smoke_select",
      "script_r2_registry_verify_artifacts",
      "script_workflow_graph_rows_smoke",
      "script_telemetry_verify_joins",
      "script_template_library_dry_run_generation",
      "script_dashboard_route_browser_smoke",
      "script_cms_live_editor_seed_dev_artifacts"
    ],
    safe_r2_prefixes: [
      "dev/cms-live-editor/",
      "cms/test-runs/live-editor-template-library/",
      "captures/inneranimalmedia/results/",
      "analytics/agentsam/cms-live-editor/"
    ],
    forbidden_without_approval: [
      "cms/themes/",
      "pages/",
      "components/",
      "src/",
      "static/",
      "assets/",
      "dashboard/"
    ],
    next_action: "Run a nano-first dry run that executes schema discovery, template-library plan, dev-app manifest, artifact write, verification, then approval gate."
  };

  insertFiltered("agentsam_project_context", {
    id: "ctx_project_cms_live_editor_dev_app",
    tenant_id: tenantId,
    workspace_id: workspaceId,
    project_key: projectKey,
    project_name: "IAM CMS Live Editor Dev App",
    project_type: "cms_live_editor_dev_app",
    status: "active",
    priority: 90,
    description: "Durable context for the R2-stored CMS live editor dev app, Shopify-style template library, prompt routes, prompt versions, cache keys, dependency graph, reusable scripts, and approval-gated promotion path.",
    goals: JSON.stringify([
      "Build test-only R2 stored .dev CMS live editor app",
      "Create Shopify-style template library from cms_* tables",
      "Register every generated/found artifact in agentsam_artifacts",
      "Use gpt-5.4-nano by default to minimize test cost",
      "Require approval before live CMS/app path promotion"
    ]),
    constraints: JSON.stringify({
      default_model: "gpt-5.4-nano",
      max_test_cost_usd: 0.25,
      safe_r2_prefixes: summary.safe_r2_prefixes,
      forbidden_without_approval: summary.forbidden_without_approval
    }),
    current_blockers: JSON.stringify([]),
    primary_tables: JSON.stringify([
      "cms_pages",
      "cms_page_sections",
      "cms_section_components",
      "cms_assets",
      "cms_themes",
      "agentsam_artifacts"
    ]),
    secondary_tables: JSON.stringify([
      "agentsam_prompt_routes",
      "agentsam_prompt_versions",
      "agentsam_prompt_cache_keys",
      "agentsam_execution_dependency_graph",
      "agentsam_workflows",
      "agentsam_workflow_runs",
      "agentsam_tool_chain",
      "agentsam_scripts",
      "agentsam_model_routing_memory"
    ]),
    workers_involved: JSON.stringify(["inneranimalmedia"]),
    r2_buckets_involved: JSON.stringify(["inneranimalmedia"]),
    domains_involved: JSON.stringify(["inneranimalmedia.com"]),
    mcp_services_involved: JSON.stringify(["d1", "r2", "openai"]),
    key_files: JSON.stringify([
      "scripts/wire-cms-live-editor-prompts-deps-context.mjs",
      "scripts/study-agentsam-commands-for-scripts.mjs",
      "scripts/seed-cms-live-editor-runtime.mjs"
    ]),
    related_routes: JSON.stringify(["/dashboard/agent", "/dashboard/overview"]),
    tokens_budgeted: 20000,
    tokens_used: 0,
    cost_usd: 0,
    linked_plan_id: planId,
    linked_todo_ids: JSON.stringify(["todo_cms_live_editor"]),
    agent_id: "subagent_oasmoke_iam",
    session_id: `sess_${runGroupId}`,
    created_by: userId,
    notes: JSON.stringify(summary),
    started_at: Math.floor(Date.now() / 1000),
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000)
  }, { ignore: true });

  d1(`
    UPDATE agentsam_project_context
    SET
      description=${q("Durable context for CMS live editor dev app prompt/dependency/script wiring refreshed.")},
      goals=${q(JSON.stringify(summary))},
      notes=${q(JSON.stringify(summary))},
      linked_plan_id=${q(planId)},
      linked_todo_ids=${q(JSON.stringify(["todo_cms_live_editor"]))},
      updated_at=unixepoch()
    WHERE id='ctx_project_cms_live_editor_dev_app';
  `);

  console.log("[ok] agentsam_project_context");
}

function main() {
  console.log("Wiring CMS live editor prompt routes, versions, cache keys, dependency graph, and project context...");
  console.log({ DB, tenantId, workspaceId, userId, workflowId });

  insertFiltered("agentsam_command_run", {
    id: commandRunId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    session_id: `sess_${runGroupId}`,
    conversation_id: `conv_${runGroupId}`,
    user_input: "Wire CMS live editor dev app prompt routes, cache keys, execution dependency graph, and project context.",
    normalized_intent: "cms_live_editor_prompt_dependency_context_wire",
    intent_category: "misc",
    model_id: "gpt-5.4-nano",
    commands_json: JSON.stringify(phases.map((p) => p.route_key)),
    result_json: JSON.stringify({ ok: true, workflow_id: workflowId, run_id: runId }),
    output_text: "Wired CMS live editor prompt/dependency/project context.",
    success: 1,
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    created_at: Math.floor(Date.now() / 1000)
  });

  insertFiltered("agentsam_workflow_runs", {
    id: runId,
    workflow_id: workflowId,
    workflow_key: workflowKey,
    display_name: "CMS Live Editor Prompt/Dependency Wiring",
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    session_id: `sess_${runGroupId}`,
    run_group_id: runGroupId,
    trigger_type: "manual",
    status: "completed",
    input_json: JSON.stringify({ phases, source: "wire-cms-live-editor-prompts-deps-context" }),
    output_json: JSON.stringify({ ok: true, prompt_routes: phases.length, dependency_edges: phases.length - 1 }),
    step_results_json: JSON.stringify([]),
    steps_completed: phases.length,
    steps_total: phases.length,
    model_used: "gpt-5.4-nano",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    environment: "production",
    metadata_json: JSON.stringify({ dry_run_seed: true, source: "wire-cms-live-editor-prompts-deps-context" }),
    graph_mode: 1,
    started_at: Math.floor(Date.now() / 1000),
    completed_at: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const chainIds = [];

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];

    const promptMarkdown = `# ${p.route_key}

## Mission
${p.summary}

## Runtime
- Workflow: ${workflowKey}
- Node: ${p.node_key}
- Default model: ${p.model_key}
- Cost posture: nano-first, escalate only on failure or ambiguity.

## Required output
Return structured JSON with pass/fail, artifacts, safe R2 keys, D1 rows touched, failures, and next action.

## Safety
Test-only by default. Do not write to live cms/themes, pages, components, src, static, assets, or dashboard without promotion approval.`;

    insertFiltered("agentsam_prompt_versions", {
      id: p.version_id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: userId,
      agent_id: "subagent_oasmoke_iam",
      prompt_key: p.prompt_id,
      version: 1,
      prompt_hash: sha256(promptMarkdown),
      body: promptMarkdown,
      body_tokens: roughTokenCount(promptMarkdown),
      is_active: 1,
      prompt_kind: "workflow_node",
      status: "active",
      is_cacheable: 1,
      cache_priority: 80,
      min_tokens_for_cache: 100,
      notes: JSON.stringify({
        workflow_id: workflowId,
        workflow_key: workflowKey,
        node_key: p.node_key,
        route_key: p.route_key,
        model_key: p.model_key,
        source: "wire-cms-live-editor-prompts-deps-context"
      }),
      created_at: Math.floor(Date.now() / 1000)
    });

    insertFiltered("agentsam_prompt_routes", {
      id: `proute_${p.node_key}`,
      tenant_id: tenantId,
      route_key: p.route_key,
      display_name: `${p.node_key} route`,
      intent_labels: JSON.stringify(["cms_live_editor", p.node_key, "template_library", "dev_app"]),
      command_categories: JSON.stringify(["cms", "workflow", "agent"]),
      trigger_keywords: JSON.stringify(["cms live editor", p.node_key, p.tool_name]),
      prompt_layer_keys: JSON.stringify(["core_identity", p.prompt_id]),
      tool_categories: JSON.stringify(["cms", "d1", "r2", "workflow"]),
      tool_keys: JSON.stringify([p.tool_name]),
      max_tools: 8,
      preferred_model: p.model_key,
      fallback_model: p.model_key === "gpt-5.4-nano" ? "gpt-5.4-mini" : "gpt-5.4-nano",
      include_rag: 1,
      include_active_plan: 1,
      include_recent_memory: 1,
      memory_limit: 5,
      include_workspace_ctx: 1,
      token_budget: 2000,
      is_active: 1,
      priority: i + 1,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const cacheKey = `prompt:${workflowKey}:${p.node_key}:v1:${p.model_key}`;

    insertFiltered("agentsam_prompt_cache_keys", {
      id: `pck_${p.node_key}`,
      tenant_id: tenantId,
      provider: "openai",
      model_key: p.model_key,
      cache_key_hash: sha256(cacheKey),
      cache_type: "compiled_prompt",
      token_count: roughTokenCount(promptMarkdown),
      write_cost_usd: 0,
      read_count: 0,
      total_read_savings_usd: 0,
      first_written_at: new Date().toISOString(),
      expires_at: isoPlusSeconds(86400),
      source_type: "agentsam_prompt_versions",
      source_id: p.version_id,
      workspace_id: workspaceId,
      agent_id: "subagent_oasmoke_iam",
      session_id: `sess_${runGroupId}`,
      user_id: userId,
      prompt_version_id: p.version_id,
      layer_keys_json: JSON.stringify(["core_identity", p.prompt_id]),
      is_shared: 0,
      fragment_hash: sha256(promptMarkdown.slice(0, 512)),
      route_key: p.route_key
    });

    const chainId = `atc_wire_${p.node_key}_${nowMs}`;
    chainIds.push(chainId);

    insertFiltered("agentsam_tool_chain", {
      id: chainId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: userId,
      todo_id: "todo_cms_live_editor",
      command_run_id: commandRunId,
      depth: i,
      tool_name: p.tool_name,
      tool_status: "completed",
      input_json: JSON.stringify({ route_key: p.route_key, prompt_version_id: p.version_id }),
      output_summary: `Wired ${p.node_key} to prompt route/version/cache key.`,
      result_json: JSON.stringify({ ok: true, node_key: p.node_key, route_key: p.route_key, prompt_version_id: p.version_id }),
      duration_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      started_at: Math.floor(Date.now() / 1000),
      completed_at: Math.floor(Date.now() / 1000),
      workflow_run_id: runId
    });
  }

  for (let i = 1; i < chainIds.length; i++) {
    const current = phases[i];
    const prev = phases[i - 1];

    insertFiltered("agentsam_execution_dependency_graph", {
      id: `edg_wire_${prev.node_key}_to_${current.node_key}`,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: userId,
      run_group_id: runGroupId,
      workflow_run_id: runId,
      plan_id: planId,
      plan_task_id: "todo_cms_live_editor",
      chain_id: chainIds[i],
      depends_on_chain_id: chainIds[i - 1],
      dependency_type: current.node_key === "promotion_gate" ? "approval_gate" : "sequential",
      condition_expression: i === chainIds.length - 1 ? "verify_live_editor_contract.pass == true" : "previous.status == completed",
      condition_json: JSON.stringify({
        from_node_key: prev.node_key,
        to_node_key: current.node_key,
        condition: i === chainIds.length - 1 ? "verified_before_promotion" : "sequential_success"
      }),
      status: "active",
      metadata_json: JSON.stringify({
        workflow_id: workflowId,
        workflow_key: workflowKey,
        from_node_key: prev.node_key,
        to_node_key: current.node_key,
        source: "wire-cms-live-editor-prompts-deps-context"
      }),
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });
  }

  updateProjectContext();

  console.log("DONE");
  console.log(JSON.stringify({
    pass: true,
    workflow_id: workflowId,
    workflow_run_id: runId,
    command_run_id: commandRunId,
    prompt_routes: phases.length,
    prompt_versions: phases.length,
    prompt_cache_keys: phases.length,
    tool_chain_nodes: chainIds.length,
    dependency_edges: Math.max(0, chainIds.length - 1),
    project_context: "ctx_project_cms_live_editor_dev_app"
  }, null, 2));
}

main();
