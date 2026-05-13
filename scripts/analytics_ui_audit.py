#!/usr/bin/env python3
"""
Audit D1 + Supabase tables to determine best data sources
for each analytics dashboard page. Outputs a ranked report
with UI widget recommendations, data freshness, and gaps.
"""

import json, os, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone

for line in (Path.home() / "inneranimalmedia/.env.agentsam.local").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
SUPABASE_URL   = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
D1_ENDPOINT    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
REPO           = Path.home() / "inneranimalmedia"
NOW            = datetime.now(timezone.utc)

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            return None
        return data["result"][0]["results"]
    except:
        return None

def supabase_count(table):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1",
            headers={"apikey": SUPABASE_KEY,
                     "Authorization": f"Bearer {SUPABASE_KEY}",
                     "Prefer": "count=exact", "Range": "0-0"},
            method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            cr = r.headers.get("Content-Range","0/0")
            return int(cr.split("/")[-1]) if "/" in cr else 0
    except:
        return -1

def d1_count_and_fresh(table, ts_col=None):
    """Returns (row_count, latest_ts_str, age_hours)"""
    rows = d1(f"SELECT COUNT(*) as n FROM {table}")
    if rows is None:
        return (None, None, None)
    count = rows[0]["n"]
    if ts_col and count > 0:
        fresh = d1(f"SELECT MAX({ts_col}) as latest FROM {table}")
        if fresh and fresh[0]["latest"]:
            latest = fresh[0]["latest"]
            # try to parse various formats
            try:
                if isinstance(latest, int) or str(latest).isdigit():
                    dt = datetime.fromtimestamp(int(latest), tz=timezone.utc)
                else:
                    for fmt in ["%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S",
                                "%Y-%m-%dT%H:%M:%S.%fZ"]:
                        try:
                            dt = datetime.strptime(str(latest)[:26], fmt).replace(tzinfo=timezone.utc)
                            break
                        except: continue
                    else:
                        return (count, str(latest), None)
                age_h = (NOW - dt).total_seconds() / 3600
                return (count, dt.strftime("%Y-%m-%d %H:%M UTC"), round(age_h, 1))
            except:
                return (count, str(latest), None)
    return (count, None, None)

# ── Table definitions per analytics page ─────────────────────────────────────
# Format: (table, ts_col, suggested_widget, priority_note)

