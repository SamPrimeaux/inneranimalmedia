#!/usr/bin/env python3
"""
audit_command_pipeline_alignment.py

Targeted Agent Sam command pipeline audit.

No broad agentsam_* table walk.
Focuses only on:
- agentsam_commands
- agentsam_command_run
- agentsam_command_pattern
- agentsam_command_allowlist
- agentsam_approval_queue

Outputs:
- artifacts/command_pipeline_alignment/LATEST_COMMAND_PIPELINE_ALIGNMENT.md
- artifacts/command_pipeline_alignment/LATEST_COMMAND_PIPELINE_ALIGNMENT.json

Purpose:
Identify whether agentsam_command_run is being polluted by plain chat,
where code inserts into command tables,
and what minimal alignment work is needed.
"""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
OUT_DIR = Path("artifacts/command_pipeline_alignment")

TABLES = [
    "agentsam_commands",
    "agentsam_command_run",
    "agentsam_command_pattern",
    "agentsam_command_allowlist",
    "agentsam_approval_queue",
]

SEARCH_PATTERNS = [
    "INSERT INTO agentsam_command_run",
    "UPDATE agentsam_command_run",
    "agentsam_command_run",
    "INSERT INTO agentsam_commands",
    "UPDATE agentsam_commands",
    "agentsam_commands",
    "INSERT INTO agentsam_command_pattern",
    "agentsam_command_pattern",
    "INSERT INTO agentsam_command_allowlist",
    "agentsam_command_allowlist",
    "INSERT INTO agentsam_approval_queue",
    "UPDATE agentsam_approval_queue",
    "agentsam_approval_queue",
    "execute-approved-tool",
    "plan-task/resume",
    "proposals/",
]

SEARCH_DIRS = ["src", "dashboard", "scripts", "migrations", "docs"]


def run_cmd(cmd: List[str], timeout: int = 180) -> Tuple[int, str, str]:
    p = subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    return p.returncode, p.stdout, p.stderr


def strip_json(stdout: str) -> str:
    s = stdout.strip()
    if not s:
        return s
    if s.startswith("[") or s.startswith("{"):
        return s
    starts = [x for x in [s.find("["), s.find("{")] if x >= 0]
    if not starts:
        return s
    return s[min(starts):].strip()


