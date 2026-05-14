#!/usr/bin/env python3
"""
eval_pipeline_e2e.py — End-to-end stress test for the agentsam plan/workflow/execution pipeline.

Tests the full lifecycle:
  chat trigger → agentsam_agent_run → agentsam_workflow_runs → agentsam_execution_steps
                → agentsam_plan / agentsam_plan_tasks (for plan-mode prompts)
                → agentsam_command_run (for command triggers)
                → agentsam_usage_events (for cost/token tracking)

For each table: verifies rows were written, checks schema alignment, reports any drift.

Usage:
    python3 scripts/eval_pipeline_e2e.py

Env:
    CHAT_URL              default: https://inneranimalmedia.com/api/agent/chat
    IAM_COOKIE / .iam_cookie
    D1_DB                 default: inneranimalmedia-business
    IAM_CHAT_TIMEOUT_SEC  default: 60
    OUTPUT_DIR            default: scripts/reports
"""

from __future__ import annotations
import json, os, subprocess, sys, time, uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
CHAT_URL    = os.getenv("CHAT_URL", "https://inneranimalmedia.com/api/agent/chat")
TIMEOUT_SEC = int(os.getenv("IAM_CHAT_TIMEOUT_SEC", "60"))
D1_DB       = os.getenv("D1_DB", "inneranimalmedia-business")
OUTPUT_DIR  = Path(os.getenv("OUTPUT_DIR", "scripts/reports"))
COOKIE_FILE = Path(".iam_cookie")

# Tables to verify post-run
PIPELINE_TABLES = [
    "agentsam_agent_run",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_plan_tasks",
    "agentsam_usage_events",
    "agentsam_command_run",
    "agentsam_tool_call_log",
    "agentsam_routing_arms",
    "agentsam_model_routing_memory",
]