PAGES = {

"overview": [
    ("agentsam_workflow_runs",        "created_at",  "KPI card — runs today/week + status breakdown", "P0 — main activity signal"),
    ("agentsam_usage_rollups_daily",  "created_at",  "Line chart — daily token spend + cost over 30d", "P0 — cost trend"),
    ("agentsam_usage_events",         "created_at",  "Sparkline — hourly activity heatmap",           "P0 — real-time pulse"),
    ("agentsam_agent_run",            "created_at",  "KPI card — success rate + avg latency",         "P0 — agent health"),
    ("agentsam_error_log",            "created_at",  "Alert strip — open errors by severity",         "P0 — error surface"),
    ("agentsam_deployment_health",    "created_at",  "Status badge grid — per-worker health",         "P1 — infra health"),
    ("agentsam_cron_runs",            "started_at",  "Heatmap calendar — cron success/fail per day",  "P1 — scheduler health"),
    ("agentsam_tool_stats_compacted", "updated_at",  "Horizontal bar — top 10 tools by call count",   "P1 — tool usage"),
    ("agentsam_execution_performance_metrics", "created_at", "Histogram — p50/p95 latency distribution", "P1 — perf"),
    ("agentsam_webhook_events",       "created_at",  "Counter + recent list — webhook volume",        "P2 — events"),
    ("agentsam_analytics",            "updated_at",  "Summary row — workspace-level rolled stats",    "P2 — meta"),
],

"agent": [
    ("agentsam_workflow_runs",        "created_at",  "Run timeline — status, model, duration per run","P0 — core view"),
    ("agentsam_execution_steps",      "created_at",  "Waterfall chart — step latency breakdown",      "P0 — step detail"),
    ("agentsam_executions",           "created_at",  "Table — execution list with status + cost",     "P0 — execution log"),
    ("agentsam_command_run",          "created_at",  "Table — CLI commands triggered per run",        "P0 — command log"),
    ("agentsam_approval_queue",       "created_at",  "Alert list — pending approvals",               "P0 — blocking items"),
    ("agentsam_execution_dependency_graph", "created_at", "DAG viz — node dependency map",           "P1 — graph view"),
    ("agentsam_execution_context",    "created_at",  "JSON inspector — context per execution",        "P1 — debug"),
    ("agentsam_execution_performance_metrics","created_at","Scatter — cost vs latency per run",       "P1 — perf"),
    ("agentsam_escalation",           "created_at",  "Timeline — escalation events",                 "P2 — escalations"),
    ("agentsam_plans",                "created_at",  "Card list — active plans + completion %",       "P2 — planning"),
    ("agentsam_plan_tasks",           "created_at",  "Kanban strip — tasks by status",               "P2 — tasks"),
],

"models": [
    ("agentsam_routing_arms",         "updated_at",  "Leaderboard — model key, score, executions",   "P0 — routing state"),
    ("agentsam_model_catalog",        "updated_at",  "Table — all models, active/degraded, cost",    "P0 — catalog"),
    ("agentsam_model_drift_signals",  "created_at",  "Alert cards — drift detected per model",       "P0 — quality"),
    ("agentsam_model_routing_memory", "created_at",  "Heat table — model × route success matrix",    "P0 — routing intel"),
    ("agentsam_model_tier",           "updated_at",  "Tier ladder viz — tier 0→4 with active model", "P1 — tier config"),
    ("agentsam_usage_events",         "created_at",  "Cost breakdown — spend by model over 7d",      "P1 — cost"),
    ("agentsam_agent_run",            "created_at",  "Bar chart — runs per model, success rate",     "P1 — model perf"),
    ("agentsam_prompt_cache_keys",    "created_at",  "Cache hit rate gauge per model",               "P2 — caching"),
],

"workers": [
    ("agentsam_deployment_health",    "created_at",  "Status grid — worker × deploy health badge",   "P0 — live status"),
    ("agentsam_cron_runs",            "started_at",  "Heatmap — cron success/fail × time of day",    "P0 — scheduler"),
    ("agentsam_webhook_events",       "created_at",  "Volume chart + recent event list",             "P0 — events"),
    ("agentsam_hook",                 "created_at",  "Table — registered hooks + last fired",        "P1 — hook registry"),
    ("agentsam_hook_execution",       "created_at",  "Timeline — hook execution history",            "P1 — hook runs"),
    ("agentsam_analytics",            "updated_at",  "KPI strip — requests, errors, avg response",   "P1 — worker metrics"),
    ("agentsam_health_daily",         "created_at",  "Line chart — daily health score over 30d",     "P1 — trend"),
    ("agentsam_error_log",            "created_at",  "Error rate chart — errors/hour by worker",     "P1 — errors"),
],

"mcp": [
    ("agentsam_mcp_tool_execution",   "created_at",  "Leaderboard — tool, calls, avg ms, fail rate", "P0 — tool perf"),
    ("agentsam_tool_call_log",        "created_at",  "Live feed — recent tool calls + status",       "P0 — live log"),
    ("agentsam_tool_stats_compacted", "updated_at",  "Bar chart — top tools by call volume",         "P0 — usage"),
    ("agentsam_tool_chain",           "created_at",  "Chain viz — tool sequence per session",        "P1 — chains"),
    ("agentsam_mcp_tools",            "updated_at",  "Catalog table — all tools, health, latency",   "P1 — registry"),
    ("agentsam_mcp_allowlist",        "created_at",  "Permission matrix — workspace × tool",         "P2 — permissions"),
    ("agentsam_mcp_servers",          "created_at",  "Server health cards — URL, status, last ping", "P1 — servers"),
    ("mcp_audit_log",                 "created_at",  "Audit feed — tool calls with actor + result",  "P2 — audit"),
],

"advisors": [
    ("agentsam_error_log",            "created_at",  "Severity cards — open issues grouped by type", "P0 — findings"),
    ("agentsam_guardrail_events",     "created_at",  "Event stream — guardrail triggers + severity", "P0 — guardrails"),
    ("agentsam_guardrails",           "created_at",  "Policy table — rules, enabled/disabled",       "P0 — policy"),
    ("agentsam_deployment_health",    "created_at",  "Drift detector — git hash mismatch per worker","P1 — drift"),
    ("agentsam_escalation",           "created_at",  "Open escalations — unresolved by age",         "P1 — escalations"),
    ("agentsam_model_drift_signals",  "created_at",  "Quality drift — models degrading over time",   "P1 — model health"),
    ("agentsam_memory",               "updated_at",  "Memory inspector — recall count, decay score", "P2 — memory health"),
],

}

# Supabase tables relevant to analytics
SUPABASE_TABLES = [
    ("agentsam_routing_decisions", "Routing decisions log — model choice audit trail"),
    ("agentsam_eval_runs",         "Eval results — quality scores per model/run"),
    ("agentsam_error_events",      "Error events — structured error stream"),
    ("agentsam_stream_events",     "SSE stream events — token-level telemetry"),
    ("build_deploy_events",        "Deploy events — CI/CD history"),
    ("codebase_snapshots",         "Codebase index — for advisor insights"),
    ("agent_memory",               "Embedded memory — semantic recall layer"),
]

# ── run audit ─────────────────────────────────────────────────────────────────
print("Auditing tables for analytics pages...\n")

all_results = {}
seen_tables = set()