def d1_query(sql: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    cmd = ["npx", "wrangler", "d1", "execute", db]
    if remote:
        cmd.append("--remote")
    if config:
        cmd += ["-c", config]
    cmd += ["--json", "--command", sql]

    rc, out, err = run_cmd(cmd)
    if rc != 0:
        return [{"__error__": f"SQL failed: {sql}", "stderr": err, "stdout": out}]

    try:
        payload = json.loads(strip_json(out))
    except Exception as e:
        return [{"__error__": f"JSON parse failed: {e}", "stdout": out[:4000]}]

    if isinstance(payload, list) and payload and isinstance(payload[0], dict) and "results" in payload[0]:
        return payload[0].get("results") or []
    if isinstance(payload, dict) and "results" in payload:
        return payload.get("results") or []
    if isinstance(payload, list):
        return payload
    return []


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def schema_for(table: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    return d1_query(f"PRAGMA table_info({qident(table)});", db, config, remote)


def count_for(table: str, db: str, config: str, remote: bool) -> int | None:
    rows = d1_query(f"SELECT COUNT(*) AS n FROM {qident(table)};", db, config, remote)
    if rows and "__error__" not in rows[0]:
        return int(rows[0].get("n", 0))
    return None


def rg(pattern: str) -> str:
    dirs = [d for d in SEARCH_DIRS if Path(d).exists()]
    if not dirs:
        return ""
    rc, out, err = run_cmd(["rg", "-n", pattern, *dirs], timeout=60)
    if rc not in (0, 1):
        return f"[rg failed] {err}"
    return out.strip()


def grep_context(pattern: str, limit: int = 30) -> List[Dict[str, str]]:
    dirs = [Path(d) for d in SEARCH_DIRS if Path(d).exists()]
    hits = []

    for root in dirs:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {
                ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".py",
                ".sql", ".md", ".json", ".toml"
            }:
                continue
            try:
                text = path.read_text(errors="ignore")
            except Exception:
                continue
            if pattern not in text:
                continue

            lines = text.splitlines()
            for i, line in enumerate(lines):
                if pattern in line:
                    start = max(0, i - 8)
                    end = min(len(lines), i + 18)
                    snippet = "\n".join(f"{n+1}: {lines[n]}" for n in range(start, end))
                    hits.append({
                        "file": str(path),
                        "line": str(i + 1),
                        "snippet": snippet,
                    })
                    if len(hits) >= limit:
                        return hits
    return hits


def md_table(rows: List[List[Any]], headers: List[str]) -> str:
    out = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        safe = [str(x).replace("|", "\\|").replace("\n", " ") for x in row]
        out.append("| " + " | ".join(safe) + " |")
    return "\n".join(out)


def truncate(s: str, n: int = 9000) -> str:
    if not s:
        return "_No matches._"
    if len(s) <= n:
        return s
    return s[:n] + f"\n\n...[truncated {len(s)-n} chars]"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--local", action="store_true")
    args = ap.parse_args()

    remote = not args.local
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    schemas = {}
    counts = {}

    for t in TABLES:
        schemas[t] = schema_for(t, args.db, args.config, remote)
        counts[t] = count_for(t, args.db, args.config, remote)

    # Targeted live diagnostics only.
    diagnostics = {}

    diagnostics["command_run_pollution_summary"] = d1_query("""
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN commands_json IS NULL OR commands_json = '[]' THEN 1 ELSE 0 END) AS empty_commands_json,
        SUM(CASE WHEN selected_command_id IS NULL AND selected_command_slug IS NULL THEN 1 ELSE 0 END) AS no_selected_command,
        SUM(CASE WHEN intent_category IS NULL OR intent_category = 'misc' THEN 1 ELSE 0 END) AS null_or_misc_intent,
        SUM(CASE WHEN approval_status = 'not_required' THEN 1 ELSE 0 END) AS not_required_approval,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS success_zero
      FROM agentsam_command_run;
    """, args.db, args.config, remote)

    diagnostics["recent_command_run_rows"] = d1_query("""
      SELECT
        id,
        substr(user_input, 1, 140) AS user_input_preview,
        intent_category,
        commands_json,
        selected_command_id,
        selected_command_slug,
        risk_level,
        requires_confirmation,
        approval_status,
        success,
        exit_code,
        created_at
      FROM agentsam_command_run
      ORDER BY created_at DESC
      LIMIT 25;
    """, args.db, args.config, remote)

    diagnostics["commands_registry_summary"] = d1_query("""
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN slug IS NULL OR slug = '' THEN 1 ELSE 0 END) AS missing_slug,
        SUM(CASE WHEN tool_key IS NULL OR tool_key = '' THEN 1 ELSE 0 END) AS missing_tool_key,
        SUM(CASE WHEN route_key IS NULL OR route_key = '' THEN 1 ELSE 0 END) AS missing_route_key,
        SUM(CASE WHEN requires_approval = 1 OR requires_confirmation = 1 THEN 1 ELSE 0 END) AS approval_required
      FROM agentsam_commands;
    """, args.db, args.config, remote)

    diagnostics["approval_queue_summary"] = d1_query("""
      SELECT
        status,
        approval_type,
        risk_level,
        COUNT(*) AS n
      FROM agentsam_approval_queue
      GROUP BY status, approval_type, risk_level
      ORDER BY n DESC;
    """, args.db, args.config, remote)

    diagnostics["recent_approval_queue"] = d1_query("""
      SELECT
        id,
        status,
        approval_type,
        risk_level,
        tool_name,
        tool_key,
        command_run_id,
        workflow_run_id,
        execution_step_id,
        substr(action_summary, 1, 140) AS action_summary,
        created_at
      FROM agentsam_approval_queue
      ORDER BY created_at DESC
      LIMIT 25;
    """, args.db, args.config, remote)

    diagnostics["pattern_summary"] = d1_query("""
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN requires_confirmation = 1 THEN 1 ELSE 0 END) AS requires_confirmation,
        SUM(use_count) AS total_use_count
      FROM agentsam_command_pattern;
    """, args.db, args.config, remote)

    diagnostics["allowlist_summary"] = d1_query("""
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT user_id) AS users,
        COUNT(DISTINCT workspace_id) AS workspaces,
        COUNT(DISTINCT command) AS unique_commands
      FROM agentsam_command_allowlist;
    """, args.db, args.config, remote)

    searches = {pat: rg(pat) for pat in SEARCH_PATTERNS}

    insert_contexts = {
        "INSERT INTO agentsam_command_run": grep_context("INSERT INTO agentsam_command_run"),
        "INSERT INTO agentsam_approval_queue": grep_context("INSERT INTO agentsam_approval_queue"),
    }

    report = {
        "generated_at": now,
        "db": args.db,
        "config": args.config,
        "remote": remote,
        "tables": TABLES,
        "counts": counts,
        "schemas": schemas,
        "diagnostics": diagnostics,
        "searches": searches,
        "insert_contexts": insert_contexts,
    }

    json_path = OUT_DIR / "LATEST_COMMAND_PIPELINE_ALIGNMENT.json"
    md_path = OUT_DIR / "LATEST_COMMAND_PIPELINE_ALIGNMENT.md"

    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    lines = []
    lines.append("# Agent Sam Command Pipeline Alignment Audit")
    lines.append("")
    lines.append(f"Generated: `{now}`")
    lines.append(f"DB: `{args.db}` remote=`{remote}`")
    lines.append("")
    lines.append("## Doctrine")
    lines.append("")
    lines.append("```text")
    lines.append("agentsam_commands = canonical command registry")
    lines.append("agentsam_command_pattern = matcher/alias layer")
    lines.append("agentsam_command_allowlist = permission layer")
    lines.append("agentsam_command_run = actual command/tool/terminal proposal or execution ledger")
    lines.append("agentsam_approval_queue = human approval gate")
    lines.append("")
    lines.append("Plain chat must not create agentsam_command_run rows.")
    lines.append("```")
    lines.append("")
    lines.append("## Table Counts")
    lines.append("")
    lines.append(md_table([[t, counts.get(t)] for t in TABLES], ["Table", "Rows"]))
    lines.append("")

    lines.append("## Command Run Pollution Summary")
    lines.append("")
    rows = diagnostics["command_run_pollution_summary"]
    if rows:
        lines.append(md_table([list(rows[0].values())], list(rows[0].keys())))
    lines.append("")

    lines.append("## Recent Command Run Rows")
    lines.append("")
    rows = diagnostics["recent_command_run_rows"]
    if rows:
        lines.append(md_table([list(r.values()) for r in rows], list(rows[0].keys())))
    lines.append("")

    lines.append("## Commands Registry Summary")
    lines.append("")
    rows = diagnostics["commands_registry_summary"]
    if rows:
        lines.append(md_table([list(rows[0].values())], list(rows[0].keys())))
    lines.append("")

    lines.append("## Approval Queue Summary")
    lines.append("")
    rows = diagnostics["approval_queue_summary"]
    if rows:
        lines.append(md_table([list(r.values()) for r in rows], list(rows[0].keys())))
    lines.append("")

    lines.append("## Recent Approval Queue")
    lines.append("")
    rows = diagnostics["recent_approval_queue"]
    if rows:
        lines.append(md_table([list(r.values()) for r in rows], list(rows[0].keys())))
    lines.append("")

    lines.append("## Pattern Summary")
    lines.append("")
    rows = diagnostics["pattern_summary"]
    if rows:
        lines.append(md_table([list(rows[0].values())], list(rows[0].keys())))
    lines.append("")

    lines.append("## Allowlist Summary")
    lines.append("")
    rows = diagnostics["allowlist_summary"]
    if rows:
        lines.append(md_table([list(rows[0].values())], list(rows[0].keys())))
    lines.append("")

    lines.append("## Insert Contexts: agentsam_command_run")
    lines.append("")
    for h in insert_contexts["INSERT INTO agentsam_command_run"]:
        lines.append(f"### {h['file']}:{h['line']}")
        lines.append("")
        lines.append("```text")
        lines.append(h["snippet"])
        lines.append("```")
        lines.append("")

    lines.append("## Insert Contexts: agentsam_approval_queue")
    lines.append("")
    for h in insert_contexts["INSERT INTO agentsam_approval_queue"]:
        lines.append(f"### {h['file']}:{h['line']}")
        lines.append("")
        lines.append("```text")
        lines.append(h["snippet"])
        lines.append("```")
        lines.append("")

    lines.append("## Search Hits")
    lines.append("")
    for pat, out in searches.items():
        lines.append(f"### `{pat}`")
        lines.append("")
        lines.append("```text")
        lines.append(truncate(out))
        lines.append("```")
        lines.append("")

    lines.append("## P0 Fix Guidance")
    lines.append("")
    lines.append("1. Identify which `INSERT INTO agentsam_command_run` path fires for plain chat.")
    lines.append("2. Guard that path so it only inserts when there is actual command/tool/terminal intent.")
    lines.append("3. Preserve inserts from approved plan/terminal/tool execution flows.")
    lines.append("4. Do not alter `agentsam_commands`, `agentsam_command_pattern`, or `agentsam_command_allowlist` unless the report proves the registry itself is wrong.")
    lines.append("5. Use `agentsam_approval_queue.command_run_id` to gate risky command runs.")
    lines.append("")
    lines.append("## Smoke Test")
    lines.append("")
    lines.append("```bash")
    lines.append("# Before patch: count recent command runs.")
    lines.append("./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command \"SELECT id, substr(user_input,1,120) AS input, intent_category, commands_json, selected_command_id, selected_command_slug, created_at FROM agentsam_command_run ORDER BY created_at DESC LIMIT 10;\"")
    lines.append("")
    lines.append("# After patch: ask a plain greeting in /dashboard/agent, then rerun the query.")
    lines.append("# Expected: no new agentsam_command_run row for the greeting.")
    lines.append("```")

    md_path.write_text("\n".join(lines))

    print(f"wrote {md_path}")
    print(f"wrote {json_path}")
    print(f"open {md_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
