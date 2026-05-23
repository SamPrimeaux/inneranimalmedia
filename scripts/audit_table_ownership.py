#!/usr/bin/env python3
"""
audit_table_ownership.py
-------------------------
1. Reads all agentsam_* tables from D1 (via Cloudflare API)
2. Reads all tables from Supabase (via REST API)
3. Calls GPT-5.4-mini to analyze schemas and propose concept ownership
4. Outputs:
     artifacts/table_ownership/TABLE_OWNERSHIP.md   ← human readable
     artifacts/table_ownership/CURSORRULES.md        ← paste into .cursorrules
     artifacts/table_ownership/ownership.json        ← machine readable

Usage:
    python3 scripts/audit_table_ownership.py
    python3 scripts/audit_table_ownership.py --no-ai   # schema map only
    python3 scripts/audit_table_ownership.py --out artifacts/table_ownership/
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.parse
from dataclasses import dataclass, field, asdict
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Config — loaded from .env.cloudflare
# ---------------------------------------------------------------------------

DEFAULT_ROOT    = Path("/Users/samprimeaux/inneranimalmedia")
DEFAULT_OUT     = Path("artifacts/table_ownership")
D1_DATABASE_ID  = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
CF_ACCOUNT_ID   = "ede6590ac0d2fb7daf155b35653457b2"
SUPABASE_URL    = "https://dpmuvynqixblxsilnlut.supabase.co"
OPENAI_MODEL    = "gpt-5.4-mini-2026-03-17"

# ---------------------------------------------------------------------------
# Env loader
# ---------------------------------------------------------------------------

def load_env(root: Path) -> dict[str, str]:
    """Load .env.cloudflare from repo root."""
    env: dict[str, str] = {}
    env_file = root / ".env.cloudflare"
    if not env_file.exists():
        print(f"Warning: {env_file} not found — set CLOUDFLARE_API_TOKEN, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY manually", file=sys.stderr)
        return env
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


# ---------------------------------------------------------------------------
# D1 schema reader
# ---------------------------------------------------------------------------

def d1_query(sql: str, cf_token: str) -> list[dict]:
    """Run a SQL query against D1 via Cloudflare REST API."""
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
        f"/d1/database/{D1_DATABASE_ID}/query"
    )
    payload = json.dumps({"sql": sql, "params": []}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {cf_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            if not data.get("success"):
                print(f"D1 error: {data.get('errors')}", file=sys.stderr)
                return []
            results = data.get("result", [])
            if results and isinstance(results, list):
                return results[0].get("results", [])
            return []
    except Exception as e:
        print(f"D1 request failed: {e}", file=sys.stderr)
        return []


def get_d1_tables(cf_token: str) -> list[str]:
    rows = d1_query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
        cf_token,
    )
    return [r["name"] for r in rows]


def get_d1_columns(table: str, cf_token: str) -> list[dict]:
    rows = d1_query(f"SELECT name, type, [notnull], dflt_value, pk FROM pragma_table_info('{table}');", cf_token)
    return rows


# ---------------------------------------------------------------------------
# Supabase schema reader
# ---------------------------------------------------------------------------

def supabase_get(path: str, sb_token: str) -> list[dict] | dict:
    url = f"{SUPABASE_URL}{path}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": sb_token,
            "Authorization": f"Bearer {sb_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"Supabase request failed ({path}): {e}", file=sys.stderr)
        return []


def get_supabase_tables(sb_token: str) -> list[str]:
    data = supabase_get(
        "/rest/v1/rpc/get_table_list"
        if False  # use information_schema instead
        else "/rest/v1/?",
        sb_token,
    )
    # Use information_schema via Supabase REST (requires service role)
    # Fall back to known table list from our earlier discovery
    url = f"{SUPABASE_URL}/rest/v1/rpc/version"
    # Use pg meta API instead
    url = f"{SUPABASE_URL}/pg/tables?limit=100&schema=public"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": sb_token,
            "Authorization": f"Bearer {sb_token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read())
            if isinstance(rows, list):
                return [r.get("name", "") for r in rows if r.get("schema") == "public"]
    except Exception:
        pass

    # Fallback: query information_schema via Supabase SQL endpoint
    return get_supabase_tables_via_sql(sb_token)


def get_supabase_tables_via_sql(sb_token: str) -> list[str]:
    """Use Supabase SQL endpoint (requires service role key)."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    # Supabase doesn't expose raw SQL via REST — use their query endpoint
    # Actually we'll use the pg meta API
    url = f"{SUPABASE_URL}/pg/tables?schema=public&limit=200"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": sb_token,
            "Authorization": f"Bearer {sb_token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read())
            if isinstance(rows, list):
                return [r.get("name", "") for r in rows if r.get("name")]
    except Exception as e:
        print(f"Supabase table list failed: {e}", file=sys.stderr)

    # Hard fallback from our known tables
    return [
        "agent_context_snapshots", "agent_decisions", "agent_memory", "agent_sessions",
        "agentsam_debug_snapshots", "agentsam_error_events", "agentsam_eval_runs",
        "agentsam_eval_suites", "agentsam_model_cost_snapshots", "agentsam_plan_tasks",
        "agentsam_plans", "agentsam_prompt_runs", "agentsam_recent_errors",
        "agentsam_recent_routing_decisions", "agentsam_recent_tool_failures",
        "agentsam_routing_arms", "agentsam_routing_decisions", "agentsam_stream_events",
        "agentsam_stream_run_summary", "agentsam_todo", "agentsam_tool_call_events",
        "agentsam_workflow_events", "agentsam_workflow_runs", "agentsam_workflow_steps",
        "agentsam_workflows", "build_deploy_events", "codebase_chunks", "codebase_files",
        "codebase_snapshots", "codebase_symbols", "conversation_members", "conversations",
        "cost_forecasts", "d1_databases", "documents", "identity_profiles",
        "knowledge_edges", "message_thread_summaries", "messages",
        "model_performance_snapshots", "provider_budget_status", "semantic_search_log",
        "session_summaries", "supabase_retention_policies", "tenant_context",
        "tenant_memberships", "tenants", "workspaces", "workspace_memberships",
    ]


