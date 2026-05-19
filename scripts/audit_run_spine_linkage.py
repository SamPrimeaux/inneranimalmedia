#!/usr/bin/env python3
"""
audit_run_spine_linkage.py
==========================

Surgical D1 audit: which agentsam_* tables can trace back to agentsam_agent_run.id?

Doctrine (platform assessment §12):
  agent_run_id = agentsam_agent_run.id

Classifications:
  DIRECT_LINKED           — has agent_run_id column
  DIRECT_ID_OVERLAP       — table id likely equals agentsam_agent_run.id (chat-path overlap)
  INDIRECT_LINKED         — workflow_run_id, execution_id, chain_root_id, session_id, etc.
  HAS_COLUMN_NOT_POPULATED — agent_run_id exists but sampled rows are all NULL/empty
  METADATA_ONLY           — metadata_json (or similar) only; no direct run column
  MISSING_LINK            — runtime side-effect table with no traceable run column
  NOT_RELEVANT            — catalog/config/reference (not per-run telemetry)

Usage:
  python3 scripts/audit_run_spine_linkage.py
  python3 scripts/audit_run_spine_linkage.py --local
  python3 scripts/audit_run_spine_linkage.py --sample   # probe agent_run_id population
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
DEFAULT_PREFIX = "agentsam_"
OUT_DIR = Path("artifacts/agentsam_run_spine_audit")

DIRECT_COL = "agent_run_id"
INDIRECT_COLS = [
    "workflow_run_id",
    "execution_id",
    "chain_root_id",
    "session_id",
    "command_run_id",
    "run_id",
    "run_group_id",
    "conversation_id",
    "work_session_id",
    "terminal_session_id",
    "source_id",
    "parent_run_id",
]
METADATA_COLS = ["metadata_json", "metadata", "context_json", "input_json", "output_json"]

# Tables whose primary key is the same value as agentsam_agent_run.id in chat SSE path.
DIRECT_ID_OVERLAP_TABLES = frozenset({
    "agentsam_agent_run",
    "agentsam_executions",  # chat path may INSERT with id = chatAgentRunId
})

# Name patterns suggesting per-run side effects (should have a link).
RUNTIME_NAME_HINTS = re.compile(
    r"(run|execution|step|message|tool|command|terminal|mcp|invocation|"
    r"artifact|patch|diff|approval|workflow_run|telemetry|usage|error|"
    r"screenshot|browser|playwright|stream|prompt_run|eval_run|hook_execution|"
    r"skill_invocation|tool_call|tool_chain|command_run|compaction)",
    re.I,
)

# Catalog / config — missing link is expected.
NOT_RELEVANT_NAME_HINTS = re.compile(
    r"(catalog|allowlist|pattern|ruleset|guardrail_rules|feature_flag|"
    r"bootstrap|ignore_pattern|model_tier|routing_arm|mcp_servers|mcp_tools|"
    r"eval_suite|eval_case|plans_old|_old$|backup|inventory|health_daily|"
    r"fetch_domain|browser_trusted_origin|command_allowlist|hook$|plans$|"
    r"plan_tasks$|todo$|workflows$|workflow_nodes$|workflow_edges$|"
    r"workflow_registry|memory$|ai_models$|model_catalog)",
    re.I,
)


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
    return s[min(starts) :].strip() if starts else s


def d1_query(sql: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    cmd = ["npx", "wrangler", "d1", "execute", db]
    if remote:
        cmd.append("--remote")
    if config:
        cmd += ["-c", config]
    cmd += ["--json", "--command", sql]

    rc, out, err = run_cmd(cmd)
    if rc != 0:
        raise RuntimeError(
            "D1 query failed\n"
            f"SQL: {sql}\n"
            f"CMD: {' '.join(shlex.quote(c) for c in cmd)}\n"
            f"STDERR:\n{err}\n"
            f"STDOUT:\n{out}"
        )

    raw = strip_json(out)
    payload = json.loads(raw)

    if isinstance(payload, list):
        if payload and isinstance(payload[0], dict) and "results" in payload[0]:
            return payload[0].get("results") or []
        return payload

    if isinstance(payload, dict):
        if "results" in payload:
            return payload.get("results") or []
        if "result" in payload and isinstance(payload["result"], list):
            return payload["result"]

    return []


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def safe_query(sql: str, db: str, config: str, remote: bool) -> Tuple[bool, Any]:
    try:
        return True, d1_query(sql, db, config, remote)
    except Exception as e:
        return False, str(e)


def get_objects(prefix: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    sql = f"""
    SELECT type, name
    FROM sqlite_master
    WHERE name LIKE '{prefix.replace("'", "''")}%'
      AND type IN ('table', 'view')
    ORDER BY type, name;
    """
    return d1_query(sql, db, config, remote)


def table_info(name: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    ok, res = safe_query(f"PRAGMA table_info({qident(name)});", db, config, remote)
    return res if ok else []


def index_list(name: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    ok, res = safe_query(f"PRAGMA index_list({qident(name)});", db, config, remote)
    return res if ok else []


def index_info(index_name: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    ok, res = safe_query(f"PRAGMA index_info({qident(index_name)});", db, config, remote)
    return res if ok else []


def row_count(name: str, obj_type: str, db: str, config: str, remote: bool) -> Optional[int]:
    if obj_type != "table":
        return None
    ok, res = safe_query(f"SELECT COUNT(*) AS n FROM {qident(name)};", db, config, remote)
    if ok and res:
        try:
            return int(res[0].get("n", 0))
        except Exception:
            return None
    return None


def sample_agent_run_id_populated(
    name: str, db: str, config: str, remote: bool, limit: int = 5
) -> Tuple[Optional[int], Optional[int]]:
    """Returns (non_null_count, total_sampled) for agent_run_id if column exists."""
    ok, res = safe_query(
        f"""
        SELECT
          SUM(CASE WHEN {qident(DIRECT_COL)} IS NOT NULL AND TRIM(CAST({qident(DIRECT_COL)} AS TEXT)) != '' THEN 1 ELSE 0 END) AS filled,
          COUNT(*) AS n
        FROM (
          SELECT {qident(DIRECT_COL)} FROM {qident(name)}
          ORDER BY rowid DESC
          LIMIT {int(limit)}
        );
        """,
        db,
        config,
        remote,
    )
    if not ok or not res:
        return None, None
    try:
        return int(res[0].get("filled") or 0), int(res[0].get("n") or 0)
    except Exception:
        return None, None


def indexed_run_columns(
    table: str, columns: Set[str], indexes: List[Dict[str, Any]], db: str, config: str, remote: bool
) -> List[str]:
    run_cols = {DIRECT_COL, *INDIRECT_COLS} & columns
    if not run_cols or not indexes:
        return []

    indexed: Set[str] = set()
    for ix in indexes:
        ix_name = ix.get("name")
        if not ix_name:
            continue
        info = index_info(ix_name, db, config, remote)
        ix_cols = {row.get("name") for row in info if row.get("name")}
        for col in run_cols:
            if col in ix_cols:
                indexed.add(col)
        # Also treat index name as hint (idx_*_agent_run_id)
        lower = (ix_name or "").lower()
        for col in run_cols:
            if col.lower() in lower:
                indexed.add(col)

    return sorted(indexed)


def is_runtime_table(name: str, columns: Set[str]) -> bool:
    if name in DIRECT_ID_OVERLAP_TABLES:
        return True
    if RUNTIME_NAME_HINTS.search(name):
        return True
    if columns & ({DIRECT_COL} | set(INDIRECT_COLS)):
        return True
    return False


def is_not_relevant(name: str, columns: Set[str], obj_type: str) -> bool:
    if name == "agentsam_agent_run":
        return False  # canonical spine — classified separately
    if obj_type == "view":
        return True
    if NOT_RELEVANT_NAME_HINTS.search(name):
        return True
    # Pure KV / planning without run columns
    if name in ("agentsam_plans", "agentsam_plan_tasks", "agentsam_todo", "agentsam_workflows"):
        return True
    if name.endswith("_catalog") or name.endswith("_allowlist"):
        return True
    return False


def classify_table(
    name: str,
    obj_type: str,
    columns: Set[str],
    indexes: List[Dict[str, Any]],
    db: str,
    config: str,
    remote: bool,
    sample: bool,
) -> Dict[str, Any]:
    link_cols = {
        DIRECT_COL: DIRECT_COL in columns,
        **{c: c in columns for c in INDIRECT_COLS},
    }
    present_indirect = [c for c in INDIRECT_COLS if c in columns]
    present_metadata = [c for c in METADATA_COLS if c in columns]
    indexed = indexed_run_columns(name, columns, indexes, db, config, remote)

    notes: List[str] = []

    if name == "agentsam_agent_run":
        return {
            "classification": "CANONICAL_SPINE",
            "link_columns": link_cols,
            "indirect_columns": [],
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": ["Primary store; agentsam_agent_run.id is the spine"],
        }

    if obj_type == "view":
        return {
            "classification": "NOT_RELEVANT",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": ["SQL view — trace through underlying tables"],
        }

    if is_not_relevant(name, columns, obj_type):
        return {
            "classification": "NOT_RELEVANT",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": ["Catalog/config/reference or planning surface"],
        }

    if name in DIRECT_ID_OVERLAP_TABLES and "id" in columns:
        return {
            "classification": "DIRECT_ID_OVERLAP",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": [
                "Chat/workflow path may use same id as agentsam_agent_run.id",
                "Verify INSERT paths in agent-run-routing.js and workflow-executor.js",
            ],
        }

    if DIRECT_COL in columns:
        classification = "DIRECT_LINKED"
        if sample and obj_type == "table":
            filled, n = sample_agent_run_id_populated(name, db, config, remote)
            if filled is not None and n and filled == 0:
                classification = "HAS_COLUMN_NOT_POPULATED"
                notes.append(f"Sampled last {n} rows: agent_run_id all NULL/empty")
            elif filled is not None and n:
                notes.append(f"Sampled last {n} rows: {filled}/{n} have agent_run_id")
        if DIRECT_COL not in indexed:
            notes.append("agent_run_id column present but no index detected")
        return {
            "classification": classification,
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": notes,
        }

    if present_indirect:
        return {
            "classification": "INDIRECT_LINKED",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": [
                f"Trace via: {', '.join(present_indirect)}",
                "Confirm Worker code populates bridge to agentsam_agent_run.id",
            ],
        }

    if present_metadata and is_runtime_table(name, columns):
        return {
            "classification": "METADATA_ONLY",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": ["Run id may be buried in JSON — not queryable without parse"],
        }

    if is_runtime_table(name, columns):
        return {
            "classification": "MISSING_LINK",
            "link_columns": link_cols,
            "indirect_columns": present_indirect,
            "metadata_columns": present_metadata,
            "indexed_link_columns": indexed,
            "notes": ["Runtime side-effect table with no obvious run spine column"],
        }

    return {
        "classification": "NOT_RELEVANT",
        "link_columns": link_cols,
        "indirect_columns": present_indirect,
        "metadata_columns": present_metadata,
        "indexed_link_columns": indexed,
        "notes": ["No runtime linkage signals detected"],
    }


def md_table(rows: List[List[Any]], headers: List[str]) -> str:
    def cell(x: Any) -> str:
        s = "" if x is None else str(x)
        s = s.replace("\n", " ").replace("|", "\\|")
        return s[:140] + "..." if len(s) > 140 else s

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for r in rows:
        lines.append("| " + " | ".join(cell(x) for x in r) + " |")
    return "\n".join(lines)


def make_report(audit: Dict[str, Any]) -> str:
    tables = audit["tables"]
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for t in tables:
        by_class.setdefault(t["classification"], []).append(t)

    lines: List[str] = []
    lines.append("# Agent Run Spine Linkage Audit")
    lines.append("")
    lines.append(f"Generated: `{audit['generated_at']}`")
    lines.append(f"Database: `{audit['db']}` | Remote: `{audit['remote']}` | Sampled population: `{audit['sample']}`")
    lines.append("")
    lines.append("## Doctrine")
    lines.append("")
    lines.append("`agent_run_id = agentsam_agent_run.id` — not a separate table.")
    lines.append("")
    lines.append("## Summary by classification")
    lines.append("")
    summary_rows = []
    for cls in [
        "CANONICAL_SPINE",
        "DIRECT_LINKED",
        "DIRECT_ID_OVERLAP",
        "INDIRECT_LINKED",
        "HAS_COLUMN_NOT_POPULATED",
        "METADATA_ONLY",
        "MISSING_LINK",
        "NOT_RELEVANT",
    ]:
        items = by_class.get(cls, [])
        summary_rows.append([cls, len(items)])
    lines.append(md_table(summary_rows, ["Classification", "Count"]))
    lines.append("")

    priority = ["MISSING_LINK", "HAS_COLUMN_NOT_POPULATED", "METADATA_ONLY", "INDIRECT_LINKED"]
    for cls in priority:
        items = sorted(by_class.get(cls, []), key=lambda x: x["name"])
        if not items:
            continue
        lines.append(f"## {cls}")
        lines.append("")
        lines.append(md_table(
            [
                [
                    t["name"],
                    t.get("row_count"),
                    ", ".join(t.get("indirect_columns", [])[:6]),
                    ", ".join(t.get("indexed_link_columns", [])),
                    "; ".join(t.get("notes", [])[:2]),
                ]
                for t in items
            ],
            ["Table", "Rows", "Link cols", "Indexed", "Notes"],
        ))
        lines.append("")

    lines.append("## DIRECT_LINKED (ready shape)")
    lines.append("")
    direct = sorted(by_class.get("DIRECT_LINKED", []), key=lambda x: x["name"])
    lines.append(md_table(
        [[t["name"], t.get("row_count"), ", ".join(t.get("indexed_link_columns", []))] for t in direct],
        ["Table", "Rows", "Indexed cols"],
    ))
    lines.append("")

    lines.append("## Full table listing")
    lines.append("")
    lines.append(md_table(
        [
            [
                t["name"],
                t["type"],
                t["classification"],
                "yes" if t["link_columns"].get(DIRECT_COL) else "",
                ", ".join(t.get("indirect_columns", [])[:4]),
                ", ".join(t.get("indexed_link_columns", [])),
            ]
            for t in sorted(tables, key=lambda x: (x["classification"], x["name"]))
        ],
        ["Table", "Type", "Class", "agent_run_id?", "Indirect", "Indexed"],
    ))
    lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit agentsam_* run-spine linkage to agentsam_agent_run.id")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--local", action="store_true")
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Probe whether agent_run_id is populated (last 5 rows per table)",
    )
    args = parser.parse_args()

    remote = not args.local
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[run-spine] db={args.db} remote={remote} sample={args.sample}")

    objs = get_objects(args.prefix, args.db, args.config, remote)
    print(f"[run-spine] objects: {len(objs)}")

    walked: List[Dict[str, Any]] = []

    for i, obj in enumerate(objs, start=1):
        name = obj["name"]
        obj_type = obj["type"]
        print(f"[{i:03d}/{len(objs):03d}] {name}")

        info = table_info(name, args.db, args.config, remote)
        col_names = [c.get("name") for c in info if c.get("name")]
        columns = set(col_names)
        idxs = index_list(name, args.db, args.config, remote) if obj_type == "table" else []
        count = row_count(name, obj_type, args.db, args.config, remote)

        result = classify_table(
            name, obj_type, columns, idxs, args.db, args.config, remote, args.sample
        )

        walked.append({
            "name": name,
            "type": obj_type,
            "row_count": count,
            "column_names": sorted(columns),
            **result,
        })

    audit = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "db": args.db,
        "config": args.config,
        "remote": remote,
        "sample": args.sample,
        "prefix": args.prefix,
        "doctrine": "agent_run_id = agentsam_agent_run.id",
        "table_count": len(walked),
        "by_classification": {
            k: [t["name"] for t in walked if t["classification"] == k]
            for k in sorted({t["classification"] for t in walked})
        },
        "tables": walked,
    }

    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    json_path = OUT_DIR / f"run_spine_linkage_{stamp}.json"
    md_path = OUT_DIR / f"run_spine_linkage_{stamp}.md"
    latest_json = OUT_DIR / "LATEST_RUN_SPINE_LINKAGE.json"
    latest_md = OUT_DIR / "LATEST_RUN_SPINE_LINKAGE.md"

    json_text = json.dumps(audit, indent=2, ensure_ascii=False)
    md_text = make_report(audit)

    json_path.write_text(json_text, encoding="utf-8")
    latest_json.write_text(json_text, encoding="utf-8")
    md_path.write_text(md_text, encoding="utf-8")
    latest_md.write_text(md_text, encoding="utf-8")

    print("")
    print("[run-spine] done")
    for cls, names in sorted(audit["by_classification"].items()):
        print(f"  {cls}: {len(names)}")
    print(f"markdown: {latest_md}")
    print(f"json:     {latest_json}")

    if remote:
        gap_sql = """
        SELECT COUNT(*) AS c FROM agentsam_tool_chain
        WHERE command_run_id IS NOT NULL
          AND (agent_run_id IS NULL OR TRIM(agent_run_id) = '')
          AND started_at > unixepoch('now', '-7 days')
        """
        ok, rows = run_sql(gap_sql, args.db, args.config, remote)
        if ok and rows:
            gap = int(rows[0].get("c") or 0)
            print(f"[run-spine] tool_chain command_run_id without agent_run_id (7d): {gap}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
