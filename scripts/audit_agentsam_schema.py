#!/usr/bin/env python3
"""
audit_agentsam_schema.py
------------------------
Pulls DDL + row count for every agentsam_* table in D1 (inneranimalmedia-business).
Outputs two files:
  - agentsam_schema_audit.json   : full machine-readable schema per table
  - agentsam_schema_chunks.jsonl : one AutoRAG/vector-ingest chunk per table

Usage:
  # Reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from env or .env.cloudflare
  python3 audit_agentsam_schema.py

  # Override DB id at runtime
  D1_DATABASE_ID=cf87b717-... python3 audit_agentsam_schema.py
"""

import os, re, json, time, sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

# ── config ────────────────────────────────────────────────────────────────────
ENV_FILE       = Path(__file__).parent / ".env.cloudflare"
D1_DATABASE_ID = os.getenv("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
OUTPUT_JSON    = Path(__file__).parent / "agentsam_schema_audit.json"
OUTPUT_JSONL   = Path(__file__).parent / "agentsam_schema_chunks.jsonl"
TABLE_PREFIX   = "agentsam_"

# Complete table list visible in screenshots (83 tables)
ALL_AGENTSAM_TABLES = [
    "agentsam_agent_run",
    "agentsam_ai",
    "agentsam_analytics",
    "agentsam_approval_queue",
    "agentsam_artifacts",
    "agentsam_bootstrap",
    "agentsam_browser_trusted_origin",
    "agentsam_cad_jobs",
    "agentsam_code_index_job",
    "agentsam_command_allowlist",
    "agentsam_command_pattern",
    "agentsam_command_run",
    "agentsam_commands",
    "agentsam_compaction_events",
    "agentsam_context_digest",
    "agentsam_cron_runs",
    "agentsam_deployment_health",
    "agentsam_error_log",
    "agentsam_escalation",
    "agentsam_eval_cases",
    "agentsam_eval_runs",
    "agentsam_eval_suites",
    "agentsam_execution_context",
    "agentsam_execution_dependency_graph",
    "agentsam_execution_performance_metrics",
    "agentsam_execution_steps",
    "agentsam_executions",
    "agentsam_feature_flag",
    "agentsam_fetch_domain_allowlist",
    "agentsam_guardrail_events",
    "agentsam_guardrail_rulesets",
    "agentsam_guardrails",
    "agentsam_health_daily",
    "agentsam_hook",
    "agentsam_hook_execution",
    "agentsam_ignore_pattern",
    "agentsam_mcp_allowlist",
    "agentsam_mcp_servers",
    "agentsam_mcp_tool_execution",
    "agentsam_mcp_tools",
    "agentsam_mcp_workflows",
    "agentsam_memory",
    "agentsam_model_catalog",
    "agentsam_model_drift_signals",
    "agentsam_model_routing_memory",
    "agentsam_model_tier",
    "agentsam_plan_tasks",
    "agentsam_plans",
    "agentsam_plans_old",
    "agentsam_project_context",
    "agentsam_prompt_cache_keys",
    "agentsam_prompt_routes",
    "agentsam_prompt_versions",
    "agentsam_route_requirements",
    "agentsam_routing_arms",
    "agentsam_rules_document",
    "agentsam_script_runs",
    "agentsam_scripts",
    "agentsam_skill",
    "agentsam_skill_invocation",
    "agentsam_skill_revision",
    "agentsam_slash_commands",
    "agentsam_subagent_profile",
    "agentsam_subscription_registry",
    "agentsam_task_slos",
    "agentsam_todo",
    "agentsam_tool_cache",
    "agentsam_tool_call_log",
    "agentsam_tool_chain",
    "agentsam_tool_stats_compacted",
    "agentsam_tools",
    "agentsam_usage_events",
    "agentsam_usage_rollups_daily",
    "agentsam_user_feature_override",
    "agentsam_user_policy",
    "agentsam_webhook_events",
    "agentsam_webhook_weekly",
    "agentsam_workflow_edges",
    "agentsam_workflow_nodes",
    "agentsam_workflow_runs",
    "agentsam_workflows",
    "agentsam_workspace",
    "agentsam_workspace_state",
]

# Subsystem tags for AutoRAG filtering / gap detection
SUBSYSTEM_MAP = {
    "routing": [
        "agentsam_routing_arms", "agentsam_model_routing_memory",
        "agentsam_model_catalog", "agentsam_model_drift_signals",
        "agentsam_model_tier", "agentsam_prompt_routes",
        "agentsam_route_requirements", "agentsam_prompt_versions",
        "agentsam_prompt_cache_keys",
    ],
    "execution": [
        "agentsam_executions", "agentsam_execution_steps",
        "agentsam_execution_context", "agentsam_execution_dependency_graph",
        "agentsam_execution_performance_metrics", "agentsam_agent_run",
        "agentsam_command_run", "agentsam_commands",
    ],
    "tool": [
        "agentsam_tools", "agentsam_tool_call_log", "agentsam_tool_chain",
        "agentsam_tool_cache", "agentsam_tool_stats_compacted",
        "agentsam_mcp_tools", "agentsam_mcp_tool_execution",
        "agentsam_mcp_allowlist", "agentsam_mcp_servers",
        "agentsam_mcp_workflows",
    ],
    "workflow": [
        "agentsam_workflows", "agentsam_workflow_nodes",
        "agentsam_workflow_edges", "agentsam_workflow_runs",
        "agentsam_plan_tasks", "agentsam_plans", "agentsam_plans_old",
    ],
    "eval": [
        "agentsam_eval_suites", "agentsam_eval_cases", "agentsam_eval_runs",
        "agentsam_model_drift_signals",
    ],
    "skill": [
        "agentsam_skill", "agentsam_skill_invocation", "agentsam_skill_revision",
        "agentsam_scripts", "agentsam_script_runs",
    ],
    "guardrail": [
        "agentsam_guardrails", "agentsam_guardrail_rulesets",
        "agentsam_guardrail_events", "agentsam_approval_queue",
        "agentsam_escalation",
    ],
    "memory": [
        "agentsam_memory", "agentsam_project_context",
        "agentsam_context_digest", "agentsam_compaction_events",
        "agentsam_model_routing_memory",
    ],
    "analytics": [
        "agentsam_analytics", "agentsam_usage_events",
        "agentsam_usage_rollups_daily", "agentsam_health_daily",
        "agentsam_cron_runs", "agentsam_error_log",
        "agentsam_deployment_health",
        "agentsam_execution_performance_metrics",
        "agentsam_tool_stats_compacted",
    ],
    "agent_config": [
        "agentsam_ai", "agentsam_workspace", "agentsam_workspace_state",
        "agentsam_user_policy", "agentsam_user_feature_override",
        "agentsam_feature_flag", "agentsam_subagent_profile",
        "agentsam_task_slos", "agentsam_subscription_registry",
    ],
    "infra": [
        "agentsam_bootstrap", "agentsam_command_allowlist",
        "agentsam_command_pattern", "agentsam_fetch_domain_allowlist",
        "agentsam_browser_trusted_origin", "agentsam_ignore_pattern",
        "agentsam_hook", "agentsam_hook_execution",
        "agentsam_webhook_events", "agentsam_webhook_weekly",
        "agentsam_rules_document", "agentsam_slash_commands",
        "agentsam_code_index_job", "agentsam_cad_jobs",
        "agentsam_artifacts", "agentsam_todo",
        "agentsam_tool_cache",
    ],
}

def _subsystems_for(table: str) -> list[str]:
    return [s for s, tables in SUBSYSTEM_MAP.items() if table in tables] or ["uncategorized"]

# ── env loading ───────────────────────────────────────────────────────────────
def load_env():
    token   = os.getenv("CLOUDFLARE_API_TOKEN")
    account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
    if not token and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k == "CLOUDFLARE_API_TOKEN":
                token = v
            elif k == "CLOUDFLARE_ACCOUNT_ID":
                account = v
    if not token:
        sys.exit("ERROR: CLOUDFLARE_API_TOKEN not found in env or .env.cloudflare")
    return token, account

# ── D1 REST API ───────────────────────────────────────────────────────────────
def d1_query(sql: str, token: str, account: str, db_id: str) -> list[dict]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db_id}/query"
    body = json.dumps({"sql": sql}).encode()
    req  = Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
    except HTTPError as e:
        sys.exit(f"D1 API error {e.code}: {e.read().decode()}")
    if not data.get("success"):
        sys.exit(f"D1 query failed: {data.get('errors')}")
    return data["result"][0].get("results", [])

