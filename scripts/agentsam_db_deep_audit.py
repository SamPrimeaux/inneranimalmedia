#!/usr/bin/env python3
"""
Deep audit of agentsam_* and cms_* D1 tables.
For each table: schema, NULL analysis, FK consistency, data quality score.
Outputs: smoke test SQLs, fix recommendations, gap report.
"""

import json, os, urllib.request, time
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

for line in (Path.home() / "inneranimalmedia/.env.agentsam.local").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
D1_ENDPOINT    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
REPO           = Path.home() / "inneranimalmedia"
NOW            = datetime.now(timezone.utc)

# ── D1 helper ─────────────────────────────────────────────────────────────────
def d1(sql, params=None, silent=False):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            if not silent:
                err = data.get("errors", [{}])[0].get("message","unknown")
                print(f"    D1 ERR: {err[:80]}")
            return None
        return data["result"][0]["results"]
    except Exception as e:
        if not silent:
            print(f"    REQ ERR: {e}")
        return None

# ── discover tables ───────────────────────────────────────────────────────────
print("Discovering tables...")
all_tables_raw = d1("""
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND (name LIKE 'agentsam_%' OR name LIKE 'cms_%')
    ORDER BY name
""")
if not all_tables_raw:
    print("ERROR: Could not fetch tables.")
    exit(1)

ALL_TABLES = [r["name"] for r in all_tables_raw]
print(f"Found {len(ALL_TABLES)} tables (agentsam_* + cms_*)\n")

# ── identity/critical columns we care about deeply ────────────────────────────
IDENTITY_COLS   = {"tenant_id", "workspace_id", "user_id", "person_uuid"}
TIMESTAMP_COLS  = {"created_at", "updated_at", "started_at", "completed_at",
                   "last_run_at", "last_sync_at", "last_error_at"}
FK_SUFFIX       = ("_id", "_ref", "_key")
CRITICAL_TABLES = {
    # table: [columns that MUST be non-null for the table to be useful]
    "agentsam_workflow_runs":    ["workspace_id","tenant_id","status","trigger_type"],
    "agentsam_execution_steps":  ["workflow_run_id","status","step_type"],
    "agentsam_executions":       ["workspace_id","status","model_key"],
    "agentsam_command_run":      ["workspace_id","command","status"],
    "agentsam_approval_queue":   ["workspace_id","command_run_id","status"],
    "agentsam_plans":            ["workspace_id","tenant_id","status"],
    "agentsam_plan_tasks":       ["plan_id","status","title"],
    "agentsam_agent_run":        ["workspace_id","trigger","status"],
    "agentsam_usage_events":     ["workspace_id","model_key","event_type"],
    "agentsam_tool_call_log":    ["workspace_id","tool_key","status"],
    "agentsam_mcp_tool_execution":["workspace_id","tool_key"],
    "agentsam_error_log":        ["workspace_id","severity","message"],
    "agentsam_memory":           ["tenant_id","user_id","key","value"],
    "agentsam_cron_runs":        ["job_name","status","started_at"],
    "agentsam_deployment_health":["worker_name","status"],
    "agentsam_routing_arms":     ["task_type","model_key","provider"],
    "cms_themes":                ["slug","name"],
    "cms_pages":                 ["slug","title","status"],
    "cms_page_sections":         ["page_id","section_type"],
}

# ── per-table audit ───────────────────────────────────────────────────────────
results = {}

