#!/usr/bin/env python3
"""
walk_agentsam_tables.py
=======================

Focused D1 audit for agentsam_* tables/views only.

What it does:
- Lists every sqlite_master object where name LIKE 'agentsam_%'
- Walks each table/view
- Captures schema, indexes, foreign keys, row count, timestamp freshness
- Detects key columns used for Agent Sam / Cursor-quality wiring
- Groups tables by likely capability
- Flags empty, duplicate-looking, stale-looking, and high-value tables
- Writes Markdown + JSON reports

Usage:
  python3 scripts/walk_agentsam_tables.py

Options:
  python3 scripts/walk_agentsam_tables.py --local
  python3 scripts/walk_agentsam_tables.py --db inneranimalmedia-business
  python3 scripts/walk_agentsam_tables.py --config wrangler.production.toml
  python3 scripts/walk_agentsam_tables.py --prefix agentsam_
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
DEFAULT_PREFIX = "agentsam_"
OUT_DIR = Path("artifacts/agentsam_db_table_walk")


CAPABILITY_RULES = {
    "agent_run_spine": [
        "run", "runs", "execution", "executions", "session", "sessions",
        "step", "steps", "message", "messages"
    ],
    "model_routing": [
        "model", "catalog", "routing", "route", "routes", "arm", "arms",
        "requirement", "requirements", "provider", "prompt"
    ],
    "tools_commands_mcp": [
        "tool", "tools", "mcp", "command", "commands", "skill", "skills",
        "invocation", "chain", "script", "scripts"
    ],
    "workflow_dag": [
        "workflow", "workflows", "node", "nodes", "edge", "edges",
        "approval", "approvals", "task", "tasks"
    ],
    "memory_context_rag": [
        "memory", "context", "chunk", "chunks", "embedding", "vector",
        "semantic", "rag", "cache"
    ],
    "telemetry_analytics": [
        "usage", "rollup", "analytics", "metric", "metrics", "performance",
        "trace", "traces", "log", "logs", "error", "health", "eval"
    ],
    "deploy_workers_cron_webhooks": [
        "deploy", "deployment", "worker", "workers", "cron", "webhook",
        "release", "environment"
    ],
    "guardrails_policy_safety": [
        "guardrail", "policy", "rule", "rules", "safety", "permission",
        "override", "feature"
    ],
    "artifacts_files_browser_terminal": [
        "artifact", "artifacts", "file", "files", "patch", "diff",
        "browser", "screenshot", "terminal", "pty"
    ],
}


IMPORTANT_COLUMNS = [
    "id",
    "tenant_id",
    "workspace_id",
    "user_id",
    "agent_run_id",
    "run_id",
    "workflow_id",
    "workflow_run_id",
    "execution_id",
    "session_id",
    "message_id",
    "tool_id",
    "tool_key",
    "command_id",
    "command",
    "command_text",
    "model_key",
    "provider",
    "route_key",
    "task_type",
    "mode",
    "status",
    "risk_level",
    "requires_approval",
    "approval_id",
    "approved_by",
    "input_json",
    "output_json",
    "metadata_json",
    "error_json",
    "created_at",
    "updated_at",
    "started_at",
    "finished_at",
    "last_seen_at",
    "heartbeat_at",
]


TS_CANDIDATES = [
    "updated_at",
    "created_at",
    "finished_at",
    "started_at",
    "last_seen_at",
    "heartbeat_at",
    "timestamp",
    "ts",
    "created_at_unix",
    "updated_at_unix",
]


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
        raise RuntimeError(
            "D1 query failed\n"
            f"SQL: {sql}\n"
            f"CMD: {' '.join(shlex.quote(c) for c in cmd)}\n"
            f"STDERR:\n{err}\n"
            f"STDOUT:\n{out}"
        )

    raw = strip_json(out)

    try:
        payload = json.loads(raw)
    except Exception as e:
        raise RuntimeError(
            f"Could not parse wrangler JSON output: {e}\n"
            f"SQL: {sql}\n"
            f"STDOUT:\n{out[:4000]}"
        )

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
    SELECT type, name, tbl_name, sql
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


def foreign_keys(name: str, db: str, config: str, remote: bool) -> List[Dict[str, Any]]:
    ok, res = safe_query(f"PRAGMA foreign_key_list({qident(name)});", db, config, remote)
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


def max_ts(name: str, columns: List[str], obj_type: str, db: str, config: str, remote: bool) -> Dict[str, Optional[str]]:
    if obj_type != "table":
        return {}

    out: Dict[str, Optional[str]] = {}
    existing = set(columns)

    for col in TS_CANDIDATES:
        if col not in existing:
            continue

        ok, res = safe_query(
            f"SELECT MAX({qident(col)}) AS latest FROM {qident(name)};",
            db,
            config,
            remote,
        )

        if ok and res:
            val = res[0].get("latest")
            out[col] = str(val) if val is not None else None

    return out


def classify_table(name: str, columns: List[str], sql: str) -> List[str]:
    haystack = " ".join([name, " ".join(columns), sql or ""]).lower()
    hits: List[str] = []

    for cap, words in CAPABILITY_RULES.items():
        if any(w.lower() in haystack for w in words):
            hits.append(cap)

    return hits or ["unclassified"]


def detect_quality_flags(
    name: str,
    obj_type: str,
    columns: List[str],
    count: Optional[int],
    fks: List[Dict[str, Any]],
    indexes: List[Dict[str, Any]],
) -> List[str]:
    flags: List[str] = []

    colset = set(columns)
    lower_name = name.lower()

    if obj_type == "table" and count == 0:
        flags.append("EMPTY_TABLE")

    if obj_type == "table" and count is None:
        flags.append("COUNT_FAILED")

    if "tenant_id" not in colset:
        flags.append("NO_TENANT_ID")

    if "workspace_id" not in colset:
        flags.append("NO_WORKSPACE_ID")

    if not any(c in colset for c in ["created_at", "created_at_unix"]):
        flags.append("NO_CREATED_AT")

    if not any(c in colset for c in ["updated_at", "updated_at_unix"]):
        flags.append("NO_UPDATED_AT")

    if lower_name.endswith("_old") or "backup" in lower_name or "deprecated" in lower_name:
        flags.append("POSSIBLE_LEGACY_OR_BACKUP")

    if any(x in lower_name for x in ["run", "execution", "step", "message", "tool", "command"]):
        if not any(c in colset for c in ["agent_run_id", "workflow_run_id", "execution_id", "session_id", "run_id"]):
            flags.append("RUNTIME_TABLE_WITHOUT_OBVIOUS_RUN_LINK")

    if any(x in lower_name for x in ["tool", "command", "terminal", "mcp"]):
        if not any(c in colset for c in ["status", "error_json", "latency_ms", "duration_ms"]):
            flags.append("TOOL_OR_COMMAND_TABLE_MISSING_STATUS_LATENCY_ERROR_SHAPE")

    if any(x in lower_name for x in ["approval", "guardrail", "policy"]):
        if not any(c in colset for c in ["risk_level", "requires_approval", "approval_status", "approved_by"]):
            flags.append("SAFETY_TABLE_MISSING_APPROVAL_SHAPE")

    if obj_type == "table" and len(indexes) == 0:
        flags.append("NO_INDEXES_REPORTED")

    if obj_type == "table" and len(fks) == 0:
        flags.append("NO_FOREIGN_KEYS_REPORTED")

    return flags


def column_summary(columns_info: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for c in columns_info:
        name = c.get("name")
        out.append({
            "cid": c.get("cid"),
            "name": name,
            "type": c.get("type"),
            "notnull": c.get("notnull"),
            "default": c.get("dflt_value"),
            "pk": c.get("pk"),
            "important": name in IMPORTANT_COLUMNS,
        })
    return out


def find_duplicate_families(names: List[str]) -> Dict[str, List[str]]:
    """
    Crude grouping to reveal overlap:
    agentsam_workflow_runs, agentsam_workflows, agentsam_workflow_nodes -> workflow
    agentsam_model_catalog, agentsam_routing_arms -> model/routing
    """
    roots: Dict[str, List[str]] = {}

    noise = {
        "agentsam", "v", "tbl", "table", "old", "new", "backup",
        "runs", "run", "events", "event", "logs", "log",
        "daily", "monthly", "weekly",
    }

    for name in names:
        tokens = re.split(r"[_\W]+", name.lower())
        tokens = [t for t in tokens if t and t not in noise]
        if not tokens:
            key = name
        else:
            key = tokens[0]
            if key in {"workflow", "workflows"}:
                key = "workflow"
            elif key in {"model", "models", "routing", "route", "routes"}:
                key = "model_routing"
            elif key in {"tool", "tools", "mcp", "command", "commands"}:
                key = "tools_commands_mcp"
            elif key in {"usage", "analytics", "metric", "metrics", "telemetry"}:
                key = "telemetry_analytics"
            elif key in {"memory", "context", "prompt"}:
                key = "memory_context_prompt"
            elif key in {"deployment", "deploy", "worker", "webhook", "cron"}:
                key = "deploy_workers_events"

        roots.setdefault(key, []).append(name)

    return {k: sorted(v) for k, v in sorted(roots.items()) if len(v) > 1}


def md_table(rows: List[List[Any]], headers: List[str]) -> str:
    def cell(x: Any) -> str:
        s = "" if x is None else str(x)
        s = s.replace("\n", " ").replace("|", "\\|")
        if len(s) > 160:
            s = s[:157] + "..."
        return s

    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for r in rows:
        lines.append("| " + " | ".join(cell(x) for x in r) + " |")
    return "\n".join(lines)


def make_report(audit: Dict[str, Any]) -> str:
    now = audit["generated_at"]
    objects = audit["objects"]
    tables = [o for o in objects if o["type"] == "table"]
    views = [o for o in objects if o["type"] == "view"]

    lines: List[str] = []
    lines.append("# agentsam_* D1 Table Walk")
    lines.append("")
    lines.append(f"Generated: `{now}`")
    lines.append(f"Database: `{audit['db']}`")
    lines.append(f"Config: `{audit['config']}`")
    lines.append(f"Remote: `{audit['remote']}`")
    lines.append(f"Prefix: `{audit['prefix']}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Objects found: **{len(objects)}**")
    lines.append(f"- Tables: **{len(tables)}**")
    lines.append(f"- Views: **{len(views)}**")
    lines.append(f"- Empty tables: **{sum(1 for o in tables if o.get('row_count') == 0)}**")
    lines.append(f"- Tables with rows: **{sum(1 for o in tables if (o.get('row_count') or 0) > 0)}**")
    lines.append("")

    total_rows = sum((o.get("row_count") or 0) for o in tables)
    lines.append(f"- Total rows across agentsam_* tables: **{total_rows:,}**")
    lines.append("")

    lines.append("## Capability Groups")
    lines.append("")
    group_rows = []
    for cap, names in audit["capability_groups"].items():
        group_rows.append([cap, len(names), ", ".join(names[:18]) + (" ..." if len(names) > 18 else "")])
    lines.append(md_table(group_rows, ["Capability", "Count", "Tables/views"]))
    lines.append("")

    lines.append("## High-Value Runtime Tables")
    lines.append("")
    high_value = []
    for o in objects:
        caps = set(o.get("capabilities", []))
        if caps & {
            "agent_run_spine",
            "model_routing",
            "tools_commands_mcp",
            "workflow_dag",
            "telemetry_analytics",
            "artifacts_files_browser_terminal",
        }:
            high_value.append(o)

    high_value = sorted(
        high_value,
        key=lambda x: (-(x.get("row_count") or 0), x["name"])
    )

    lines.append(md_table(
        [
            [
                o["name"],
                o["type"],
                o.get("row_count"),
                ", ".join(o.get("capabilities", [])),
                ", ".join(o.get("key_columns", [])),
                ", ".join(o.get("quality_flags", [])[:5]),
            ]
            for o in high_value
        ],
        ["Name", "Type", "Rows", "Capabilities", "Key columns", "Flags"],
    ))
    lines.append("")

    lines.append("## Tables With Rows")
    lines.append("")
    with_rows = [o for o in tables if (o.get("row_count") or 0) > 0]
    with_rows = sorted(with_rows, key=lambda x: -(x.get("row_count") or 0))
    lines.append(md_table(
        [
            [
                o["name"],
                o.get("row_count"),
                len(o.get("columns", [])),
                ", ".join(o.get("capabilities", [])),
                json.dumps(o.get("latest_timestamps", {}), ensure_ascii=False),
            ]
            for o in with_rows
        ],
        ["Table", "Rows", "Cols", "Capabilities", "Latest timestamps"],
    ))
    lines.append("")

    lines.append("## Empty agentsam_* Tables")
    lines.append("")
    empty = [o for o in tables if o.get("row_count") == 0]
    lines.append(md_table(
        [
            [
                o["name"],
                len(o.get("columns", [])),
                ", ".join(o.get("capabilities", [])),
                ", ".join(o.get("quality_flags", [])[:6]),
            ]
            for o in empty
        ],
        ["Table", "Cols", "Capabilities", "Flags"],
    ))
    lines.append("")

    lines.append("## Possible Overlap / Duplicate Families")
    lines.append("")
    dup_rows = []
    for family, names in audit["duplicate_families"].items():
        dup_rows.append([family, len(names), ", ".join(names)])
    lines.append(md_table(dup_rows, ["Family", "Count", "Objects"]))
    lines.append("")

    lines.append("## Cursor-Quality Concept Coverage From Existing agentsam_* Tables")
    lines.append("")
    coverage_rows = []
    for concept, data in audit["concept_coverage"].items():
        coverage_rows.append([
            concept,
            data["status"],
            ", ".join(data["candidate_tables"][:10]),
            data["note"],
        ])
    lines.append(md_table(coverage_rows, ["Concept", "Status", "Candidate tables", "Note"]))
    lines.append("")

    lines.append("## Full Object Walk")
    lines.append("")
    for o in objects:
        lines.append(f"### `{o['name']}`")
        lines.append("")
        lines.append(f"- Type: `{o['type']}`")
        lines.append(f"- Rows: `{o.get('row_count')}`")
        lines.append(f"- Capabilities: `{', '.join(o.get('capabilities', []))}`")
        lines.append(f"- Key columns: `{', '.join(o.get('key_columns', []))}`")
        lines.append(f"- Quality flags: `{', '.join(o.get('quality_flags', []))}`")
        lines.append(f"- Latest timestamps: `{json.dumps(o.get('latest_timestamps', {}), ensure_ascii=False)}`")
        lines.append("")

        col_rows = [
            [
                c["name"],
                c["type"],
                c["notnull"],
                c["default"],
                c["pk"],
                "yes" if c["important"] else "",
            ]
            for c in o.get("columns", [])
        ]
        lines.append(md_table(col_rows, ["Column", "Type", "NotNull", "Default", "PK", "Important"]))
        lines.append("")

        if o.get("indexes"):
            lines.append("Indexes:")
            lines.append("")
            lines.append(md_table(
                [
                    [ix.get("name"), ix.get("unique"), ix.get("origin"), ix.get("partial")]
                    for ix in o.get("indexes", [])
                ],
                ["Index", "Unique", "Origin", "Partial"],
            ))
            lines.append("")

        if o.get("foreign_keys"):
            lines.append("Foreign keys:")
            lines.append("")
            lines.append(md_table(
                [
                    [
                        fk.get("table"),
                        fk.get("from"),
                        fk.get("to"),
                        fk.get("on_update"),
                        fk.get("on_delete"),
                    ]
                    for fk in o.get("foreign_keys", [])
                ],
                ["Ref table", "From", "To", "On update", "On delete"],
            ))
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def concept_coverage(objects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    concepts = {
        "agent_run_id_spine": {
            "must_have_any": ["agent_run_id", "run_id", "workflow_run_id", "execution_id", "session_id"],
            "name_hints": ["run", "execution", "session", "message", "step"],
        },
        "model_route_decision": {
            "must_have_any": ["model_key", "provider", "route_key", "task_type", "mode"],
            "name_hints": ["model", "routing", "route", "arm", "catalog"],
        },
        "tool_invocation_ledger": {
            "must_have_any": ["tool_id", "tool_key", "tool_name", "input_json", "output_json", "error_json", "latency_ms", "status"],
            "name_hints": ["tool", "mcp", "invocation", "command"],
        },
        "terminal_command_audit": {
            "must_have_any": ["terminal_session_id", "command", "command_text", "exit_code", "stdout", "stderr"],
            "name_hints": ["terminal", "pty", "command"],
        },
        "workflow_dag": {
            "must_have_any": ["workflow_id", "workflow_run_id", "node_id", "edge_id", "status"],
            "name_hints": ["workflow", "node", "edge", "step"],
        },
        "approval_gate": {
            "must_have_any": ["approval_id", "approval_status", "approved_by", "requires_approval", "risk_level"],
            "name_hints": ["approval", "guardrail", "policy"],
        },
        "file_patch_diff_review": {
            "must_have_any": ["file_path", "patch_text", "diff_text", "review_status", "findings_json"],
            "name_hints": ["patch", "diff", "review", "artifact", "file"],
        },
        "browser_evidence": {
            "must_have_any": ["url", "screenshot", "viewport", "console_errors", "network_errors", "dom"],
            "name_hints": ["browser", "screenshot", "evidence", "playwright"],
        },
        "context_pack_retrieval": {
            "must_have_any": ["context_json", "context_pack_id", "sources_json", "chunks_json", "embedding", "vector_id"],
            "name_hints": ["context", "memory", "chunk", "embedding", "vector", "rag"],
        },
        "usage_cost_analytics": {
            "must_have_any": ["cost", "tokens", "tokens_in", "tokens_out", "latency_ms", "usage"],
            "name_hints": ["usage", "analytics", "metric", "performance", "rollup"],
        },
    }

    result: Dict[str, Dict[str, Any]] = {}

    for concept, rule in concepts.items():
        candidates: List[str] = []

        for o in objects:
            cols = {c["name"] for c in o.get("columns", [])}
            name = o["name"].lower()

            col_hit = any(c in cols for c in rule["must_have_any"])
            name_hit = any(h in name for h in rule["name_hints"])

            if col_hit or name_hit:
                candidates.append(o["name"])

        if len(candidates) >= 2:
            status = "LIKELY_EXISTS"
            note = "Multiple candidate agentsam_* tables found. Inspect for canonical one."
        elif len(candidates) == 1:
            status = "PARTIAL_OR_SINGLE_CANDIDATE"
            note = "One candidate found. May be usable or may need columns."
        else:
            status = "NOT_FOUND_IN_AGENTSAM_PREFIX"
            note = "No obvious agentsam_* table found for this concept."

        result[concept] = {
            "status": status,
            "candidate_tables": sorted(candidates),
            "note": note,
        }

    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args()

    remote = not args.local

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[agentsam-walk] db={args.db} config={args.config} remote={remote} prefix={args.prefix}")

    objs = get_objects(args.prefix, args.db, args.config, remote)
    print(f"[agentsam-walk] objects found: {len(objs)}")

    walked: List[Dict[str, Any]] = []

    for i, obj in enumerate(objs, start=1):
        name = obj["name"]
        obj_type = obj["type"]

        print(f"[{i:03d}/{len(objs):03d}] {obj_type:5s} {name}")

        info = table_info(name, args.db, args.config, remote)
        cols = column_summary(info)
        col_names = [c["name"] for c in cols]

        idxs = index_list(name, args.db, args.config, remote) if obj_type == "table" else []
        fks = foreign_keys(name, args.db, args.config, remote) if obj_type == "table" else []
        count = row_count(name, obj_type, args.db, args.config, remote)
        timestamps = max_ts(name, col_names, obj_type, args.db, args.config, remote)

        caps = classify_table(name, col_names, obj.get("sql") or "")
        key_cols = [c for c in col_names if c in IMPORTANT_COLUMNS]
        flags = detect_quality_flags(name, obj_type, col_names, count, fks, idxs)

        walked.append({
            "name": name,
            "type": obj_type,
            "sql": obj.get("sql"),
            "row_count": count,
            "columns": cols,
            "column_names": col_names,
            "key_columns": key_cols,
            "indexes": idxs,
            "foreign_keys": fks,
            "latest_timestamps": timestamps,
            "capabilities": caps,
            "quality_flags": flags,
        })

    capability_groups: Dict[str, List[str]] = {}
    for o in walked:
        for cap in o.get("capabilities", []):
            capability_groups.setdefault(cap, []).append(o["name"])
    capability_groups = {k: sorted(v) for k, v in sorted(capability_groups.items())}

    duplicate_families = find_duplicate_families([o["name"] for o in walked])

    audit = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "db": args.db,
        "config": args.config,
        "remote": remote,
        "prefix": args.prefix,
        "object_count": len(walked),
        "table_count": sum(1 for o in walked if o["type"] == "table"),
        "view_count": sum(1 for o in walked if o["type"] == "view"),
        "total_rows": sum((o.get("row_count") or 0) for o in walked if o["type"] == "table"),
        "capability_groups": capability_groups,
        "duplicate_families": duplicate_families,
        "concept_coverage": concept_coverage(walked),
        "objects": walked,
    }

    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")

    json_path = OUT_DIR / f"agentsam_db_table_walk_{stamp}.json"
    md_path = OUT_DIR / f"agentsam_db_table_walk_{stamp}.md"

    latest_json = OUT_DIR / "LATEST_AGENTSAM_DB_TABLE_WALK.json"
    latest_md = OUT_DIR / "LATEST_AGENTSAM_DB_TABLE_WALK.md"

    json_text = json.dumps(audit, indent=2, ensure_ascii=False)
    md_text = make_report(audit)

    json_path.write_text(json_text, encoding="utf-8")
    latest_json.write_text(json_text, encoding="utf-8")

    md_path.write_text(md_text, encoding="utf-8")
    latest_md.write_text(md_text, encoding="utf-8")

    print("")
    print("[agentsam-walk] done")
    print(f"objects     : {audit['object_count']}")
    print(f"tables      : {audit['table_count']}")
    print(f"views       : {audit['view_count']}")
    print(f"total rows  : {audit['total_rows']:,}")
    print(f"markdown    : {latest_md}")
    print(f"json        : {latest_json}")
    print("")
    print(f"open {latest_md}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