def get_supabase_columns(table: str, sb_token: str) -> list[dict]:
    """Get column info for a Supabase table."""
    url = f"{SUPABASE_URL}/pg/columns?table_id=&table_name={urllib.parse.quote(table)}&schema=public&limit=100"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": sb_token,
            "Authorization": f"Bearer {sb_token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            cols = json.loads(resp.read())
            if isinstance(cols, list):
                return [{"name": c.get("name"), "type": c.get("format", c.get("data_type", ""))} for c in cols]
    except Exception:
        pass
    return []


# ---------------------------------------------------------------------------
# Schema builder
# ---------------------------------------------------------------------------

@dataclass
class TableSchema:
    name: str
    source: str          # d1 | supabase
    columns: list[dict] = field(default_factory=list)
    row_count: int = 0
    concept_guess: str = ""


def guess_concept(name: str, columns: list[dict]) -> str:
    """Quick heuristic concept grouping before AI analysis."""
    col_names = {c.get("name", "").lower() for c in columns}
    n = name.lower()

    if any(k in n for k in ["workflow_run", "workflow_step", "workflow_event"]):
        return "workflow_execution"
    if "workflow" in n:
        return "workflow_definition"
    if "agent_run" in n or "agent_session" in n:
        return "agent_execution"
    if any(k in n for k in ["tool_call", "tool_stat", "mcp_tool"]):
        return "tool_execution"
    if any(k in n for k in ["mcp_server", "mcp_allowlist", "mcp_workflow"]):
        return "mcp_config"
    if any(k in n for k in ["routing_arm", "routing_decision", "model_tier"]):
        return "ai_routing"
    if any(k in n for k in ["usage_event", "usage_rollup", "cost_forecast", "model_cost"]):
        return "cost_telemetry"
    if any(k in n for k in ["plan_task", "plan", "todo"]):
        return "planning"
    if any(k in n for k in ["error_log", "error_event", "escalation"]):
        return "error_tracking"
    if any(k in n for k in ["deploy", "deployment", "build_deploy"]):
        return "deployment"
    if any(k in n for k in ["codebase", "code_index"]):
        return "codebase_index"
    if any(k in n for k in ["document", "knowledge", "semantic", "rag", "memory"]):
        return "rag_knowledge"
    if any(k in n for k in ["artifact", "skill"]):
        return "artifacts_skills"
    if any(k in n for k in ["auth", "session", "identity", "user_policy", "user_id"]):
        return "auth_identity"
    if any(k in n for k in ["tenant", "workspace", "membership"]):
        return "multi_tenancy"
    if any(k in n for k in ["eval_run", "eval_suite"]):
        return "eval_quality"
    if any(k in n for k in ["webhook", "hook", "cron"]):
        return "events_automation"
    if any(k in n for k in ["health", "bootstrap", "analytics"]):
        return "platform_health"
    if any(k in n for k in ["approval", "command", "allowlist"]):
        return "safety_governance"
    if "prompt" in n:
        return "prompt_management"
    if "conversation" in n or "message" in n:
        return "conversations"
    if any(k in n for k in ["stream", "compaction", "guardrail"]):
        return "streaming_runtime"
    return "other"