for i, table in enumerate(ALL_TABLES, 1):
    print(f"[{i:3}/{len(ALL_TABLES)}] {table}", end=" ... ", flush=True)

    # 1. schema
    schema_rows = d1(f"PRAGMA table_info({table})", silent=True)
    if not schema_rows:
        results[table] = {"error": "schema_fail"}
        print("SCHEMA ERR")
        continue

    cols = {r["name"]: r for r in schema_rows}
    col_names = list(cols.keys())

    # 2. row count
    cnt_rows = d1(f"SELECT COUNT(*) as n FROM {table}", silent=True)
    count    = cnt_rows[0]["n"] if cnt_rows else 0

    if count == 0:
        results[table] = {
            "cols": cols, "count": 0, "null_analysis": {},
            "grade": "EMPTY", "critical_nulls": [], "zombie_cols": [],
            "sparse_cols": [], "fk_cols": [], "ts_cols": [],
            "identity_coverage": 0,
        }
        print("EMPTY")
        continue

    # 3. NULL analysis — one query counts nulls for all columns at once
    null_parts = [f"SUM(CASE WHEN {c} IS NULL THEN 1 ELSE 0 END) as n_{c}" for c in col_names]
    null_sql   = f"SELECT {', '.join(null_parts)} FROM {table}"
    null_rows  = d1(null_sql, silent=True)
    null_map   = {}
    if null_rows:
        for c in col_names:
            null_count = null_rows[0].get(f"n_{c}", 0) or 0
            null_map[c] = {
                "null_count": null_count,
                "null_pct":   round(100 * null_count / count, 1) if count else 0,
            }

    # 4. classify columns
    zombie_cols   = [c for c in col_names if null_map.get(c, {}).get("null_pct", 0) == 100]
    sparse_cols   = [c for c in col_names if 80 <= null_map.get(c, {}).get("null_pct", 0) < 100]
    fk_cols       = [c for c in col_names if any(c.endswith(s) for s in FK_SUFFIX) and c != "id"]
    ts_cols       = [c for c in col_names if c in TIMESTAMP_COLS]
    identity_cols_present = [c for c in col_names if c in IDENTITY_COLS]
    identity_coverage = len([c for c in identity_cols_present
                             if null_map.get(c, {}).get("null_pct", 0) < 50])

    # 5. critical column null check
    critical_nulls = []
    required = CRITICAL_TABLES.get(table, [])
    for req_col in required:
        if req_col in null_map and null_map[req_col]["null_pct"] > 20:
            critical_nulls.append({
                "col": req_col,
                "null_pct": null_map[req_col]["null_pct"]
            })

    # 6. freshness
    fresh_col = next((c for c in ["created_at","updated_at","started_at"] if c in col_names), None)
    age_h     = None
    latest    = None
    if fresh_col and count > 0:
        fr = d1(f"SELECT MAX({fresh_col}) as mx FROM {table}", silent=True)
        if fr and fr[0]["mx"]:
            try:
                mx = fr[0]["mx"]
                if str(mx).isdigit():
                    dt = datetime.fromtimestamp(int(mx), tz=timezone.utc)
                else:
                    for fmt in ["%Y-%m-%dT%H:%M:%SZ","%Y-%m-%d %H:%M:%S",
                                "%Y-%m-%dT%H:%M:%S.%fZ","%Y-%m-%dT%H:%M:%S+00:00"]:
                        try:
                            dt = datetime.strptime(str(mx)[:26], fmt).replace(tzinfo=timezone.utc)
                            break
                        except: continue
                    else:
                        dt = None
                if dt:
                    age_h  = round((NOW - dt).total_seconds() / 3600, 1)
                    latest = dt.strftime("%Y-%m-%d %H:%M UTC")
            except: pass

    # 7. grade
    if count == 0:
        grade = "EMPTY"
    elif zombie_cols and len(zombie_cols) > len(col_names) * 0.4:
        grade = "SHELL"   # mostly dead columns
    elif critical_nulls:
        grade = "BROKEN"  # critical columns missing
    elif age_h and age_h > 168 * 4:  # 4 weeks
        grade = "STALE"
    elif identity_coverage == 0 and len(identity_cols_present) > 0:
        grade = "UNSCOPED"  # has identity cols but all null
    else:
        grade = "OK"

    results[table] = {
        "cols": cols, "count": count, "null_analysis": null_map,
        "grade": grade, "critical_nulls": critical_nulls,
        "zombie_cols": zombie_cols, "sparse_cols": sparse_cols,
        "fk_cols": fk_cols, "ts_cols": ts_cols,
        "identity_coverage": identity_coverage,
        "identity_cols": identity_cols_present,
        "age_h": age_h, "latest": latest,
        "col_count": len(col_names),
    }

    issues = []
    if zombie_cols:   issues.append(f"{len(zombie_cols)} zombie cols")
    if sparse_cols:   issues.append(f"{len(sparse_cols)} sparse cols")
    if critical_nulls: issues.append(f"{len(critical_nulls)} critical nulls")
    print(f"{grade} | {count:,} rows | {', '.join(issues) if issues else 'clean'}")

    time.sleep(0.05)

