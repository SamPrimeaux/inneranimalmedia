#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
ARTIFACT_DIR = ROOT / "artifacts" / "agentsam_audit"

DEFAULT_D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
DEFAULT_WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
DEFAULT_BASE_URL = os.getenv("IAM_BASE_URL", "https://inneranimalmedia.com")

TARGET_TABLES = [
    "agentsam_eval_suites",
    "agentsam_eval_runs",
    "agentsam_eval_cases",
    "ai_api_test_runs",
    "agentsam_hook",
    "agentsam_hook_execution",
    "agentsam_error_log",
    "agentsam_escalation",
    "agentsam_execution_context",
    "agentsam_executions",
    "agentsam_execution_steps",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_prompt_cache_keys",
    "agentsam_prompt_routes",
    "agentsam_prompt_versions",
    "agentsam_tool_chain",
    "agentsam_tool_call_log",
    "agentsam_tool_cache",
    "agentsam_usage_events",
    "agentsam_usage_rollups_daily",
    "agentsam_commands",
    "agentsam_command_run",
    "agentsam_command_pattern",
    "agentsam_capability_aliases",
    "agentsam_tools",
    "agentsam_routing_arms",
    "agentsam_model_catalog",
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
]

CODE_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".py",
    ".sql",
    ".md",
    ".json",
    ".toml",
    ".yml",
    ".yaml",
    ".html",
    ".css",
}

IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".wrangler",
    "dist",
    "build",
    ".next",
    ".turbo",
    "__pycache__",
    ".venv",
    "venv",
    "artifacts",
    "coverage",
    ".cache",
}


def utc_stamp() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def short_sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


def safe_rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def run_cmd(cmd: list[str], timeout: int = 60) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": int((time.time() - started) * 1000),
            "cmd": redact_cmd(cmd),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": f"TIMEOUT after {timeout}s\n{exc.stderr or ''}",
            "duration_ms": int((time.time() - started) * 1000),
            "cmd": redact_cmd(cmd),
        }


def redact_cmd(cmd: list[str]) -> list[str]:
    redacted: list[str] = []
    for part in cmd:
        if "cookie" in part.lower() or "authorization" in part.lower():
            redacted.append("[REDACTED]")
        else:
            redacted.append(part)
    return redacted


def wrangler_available() -> bool:
    return shutil.which("npx") is not None


def wrangler_sql(db: str, config: str, sql: str, timeout: int = 90) -> dict[str, Any]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db,
        "--remote",
        "-c",
        config,
        "--json",
        "--command",
        sql,
    ]
    result = run_cmd(cmd, timeout=timeout)
    parsed = None

    if result["stdout"].strip():
        parsed = parse_wrangler_json(result["stdout"])

    result["json"] = parsed
    result["sql_sha"] = short_sha(sql)
    return result


def parse_wrangler_json(stdout: str) -> Any:
    text = stdout.strip()
    if not text:
        return None

    candidates = [text]

    first_bracket = min(
        [i for i in [text.find("["), text.find("{")] if i >= 0],
        default=-1,
    )
    if first_bracket >= 0:
        candidates.append(text[first_bracket:])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None


def extract_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    data = result.get("json")
    if data is None:
        return []

    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            if "results" in data[0] and isinstance(data[0]["results"], list):
                return [r for r in data[0]["results"] if isinstance(r, dict)]
            return [r for r in data if isinstance(r, dict)]

    if isinstance(data, dict):
        if "results" in data and isinstance(data["results"], list):
            return [r for r in data["results"] if isinstance(r, dict)]
        if "result" in data and isinstance(data["result"], list):
            return [r for r in data["result"] if isinstance(r, dict)]

    return []


def table_exists(table_names: set[str], table: str) -> bool:
    return table in table_names


def qident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def get_table_inventory(db: str, config: str) -> dict[str, Any]:
    sql = """
SELECT
  name,
  type,
  sql
FROM sqlite_master
WHERE type IN ('table', 'index', 'trigger', 'view')
  AND (
    name LIKE 'agentsam_%'
    OR name LIKE 'ai_api_%'
    OR name LIKE 'agent_%'
    OR name LIKE 'terminal_%'
    OR name LIKE 'cms_%'
  )
ORDER BY type, name;
""".strip()
    result = wrangler_sql(db, config, sql)
    rows = extract_rows(result)
    return {"result": result, "rows": rows}


def get_table_columns(db: str, config: str, table: str) -> list[dict[str, Any]]:
    result = wrangler_sql(db, config, f"PRAGMA table_info({qident(table)});")
    return extract_rows(result)