# ── column parser ─────────────────────────────────────────────────────────────
def parse_columns(ddl: str) -> list[dict]:
    """Extract column names + types from a CREATE TABLE DDL string."""
    cols = []
    # strip outer CREATE TABLE ... ( ... )
    inner = re.sub(r"^CREATE\s+TABLE\s+.*?\(", "", ddl, count=1, flags=re.IGNORECASE|re.DOTALL)
    inner = re.sub(r"\)\s*$", "", inner, flags=re.DOTALL)
    for line in inner.split("\n"):
        line = line.strip().rstrip(",")
        # skip constraints / foreign keys / unique / check
        if re.match(r"(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK|CONSTRAINT)\b", line, re.IGNORECASE):
            continue
        if not line:
            continue
        m = re.match(r"['\"]?(\w+)['\"]?\s+(\w+)", line)
        if m:
            cols.append({"name": m.group(1), "type": m.group(2).upper()})
    return cols

# ── main ──────────────────────────────────────────────────────────────────────
def main():
    token, account = load_env()

    print(f"[1/3] Fetching DDL for {len(ALL_AGENTSAM_TABLES)} tables ...")
    quoted = ", ".join(f"'{t}'" for t in ALL_AGENTSAM_TABLES)
    ddl_rows = d1_query(
        f"SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ({quoted}) ORDER BY name",
        token, account, D1_DATABASE_ID
    )
    ddl_map = {r["name"]: r.get("sql", "") for r in ddl_rows}

    print("[2/3] Fetching row counts (single UNION query) ...")
    count_sql = "\nUNION ALL\n".join(
        f"SELECT '{t}' AS tbl, COUNT(*) AS cnt FROM {t}" for t in ALL_AGENTSAM_TABLES
    )
    try:
        count_rows = d1_query(count_sql, token, account, D1_DATABASE_ID)
        count_map  = {r["tbl"]: r["cnt"] for r in count_rows}
    except SystemExit:
        # fallback: count one by one if UNION is too big
        print("  UNION too large, falling back to per-table counts ...")
        count_map = {}
        for t in ALL_AGENTSAM_TABLES:
            try:
                res = d1_query(f"SELECT COUNT(*) AS cnt FROM {t}", token, account, D1_DATABASE_ID)
                count_map[t] = res[0]["cnt"] if res else 0
            except Exception:
                count_map[t] = -1
            time.sleep(0.05)

    print("[3/3] Building output files ...")
    audit = []
    for table in ALL_AGENTSAM_TABLES:
        ddl      = ddl_map.get(table, "")
        row_cnt  = count_map.get(table, -1)
        cols     = parse_columns(ddl) if ddl else []
        subsys   = _subsystems_for(table)
        exists   = bool(ddl)

        record = {
            "table":      table,
            "exists":     exists,
            "row_count":  row_cnt,
            "subsystems": subsys,
            "columns":    cols,
            "ddl":        ddl,
            # gap flags
            "gap_flags": {
                "missing_from_db":  not exists,
                "empty_and_active": exists and row_cnt == 0 and subsys[0] not in ("infra",),
                "routing_critical": table in SUBSYSTEM_MAP["routing"] and row_cnt == 0,
                "eval_empty":       table in SUBSYSTEM_MAP["eval"] and row_cnt == 0,
                "analytics_empty":  table in SUBSYSTEM_MAP["analytics"] and row_cnt == 0,
            },
        }
        audit.append(record)

    # ── full JSON ────────────────────────────────────────────────────────────
    OUTPUT_JSON.write_text(json.dumps(audit, indent=2))
    print(f"  Wrote {OUTPUT_JSON} ({len(audit)} tables)")

    # ── AutoRAG JSONL (one chunk per table) ──────────────────────────────────
    with OUTPUT_JSONL.open("w") as f:
        for rec in audit:
            col_list = ", ".join(f"{c['name']} ({c['type']})" for c in rec["columns"])
            gap_tags = [k for k, v in rec["gap_flags"].items() if v]

            chunk = {
                "id":       f"schema:{rec['table']}",
                "text": (
                    f"Table: {rec['table']}\n"
                    f"Subsystems: {', '.join(rec['subsystems'])}\n"
                    f"Row count: {rec['row_count']}\n"
                    f"Exists in DB: {rec['exists']}\n"
                    f"Gap flags: {', '.join(gap_tags) if gap_tags else 'none'}\n"
                    f"Columns ({len(rec['columns'])}): {col_list}\n"
                    f"DDL:\n{rec['ddl']}"
                ),
                "metadata": {
                    "table":      rec["table"],
                    "subsystems": rec["subsystems"],
                    "row_count":  rec["row_count"],
                    "exists":     rec["exists"],
                    "gap_flags":  rec["gap_flags"],
                },
            }
            f.write(json.dumps(chunk) + "\n")
    print(f"  Wrote {OUTPUT_JSONL} ({len(audit)} chunks)")

    # ── gap report to stdout ─────────────────────────────────────────────────
    print("\n=== GAP REPORT ===")
    missing   = [r for r in audit if r["gap_flags"]["missing_from_db"]]
    empty_crit = [r for r in audit if r["gap_flags"]["routing_critical"]]
    empty_eval = [r for r in audit if r["gap_flags"]["eval_empty"]]

    if missing:
        print(f"\n[MISSING FROM DB] {len(missing)} tables:")
        for r in missing:
            print(f"  - {r['table']}")
    else:
        print("\n[OK] All 83 tables exist in DB.")

    if empty_crit:
        print(f"\n[ROUTING CRITICAL / EMPTY] {len(empty_crit)} tables (TS engine starved):")
        for r in empty_crit:
            print(f"  - {r['table']}  (0 rows)")

    if empty_eval:
        print(f"\n[EVAL EMPTY] {len(empty_eval)} tables (no eval data yet):")
        for r in empty_eval:
            print(f"  - {r['table']}  (0 rows)")

    total_empty = sum(1 for r in audit if r["row_count"] == 0 and r["exists"])
    print(f"\nSummary: {len(audit)} tables | {total_empty} empty | {len(missing)} missing")

if __name__ == "__main__":
    main()