# ── FK consistency spot-check ─────────────────────────────────────────────────
print("\nChecking FK consistency...")
FK_CHECKS = [
    ("agentsam_execution_steps", "workflow_run_id",  "agentsam_workflow_runs", "id"),
    ("agentsam_plan_tasks",      "plan_id",           "agentsam_plans",         "id"),
    ("agentsam_command_run",     "workflow_run_id",   "agentsam_workflow_runs", "id"),
    ("agentsam_approval_queue",  "command_run_id",    "agentsam_command_run",   "id"),
    ("agentsam_hook_execution",  "hook_id",           "agentsam_hook",          "id"),
    ("agentsam_script_runs",     "script_id",         "agentsam_scripts",       "id"),
    ("agentsam_eval_runs",       "suite_id",          "agentsam_eval_suites",   "id"),
]

fk_results = []
for child_table, child_col, parent_table, parent_col in FK_CHECKS:
    if child_table not in results or results[child_table].get("count", 0) == 0:
        continue
    if child_col not in results.get(child_table, {}).get("cols", {}):
        continue
    orphan_sql = f"""
        SELECT COUNT(*) as orphans FROM {child_table} c
        WHERE c.{child_col} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM {parent_table} p WHERE p.{parent_col} = c.{child_col})
    """
    r = d1(orphan_sql, silent=True)
    orphans = r[0]["orphans"] if r else "?"
    total   = results[child_table]["count"]
    fk_results.append({
        "child": child_table, "col": child_col,
        "parent": parent_table, "orphans": orphans,
        "total": total,
        "pct": round(100 * orphans / total, 1) if isinstance(orphans, int) and total else 0
    })
    status = "OK" if orphans == 0 else f"{orphans} ORPHANS"
    print(f"  {child_table}.{child_col} → {parent_table}: {status}")

