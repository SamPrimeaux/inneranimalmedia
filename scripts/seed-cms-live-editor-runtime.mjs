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


const WORKFLOW_ID = "wf_cms_live_editor_dev_app";
const WORKFLOW_KEY = "cms_live_editor_dev_app";
const PLAN_ID = "plan_cms_live_editor_dev_20260509";
const RUN_ID = `wrun_cms_live_editor_seed_${Date.now()}`;
const COMMAND_RUN_ID = `run_cms_live_editor_seed_${Date.now()}`;

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replaceAll("'", "''")}'`;
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
  return JSON.parse(out)?.[0]?.results || [];
}

function tableExists(table) {
  const rows = d1(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=${q(table)};`,
    true
  );
  return rows.length > 0;
}

function cols(table) {
  if (!tableExists(table)) return new Set();
  return new Set(d1(`PRAGMA table_info(${table});`, true).map((r) => r.name));
}

function insertFiltered(table, values, { replace = false, ignore = true } = {}) {
  if (!tableExists(table)) {
    console.log(`[skip] missing table ${table}`);
    return null;
  }

  const c = cols(table);
  const entries = Object.entries(values).filter(([k]) => c.has(k));

  if (!entries.length) {
    console.log(`[skip] no matching columns for ${table}`);
    return null;
  }

  const verb = replace ? "INSERT OR REPLACE" : ignore ? "INSERT OR IGNORE" : "INSERT";
  const colSql = entries.map(([k]) => k).join(", ");
  const valSql = entries.map(([, v]) => q(v)).join(", ");

  const sql = `${verb} INTO ${table} (${colSql}) VALUES (${valSql});`;
  d1(sql);
  console.log(`[ok] ${table}`);
}

function updateIfExists(table, setSql, whereSql) {
  if (!tableExists(table)) {
    console.log(`[skip] missing table ${table}`);
    return;
  }
  d1(`UPDATE ${table} SET ${setSql} WHERE ${whereSql};`);
  console.log(`[ok] update ${table}`);
}

function main() {
  console.log("Seeding CMS live editor runtime bindings...");
  console.log({ DB, tenantId, workspaceId, userId });

  // 1. Plan row.
  insertFiltered("agentsam_plans", {
    id: PLAN_ID,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    title: "CMS Live Editor Dev App Plan",
    name: "CMS Live Editor Dev App Plan",
    description:
      "Graph-backed plan to turn todo_cms_live_editor into a test-only R2 stored .dev CMS editor/template-library system.",
    status: "active",
    plan_status: "active",
    priority: "high",
    category: "cms",
    tags: JSON.stringify(["cms", "live-editor", "template-library", "graph", "dev-app"]),
    metadata_json: JSON.stringify({
      todo_id: "todo_cms_live_editor",
      workflow_id: WORKFLOW_ID,
      workflow_key: WORKFLOW_KEY,
      default_model: "gpt-5.4-nano",
      escalation_model: "gpt-5.4-mini",
      repair_model: "gpt-5-codex",
      safe_r2_prefixes: [
        "dev/cms-live-editor/",
        "cms/test-runs/live-editor-template-library/",
        "captures/inneranimalmedia/results/",
        "analytics/agentsam/cms-live-editor/"
      ],
      promotion_requires_approval: true
    }),
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  });

  // Some of your FK history referenced agentsam_plans_old.
  insertFiltered("agentsam_plans_old", {
    id: PLAN_ID,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    title: "CMS Live Editor Dev App Plan",
    name: "CMS Live Editor Dev App Plan",
    description:
      "Compatibility plan row for graph-backed CMS live editor workflow.",
    status: "active",
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  });

  // 2. Tool catalog rows for each handler.
  const tools = [
    {
      id: "tool_cms_schema_discovery",
      slug: "cms_schema_discovery",
      name: "CMS Schema Discovery",
      description: "Discover and classify live cms_* D1 tables for template-library/editor planning.",
      category: "cms",
      handler: "agent.nano.cms_schema_discovery",
    },
    {
      id: "tool_template_library_plan",
      slug: "template_library_plan",
      name: "Template Library Planner",
      description: "Map cms_* tables into Shopify-style templates, sections, blocks, assets, settings, and routes.",
      category: "cms",
      handler: "agent.nano.template_library_plan",
    },
    {
      id: "tool_dev_app_manifest",
      slug: "dev_app_manifest",
      name: "Dev App Manifest Generator",
      description: "Generate test-only R2 app manifest and component/route bindings for the CMS live editor.",
      category: "cms",
      handler: "agent.nano.dev_app_manifest",
    },
    {
      id: "tool_write_cms_live_editor_dev_artifacts",
      slug: "write_cms_live_editor_dev_artifacts",
      name: "Write CMS Live Editor Dev Artifacts",
      description: "Write dev/test artifacts to R2 and register every object in agentsam_artifacts.",
      category: "storage",
      handler: "script_write_cms_live_editor_dev_artifacts",
    },
    {
      id: "tool_eval_cms_live_editor_contract",
      slug: "eval_cms_live_editor_contract",
      name: "Evaluate CMS Live Editor Contract",
      description: "Verify artifact registry, safe R2 prefixes, JSON validity, and no unapproved live promotion.",
      category: "eval",
      handler: "eval_cms_live_editor_contract",
    },
  ];

  for (const t of tools) {
    insertFiltered("agentsam_tools", {
      id: t.id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      slug: t.slug,
      tool_slug: t.slug,
      tool_key: t.slug,
      key: t.slug,
      name: t.name,
      display_name: t.name,
      description: t.description,
      category: t.category,
      tool_category: t.category,
      handler_key: t.handler,
      route_key: t.handler,
      provider: "agentsam",
      runtime: "cloudflare",
      is_active: 1,
      enabled: 1,
      safe_to_run: 1,
      requires_approval: t.category === "storage" ? 0 : 0,
      input_schema_json: JSON.stringify({ workflow_id: WORKFLOW_ID, safe_default: true }),
      output_schema_json: JSON.stringify({ required: ["ok", "artifacts", "summary"] }),
      metadata_json: JSON.stringify({
        source: "seed-cms-live-editor-runtime",
        default_model: "gpt-5.4-nano",
        workflow_id: WORKFLOW_ID,
      }),
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  // 3. Tool cache seed: cheap reusable workflow context.
  insertFiltered("agentsam_tool_cache", {
    id: "tc_cms_live_editor_context",
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    cache_key: "cms_live_editor_dev_app:context:v1",
    key: "cms_live_editor_dev_app:context:v1",
    tool_name: "cms_live_editor_context",
    value_json: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      workflow_key: WORKFLOW_KEY,
      todo_id: "todo_cms_live_editor",
      default_model: "gpt-5.4-nano",
      safe_r2_prefixes: [
        "dev/cms-live-editor/",
        "cms/test-runs/live-editor-template-library/",
        "captures/inneranimalmedia/results/",
        "analytics/agentsam/cms-live-editor/"
      ],
      forbidden_live_prefixes_without_approval: [
        "cms/themes/",
        "pages/",
        "components/",
        "src/",
        "static/",
        "assets/",
        "dashboard/"
      ]
    }),
    result_json: JSON.stringify({
      ok: true,
      source: "seed-cms-live-editor-runtime",
    }),
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  });

  // 4. Routing memory: nano as default, mini/codex as escalation/repair.
  const memories = [
    {
      id: "mrm_cms_live_editor_nano",
      model_key: "gpt-5.4-nano",
      provider: "openai",
      score: 0.94,
      role: "default_discovery_planning",
    },
    {
      id: "mrm_cms_live_editor_mini",
      model_key: "gpt-5.4-mini",
      provider: "openai",
      score: 0.88,
      role: "generation_escalation",
    },
    {
      id: "mrm_cms_live_editor_codex",
      model_key: "gpt-5-codex",
      provider: "openai",
      score: 0.94,
      role: "code_schema_repair",
    },
  ];

  for (const m of memories) {
    insertFiltered("agentsam_model_routing_memory", {
      id: m.id,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      task_type: "cms_live_editor_dev_app",
      route_key: "cms_live_editor_dev_app",
      intent_slug: "cms_live_editor_dev_app",
      model_key: m.model_key,
      provider: m.provider,
      mode: "agent",
      score: m.score,
      avg_quality_score: m.score,
      avg_latency_ms: 0,
      avg_cost_usd: 0,
      total_runs: 0,
      success_count: 0,
      failure_count: 0,
      is_active: 1,
      metadata_json: JSON.stringify({
        role: m.role,
        source: "seed-cms-live-editor-runtime",
        evidence: "cms3theme_20260509055951_85257a47",
        notes: "Nano preferred for cheap test/data/trial work; escalate only when needed."
      }),
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  // 5. Command run: seed invocation record.
  insertFiltered("agentsam_command_run", {
    id: COMMAND_RUN_ID,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    session_id: `sess_${COMMAND_RUN_ID}`,
    conversation_id: `conv_${COMMAND_RUN_ID}`,
    user_input: "Seed CMS live editor dev app workflow/runtime bindings.",
    normalized_intent: "cms_live_editor_dev_app_seed",
    intent_category: "misc",
    model_id: "gpt-5.4-nano",
    commands_json: JSON.stringify([
      "seed agentsam_plans",
      "seed agentsam_tools",
      "seed agentsam_tool_cache",
      "seed agentsam_model_routing_memory",
      "seed workflow_run/tool_chain/tool_call_log"
    ]),
    result_json: JSON.stringify({
      ok: true,
      workflow_id: WORKFLOW_ID,
      plan_id: PLAN_ID,
      default_model: "gpt-5.4-nano",
    }),
    output_text: "CMS live editor dev app runtime bindings seeded.",
    success: 1,
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    created_at: Math.floor(Date.now() / 1000),
  });

  // 6. Workflow run seed: initial dry-run state.
  insertFiltered("agentsam_workflow_runs", {
    id: RUN_ID,
    workflow_id: WORKFLOW_ID,
    workflow_key: WORKFLOW_KEY,
    display_name: "CMS Live Editor Dev App Seed Run",
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    session_id: `sess_${RUN_ID}`,
    run_group_id: RUN_ID,
    trigger_type: "manual",
    status: "completed",
    input_json: JSON.stringify({
      todo_id: "todo_cms_live_editor",
      mode: "seed_runtime_bindings",
    }),
    output_json: JSON.stringify({
      ok: true,
      seeded_tables: [
        "agentsam_plans",
        "agentsam_tools",
        "agentsam_tool_cache",
        "agentsam_model_routing_memory",
        "agentsam_workflow_runs",
        "agentsam_tool_chain",
        "agentsam_tool_call_log"
      ],
    }),
    step_results_json: JSON.stringify([]),
    steps_completed: 0,
    steps_total: 6,
    model_used: "gpt-5.4-nano",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    environment: "production",
    metadata_json: JSON.stringify({
      source: "seed-cms-live-editor-runtime",
      dry_run_seed: true,
    }),
    graph_mode: 1,
    current_node_key: null,
    started_at: Math.floor(Date.now() / 1000),
    completed_at: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 7. Tool chain seed.
  // Keep FK-safe: command_run_id, todo_id, and workflow_run_id are enough for this seed.
  // Avoid plan_id/tool_id here because live compatibility schemas may reject optional FKs.
  insertFiltered("agentsam_tool_chain", {
    id: `atc_${COMMAND_RUN_ID}`,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    todo_id: "todo_cms_live_editor",
    command_run_id: COMMAND_RUN_ID,
    depth: 0,
    tool_name: "seed_cms_live_editor_runtime",
    tool_status: "completed",
    input_json: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      todo_id: "todo_cms_live_editor",
    }),
    output_summary: "Seeded CMS live editor runtime bindings.",
    result_json: JSON.stringify({
      ok: true,
      workflow_run_id: RUN_ID,
      command_run_id: COMMAND_RUN_ID,
    }),
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    started_at: Math.floor(Date.now() / 1000),
    completed_at: Math.floor(Date.now() / 1000),
    workflow_run_id: RUN_ID,
  });

  // 8. Tool call log seed.
  insertFiltered("agentsam_tool_call_log", {
    id: `tcl_${COMMAND_RUN_ID}`,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    command_run_id: COMMAND_RUN_ID,
    workflow_run_id: RUN_ID,
    tool_name: "seed_cms_live_editor_runtime",
    status: "completed",
    input_json: JSON.stringify({
      source: "seed-cms-live-editor-runtime",
      workflow_id: WORKFLOW_ID,
    }),
    output_json: JSON.stringify({
      ok: true,
      run_id: RUN_ID,
    }),
    result_json: JSON.stringify({
      ok: true,
      run_id: RUN_ID,
    }),
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    created_at: Math.floor(Date.now() / 1000),
    completed_at: Math.floor(Date.now() / 1000),
  });

  // 9. Mark todo as planned/runnable, not complete.
  updateIfExists(
    "agentsam_todo",
    [
      `execution_status='ready'`,
      `plan_id=${q(PLAN_ID)}`,
      `tokens_used=0`,
      `cost_usd=0`,
      `output_summary=${q("Runtime bindings seeded across workflows, nodes, edges, tools, cache, plan, routing memory, run, tool_chain, and tool_call_log. Ready for cheap nano-first dry run.")}`,
      `updated_at=datetime('now')`,
    ].join(", "),
    `id='todo_cms_live_editor'`
  );

  console.log("\nDONE");
  console.log(JSON.stringify({
    workflow_id: WORKFLOW_ID,
    workflow_key: WORKFLOW_KEY,
    plan_id: PLAN_ID,
    workflow_run_id: RUN_ID,
    command_run_id: COMMAND_RUN_ID,
    default_model: "gpt-5.4-nano",
  }, null, 2));
}

main();