def count_table(db: str, config: str, table: str) -> dict[str, Any]:
    result = wrangler_sql(db, config, f"SELECT COUNT(*) AS row_count FROM {qident(table)};")
    rows = extract_rows(result)
    row_count = rows[0].get("row_count") if rows else None
    return {"table": table, "row_count": row_count, "raw": result}


def profile_table(db: str, config: str, table: str, columns: list[dict[str, Any]]) -> dict[str, Any]:
    col_names = [str(c.get("name")) for c in columns if c.get("name")]
    checks: list[str] = ["COUNT(*) AS row_count"]

    for col in [
        "tenant_id",
        "workspace_id",
        "user_id",
        "session_id",
        "conversation_id",
        "request_id",
        "run_group_id",
        "routing_arm_id",
        "model_key",
        "provider",
        "api_platform",
        "tool_name",
        "status",
        "success",
        "quality_score",
        "latency_ms",
        "duration_ms",
        "plan_id",
        "task_id",
        "created_at",
        "updated_at",
        "completed_at",
        "started_at",
    ]:
        if col in col_names:
            checks.append(f"SUM(CASE WHEN {qident(col)} IS NOT NULL THEN 1 ELSE 0 END) AS {qident('nonnull_' + col)}")

    for time_col in ["created_at", "updated_at", "completed_at", "started_at"]:
        if time_col in col_names:
            checks.append(f"MIN({qident(time_col)}) AS {qident('min_' + time_col)}")
            checks.append(f"MAX({qident(time_col)}) AS {qident('max_' + time_col)}")

    sql = f"SELECT {', '.join(checks)} FROM {qident(table)};"
    result = wrangler_sql(db, config, sql)
    rows = extract_rows(result)
    profile = rows[0] if rows else {}
    return {
        "table": table,
        "columns": col_names,
        "profile": profile,
        "raw_ok": result.get("ok"),
        "raw_error": result.get("stderr") if not result.get("ok") else "",
    }


def sample_table(db: str, config: str, table: str, columns: list[dict[str, Any]], limit: int = 3) -> dict[str, Any]:
    col_names = [str(c.get("name")) for c in columns if c.get("name")]
    preferred = [
        "id",
        "title",
        "name",
        "slug",
        "status",
        "task_type",
        "mode",
        "model_key",
        "provider",
        "tool_name",
        "success",
        "latency_ms",
        "duration_ms",
        "created_at",
        "updated_at",
        "completed_at",
    ]
    selected = [c for c in preferred if c in col_names]
    if not selected:
        selected = col_names[:8]
    if not selected:
        return {"table": table, "rows": []}

    order_col = "created_at" if "created_at" in col_names else "id" if "id" in col_names else selected[0]
    sql = f"""
SELECT {", ".join(qident(c) for c in selected)}
FROM {qident(table)}
ORDER BY {qident(order_col)} DESC
LIMIT {int(limit)};
""".strip()
    result = wrangler_sql(db, config, sql)
    return {"table": table, "rows": extract_rows(result), "ok": result.get("ok"), "stderr": result.get("stderr", "")}


def scan_codebase(table_names: list[str]) -> dict[str, Any]:
    files_scanned = 0
    matches_by_table: dict[str, list[dict[str, Any]]] = {t: [] for t in table_names}
    important_patterns = {
        "hook_dispatch": re.compile(r"emitAgentEvent|dispatchAgentHooks|agentsam_hook|hook_execution", re.I),
        "routing": re.compile(r"routing_arm|routingArm|recordArmOutcome|scheduleRoutingArmQualityUpdate|agentsam_routing", re.I),
        "usage": re.compile(r"usage_events|usage_rollups|token|cost_usd|estimated_cost", re.I),
        "tools": re.compile(r"tool_call|tool_chain|agentsam_tools|approval|allowlist", re.I),
        "evals": re.compile(r"eval_runs|eval_cases|eval_suites|ai_api_test_runs", re.I),
        "prompt": re.compile(r"prompt_routes|prompt_versions|prompt_cache|prompt_runs", re.I),
    }
    pattern_hits: dict[str, list[dict[str, Any]]] = {k: [] for k in important_patterns}

    table_regexes = {t: re.compile(r"\b" + re.escape(t) + r"\b", re.I) for t in table_names}

    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.suffix not in CODE_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 2_000_000:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        files_scanned += 1
        rel = safe_rel(path)
        lines = text.splitlines()

        for table, rx in table_regexes.items():
            if table not in text:
                continue
            for idx, line in enumerate(lines, start=1):
                if rx.search(line):
                    matches_by_table[table].append(
                        {
                            "file": rel,
                            "line": idx,
                            "preview": line.strip()[:220],
                        }
                    )
                    if len(matches_by_table[table]) >= 80:
                        break

        for key, rx in important_patterns.items():
            if not rx.search(text):
                continue
            for idx, line in enumerate(lines, start=1):
                if rx.search(line):
                    pattern_hits[key].append(
                        {
                            "file": rel,
                            "line": idx,
                            "preview": line.strip()[:220],
                        }
                    )
                    if len(pattern_hits[key]) >= 120:
                        break

    table_summary = []
    for table, hits in matches_by_table.items():
        unique_files = sorted({h["file"] for h in hits})
        table_summary.append(
            {
                "table": table,
                "hit_count_capped": len(hits),
                "file_count": len(unique_files),
                "files": unique_files[:20],
                "sample_hits": hits[:10],
            }
        )

    table_summary.sort(key=lambda x: (x["file_count"], x["hit_count_capped"]), reverse=True)

    return {
        "files_scanned": files_scanned,
        "table_reference_summary": table_summary,
        "pattern_hits": pattern_hits,
    }


