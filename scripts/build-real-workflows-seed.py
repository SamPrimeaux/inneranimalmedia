from pathlib import Path
import json

OUT = Path("scripts/sql/seed-real-agentsam-workflows.sql")

TENANT_ID = "tenant_sam_primeaux"
WORKSPACE_ID = "ws_inneranimalmedia"

def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"))
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

workflows = [
    {
        "id": "wf_agent_browser_inspection_to_patch",
        "key": "agent_browser_inspection_to_patch",
        "name": "Browser Inspection to Patch",
        "type": "browser_ui_repair",
        "risk": "medium",
        "approval": 0,
        "description": "Turns BrowserView selected elements, computed styles, console/network state, and page context into a Monaco-ready patch plan with validation steps.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"surfaces":["browser","inspector","monaco","chat"],"production_real":True},
        "nodes": [
            ("capture_browser_context","agent","Capture Browser Context","browser.capture_context","Collect selected element, DOM path, computed styles, route, console, and network state.",10,"low",0),
            ("diagnose_ui_issue","agent","Diagnose UI Issue","openai.mini.diagnose_ui_issue","Identify likely component, CSS, route, or data-binding issue.",20,"medium",0),
            ("prepare_monaco_patch_plan","agent","Prepare Monaco Patch Plan","openai.mini.prepare_patch_plan","Return exact Monaco/Cursor patch plan with files, validation commands, and rollback notes.",30,"medium",0),
            ("validate_patch_plan","eval","Validate Patch Plan","eval.patch_plan_quality","Validate that the plan has file paths, tests, and no vague instructions.",40,"low",0),
            ("emit_ui_timeline","webhook","Emit UI Timeline","ui.emit_workflow_timeline_event","Send diagnosis and patch plan to Agent Sam live timeline.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_d1_workflow_data_audit",
        "key": "agent_d1_workflow_data_audit",
        "name": "D1 Workflow Data Audit",
        "type": "d1_audit",
        "risk": "low",
        "approval": 0,
        "description": "Audits workflow tables for broken graph links, empty runs, missing costs, stale smoke rows, and UI binding gaps.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"tables":["agentsam_workflows","agentsam_workflow_nodes","agentsam_workflow_edges","agentsam_workflow_runs"],"production_real":True},
        "nodes": [
            ("inspect_workflow_tables","db_query","Inspect Workflow Tables","db.audit_workflow_tables","Query workflows, nodes, edges, and runs for counts, orphans, empty step JSON, and smoke clutter.",10,"low",0),
            ("summarize_implementation_gaps","agent","Summarize Implementation Gaps","openai.mini.summarize_d1_workflow_gaps","Explain real workflows, smoke clutter, and missing runtime/UI bindings.",20,"low",0),
            ("score_graph_health","eval","Score Graph Health","eval.workflow_graph_health","Score whether graph data is executable and UI-bindable.",30,"low",0),
            ("emit_audit_card","webhook","Emit Audit Card","ui.emit_audit_card","Render audit result into Agent Sam inspector and timeline.",40,"low",0),
        ],
    },
    {
        "id": "wf_agent_r2_artifact_publish_pipeline",
        "key": "agent_r2_artifact_publish_pipeline",
        "name": "R2 Artifact Publish Pipeline",
        "type": "artifact_publish",
        "risk": "medium",
        "approval": 0,
        "description": "Validates generated artifacts, assigns an R2 key, publishes to R2, and registers the result in agentsam_artifacts for Library UI.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"tables":["agentsam_artifacts"],"r2_bucket":"inneranimalmedia-assets","production_real":True},
        "nodes": [
            ("validate_artifact_payload","eval","Validate Artifact Payload","eval.artifact_payload","Check artifact name, type, source, tags, content size, R2 key plan, and publish eligibility.",10,"low",0),
            ("prepare_r2_object","agent","Prepare R2 Object","openai.mini.prepare_r2_artifact","Prepare sanitized artifact content and metadata for R2 upload.",20,"medium",0),
            ("publish_to_r2","script","Publish to R2","script.r2_put_artifact","Upload artifact content to configured R2 bucket/key.",30,"medium",0),
            ("register_artifact_row","db_query","Register Artifact Row","db.upsert_agentsam_artifact","Insert/update agentsam_artifacts with R2 key, URL, source, tags, visibility, and file size.",40,"low",0),
            ("emit_library_refresh","webhook","Emit Library Refresh","ui.emit_library_refresh","Notify /dashboard/library to refresh artifact list and preview card.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_hyperdrive_connection_repair",
        "key": "agent_hyperdrive_connection_repair",
        "name": "Hyperdrive Connection Repair",
        "type": "hyperdrive_debug",
        "risk": "high",
        "approval": 1,
        "description": "Audits Worker bindings, Hyperdrive env access, Supabase connection path, query failures, and dashboard database integration before deploy.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"surfaces":["worker","hyperdrive","supabase","dashboard/database"],"production_real":True},
        "nodes": [
            ("audit_worker_bindings","script","Audit Worker Bindings","script.audit_hyperdrive_bindings","Inspect wrangler config, Worker env binding names, Hyperdrive binding presence, and safe non-secret metadata.",10,"medium",0),
            ("test_hyperdrive_path","terminal","Test Hyperdrive Path","terminal.hyperdrive_connectivity_check","Run safe connectivity checks without exposing credentials.",20,"high",1),
            ("diagnose_connection_failure","agent","Diagnose Connection Failure","openai.mini.diagnose_hyperdrive","Map failures to binding/env/query/client/runtime causes.",30,"medium",0),
            ("approval_before_deploy_fix","approval_gate","Approval Before Deploy Fix","approval.require_owner","Require approval before deploy-affecting Hyperdrive or Worker changes.",40,"high",1),
            ("emit_hyperdrive_report","webhook","Emit Hyperdrive Report","ui.emit_hyperdrive_report","Send fix plan and validation checklist to dashboard/database and Agent timeline.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_analytics_rollup_builder",
        "key": "agent_analytics_rollup_builder",
        "name": "Analytics Rollup Builder",
        "type": "analytics_rollup",
        "risk": "low",
        "approval": 0,
        "description": "Builds dashboard-ready datasets from workflow runs, model usage, tool calls, costs, latency, status counts, and health signals.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"charts":["line","bar","pie","health","cost"],"production_real":True},
        "nodes": [
            ("collect_raw_usage_events","db_query","Collect Raw Usage Events","db.collect_agent_usage_events","Collect run status, costs, tokens, duration, model usage, tool calls, and errors.",10,"low",0),
            ("build_chart_datasets","agent","Build Chart Datasets","openai.mini.build_analytics_datasets","Transform raw usage into line/bar/pie/health datasets.",20,"low",0),
            ("validate_chart_contract","eval","Validate Chart Contract","eval.chart_dataset_contract","Ensure datasets match frontend chart schema and include empty/failure states.",30,"low",0),
            ("persist_rollup_snapshot","db_query","Persist Rollup Snapshot","db.persist_analytics_rollup","Persist rollup output for dashboard/cache consumption.",40,"low",0),
            ("emit_analytics_refresh","webhook","Emit Analytics Refresh","ui.emit_analytics_refresh","Notify Analytics dashboard to refresh charts and KPI cards.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_openai_cost_safe_execution",
        "key": "agent_openai_cost_safe_execution",
        "name": "OpenAI Cost-Safe Execution",
        "type": "openai_execution",
        "risk": "medium",
        "approval": 0,
        "description": "Routes real Agent Sam tasks through gpt-5.4-nano classification/eval and gpt-5.4-mini execution with strict cost, token, timeout, and approval gates.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"pro_enabled":False,"production_real":True},
        "nodes": [
            ("classify_task_with_nano","agent","Classify Task With Nano","openai.nano.classify_task","Classify task type, risk, expected output, tools needed, and whether mini should execute.",10,"low",0),
            ("check_budget_gate","branch","Check Budget Gate","branch.cost_token_risk_gate","Stop or continue based on max cost, max tokens, risk, and approval requirements.",20,"low",0),
            ("execute_with_mini","agent","Execute With Mini","openai.mini.execute_task","Use gpt-5.4-mini to perform real task under cost and output schema controls.",30,"medium",0),
            ("evaluate_result_with_nano","eval","Evaluate Result With Nano","openai.nano.evaluate_task_result","Verify completeness, safety, and schema.",40,"low",0),
            ("persist_model_ledger","db_query","Persist Model Ledger","db.persist_model_ledger","Write actual model, tokens, cost, latency, and step results into run ledger.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_dashboard_live_workbench_repair",
        "key": "agent_dashboard_live_workbench_repair",
        "name": "Dashboard Live Workbench Repair",
        "type": "dashboard_repair",
        "risk": "medium",
        "approval": 0,
        "description": "Repairs /dashboard/agent live workbench bindings across chat, BrowserView, inspector, explorer, Monaco, workflow timeline, SSE events, and run persistence.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"route":"/dashboard/agent","production_real":True},
        "nodes": [
            ("map_live_workbench_bindings","agent","Map Live Workbench Bindings","openai.mini.map_dashboard_bindings","Map chat, BrowserView, inspector, Monaco, explorer, terminal, and timeline data flow.",10,"medium",0),
            ("inspect_sse_and_run_state","script","Inspect SSE and Run State","script.inspect_agent_sse_run_state","Check SSE events, run mutations, current_node_key, and timeline consumption.",20,"medium",0),
            ("prepare_workbench_repair_plan","agent","Prepare Workbench Repair Plan","openai.mini.prepare_workbench_repair_plan","Prepare exact repair steps for UI bindings and runtime event contracts.",30,"medium",0),
            ("validate_workbench_plan","eval","Validate Workbench Plan","eval.workbench_repair_plan","Validate repair plan against route, component, DB, SSE, and fallback requirements.",40,"low",0),
            ("emit_repair_plan","webhook","Emit Repair Plan","ui.emit_workbench_repair_plan","Render repair plan into Agent Sam timeline and Monaco task panel.",50,"low",0),
        ],
    },
    {
        "id": "wf_agent_library_assets_backend_connect",
        "key": "agent_library_assets_backend_connect",
        "name": "Library Assets Backend Connect",
        "type": "library_backend_connect",
        "risk": "medium",
        "approval": 0,
        "description": "Connects /dashboard/library to agentsam_artifacts, R2 object metadata, preview URLs, tags, visibility, source, artifact type, and workspace scoping.",
        "metadata": {"models":{"route":"gpt-5.4-nano","work":"gpt-5.4-mini"},"route":"/dashboard/library","tables":["agentsam_artifacts"],"production_real":True},
        "nodes": [
            ("inspect_artifacts_schema","db_query","Inspect Artifacts Schema","db.inspect_agentsam_artifacts","Read agentsam_artifacts columns and sample rows to determine real backend fields.",10,"low",0),
            ("map_library_ui_contract","agent","Map Library UI Contract","openai.mini.map_library_ui_contract","Map artifact rows to cards, previews, filters, tags, visibility, source badges, and R2 URLs.",20,"medium",0),
            ("validate_r2_preview_access","script","Validate R2 Preview Access","script.validate_r2_artifact_previews","Check public_url/r2_key access patterns and preview failure states.",30,"medium",0),
            ("prepare_library_backend_patch","agent","Prepare Library Backend Patch","openai.mini.prepare_library_backend_patch","Prepare exact backend/frontend patch plan for Library page.",40,"medium",0),
            ("emit_library_patch_plan","webhook","Emit Library Patch Plan","ui.emit_library_patch_plan","Send backend connection plan to Agent timeline and Library debug panel.",50,"low",0),
        ],
    },
]

lines = [
    "-- Real Agent Sam production workflows",
    "-- Pure INSERT OR IGNORE only. No transactions. No temp tables. No helper tables.",
]

wf_cols = [
    "id","tenant_id","workspace_id","workflow_key","display_name","description",
    "workflow_type","trigger_type","default_mode","default_task_type","risk_level",
    "requires_approval","max_concurrent_nodes","timeout_ms","quality_gate_json",
    "metadata_json","is_active","is_platform_global"
]

node_cols = [
    "workflow_id","node_key","node_type","title","description","handler_key",
    "input_schema_json","output_schema_json","timeout_ms","retry_policy_json",
    "quality_gate_json","risk_level","requires_approval","is_active","sort_order"
]

edge_cols = [
    "workflow_id","from_node_key","to_node_key","condition_type","priority","label"
]

for wf in workflows:
    wf_vals = [
        wf["id"], TENANT_ID, WORKSPACE_ID, wf["key"], wf["name"], wf["description"],
        "agentic", "manual", "agent", wf["type"], wf["risk"], wf["approval"],
        3, 300000,
        {"requires_structured_output": True, "capture_tokens": True, "capture_cost": True},
        wf["metadata"],
        1, 1
    ]
    lines.append(f"INSERT OR IGNORE INTO agentsam_workflows ({', '.join(wf_cols)}) VALUES ({', '.join(q(v) for v in wf_vals)});")

    prev = None
    for node_key, node_type, title, handler, desc, sort_order, risk, approval in wf["nodes"]:
        node_vals = [
            wf["id"], node_key, node_type, title, desc, handler,
            {}, {}, 60000,
            {"max_retries": 1, "backoff": "exponential", "delay_ms": 1000},
            {"model_route": "gpt-5.4-nano", "model_work": "gpt-5.4-mini"},
            risk, approval, 1, sort_order
        ]
        lines.append(f"INSERT OR IGNORE INTO agentsam_workflow_nodes ({', '.join(node_cols)}) VALUES ({', '.join(q(v) for v in node_vals)});")

        if prev:
            edge_vals = [wf["id"], prev, node_key, "always", sort_order, f"{prev} -> {node_key}"]
            lines.append(f"INSERT OR IGNORE INTO agentsam_workflow_edges ({', '.join(edge_cols)}) VALUES ({', '.join(q(v) for v in edge_vals)});")
        prev = node_key

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT} with {len(workflows)} workflows.")