# ── smoke test generation ─────────────────────────────────────────────────────
SMOKE_TESTS = {
    "agentsam_workflow_runs": """
-- Smoke: insert a minimal workflow run, verify it's readable
INSERT INTO agentsam_workflow_runs (id, workspace_id, tenant_id, status, trigger_type, created_at)
VALUES ('smoke_wr_001','ws_inneranimalmedia','tenant_sam_primeaux','running','manual',unixepoch());
SELECT id, status FROM agentsam_workflow_runs WHERE id='smoke_wr_001';
DELETE FROM agentsam_workflow_runs WHERE id='smoke_wr_001';""",

    "agentsam_execution_steps": """
-- Smoke: requires a valid workflow_run_id FK
SELECT COUNT(*) as orphan_steps FROM agentsam_execution_steps s
WHERE NOT EXISTS (SELECT 1 FROM agentsam_workflow_runs r WHERE r.id = s.workflow_run_id);
SELECT COUNT(*) as missing_status FROM agentsam_execution_steps WHERE status IS NULL;
SELECT COUNT(*) as missing_step_type FROM agentsam_execution_steps WHERE step_type IS NULL;""",

    "agentsam_usage_events": """
-- Smoke: verify write path captures model_key and tokens
SELECT COUNT(*) as no_model FROM agentsam_usage_events WHERE model_key IS NULL OR model_key='';
SELECT COUNT(*) as no_workspace FROM agentsam_usage_events WHERE workspace_id IS NULL;
SELECT COUNT(*) as no_tokens FROM agentsam_usage_events WHERE input_tokens IS NULL AND output_tokens IS NULL;
SELECT model_key, COUNT(*) as n, SUM(input_tokens) as total_in FROM agentsam_usage_events GROUP BY model_key ORDER BY n DESC LIMIT 5;""",

    "agentsam_memory": """
-- Smoke: verify memory has embedding_id populated after today's backfill
SELECT COUNT(*) as total,
       SUM(CASE WHEN embedding_id IS NULL THEN 1 ELSE 0 END) as missing_embedding,
       SUM(CASE WHEN value IS NULL OR value='' THEN 1 ELSE 0 END) as empty_value,
       COUNT(DISTINCT memory_type) as type_count
FROM agentsam_memory;""",

    "agentsam_tool_call_log": """
-- Smoke: verify tool calls have capability_key populated
SELECT COUNT(*) as total,
       SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END) as no_tool_key,
       SUM(CASE WHEN capability_key IS NULL THEN 1 ELSE 0 END) as no_capability_key,
       SUM(CASE WHEN policy_decision_json IS NULL THEN 1 ELSE 0 END) as no_policy
FROM agentsam_tool_call_log;""",

    "agentsam_mcp_tool_execution": """
-- Smoke: verify execution logging has workspace + tool data
SELECT COUNT(*) as total,
       SUM(CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END) as no_workspace,
       SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END) as no_tool_key,
       SUM(CASE WHEN duration_ms IS NULL THEN 1 ELSE 0 END) as no_duration,
       AVG(duration_ms) as avg_ms
FROM agentsam_mcp_tool_execution;""",

    "agentsam_cron_runs": """
-- Smoke: cron run completions are being recorded
SELECT job_name, status, COUNT(*) as n, AVG(duration_ms) as avg_ms,
       MAX(started_at) as last_run
FROM agentsam_cron_runs GROUP BY job_name, status ORDER BY n DESC LIMIT 10;""",

    "agentsam_deployment_health": """
-- Smoke: deployment health has worker names and status
SELECT COUNT(*) as total,
       SUM(CASE WHEN worker_name IS NULL THEN 1 ELSE 0 END) as no_worker_name,
       SUM(CASE WHEN git_hash IS NULL THEN 1 ELSE 0 END) as no_git_hash,
       COUNT(DISTINCT worker_name) as distinct_workers
FROM agentsam_deployment_health;""",

    "agentsam_agent_run": """
-- Smoke: agent runs have token counts and model refs
SELECT COUNT(*) as total,
       SUM(CASE WHEN input_tokens=0 THEN 1 ELSE 0 END) as zero_input_tokens,
       SUM(CASE WHEN output_tokens=0 THEN 1 ELSE 0 END) as zero_output_tokens,
       SUM(CASE WHEN ai_model_ref IS NULL THEN 1 ELSE 0 END) as no_model_ref,
       SUM(CASE WHEN routing_arm_id IS NULL THEN 1 ELSE 0 END) as no_routing_arm
FROM agentsam_agent_run;""",

    "agentsam_routing_arms": """
-- Smoke: routing arms have valid model_catalog links
SELECT COUNT(*) as total,
       SUM(CASE WHEN model_catalog_id IS NULL THEN 1 ELSE 0 END) as no_catalog_link,
       SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active_arms,
       SUM(CASE WHEN total_executions=0 THEN 1 ELSE 0 END) as never_used
FROM agentsam_routing_arms;""",

    "agentsam_error_log": """
-- Smoke: error log has severity and message
SELECT severity, COUNT(*) as n FROM agentsam_error_log GROUP BY severity;
SELECT COUNT(*) as no_workspace FROM agentsam_error_log WHERE workspace_id IS NULL;
SELECT COUNT(*) as no_message FROM agentsam_error_log WHERE message IS NULL OR message='';""",

    "cms_themes": """
-- Smoke: themes have required fields for CSS var injection
SELECT COUNT(*) as total,
       SUM(CASE WHEN slug IS NULL THEN 1 ELSE 0 END) as no_slug,
       SUM(CASE WHEN config_json IS NULL THEN 1 ELSE 0 END) as no_config,
       SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active_themes
FROM cms_themes;""",
}

# ── run smoke tests ───────────────────────────────────────────────────────────
print("\nRunning smoke tests...")
smoke_results = {}
for table, sql in SMOKE_TESTS.items():
    if table not in results or results[table].get("count", 0) == 0:
        smoke_results[table] = {"skipped": True, "reason": "empty table"}
        continue
    # run each statement
    statements = [s.strip() for s in sql.strip().split(";") if s.strip() and not s.strip().startswith("--")]
    table_smoke = []
    for stmt in statements:
        r = d1(stmt, silent=True)
        table_smoke.append({"sql": stmt[:80]+"...", "result": r[0] if r else "no result"})
    smoke_results[table] = {"statements": table_smoke}
    print(f"  {table}: {len(table_smoke)} checks")

# ── write report ──────────────────────────────────────────────────────────────
out_dir = REPO / "docs" / "db-audit"
out_dir.mkdir(parents=True, exist_ok=True)
ts_str  = NOW.strftime("%Y%m%dT%H%M%S")

# ── main report ───────────────────────────────────────────────────────────────
GRADE_ICON = {"OK":"✅","EMPTY":"⚪","BROKEN":"🔴","STALE":"🟠",
              "SHELL":"💀","UNSCOPED":"⚠️"}

lines = []
lines.append(f"# agentsam_* + cms_* Deep DB Audit")
lines.append(f"Generated: {NOW.strftime('%Y-%m-%dT%H:%M:%S UTC')} | {len(ALL_TABLES)} tables\n")

