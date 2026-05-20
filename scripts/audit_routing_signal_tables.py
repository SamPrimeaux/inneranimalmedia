#!/usr/bin/env python3
"""
audit_routing_signal_tables.py
==============================

Read-only D1 inspection for **routing-signal** tables: schema, column taxonomy,
and redacted sample rows.

Answers (per table + roll-up matrix):
  - Which tables contain model_key (and related model id columns)?
  - Which contain route_key?
  - Which contain task_type / mode?
  - Which contain status / success / error fields?
  - Which contain latency / cost / token fields?
  - Which contain workflow_run_id / agent_run_id / execution_id?
  - Which contain smoke / test / debug content (columns or sample values)?

Companion to: scripts/audit_agentsam_table_usage.py (full 85-table inventory).

Usage (repo root):
  python3 scripts/audit_routing_signal_tables.py
  python3 scripts/audit_routing_signal_tables.py --local --sample-limit 2
  python3 scripts/audit_routing_signal_tables.py --tables agentsam_routing_arms,agentsam_agent_run

Output:
  artifacts/routing_signal_tables_audit/LATEST_ROUTING_SIGNAL_TABLES_AUDIT.md
  artifacts/routing_signal_tables_audit/LATEST_ROUTING_SIGNAL_TABLES_AUDIT.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

# plan_audit_common lives in scripts/lib
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (  # noqa: E402
    AuditConfig,
    add_base_args,
    config_from_args,
    now_iso,
    qident,
    repo_root,
    safe_d1_query,
    table_columns,
    table_exists,
)

OUT_DIR = Path("artifacts/routing_signal_tables_audit")

# Registry / policy tables (from audit_agentsam_table_usage.ROUTING_TABLES)
ROUTING_CONFIG_TABLES: Tuple[str, ...] = (
    "agentsam_routing_arms",
    "agentsam_route_requirements",
    "agentsam_prompt_routes",
    "agentsam_model_routing_memory",
    "agentsam_model_drift_signals",
    "agentsam_model_catalog",
    "agentsam_model_tier",
    "agentsam_escalation",
    "agentsam_eval_cases",
    "agentsam_eval_runs",
    "agentsam_eval_suites",
    "agentsam_prompt_versions",
    "agentsam_prompt_cache_keys",
    "agentsam_capability_aliases",
)

# Runtime tables that record routing decisions / outcomes (Thompson rewards, traces)
ROUTING_RUNTIME_TABLES: Tuple[str, ...] = (
    "agentsam_agent_run",
    "agentsam_usage_events",
    "agentsam_executions",
    "agentsam_execution_steps",
    "agentsam_execution_performance_metrics",
    "agentsam_tool_call_log",
    "agentsam_mcp_tool_execution",
    "agentsam_command_run",
)

# Optional D1 table (may exist on some envs; probed at runtime)
OPTIONAL_TABLES: Tuple[str, ...] = ("agentsam_routing_decisions",)

DEFAULT_TABLES: Tuple[str, ...] = tuple(
    dict.fromkeys(
        list(ROUTING_CONFIG_TABLES) + list(ROUTING_RUNTIME_TABLES) + list(OPTIONAL_TABLES)
    )
)

# ── Column taxonomy (regex on lowercased column names) ─────────────────────────

SIGNAL_GROUPS: Dict[str, List[str]] = {
    "model_key": [
        r"model_key",
        r"model_used",
        r"^model$",
        r"primary_model",
        r"fallback_model",
        r"escalation_model",
        r"selected_model",
        r"ai_model_id",
        r"model_id",
        r"provider_model",
    ],
    "route_key": [
        r"route_key",
        r"prompt_route",
    ],
    "task_type_mode": [
        r"task_type",
        r"^mode$",
        r"agent_mode",
        r"suite_mode",
        r"arm_type",
        r"intent_slug",
        r"intent_category",
        r"routing_mode",
    ],
    "status_success_error": [
        r"^status$",
        r"success",
        r"failure",
        r"error_message",
        r"error_code",
        r"error_trace",
        r"outcome",
        r"result_status",
        r"exit_code",
        r"blocked_reason",
        r"is_success",
        r"passed",
        r"failed",
    ],
    "latency_cost_tokens": [
        r"latency",
        r"duration_ms",
        r"cost_usd",
        r"cost_cents",
        r"input_tokens",
        r"output_tokens",
        r"total_tokens",
        r"tokens_before",
        r"tokens_after",
        r"token_count",
        r"prompt_tokens",
        r"completion_tokens",
        r"mtok",
        r"per_mtok",
    ],
    "run_linkage_ids": [
        r"workflow_run_id",
        r"agent_run_id",
        r"execution_id",
        r"command_run_id",
        r"run_group_id",
        r"routing_arm_id",
        r"routing_decision_id",
        r"session_id",
        r"plan_run_id",
    ],
    "smoke_test_debug_columns": [
        r"smoke",
        r"\btest\b",
        r"debug",
        r"benchmark",
        r"\beval\b",
        r"fixture",
        r"mock",
        r"dry_run",
        r"sandbox",
    ],
}

SMOKE_VALUE_RE = re.compile(
    r"(smoke|benchmark|fixture|dry[_-]?run|e2e[_-]?test|debug[_-]?snap|"
    r"routing[_-]?eval|test[_-]?suite|iam_eval)",
    re.I,
)

MAX_CELL_LEN = 120
MAX_JSON_SAMPLE_LEN = 4000


def classify_columns(columns: Sequence[str]) -> Dict[str, List[str]]:
    """Map signal group → matching column names on this table."""
    out: Dict[str, List[str]] = {g: [] for g in SIGNAL_GROUPS}
    for col in columns:
        lc = col.lower()
        for group, patterns in SIGNAL_GROUPS.items():
            if any(re.search(p, lc) for p in patterns):
                out[group].append(col)
    return out


def truncate_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (int, float, bool)):
        return v
    s = str(v)
    if len(s) <= MAX_CELL_LEN:
        return s
    return s[: MAX_CELL_LEN - 3] + "..."


def redact_row(row: Mapping[str, Any]) -> Dict[str, Any]:
    skip_prefixes = ("embedding", "prompt_body", "system_prompt", "content_blob")
    out: Dict[str, Any] = {}
    for k, v in row.items():
        lk = k.lower()
        if any(lk.startswith(p) for p in skip_prefixes):
            out[k] = "<redacted>"
            continue
        if isinstance(v, (dict, list)):
            raw = json.dumps(v, ensure_ascii=False)
            out[k] = raw if len(raw) <= MAX_CELL_LEN else raw[: MAX_CELL_LEN - 3] + "..."
            continue
        out[k] = truncate_value(v)
    return out


def detect_smoke_in_samples(rows: Sequence[Mapping[str, Any]]) -> List[str]:
    hits: List[str] = []
    for row in rows:
        for k, v in row.items():
            if v is None:
                continue
            text = str(v)
            if len(text) > 500:
                text = text[:500]
            if SMOKE_VALUE_RE.search(text) or SMOKE_VALUE_RE.search(k):
                hits.append(f"{k}={truncate_value(v)}")
    # dedupe preserve order
    seen: Set[str] = set()
    uniq: List[str] = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            uniq.append(h)
    return uniq[:12]


def table_row_count(cfg: AuditConfig, table: str) -> Optional[int]:
    ok, res = safe_d1_query(cfg, f"SELECT COUNT(*) AS n FROM {qident(table)};")
    if not ok or not isinstance(res, list) or not res:
        return None
    try:
        return int(res[0].get("n") or 0)
    except (TypeError, ValueError):
        return None


def sample_rows(
    cfg: AuditConfig,
    table: str,
    *,
    limit: int,
    order_col: Optional[str],
) -> Tuple[bool, Any]:
    order = f" ORDER BY {qident(order_col)} DESC" if order_col else ""
    sql = f"SELECT * FROM {qident(table)}{order} LIMIT {int(limit)};"
    return safe_d1_query(cfg, sql)


def pick_order_column(columns: Sequence[str]) -> Optional[str]:
    prefs = (
        "updated_at",
        "created_at",
        "run_at",
        "invoked_at",
        "started_at",
        "detected_at",
        "last_seen_at",
        "rowid",
    )
    lower = {c.lower(): c for c in columns}
    for p in prefs:
        if p in lower:
            return lower[p]
    return None


def inspect_table(
    cfg: AuditConfig,
    table: str,
    *,
    sample_limit: int,
) -> Dict[str, Any]:
    exists = table_exists(cfg, table)
    if not exists:
        return {
            "table": table,
            "exists": False,
            "error": "table not found in sqlite_master",
        }

    cols = table_columns(cfg, table)
    groups = classify_columns(cols)
    n = table_row_count(cfg, table)
    order_col = pick_order_column(cols)

    ok_sample, sample_res = sample_rows(cfg, table, limit=sample_limit, order_col=order_col)
    samples: List[Dict[str, Any]] = []
    sample_error: Optional[str] = None
    if ok_sample and isinstance(sample_res, list):
        samples = [redact_row(r) for r in sample_res]
    elif not ok_sample:
        sample_error = str(sample_res)

    smoke_hits = detect_smoke_in_samples(samples)
    smoke_cols = groups.get("smoke_test_debug_columns") or []

    return {
        "table": table,
        "exists": True,
        "row_count": n,
        "column_count": len(cols),
        "columns": cols,
        "sample_order_column": order_col,
        "signal_groups": groups,
        "smoke_test_debug": {
            "columns": smoke_cols,
            "sample_value_hits": smoke_hits,
            "has_signal": bool(smoke_cols or smoke_hits),
        },
        "samples": samples,
        "sample_error": sample_error,
    }


def build_matrix(tables: Sequence[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Roll-up: group → list of tables that have ≥1 matching column."""
    matrix: Dict[str, List[str]] = {g: [] for g in SIGNAL_GROUPS}
    matrix["smoke_test_debug_any"] = []

    for t in tables:
        if not t.get("exists"):
            continue
        name = str(t["table"])
        groups = t.get("signal_groups") or {}
        for g in SIGNAL_GROUPS:
            if groups.get(g):
                matrix[g].append(name)
        st = t.get("smoke_test_debug") or {}
        if st.get("has_signal"):
            matrix["smoke_test_debug_any"].append(name)

    return matrix


