#!/usr/bin/env python3
"""
audit_and_todo.py
─────────────────
Audits agentsam_* tables in batches of 20.
For every issue found → writes a real agentsam_todo row.

Usage:
  python3 audit_and_todo.py            # tables 1-20
  python3 audit_and_todo.py 20         # tables 21-40
  python3 audit_and_todo.py 40         # tables 41-60
  python3 audit_and_todo.py 60         # tables 61-80
  python3 audit_and_todo.py 80         # tables 81+
"""

import os, sys, uuid, json, requests
from datetime import datetime, timezone

CF_TOKEN     = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT   = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DB_ID     = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
TENANT_ID    = os.environ["IAM_TENANT_ID"]
WORKSPACE_ID = os.environ["IAM_WORKSPACE_ID"]

OFFSET = int(sys.argv[1]) if len(sys.argv) > 1 else 0
BATCH  = 20

D1_URL  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
           f"/d1/database/{CF_DB_ID}/query")
HEADERS = {"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"}

# ── D1 helpers ────────────────────────────────────────────────────────────────
def d1(sql, params=None):
    r = requests.post(D1_URL, headers=HEADERS,
                      json={"sql": sql, "params": params or []}, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data.get("errors"))
    return data["result"][0].get("results", [])

def d1_exec(sql, params=None):
    r = requests.post(D1_URL, headers=HEADERS,
                      json={"sql": sql, "params": params or []}, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data.get("errors"))
    return data["result"][0].get("meta", {})

# ── Critical columns — NULL here means broken linkage, not optional data ──────
CRITICAL_COLS = {
    "tenant_id", "workspace_id", "command_id", "command_run_id",
    "routing_arm_id", "agent_id", "tool_id", "session_id",
    "plan_id", "todo_id", "user_id", "model_id", "workflow_run_id",
}

# ── Tables the Worker actively uses — empty = broken ─────────────────────────
WORKER_ACTIVE = {
    "agentsam_agent_run", "agentsam_command_run", "agentsam_commands",
    "agentsam_routing_arms", "agentsam_usage_events", "agentsam_mcp_tool_execution",
    "agentsam_tool_call_log", "agentsam_tool_cache", "agentsam_execution_steps",
    "agentsam_executions", "agentsam_execution_performance_metrics",
    "agentsam_hook", "agentsam_hook_execution", "agentsam_guardrail_events",
    "agentsam_guardrails", "agentsam_skill", "agentsam_skill_invocation",
    "agentsam_health_daily", "agentsam_usage_rollups_daily", "agentsam_compaction_events",
    "agentsam_context_digest", "agentsam_escalation", "agentsam_error_log",
    "agentsam_workflow_runs", "agentsam_workflow_nodes", "agentsam_workflow_edges",
    "agentsam_workflows", "agentsam_mcp_servers", "agentsam_mcp_allowlist",
    "agentsam_execution_context", "agentsam_execution_dependency_graph",
}

# ── Todo writer ───────────────────────────────────────────────────────────────
todos_written = []