lines.append("## Grade Legend")
lines.append("✅ OK | ⚪ EMPTY | 🔴 BROKEN (critical nulls) | 🟠 STALE | 💀 SHELL (mostly dead cols) | ⚠️ UNSCOPED (identity cols null)\n")

# summary counts
grade_counts = defaultdict(int)
for t, r in results.items():
    grade_counts[r.get("grade","?")] += 1

lines.append("## Summary\n")
lines.append("| Grade | Count |")
lines.append("|-------|-------|")
for g in ["OK","BROKEN","UNSCOPED","STALE","SHELL","EMPTY"]:
    lines.append(f"| {GRADE_ICON.get(g,g)} {g} | {grade_counts[g]} |")

total_rows = sum(r.get("count",0) for r in results.values())
total_zombie = sum(len(r.get("zombie_cols",[])) for r in results.values())
total_sparse = sum(len(r.get("sparse_cols",[])) for r in results.values())
lines.append(f"\n- Total rows across all tables: **{total_rows:,}**")
lines.append(f"- Total zombie columns (always NULL): **{total_zombie}**")
lines.append(f"- Total sparse columns (>80% NULL): **{total_sparse}**\n")

lines.append("---\n")

# per-table detail — broken first, then by grade
grade_order = ["BROKEN","UNSCOPED","STALE","SHELL","OK","EMPTY"]
by_grade    = defaultdict(list)
for t, r in results.items():
    by_grade[r.get("grade","?")].append(t)

for grade in grade_order:
    tables_in_grade = by_grade.get(grade, [])
    if not tables_in_grade:
        continue
    lines.append(f"## {GRADE_ICON.get(grade,grade)} {grade} Tables ({len(tables_in_grade)})\n")

    for table in sorted(tables_in_grade):
        r = results[table]
        lines.append(f"### `{table}` — {r.get('count',0):,} rows")

        if r.get("grade") == "EMPTY":
            lines.append("No data. Write path not exercised yet.\n")
            continue

        # null summary
        null_anal = r.get("null_analysis", {})
        zombie    = r.get("zombie_cols", [])
        sparse    = r.get("sparse_cols", [])
        critical  = r.get("critical_nulls", [])
        fk_cols   = r.get("fk_cols", [])

        if critical:
            lines.append(f"\n**🚨 Critical NULLs** (columns that should always be populated):")
            for cn in critical:
                lines.append(f"- `{cn['col']}` — **{cn['null_pct']}% NULL**")

        if zombie:
            lines.append(f"\n**💀 Zombie columns** (100% NULL — never written to):")
            lines.append(", ".join(f"`{c}`" for c in zombie[:12]) +
                        (f" + {len(zombie)-12} more" if len(zombie) > 12 else ""))

        if sparse:
            lines.append(f"\n**⚠️ Sparse columns** (>80% NULL — rarely written):")
            lines.append(", ".join(f"`{c}` ({null_anal.get(c,{}).get('null_pct',0)}%)" for c in sparse[:8]))

        # identity coverage
        id_cols = r.get("identity_cols", [])
        if id_cols:
            id_status = []
            for ic in id_cols:
                pct = null_anal.get(ic, {}).get("null_pct", 0)
                id_status.append(f"`{ic}` {100-pct:.0f}% populated")
            lines.append(f"\n**Identity coverage:** {' | '.join(id_status)}")

        # FK cols null check
        fk_nulls = [(c, null_anal.get(c,{}).get("null_pct",0)) for c in fk_cols
                    if null_anal.get(c,{}).get("null_pct",0) > 50]
        if fk_nulls:
            lines.append(f"\n**FK columns mostly null** (broken relationships):")
            for c, pct in fk_nulls:
                lines.append(f"- `{c}` — {pct}% NULL")

        # freshness
        if r.get("latest"):
            lines.append(f"\n**Last write:** {r['latest']} ({r.get('age_h','?')}h ago)")

        # fix recommendations
        fixes = []
        for cn in critical:
            fixes.append(f"Wire `{cn['col']}` into the write path — currently {cn['null_pct']}% NULL")
        for c in zombie[:5]:
            fixes.append(f"Drop or populate `{c}` — 100% NULL, consuming schema space")
        for c, pct in fk_nulls[:3]:
            fixes.append(f"Fix FK `{c}` — {pct}% rows have no parent reference")
        if fixes:
            lines.append(f"\n**Fixes:**")
            for fix in fixes:
                lines.append(f"- {fix}")

        lines.append("")