# ---------------------------------------------------------------------------
# OpenAI call
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a senior platform architect analyzing a Cloudflare Workers + D1 + Supabase 
platform called "Agent Sam" — an AI agent orchestration dashboard.

You will receive a JSON list of all database tables with their columns and a heuristic concept grouping.

Your job: produce a definitive TABLE OWNERSHIP MAP for .cursorrules.

The output must have these sections:

## CONCEPT → TABLE OWNERSHIP

For each concept, list:
- Concept name (the authoritative "thing" this concept represents)
- Source of truth table (D1 or Supabase, which one owns it)
- Primary table name
- Supporting tables (read from but not the write authority)
- What MUST NOT happen (common mistakes Cursor makes)

## CURSOR RULES (ready to paste into .cursorrules)

Write direct, imperative rules like:
  "Agent execution state → agentsam_agent_run (D1). NEVER store agent run state in mcp.js local variables."
  "Tool call logs → scheduleToolCallLog() in src/core/agentsam-ops-ledger.js. NEVER write hardcoded INSERT INTO agentsam_tool_call_log."
  "Workflow timeouts → maxAgentsamWorkflowTimeoutSeconds() from DB. NEVER use const fallback = 300 or other hardcoded timeout values."

## STALE/DUPLICATE TABLE WARNINGS

Flag any tables that appear to be duplicates or shadow tables that should be consolidated.

## MISSING TABLES

Based on the concepts you see, flag any concepts that DON'T have a clear owner table 
(where Cursor might be tempted to reinvent one).