def write_todo(title, description, priority, linked_table,
               category="database-audit", tags=None):
    todo_id = f"todo_{uuid.uuid4().hex[:16]}"
    tags_json = json.dumps(tags or ["smoke", "audit", "database"])
    try:
        d1_exec(
            """INSERT INTO agentsam_todo
               (id, tenant_id, workspace_id, title, description,
                status, priority, category, tags,
                linked_table, task_type, execution_status,
                assigned_to, created_by, context_snapshot)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                todo_id, TENANT_ID, WORKSPACE_ID,
                title[:200], description[:1000],
                "open", priority, category, tags_json,
                linked_table, "execute", "queued",
                "agentsam", "agentsam_smoke",
                json.dumps({"audit_offset": OFFSET, "batch": BATCH}),
            ],
        )
        todos_written.append({"id": todo_id, "table": linked_table,
                               "priority": priority, "title": title})
        return todo_id
    except Exception as e:
        print(f"     ⚠ todo write failed for {linked_table}: {e}")
        return None

# ── Main audit ────────────────────────────────────────────────────────────────
tables_rows = d1(
    f"""SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE 'agentsam_%'
          AND name NOT LIKE '%_backup_%'
        ORDER BY name
        LIMIT {BATCH} OFFSET {OFFSET}"""
)
tables = [r["name"] for r in tables_rows]

print()
print("=" * 80)
print(f"  agentsam_* Table Audit + Todo Writer")
print(f"  batch    : tables {OFFSET+1}–{OFFSET+len(tables)}")
print(f"  tenant   : {TENANT_ID}")
print(f"  workspace: {WORKSPACE_ID}")
print("=" * 80)
print(f"  {'TABLE':<45} {'ROWS':>5}  ISSUES")
print("  " + "-" * 75)

table_issues = []

for tbl in tables:
    issues = []

    # row count
    try:
        cnt = d1(f'SELECT COUNT(*) as n FROM "{tbl}"')[0]["n"]
    except Exception as e:
        cnt = None
        issues.append(f"COUNT failed: {e}")

    # skip backup tables
    if "_backup_" in tbl:
        print(f"  {tbl:<45} {'?':>5}  ⚠ BACKUP TABLE IN SCHEMA — should be dropped")
        write_todo(
            f"Drop backup table {tbl} from production schema",
            f"Backup table {tbl} exists in production D1. "
            f"Backup tables pollute the schema and should be removed after validation.",
            priority="medium",
            linked_table=tbl,
            tags=["smoke", "audit", "schema-cleanup"],
        )
        continue

    # empty + worker-active
    if cnt == 0 and tbl in WORKER_ACTIVE:
        issues.append("EMPTY — Worker references this table")
        write_todo(
            f"Smoke + verify write path for {tbl} (empty but Worker-active)",
            f"{tbl} has 0 rows but is referenced by live Worker code. "
            f"The write path is either silently failing or never triggered. "
            f"Write a smoke script that exercises the full write → verify cycle.",
            priority="high",
            linked_table=tbl,
            tags=["smoke", "empty-table", "worker-active"],
        )
    elif cnt == 0:
        issues.append("EMPTY")

    # null analysis
    null_summary = []
    critical_nulls = []
    if cnt and cnt > 0:
        try:
            cols = d1(f'PRAGMA table_info("{tbl}")')
        except Exception:
            cols = []

        for col in cols:
            col_name = col["name"]
            if col["notnull"]:
                continue
            try:
                n = d1(f'SELECT COUNT(*) as n FROM "{tbl}" WHERE "{col_name}" IS NULL')[0]["n"]
                if n == 0:
                    continue
                pct = n / cnt
                null_summary.append(f"{col_name}({n})")
                if col_name in CRITICAL_COLS:
                    critical_nulls.append((col_name, n, pct))
            except Exception:
                pass

        # P0 — critical linking column is 100% NULL
        all_null_critical = [(c, n, p) for c, n, p in critical_nulls if p >= 0.99]
        if all_null_critical:
            col_list = ", ".join(f"{c}({n})" for c, n, _ in all_null_critical)
            issues.append(f"P0 NULL: {col_list}")
            write_todo(
                f"Fix NULL linkage columns in {tbl}: {', '.join(c for c,_,_ in all_null_critical)}",
                f"{tbl} has {cnt} rows but critical linking columns are 100% NULL: "
                f"{col_list}. The Worker INSERT never populates these fields. "
                f"Find the INSERT statement in src/ and add these columns at write time.",
                priority="high",
                linked_table=tbl,
                tags=["smoke", "null-linkage", "worker-fix", "p0"],
            )

        # P1 — critical column >50% NULL
        partial_null_critical = [(c, n, p) for c, n, p in critical_nulls
                                  if 0.5 <= p < 0.99]
        if partial_null_critical:
            col_list = ", ".join(f"{c}({n}/{cnt})" for c, n, _ in partial_null_critical)
            issues.append(f"P1 NULL: {col_list}")
            write_todo(
                f"Investigate partial NULL linkage in {tbl}: {', '.join(c for c,_,_ in partial_null_critical)}",
                f"{tbl} has critical columns that are >50% NULL: {col_list}. "
                f"Some code paths set these, others don't. Audit all INSERT/UPDATE paths in src/.",
                priority="medium",
                linked_table=tbl,
                tags=["smoke", "null-linkage", "partial"],
            )

    # display
    issue_str = " | ".join(issues) if issues else "—"
    if len(issue_str) > 50:
        issue_str = issue_str[:47] + "..."
    cnt_str = str(cnt) if cnt is not None else "ERR"
    flag = "⚠" if issues else "✓"
    print(f"  {flag} {tbl:<43} {cnt_str:>5}  {issue_str}")
    if null_summary and cnt and cnt > 0:
        ns = ", ".join(null_summary)
        if len(ns) > 72:
            ns = ns[:69] + "..."
        print(f"    {'':45}      nulls: {ns}")

    table_issues.append({"table": tbl, "rows": cnt, "issues": issues})

# ── Summary ───────────────────────────────────────────────────────────────────
print("  " + "-" * 75)
print()

empty   = [r for r in table_issues if r["rows"] == 0]
broken  = [r for r in table_issues if any("P0" in i for i in r["issues"])]
partial = [r for r in table_issues if any("P1" in i for i in r["issues"])]
clean   = [r for r in table_issues if not r["issues"]]

print(f"  CLEAN        : {len(clean)}")
print(f"  EMPTY        : {len(empty)}")
print(f"  P0 (broken)  : {len(broken)}")
print(f"  P1 (partial) : {len(partial)}")
print()
print(f"  agentsam_todo rows written: {len(todos_written)}")
for t in todos_written:
    print(f"    [{t['priority'].upper():<6}] {t['table']:<40} {t['id']}")

print()
print(f"  Next batch: python3 audit_and_todo.py {OFFSET + BATCH}")
print("=" * 80)
print()