for page, tables in PAGES.items():
    print(f"  [{page}]", end=" ", flush=True)
    page_results = []
    for table, ts_col, widget, priority in tables:
        if table not in seen_tables:
            count, fresh, age_h = d1_count_and_fresh(table, ts_col)
            seen_tables.add(table)
        else:
            count, fresh, age_h = d1_count_and_fresh(table, ts_col)

        # freshness grade
        if count is None:
            grade = "MISSING"
        elif count == 0:
            grade = "EMPTY"
        elif age_h is None:
            grade = "NO_TS"
        elif age_h < 1:
            grade = "LIVE"
        elif age_h < 24:
            grade = "FRESH"
        elif age_h < 168:
            grade = "WEEK"
        else:
            grade = "STALE"

        page_results.append({
            "table": table, "ts_col": ts_col, "widget": widget,
            "priority": priority, "count": count,
            "latest": fresh, "age_h": age_h, "grade": grade,
        })
        print(".", end="", flush=True)
    all_results[page] = page_results
    print()

# supabase counts
print("\n  [supabase]", end=" ")
supa_results = []
for table, purpose in SUPABASE_TABLES:
    count = supabase_count(table)
    supa_results.append({"table": table, "count": count, "purpose": purpose})
    print(".", end="", flush=True)
print()

# ── write report ──────────────────────────────────────────────────────────────
out = REPO / "docs" / "analytics_ui_audit.md"
out.parent.mkdir(parents=True, exist_ok=True)

GRADE_ICON = {
    "LIVE": "🟢", "FRESH": "🟡", "WEEK": "🟠",
    "STALE": "🔴", "EMPTY": "⚪", "MISSING": "❌", "NO_TS": "🔵"
}

lines = []
lines.append("# Analytics UI Audit")
lines.append(f"Generated: {NOW.strftime('%Y-%m-%dT%H:%M:%S UTC')}\n")
lines.append("## Legend")
lines.append("🟢 LIVE (<1h)  🟡 FRESH (<24h)  🟠 WEEK (<7d)  🔴 STALE (>7d)  ⚪ EMPTY  ❌ MISSING  🔵 NO_TS\n")
lines.append("---\n")

for page, results in all_results.items():
    url = f"/dashboard/analytics/{page}"
    lines.append(f"## {page.upper()} — `{url}`\n")

    live   = [r for r in results if r["grade"] in ("LIVE","FRESH")]
    empty  = [r for r in results if r["grade"] in ("EMPTY","MISSING")]
    stale  = [r for r in results if r["grade"] in ("STALE","WEEK")]

    lines.append(f"**{len(live)} data-ready** | **{len(stale)} stale** | **{len(empty)} empty/missing**\n")
    lines.append("| Status | Priority | Table | Rows | Freshness | Widget |")
    lines.append("|--------|----------|-------|------|-----------|--------|")

    for r in sorted(results, key=lambda x: (x["priority"][1], {"LIVE":0,"FRESH":1,"WEEK":2,"NO_TS":3,"STALE":4,"EMPTY":5,"MISSING":6}.get(x["grade"],7))):
        icon    = GRADE_ICON.get(r["grade"], "?")
        rows    = f"{r['count']:,}" if r["count"] is not None else "—"
        age_str = f"{r['age_h']}h ago" if r["age_h"] is not None else r["latest"] or "—"
        lines.append(f"| {icon} {r['grade']} | {r['priority'][:2]} | `{r['table']}` | {rows} | {age_str} | {r['widget']} |")

    # top recommendations
    p0_ready = [r for r in results if r["priority"].startswith("P0") and r["grade"] in ("LIVE","FRESH","WEEK","NO_TS")]
    if p0_ready:
        lines.append(f"\n**Ship these first** (P0, has data):")
        for r in p0_ready:
            lines.append(f"- `{r['table']}` ({r['count']:,} rows) → {r['widget']}")

    p0_empty = [r for r in results if r["priority"].startswith("P0") and r["grade"] in ("EMPTY","MISSING")]
    if p0_empty:
        lines.append(f"\n**P0 gaps** (no data yet — need writes wired):")
        for r in p0_empty:
            lines.append(f"- `{r['table']}` → {r['widget']}")

    lines.append("")

# supabase
lines.append("---\n")
lines.append("## SUPABASE — semantic/analytics layer\n")
lines.append("| Table | Rows | Purpose |")
lines.append("|-------|------|---------|")
for r in supa_results:
    rows = f"{r['count']:,}" if r["count"] >= 0 else "ERR"
    lines.append(f"| `{r['table']}` | {rows} | {r['purpose']} |")

# global summary
lines.append("\n---\n")
lines.append("## Global Summary\n")
all_flat = [r for results in all_results.values() for r in results]
for grade in ["LIVE","FRESH","WEEK","NO_TS","STALE","EMPTY","MISSING"]:
    g_rows = [r for r in all_flat if r["grade"] == grade]
    if g_rows:
        lines.append(f"**{GRADE_ICON[grade]} {grade}** ({len(g_rows)} tables): " +
                     ", ".join(f"`{r['table']}`" for r in g_rows[:8]) +
                     (f" + {len(g_rows)-8} more" if len(g_rows) > 8 else ""))

lines.append("\n---")
lines.append("*Run `scripts/analytics_ui_audit.py` to refresh.*")

out.write_text("\n".join(lines))
print(f"\nReport written: docs/analytics_ui_audit.md ({len(lines)} lines)")
print("Done.")