# Test prompts designed to exercise different pipeline paths
PIPELINE_PROMPTS = [
    {
        "slug":    "simple_chat",
        "mode":    "agent",
        "message": "Reply with exactly: PIPELINE_OK",
        "expect_tables": ["agentsam_agent_run", "agentsam_usage_events"],
        "expect_text": "PIPELINE_OK",
    },
    {
        "slug":    "tool_use",
        "mode":    "agent",
        "message": "Query agentsam_memory and tell me how many rows exist.",
        "expect_tables": ["agentsam_agent_run", "agentsam_tool_call_log", "agentsam_usage_events"],
        "expect_text": None,  # just check it responds
    },
    {
        "slug":    "plan_creation",
        "mode":    "plan",
        "message": "Create a plan to add a health check endpoint to the API that returns Worker status.",
        "expect_tables": ["agentsam_agent_run", "agentsam_plan_tasks", "agentsam_usage_events"],
        "expect_text": None,
    },
    {
        "slug":    "workflow_trigger",
        "mode":    "agent",
        "message": "Run a quick system status check and report back.",
        "expect_tables": ["agentsam_agent_run", "agentsam_workflow_runs", "agentsam_usage_events"],
        "expect_text": None,
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_cookie() -> str:
    env_val = os.getenv("IAM_COOKIE", "").strip()
    if env_val:
        return env_val
    if COOKIE_FILE.exists():
        return COOKIE_FILE.read_text().strip()
    print("WARN: No IAM_COOKIE — requests may 401", file=sys.stderr)
    return ""

def d1_query(sql: str) -> list[dict]:
    try:
        r = subprocess.run(
            ["npx", "wrangler", "d1", "execute", D1_DB, "--remote", "--json", f"--command={sql}"],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return []
        data = json.loads(r.stdout)
        if isinstance(data, list) and data:
            return data[0].get("results", [])
        return []
    except Exception as e:
        print(f"  D1 error: {e}", file=sys.stderr)
        return []

def d1_count(table: str, where: str = "", since_unix: int = 0) -> int:
    clause = f"WHERE created_at >= {since_unix}" if since_unix else ""
    if where:
        clause = f"WHERE {where}" + (f" AND created_at >= {since_unix}" if since_unix else "")
    rows = d1_query(f"SELECT COUNT(*) as cnt FROM {table} {clause}")
    return int(rows[0]["cnt"]) if rows else -1

def d1_pragma(table: str) -> set[str]:
    rows = d1_query(f"PRAGMA table_info({table})")
    return {r["name"] for r in rows} if rows else set()

def chat_request(message: str, mode: str, cookie: str) -> tuple[bool, str, float, float | None]:
    """Returns (success, text, total_ms, ttft_ms)."""
    payload = json.dumps({"message": message, "mode": mode, "stream": True})
    cmd = [
        "curl", "-sSN", "--max-time", str(TIMEOUT_SEC),
        "-X", "POST", CHAT_URL,
        "-H", "Content-Type: application/json",
        "-H", f"Cookie: {cookie}",
        "--data-raw", payload,
    ]
    t_start   = time.perf_counter()
    ttft_ms   = None
    chunks    = []
    saw_done  = False
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, bufsize=1)
        for raw in proc.stdout:
            line = raw.strip()
            if not line.startswith("data:"):
                continue
            js = line[5:].strip()
            if not js:
                continue
            try:
                obj = json.loads(js)
            except Exception:
                continue
            t = obj.get("type", "")
            if t == "done":
                saw_done = True
                break
            if t == "error":
                proc.kill()
                return False, obj.get("message", "error"), (time.perf_counter()-t_start)*1000, None
            if t == "text":
                content = obj.get("text", "")
                if content and ttft_ms is None:
                    ttft_ms = (time.perf_counter() - t_start) * 1000
                if content:
                    chunks.append(content)
        proc.wait(timeout=5)
    except Exception as e:
        return False, str(e), (time.perf_counter()-t_start)*1000, None

    total_ms = (time.perf_counter() - t_start) * 1000
    text = "".join(chunks)
    return saw_done and bool(text), text, total_ms, ttft_ms

# ── Schema audit ──────────────────────────────────────────────────────────────

@dataclass
class TableAudit:
    table:         str
    exists:        bool        = False
    row_count:     int         = 0
    rows_since:    int         = 0      # written during this test run
    columns:       set         = field(default_factory=set)
    schema_issues: list[str]   = field(default_factory=list)

EXPECTED_COLUMNS = {
    # session_id does not exist on agentsam_agent_run (uses work_session_id)
    "agentsam_agent_run":     {"id","tenant_id","user_id","workspace_id","status","started_at","created_at"},
    "agentsam_workflow_runs": {"id","tenant_id","workspace_id","status","started_at","created_at","input_tokens","output_tokens","cost_usd"},
    "agentsam_execution_steps":{"id","node_key","node_type","status","created_at"},
    "agentsam_plan_tasks":    {"id","plan_id","title","status","priority","order_index","created_at"},
    "agentsam_usage_events":  {"id","tenant_id","workspace_id","model","tokens_in","tokens_out","cost_usd","created_at"},
    "agentsam_command_run":   {"id","tenant_id","workspace_id","selected_command_slug","created_at"},
    # success does not exist on agentsam_tool_call_log (uses status column instead)
    "agentsam_tool_call_log": {"id","tenant_id","tool_name","status","created_at"},
    "agentsam_routing_arms":  {"id","task_type","mode","model_key","success_alpha","success_beta","workspace_id"},
    "agentsam_model_routing_memory": {"workspace_id","task_type","model_key","success_rate","sample_n"},
}

def audit_table(table: str, since_unix: int) -> TableAudit:
    audit = TableAudit(table=table)
    cols  = d1_pragma(table)
    if not cols:
        audit.exists = False
        return audit
    audit.exists  = True
    audit.columns = cols

    # Check expected columns
    expected = EXPECTED_COLUMNS.get(table, set())
    missing  = expected - cols
    if missing:
        audit.schema_issues.append(f"Missing expected columns: {sorted(missing)}")

    # Count total rows
    cnt = d1_count(table)
    audit.row_count = cnt if cnt >= 0 else 0

    # Count rows written during test
    # Most tables use created_at as INTEGER unixepoch; some use TEXT
    since_rows = d1_query(
        f"SELECT COUNT(*) as cnt FROM {table} WHERE "
        f"CAST(COALESCE(created_at_unix, created_at, 0) AS INTEGER) >= {since_unix} "
        f"OR (typeof(created_at) = 'text' AND created_at >= datetime({since_unix}, 'unixepoch'))"
    )
    audit.rows_since = int(since_rows[0]["cnt"]) if since_rows else 0

    return audit

# ── Main ──────────────────────────────────────────────────────────────────────

@dataclass
class PromptResult:
    slug:        str
    mode:        str
    ok:          bool
    total_ms:    float
    ttft_ms:     Optional[float]
    output_chars: int
    error:       Optional[str] = None
    tables_hit:  dict          = field(default_factory=dict)

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cookie   = load_cookie()
    run_id   = uuid.uuid4().hex[:8]
    t_start  = time.perf_counter()
    since_unix = int(time.time()) - 5  # 5s buffer

    print(f"\n{'═'*70}")
    print(f"  AgentSam Pipeline E2E Eval  —  run {run_id}")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    print(f"  CHAT_URL={CHAT_URL}  timeout={TIMEOUT_SEC}s")
    print(f"{'═'*70}\n")

    # ── Phase 1: Schema audit (baseline) ──────────────────────────────────────
    print("Phase 1 — Schema audit (pre-run baseline)")
    print("─" * 70)
    pre_audits: dict[str, TableAudit] = {}
    for tbl in PIPELINE_TABLES:
        a = audit_table(tbl, since_unix)
        pre_audits[tbl] = a
        status = "✅" if a.exists else "❌ MISSING"
        issues = f"  ⚠️  {'; '.join(a.schema_issues)}" if a.schema_issues else ""
        print(f"  {status}  {tbl:<40}  {a.row_count:>5} rows{issues}")
    print()

    # ── Phase 2: Fire test prompts ────────────────────────────────────────────
    print("Phase 2 — Firing pipeline prompts")
    print("─" * 70)
    results: list[PromptResult] = []

    for p in PIPELINE_PROMPTS:
        t0 = time.perf_counter()
        ok, text, total_ms, ttft_ms = chat_request(p["message"], p["mode"], cookie)
        status = "ok  " if ok else "FAIL"
        ttft   = f"{ttft_ms:.0f}ms" if ttft_ms else "—"
        expect_ok = p["expect_text"] is None or (p["expect_text"] in text if text else False)
        quality = "✅" if ok and expect_ok else "⚠️ " if ok else "❌"
        print(f"  {quality} [{p['slug']:<18}]  {status}  ttft={ttft:<8}  total={total_ms:.0f}ms  {len(text)}ch")
        if not ok and text:
            print(f"      ↳ {text[:100]}")
        results.append(PromptResult(
            slug=p["slug"], mode=p["mode"], ok=ok,
            total_ms=total_ms, ttft_ms=ttft_ms,
            output_chars=len(text),
            error=None if ok else text[:200],
        ))
        # Small gap between requests
        time.sleep(2)

    print()

    # ── Phase 3: Post-run table audit ─────────────────────────────────────────
    print("Phase 3 — Post-run table audit (rows written during test)")
    print("─" * 70)
    time.sleep(3)  # give async writes time to land

    post_audits: dict[str, TableAudit] = {}
    pipeline_pass = 0
    pipeline_fail = 0

    for tbl in PIPELINE_TABLES:
        a = audit_table(tbl, since_unix)
        post_audits[tbl] = a
        pre = pre_audits[tbl]
        new_rows = a.row_count - pre.row_count if (a.row_count >= 0 and pre.row_count >= 0) else a.rows_since
        wrote = new_rows > 0 or a.rows_since > 0
        actual_new = max(new_rows, a.rows_since)

        if not a.exists:
            icon = "❌"
            pipeline_fail += 1
            note = "TABLE MISSING"
        elif a.schema_issues:
            icon = "⚠️ "
            pipeline_fail += 1
            note = f"+{actual_new} rows  SCHEMA: {'; '.join(a.schema_issues)}"
        elif wrote:
            icon = "✅"
            pipeline_pass += 1
            note = f"+{actual_new} rows written"
        else:
            icon = "○ "
            note = f"no new rows (total={a.row_count}) — path may not have been exercised"

        print(f"  {icon} {tbl:<42}  {note}")

    print()

    # ── Phase 4: Specific data checks ─────────────────────────────────────────
    print("Phase 4 — Data integrity spot checks")
    print("─" * 70)

    checks = [
        ("agentsam_routing_arms has workspace rows",
         "SELECT COUNT(*) as cnt FROM agentsam_routing_arms WHERE workspace_id IS NOT NULL AND workspace_id != ''"),
        ("agentsam_model_routing_memory populated",
         "SELECT COUNT(*) as cnt FROM agentsam_model_routing_memory WHERE sample_n > 0"),
        ("agentsam_model_tier covers all workspaces",
         "SELECT COUNT(DISTINCT workspace_id) as cnt FROM agentsam_model_tier WHERE tier_level = 0"),
        ("agentsam_usage_events has recent data",
         f"SELECT COUNT(*) as cnt FROM agentsam_usage_events WHERE created_at >= {since_unix - 3600}"),
        ("agentsam_workflow_runs has no stuck 'running'",
         "SELECT COUNT(*) as cnt FROM agentsam_workflow_runs WHERE status = 'running' AND started_at < unixepoch('now','-1 hour')"),
        ("agentsam_ai all global",
         "SELECT COUNT(*) as cnt FROM agentsam_ai WHERE is_global = 0 AND mode = 'model' AND status = 'active'"),
        ("agentsam_model_catalog active models",
         "SELECT COUNT(*) as cnt FROM agentsam_model_catalog WHERE is_active = 1 AND is_degraded = 0"),
    ]

    for label, sql in checks:
        rows = d1_query(sql)
        val  = rows[0]["cnt"] if rows else "?"
        # Heuristic pass/fail
        if "no new rows" in label or "stuck" in label:
            icon = "✅" if val == 0 else f"⚠️  ({val} stuck)"
        elif "all global" in label:
            icon = "✅" if val == 0 else f"⚠️  ({val} not global — run D1 fix)"
        else:
            icon = "✅" if int(val) > 0 else "❌ ZERO"
        print(f"  {icon}  {label:<50}  → {val}")

    print()

    # ── Summary ───────────────────────────────────────────────────────────────
    elapsed = time.perf_counter() - t_start
    chat_ok = sum(1 for r in results if r.ok)

    print(f"{'═'*70}")
    print(f"  Summary  —  {elapsed:.1f}s")
    print(f"  Chat:    {chat_ok}/{len(results)} prompts succeeded")
    print(f"  Tables:  {pipeline_pass} writing correctly  |  {pipeline_fail} issues")
    print()

    if pipeline_fail > 0:
        print("  Issues to fix:")
        for tbl, a in post_audits.items():
            if not a.exists:
                print(f"    ❌ {tbl} — table missing entirely")
            elif a.schema_issues:
                for issue in a.schema_issues:
                    print(f"    ⚠️  {tbl} — {issue}")
    print()

    # ── Write report ──────────────────────────────────────────────────────────
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    report_path = OUTPUT_DIR / f"pipeline_e2e_{ts}.json"
    report = {
        "run_id":       run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chat_url":     CHAT_URL,
        "prompts":      [asdict(r) for r in results],
        "pre_audit":    {k: asdict(v) for k, v in pre_audits.items()},
        "post_audit":   {k: asdict(v) for k, v in post_audits.items()},
    }
    # sets aren't JSON serialisable
    for d in (report["pre_audit"], report["post_audit"]):
        for v in d.values():
            v["columns"] = sorted(v["columns"])
    report_path.write_text(json.dumps(report, indent=2))
    print(f"  Report: {report_path}\n")


if __name__ == "__main__":
    main()