def print_report(tables: Sequence[Dict[str, Any]], matrix: Mapping[str, List[str]]) -> None:
    print("=" * 100)
    print("ROUTING-SIGNAL TABLE AUDIT")
    print("=" * 100)

    print("\n── Roll-up: which tables have which signal columns? ──\n")
    labels = {
        "model_key": "model_key / model id",
        "route_key": "route_key",
        "task_type_mode": "task_type / mode",
        "status_success_error": "status / success / error",
        "latency_cost_tokens": "latency / cost / tokens",
        "run_linkage_ids": "workflow_run_id / agent_run_id / execution_id",
        "smoke_test_debug_columns": "smoke/test/debug (column names)",
        "smoke_test_debug_any": "smoke/test/debug (columns OR sample values)",
    }
    for key, label in labels.items():
        names = matrix.get(key) or []
        print(f"  {label}:")
        if names:
            for n in names:
                print(f"    • {n}")
        else:
            print("    (none)")
        print()

    print("── Per-table detail ──\n")
    for t in tables:
        name = t.get("table", "?")
        if not t.get("exists"):
            print(f"## {name}  [MISSING]")
            print(f"   {t.get('error', '')}\n")
            continue

        print(f"## {name}  rows={t.get('row_count')}  cols={t.get('column_count')}")
        groups = t.get("signal_groups") or {}
        for g, matched in groups.items():
            if matched:
                print(f"   {g}: {', '.join(matched)}")
        if t.get("sample_error"):
            print(f"   sample_error: {t['sample_error']}")
        st = t.get("smoke_test_debug") or {}
        if st.get("sample_value_hits"):
            print(f"   smoke sample hits: {st['sample_value_hits'][:5]}")
        print("   columns:", ", ".join(t.get("columns") or [])[:2000])
        if t.get("samples"):
            print("   samples:")
            for i, row in enumerate(t["samples"][:3], 1):
                blob = json.dumps(row, ensure_ascii=False)
                if len(blob) > MAX_JSON_SAMPLE_LEN:
                    blob = blob[: MAX_JSON_SAMPLE_LEN - 3] + "..."
                print(f"     [{i}] {blob}")
        print()