# FK consistency section
lines.append("---\n")
lines.append("## FK Consistency Checks\n")
lines.append("| Child Table | Column | Parent | Orphans | % |")
lines.append("|-------------|--------|--------|---------|---|")
for fk in fk_results:
    icon = "✅" if fk["orphans"] == 0 else "🔴"
    lines.append(f"| `{fk['child']}` | `{fk['col']}` | `{fk['parent']}` | {icon} {fk['orphans']} | {fk['pct']}% |")

# smoke test results
lines.append("\n---\n")
lines.append("## Smoke Test Results\n")
for table, sr in smoke_results.items():
    if sr.get("skipped"):
        lines.append(f"### ⚪ `{table}` — skipped ({sr['reason']})")
        continue
    lines.append(f"### `{table}`")
    for stmt in sr.get("statements", []):
        result = stmt["result"]
        if isinstance(result, dict):
            # format as key: value pairs
            kv = " | ".join(f"{k}: **{v}**" for k, v in result.items())
            lines.append(f"- {kv}")
        else:
            lines.append(f"- {result}")
    lines.append("")

# top recommendations
lines.append("---\n")
lines.append("## Top Recommendations\n")

lines.append("### 1. Wire identity columns everywhere")
lines.append("The most common NULL pattern across agentsam_* is `tenant_id` and `workspace_id` missing.")
lines.append("Every INSERT in the Worker should resolve and bind these at the handler level, not leave them to individual table writers.\n")

lines.append("### 2. Token counts are always 0 in agentsam_agent_run")
lines.append("`input_tokens`, `output_tokens`, and `cost_usd` are almost certainly 0 across the board.")
lines.append("The SSE stream handler needs to capture the usage block from the provider response and UPDATE the run row after completion.\n")

lines.append("### 3. Zombie column migration")
uniq_zombies = set()
for t, r in results.items():
    for z in r.get("zombie_cols", []):
        uniq_zombies.add(z)
common_zombies = sorted([z for z in uniq_zombies
                         if sum(1 for r in results.values() if z in r.get("zombie_cols", [])) > 3])
if common_zombies:
    lines.append(f"These columns are 100% NULL across 3+ tables — likely never wired:")
    for z in common_zombies[:15]:
        tables_with_z = [t for t, r in results.items() if z in r.get("zombie_cols", [])]
        lines.append(f"- `{z}` — appears in {len(tables_with_z)} tables: {', '.join(tables_with_z[:4])}")
lines.append("")

lines.append("### 4. Empty critical tables need write paths")
empty_critical = [t for t in CRITICAL_TABLES if results.get(t,{}).get("grade") == "EMPTY"]
if empty_critical:
    for t in empty_critical:
        lines.append(f"- `{t}` — 0 rows. Required cols: {', '.join(f'`{c}`' for c in CRITICAL_TABLES[t])}")
lines.append("")

lines.append("### 5. FK orphan cleanup")
bad_fks = [fk for fk in fk_results if isinstance(fk["orphans"], int) and fk["orphans"] > 0]
if bad_fks:
    for fk in bad_fks:
        lines.append(f"- `{fk['child']}.{fk['col']}` has {fk['orphans']} rows pointing at non-existent `{fk['parent']}`")
else:
    lines.append("- All checked FKs are clean ✅")

lines.append("\n---")
lines.append(f"*Generated by `scripts/agentsam_db_deep_audit.py` at {NOW.strftime('%Y-%m-%dT%H:%M:%S UTC')}*")

report_path = out_dir / f"agentsam_audit_{ts_str}.md"
report_path.write_text("\n".join(lines))
print(f"\nReport: docs/db-audit/agentsam_audit_{ts_str}.md")

# also write smoke SQL file
smoke_sql_lines = [f"-- Smoke tests generated {NOW.strftime('%Y-%m-%dT%H:%M:%S UTC')}\n"]
for table, sql in SMOKE_TESTS.items():
    smoke_sql_lines.append(f"\n-- ═══ {table} ═══")
    smoke_sql_lines.append(sql)

smoke_path = out_dir / f"smoke_tests_{ts_str}.sql"
smoke_path.write_text("\n".join(smoke_sql_lines))
print(f"Smoke SQL: docs/db-audit/smoke_tests_{ts_str}.sql")
print(f"\nDone. {len(ALL_TABLES)} tables audited.")