Be direct and decisive. This will be read by an AI coding assistant on every session.
Write rules Cursor cannot misinterpret. Short, imperative sentences."""


def call_openai(schema_map: list[dict], api_key: str) -> str:
    payload = {
        "model": OPENAI_MODEL,
        "max_tokens": 4000,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(schema_map, indent=2)[:50000]},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"OpenAI call failed: {e}\n\nReview ownership.json manually."


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def write_table_ownership_md(out: Path, schemas: list[TableSchema]) -> None:
    by_concept: dict[str, list[TableSchema]] = {}
    for s in schemas:
        by_concept.setdefault(s.concept_guess, []).append(s)

    lines = [
        "# Table Ownership Map",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"Total tables: {len(schemas)} ({sum(1 for s in schemas if s.source == 'd1')} D1, {sum(1 for s in schemas if s.source == 'supabase')} Supabase)",
        "",
        "| Concept | Table | Source | Columns | Rows |",
        "|---------|-------|--------|---------|------|",
    ]
    for concept in sorted(by_concept.keys()):
        for s in sorted(by_concept[concept], key=lambda x: x.name):
            col_preview = ", ".join(c.get("name", "") for c in s.columns[:5])
            if len(s.columns) > 5:
                col_preview += f" +{len(s.columns)-5}"
            lines.append(
                f"| {concept} | `{s.name}` | {s.source.upper()} "
                f"| {col_preview} | {s.row_count or '?'} |"
            )

    (out / "TABLE_OWNERSHIP.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"TABLE_OWNERSHIP.md written", file=sys.stderr)


def write_cursorrules_md(out: Path, ai_output: str) -> None:
    lines = [
        "# AI-Generated Table Ownership Rules",
        "# Paste the CURSOR RULES section into .cursorrules",
        "",
        ai_output,
    ]
    (out / "CURSORRULES.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"CURSORRULES.md written", file=sys.stderr)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root",  default=str(DEFAULT_ROOT))
    parser.add_argument("--out",   default=str(DEFAULT_OUT))
    parser.add_argument("--no-ai", action="store_true")
    parser.add_argument("--api-key", default="")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    out  = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)

    # Load credentials
    env = load_env(root)
    cf_token = env.get("CLOUDFLARE_API_TOKEN", os.environ.get("CLOUDFLARE_API_TOKEN", ""))
    sb_token = env.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    api_key  = args.api_key or env.get("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY", ""))

    schemas: list[TableSchema] = []

    # ── D1 tables ──────────────────────────────────────────────────────────
    if cf_token:
        print("Fetching D1 tables...", file=sys.stderr)
        d1_tables = get_d1_tables(cf_token)
        print(f"  Found {len(d1_tables)} D1 tables", file=sys.stderr)
        for tbl in d1_tables:
            cols = get_d1_columns(tbl, cf_token)
            schema = TableSchema(
                name=tbl,
                source="d1",
                columns=cols,
                concept_guess=guess_concept(tbl, cols),
            )
            schemas.append(schema)
            print(f"  D1: {tbl} ({len(cols)} cols)", file=sys.stderr)
    else:
        print("No CLOUDFLARE_API_TOKEN — skipping D1", file=sys.stderr)

    # ── Supabase tables ─────────────────────────────────────────────────────
    if sb_token:
        print("Fetching Supabase tables...", file=sys.stderr)
        sb_tables = get_supabase_tables(sb_token)
        # Exclude tables already in D1 (by name overlap where mirrored)
        d1_names = {s.name for s in schemas}
        for tbl in sb_tables:
            if not tbl:
                continue
            cols = get_supabase_columns(tbl, sb_token)
            schema = TableSchema(
                name=tbl,
                source="supabase",
                columns=cols,
                concept_guess=guess_concept(tbl, cols),
            )
            # Flag mirrors
            if tbl in d1_names:
                schema.concept_guess = "MIRROR_" + schema.concept_guess
            schemas.append(schema)
            print(f"  Supabase: {tbl} ({len(cols)} cols)", file=sys.stderr)
    else:
        print("No SUPABASE_SERVICE_ROLE_KEY — skipping Supabase", file=sys.stderr)

    print(f"\nTotal: {len(schemas)} tables mapped", file=sys.stderr)

    # ── Write raw table map ─────────────────────────────────────────────────
    write_table_ownership_md(out, schemas)

    schema_map = [
        {
            "table": s.name,
            "source": s.source,
            "concept_heuristic": s.concept_guess,
            "columns": [c.get("name") for c in s.columns],
            "column_count": len(s.columns),
        }
        for s in schemas
    ]

    (out / "ownership.json").write_text(
        json.dumps(schema_map, indent=2), encoding="utf-8"
    )

    # ── OpenAI analysis ─────────────────────────────────────────────────────
    if args.no_ai:
        print("\n--no-ai set. Review TABLE_OWNERSHIP.md and ownership.json.", file=sys.stderr)
        cursorrules_content = "# Run without --no-ai to generate AI ownership rules.\n"
    elif not api_key:
        print("No OPENAI_API_KEY — skipping AI analysis.", file=sys.stderr)
        cursorrules_content = "# Set OPENAI_API_KEY to generate AI ownership rules.\n"
    else:
        print(f"Calling {OPENAI_MODEL} for concept ownership analysis...", file=sys.stderr)
        cursorrules_content = call_openai(schema_map, api_key)
        print("Analysis complete.", file=sys.stderr)

    write_cursorrules_md(out, cursorrules_content)

    # ── Summary ─────────────────────────────────────────────────────────────
    concept_counts: dict[str, int] = {}
    for s in schemas:
        concept_counts[s.concept_guess] = concept_counts.get(s.concept_guess, 0) + 1

    print(f"""
Done → {out}/

  TABLE_OWNERSHIP.md  — full table → concept map
  CURSORRULES.md      — paste into .cursorrules
  ownership.json      — machine readable

Concepts found ({len(concept_counts)}):""", file=sys.stderr)

    for concept, count in sorted(concept_counts.items()):
        print(f"  {concept}: {count} tables", file=sys.stderr)

    print(f"""
Next:
  1. Review CURSORRULES.md
  2. Edit/approve the rules
  3. Paste into .cursorrules at repo root
  4. Commit — Cursor reads this on every session
""", file=sys.stderr)


if __name__ == "__main__":
    main()