def render_markdown(
    *,
    generated_at: str,
    cfg: AuditConfig,
    tables: Sequence[Dict[str, Any]],
    matrix: Mapping[str, List[str]],
) -> str:
    lines = [
        "# Routing-signal tables audit",
        "",
        f"- **Generated:** {generated_at}",
        f"- **Repo:** `{cfg.root.resolve()}`",
        f"- **D1:** `{cfg.db}` remote={cfg.remote}",
        f"- **Tables inspected:** {len(tables)}",
        "",
        "## Roll-up matrix",
        "",
        "| Signal | Tables |",
        "|--------|--------|",
    ]
    row_labels = [
        ("model_key", "model_key / model id columns"),
        ("route_key", "route_key"),
        ("task_type_mode", "task_type / mode"),
        ("status_success_error", "status / success / error"),
        ("latency_cost_tokens", "latency / cost / tokens"),
        ("run_linkage_ids", "run / execution linkage ids"),
        ("smoke_test_debug_columns", "smoke/test/debug column names"),
        ("smoke_test_debug_any", "smoke/test/debug (cols or samples)"),
    ]
    for key, label in row_labels:
        names = ", ".join(f"`{n}`" for n in (matrix.get(key) or [])) or "—"
        lines.append(f"| {label} | {names} |")
    lines.append("")

    lines.append("## Per-table")
    lines.append("")
    for t in tables:
        name = t.get("table", "?")
        lines.append(f"### `{name}`")
        lines.append("")
        if not t.get("exists"):
            lines.append(f"- **Status:** missing — {t.get('error', '')}")
            lines.append("")
            continue
        lines.append(f"- **Rows:** {t.get('row_count')}")
        lines.append(f"- **Columns ({t.get('column_count')}):** `{'`, `'.join(t.get('columns') or [])}`")
        lines.append("")
        groups = t.get("signal_groups") or {}
        lines.append("**Signal columns:**")
        lines.append("")
        for g in SIGNAL_GROUPS:
            matched = groups.get(g) or []
            if matched:
                lines.append(f"- `{g}`: {', '.join(f'`{c}`' for c in matched)}")
        st = t.get("smoke_test_debug") or {}
        if st.get("sample_value_hits"):
            lines.append(f"- **Sample smoke/test hits:** {st['sample_value_hits']}")
        lines.append("")
        if t.get("samples"):
            lines.append("<details><summary>Sample rows (redacted)</summary>")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(t["samples"], indent=2, ensure_ascii=False)[:12000])
            lines.append("```")
            lines.append("")
            lines.append("</details>")
            lines.append("")
        if t.get("sample_error"):
            lines.append(f"- **Sample error:** `{t['sample_error']}`")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Audit routing-signal D1 tables (schema + samples).")
    add_base_args(p)
    p.add_argument(
        "--sample-limit",
        type=int,
        default=3,
        help="Rows to sample per table (default 3)",
    )
    p.add_argument(
        "--tables",
        default="",
        help="Comma-separated subset; default = built-in routing-signal set",
    )
    p.add_argument(
        "--no-write",
        action="store_true",
        help="Print only; do not write artifacts/",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    cfg = config_from_args(args)

    if args.tables.strip():
        tables_to_scan = [t.strip() for t in args.tables.split(",") if t.strip()]
    else:
        tables_to_scan = list(DEFAULT_TABLES)

    if args.no_d1:
        print("ERROR: --no-d1 not supported for this script (D1-only).", file=sys.stderr)
        return 2

    results: List[Dict[str, Any]] = []
    for table in tables_to_scan:
        results.append(
            inspect_table(cfg, table, sample_limit=max(0, args.sample_limit))
        )

    matrix = build_matrix(results)
    print_report(results, matrix)

    payload = {
        "audit": "routing_signal_tables",
        "generated_at": now_iso(),
        "repo_root": str(cfg.root.resolve()),
        "d1": {"db": cfg.db, "config": cfg.config, "remote": cfg.remote},
        "tables_requested": tables_to_scan,
        "matrix": matrix,
        "tables": results,
    }

    if not args.no_write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        json_path = OUT_DIR / f"audit_{stamp}.json"
        md_path = OUT_DIR / f"audit_{stamp}.md"
        latest_json = OUT_DIR / "LATEST_ROUTING_SIGNAL_TABLES_AUDIT.json"
        latest_md = OUT_DIR / "LATEST_ROUTING_SIGNAL_TABLES_AUDIT.md"

        text = json.dumps(payload, indent=2, ensure_ascii=False)
        md = render_markdown(
            generated_at=payload["generated_at"],
            cfg=cfg,
            tables=results,
            matrix=matrix,
        )
        json_path.write_text(text, encoding="utf-8")
        md_path.write_text(md, encoding="utf-8")
        latest_json.write_text(text, encoding="utf-8")
        latest_md.write_text(md, encoding="utf-8")
        print(f"\nWrote:\n  {latest_md}\n  {latest_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