def auth_cookie_header() -> str | None:
    direct = os.getenv("IAM_AUTH_COOKIE_HEADER", "").strip()
    if direct:
        return direct

    value = os.getenv("IAM_SESSION_COOKIE_VALUE", "").strip()
    if not value:
        return None

    name = os.getenv("IAM_SESSION_COOKIE_NAME", "iam_session").strip() or "iam_session"
    return f"{name}={value}"


def probe_authenticated_routes(base_url: str) -> dict[str, Any]:
    cookie = auth_cookie_header()
    routes = [
        "/dashboard/agent",
        "/api/agent/models?show_in_picker=1",
        "/api/settings/workspace",
    ]

    if not cookie:
        return {
            "enabled": False,
            "reason": "No IAM_AUTH_COOKIE_HEADER or IAM_SESSION_COOKIE_VALUE found in environment.",
            "routes": [],
        }

    results = []
    for route in routes:
        url = base_url.rstrip("/") + route
        req = urllib.request.Request(
            url,
            headers={
                "Cookie": cookie,
                "User-Agent": "AgentSamAudit/1.0",
                "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            },
            method="GET",
        )
        started = time.time()
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read(2048)
                results.append(
                    {
                        "route": route,
                        "status": resp.status,
                        "content_type": resp.headers.get("content-type", ""),
                        "bytes_previewed": len(body),
                        "duration_ms": int((time.time() - started) * 1000),
                        "looks_authenticated": resp.status < 400 and b"login" not in body[:512].lower(),
                    }
                )
        except urllib.error.HTTPError as exc:
            body = exc.read(1024)
            results.append(
                {
                    "route": route,
                    "status": exc.code,
                    "content_type": exc.headers.get("content-type", ""),
                    "bytes_previewed": len(body),
                    "duration_ms": int((time.time() - started) * 1000),
                    "looks_authenticated": False,
                    "error": str(exc),
                }
            )
        except Exception as exc:
            results.append(
                {
                    "route": route,
                    "status": None,
                    "duration_ms": int((time.time() - started) * 1000),
                    "looks_authenticated": False,
                    "error": repr(exc),
                }
            )

    return {
        "enabled": True,
        "cookie_name": os.getenv("IAM_SESSION_COOKIE_NAME", "iam_session"),
        "routes": results,
    }


def git_state() -> dict[str, Any]:
    return {
        "status": run_cmd(["git", "status", "-sb"], timeout=20),
        "head": run_cmd(["git", "log", "--oneline", "--decorate", "-5"], timeout=20),
    }


def derive_findings(
    existing_tables: set[str],
    profiles: list[dict[str, Any]],
    code_scan: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    profile_by_table = {p["table"]: p for p in profiles}

    for table in TARGET_TABLES:
        if table not in existing_tables:
            findings.append(
                {
                    "severity": "missing_or_d1_name_mismatch",
                    "table": table,
                    "finding": "Target table was not found in this D1 schema inventory.",
                    "recommendation": "Verify whether this table exists under a different D1 name, was only created in Supabase, or still needs migration.",
                }
            )

    for table, prof in profile_by_table.items():
        row_count = prof.get("profile", {}).get("row_count")
        code_ref = next(
            (x for x in code_scan["table_reference_summary"] if x["table"] == table),
            {"file_count": 0, "hit_count_capped": 0},
        )
        file_count = code_ref.get("file_count", 0)

        if row_count == 0 and file_count > 0:
            findings.append(
                {
                    "severity": "wired_but_empty",
                    "table": table,
                    "finding": f"Code references exist in {file_count} file(s), but table has 0 rows.",
                    "recommendation": "Likely schema is present but runtime writes are missing, blocked, or pointed at another table.",
                }
            )

        if row_count and row_count > 0 and file_count == 0:
            findings.append(
                {
                    "severity": "populated_but_not_referenced",
                    "table": table,
                    "finding": f"Table has {row_count} row(s), but no direct code references were found.",
                    "recommendation": "High risk of manual/seeded data not being used by Agent Sam runtime.",
                }
            )

        for key_col in ["tenant_id", "workspace_id", "run_group_id", "routing_arm_id", "plan_id", "task_id"]:
            metric = f"nonnull_{key_col}"
            if metric in prof.get("profile", {}):
                nonnull = prof["profile"].get(metric) or 0
                if row_count and row_count > 0 and nonnull == 0:
                    findings.append(
                        {
                            "severity": "missing_linkage",
                            "table": table,
                            "finding": f"{key_col} is always NULL across {row_count} row(s).",
                            "recommendation": f"Pass {key_col} through the runtime context when writing this table.",
                        }
                    )

    routing_hits = len(code_scan["pattern_hits"].get("routing", []))
    hook_hits = len(code_scan["pattern_hits"].get("hook_dispatch", []))
    if routing_hits > 0 and hook_hits == 0:
        findings.append(
            {
                "severity": "architecture_gap",
                "table": "agentsam_hook / agentsam_hook_execution",
                "finding": "Routing code patterns exist, but hook dispatcher patterns were not found.",
                "recommendation": "Add a small emitAgentEvent/dispatchAgentHooks spine before adding more one-off table writes.",
            }
        )

    return findings


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=False, default=str), encoding="utf-8")


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    lines: list[str] = []
    lines.append("# Agent Sam D1 + Codebase Audit")
    lines.append("")
    lines.append(f"- Generated: `{report['generated_at']}`")
    lines.append(f"- Repo: `{ROOT}`")
    lines.append(f"- D1 DB: `{report['d1']['db']}`")
    lines.append(f"- Wrangler config: `{report['d1']['config']}`")
    lines.append("")

    lines.append("## Executive findings")
    lines.append("")
    findings = report["findings"]
    if not findings:
        lines.append("No high-confidence findings were generated.")
    else:
        for f in findings[:40]:
            lines.append(f"- **{f['severity']}** — `{f['table']}`: {f['finding']}  ")
            lines.append(f"  - Recommendation: {f['recommendation']}")
    lines.append("")

    lines.append("## Target table coverage")
    lines.append("")
    lines.append("| Table | Exists | Rows | Code files | Last created/updated |")
    lines.append("|---|---:|---:|---:|---|")

    profile_by_table = {p["table"]: p for p in report["d1"]["profiles"]}
    code_by_table = {
        x["table"]: x for x in report["codebase"]["table_reference_summary"]
    }
    existing = set(report["d1"]["existing_tables"])

    for table in TARGET_TABLES:
        prof = profile_by_table.get(table, {})
        metrics = prof.get("profile", {})
        row_count = metrics.get("row_count", "")
        code_files = code_by_table.get(table, {}).get("file_count", 0)
        last_seen = (
            metrics.get("max_updated_at")
            or metrics.get("max_created_at")
            or metrics.get("max_completed_at")
            or metrics.get("max_started_at")
            or ""
        )
        lines.append(
            f"| `{table}` | {'yes' if table in existing else 'no'} | {row_count} | {code_files} | `{last_seen}` |"
        )
    lines.append("")

    lines.append("## D1 profile details")
    lines.append("")
    for prof in sorted(report["d1"]["profiles"], key=lambda p: p["table"]):
        lines.append(f"### `{prof['table']}`")
        lines.append("")
        metrics = prof.get("profile", {})
        if not metrics:
            lines.append("- No metrics returned.")
            lines.append("")
            continue
        for key, value in metrics.items():
            lines.append(f"- `{key}`: `{value}`")
        lines.append("")

    lines.append("## Codebase pattern hits")
    lines.append("")
    for key, hits in report["codebase"]["pattern_hits"].items():
        lines.append(f"### `{key}`")
        lines.append("")
        if not hits:
            lines.append("- No hits.")
        else:
            for h in hits[:20]:
                lines.append(f"- `{h['file']}:{h['line']}` — `{h['preview']}`")
        lines.append("")

    lines.append("## Auth route probe")
    lines.append("")
    auth = report["auth_probe"]
    lines.append(f"- Enabled: `{auth.get('enabled')}`")
    if auth.get("reason"):
        lines.append(f"- Reason: {auth['reason']}")
    for r in auth.get("routes", []):
        lines.append(
            f"- `{r.get('route')}` → status `{r.get('status')}`, authenticated-ish `{r.get('looks_authenticated')}`, `{r.get('duration_ms')}` ms"
        )
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Agent Sam D1 tables and repo code references.")
    parser.add_argument("--db", default=DEFAULT_D1_DB)
    parser.add_argument("--config", default=DEFAULT_WRANGLER_CONFIG)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--skip-d1", action="store_true")
    parser.add_argument("--skip-auth-probe", action="store_true")
    args = parser.parse_args()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = utc_stamp()

    if not ROOT.joinpath("package.json").exists() and not ROOT.joinpath("wrangler.toml").exists() and not ROOT.joinpath(args.config).exists():
        print("WARN: This does not look like the repo root. Run from /Users/samprimeaux/inneranimalmedia.", file=sys.stderr)

    report: dict[str, Any] = {
        "generated_at": stamp,
        "root": str(ROOT),
        "d1": {
            "db": args.db,
            "config": args.config,
            "existing_tables": [],
            "inventory": [],
            "profiles": [],
            "samples": [],
            "errors": [],
        },
        "codebase": {},
        "auth_probe": {},
        "git": {},
        "findings": [],
    }

    print("1/5 Capturing git state...")
    report["git"] = git_state()

    existing_tables: set[str] = set()
    profiles: list[dict[str, Any]] = []

    if args.skip_d1:
        print("2/5 Skipping D1 audit by request.")
    else:
        print("2/5 Auditing D1 table inventory...")
        if not wrangler_available():
            print("ERROR: npx not found. Install/use Node tooling or run with --skip-d1.", file=sys.stderr)
            return 2

        inventory = get_table_inventory(args.db, args.config)
        if not inventory["result"].get("ok"):
            report["d1"]["errors"].append(
                {
                    "stage": "inventory",
                    "stderr": inventory["result"].get("stderr"),
                    "stdout": inventory["result"].get("stdout"),
                }
            )
        rows = inventory["rows"]
        report["d1"]["inventory"] = rows
        existing_tables = {r["name"] for r in rows if r.get("type") == "table" and r.get("name")}
        report["d1"]["existing_tables"] = sorted(existing_tables)

        print(f"    Found {len(existing_tables)} relevant D1 tables.")

        tables_to_profile = sorted(existing_tables.union(set(TARGET_TABLES)))
        for idx, table in enumerate(tables_to_profile, start=1):
            if table not in existing_tables:
                continue
            print(f"    Profiling {idx}/{len(tables_to_profile)}: {table}")
            columns = get_table_columns(args.db, args.config, table)
            prof = profile_table(args.db, args.config, table, columns)
            sample = sample_table(args.db, args.config, table, columns)
            profiles.append(prof)
            report["d1"]["profiles"].append(prof)
            report["d1"]["samples"].append(sample)

    print("3/5 Scanning codebase references...")
    table_names_for_scan = sorted(set(TARGET_TABLES).union(existing_tables))
    report["codebase"] = scan_codebase(table_names_for_scan)

    print("4/5 Probing authenticated dashboard/API routes...")
    if args.skip_auth_probe:
        report["auth_probe"] = {"enabled": False, "reason": "Skipped by --skip-auth-probe", "routes": []}
    else:
        report["auth_probe"] = probe_authenticated_routes(args.base_url)

    print("5/5 Deriving findings and writing artifacts...")
    report["findings"] = derive_findings(existing_tables, profiles, report["codebase"])

    json_path = ARTIFACT_DIR / f"agentsam_d1_codebase_audit_{stamp}.json"
    md_path = ARTIFACT_DIR / f"agentsam_d1_codebase_audit_{stamp}.md"
    latest_json = ARTIFACT_DIR / "latest_agentsam_d1_codebase_audit.json"
    latest_md = ARTIFACT_DIR / "latest_agentsam_d1_codebase_audit.md"

    write_json(json_path, report)
    write_json(latest_json, report)
    write_markdown(md_path, report)
    write_markdown(latest_md, report)

    print("")
    print("PASS: Agent Sam audit complete.")
    print(f"Markdown report: {safe_rel(md_path)}")
    print(f"JSON report:     {safe_rel(json_path)}")
    print(f"Latest MD:       {safe_rel(latest_md)}")
    print(f"Latest JSON:     {safe_rel(latest_json)}")
    print("")
    print("Top findings:")
    for f in report["findings"][:12]:
        print(f"- [{f['severity']}] {f['table']}: {f['finding']}")

    if not report["findings"]:
        print("- No high-confidence findings generated.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())