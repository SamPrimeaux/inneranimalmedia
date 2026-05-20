#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Any

DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"

TS_CANDIDATES = [
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
    "ended_at",
    "finished_at",
    "timestamp",
    "ts",
    "time",
    "run_at",
    "last_seen_at",
    "last_used_at",
    "last_run_at",
    "inserted_at",
]


@dataclass
class TableSummary:
    table: str
    rows: int | None
    cols: int | None
    ts_col: str | None
    latest: str | None
    status: str
    error: str | None = None


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, text=True, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "").strip())
    return p.stdout


def wrangler_base(args: argparse.Namespace) -> list[str]:
    if not shutil.which("npx"):
        raise SystemExit("ERROR: npx not found.")

    cmd = ["npx", "wrangler", "d1", "execute", args.db]

    if not args.local:
        cmd.append("--remote")

    if args.config:
        cmd += ["-c", args.config]

    return cmd


def d1_json(args: argparse.Namespace, sql: str) -> list[dict[str, Any]]:
    cmd = wrangler_base(args) + ["--json", "--command", sql]
    raw = run(cmd)
    data = json.loads(raw)

    if isinstance(data, list):
        if data and isinstance(data[0], dict) and "results" in data[0]:
            return data[0].get("results") or []
        return data

    if isinstance(data, dict):
        if "result" in data and isinstance(data["result"], list):
            result = data["result"]
            if result and isinstance(result[0], dict) and "results" in result[0]:
                return result[0].get("results") or []
            return result
        if "results" in data:
            return data.get("results") or []

    return []


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_agentsam_tables(args: argparse.Namespace) -> list[str]:
    rows = d1_json(
        args,
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name LIKE 'agentsam_%'
        ORDER BY name;
        """,
    )
    return [r["name"] for r in rows if r.get("name")]


def get_columns(args: argparse.Namespace, table: str) -> list[str]:
    rows = d1_json(args, f"PRAGMA table_info({quote_ident(table)});")
    return [r["name"] for r in rows if r.get("name")]


def get_count(args: argparse.Namespace, table: str) -> int:
    rows = d1_json(args, f"SELECT COUNT(*) AS n FROM {quote_ident(table)};")
    return int(rows[0]["n"]) if rows else 0


def pick_ts_col(cols: list[str]) -> str | None:
    lowered = {c.lower(): c for c in cols}
    for candidate in TS_CANDIDATES:
        if candidate in lowered:
            return lowered[candidate]
    for c in cols:
        lc = c.lower()
        if lc.endswith("_at") or "timestamp" in lc:
            return c
    return None


def get_latest(args: argparse.Namespace, table: str, ts_col: str | None) -> str | None:
    if not ts_col:
        return None

    rows = d1_json(
        args,
        f"""
        SELECT MAX({quote_ident(ts_col)}) AS latest
        FROM {quote_ident(table)}
        WHERE {quote_ident(ts_col)} IS NOT NULL;
        """,
    )

    if not rows:
        return None

    val = rows[0].get("latest")
    return str(val) if val is not None else None


def classify(rows: int | None, ts_col: str | None, latest: str | None) -> str:
    if rows is None:
        return "ERROR"
    if rows == 0:
        return "EMPTY"
    if not ts_col:
        return "NO_TS"
    if not latest:
        return "NO_LATEST"
    return "ACTIVE_OR_HISTORIC"


def summarize(args: argparse.Namespace, table: str) -> TableSummary:
    try:
        cols = get_columns(args, table)
        row_count = get_count(args, table)
        ts_col = pick_ts_col(cols)
        latest = get_latest(args, table, ts_col)
        status = classify(row_count, ts_col, latest)

        return TableSummary(
            table=table,
            rows=row_count,
            cols=len(cols),
            ts_col=ts_col,
            latest=latest,
            status=status,
        )
    except Exception as e:
        return TableSummary(
            table=table,
            rows=None,
            cols=None,
            ts_col=None,
            latest=None,
            status="ERROR",
            error=str(e),
        )


def print_table(summaries: list[TableSummary]) -> None:
    print()
    print(f"agentsam_* table inventory — {len(summaries)} tables")
    print("=" * 118)
    print(f"{'TABLE':55} {'ROWS':>10} {'COLS':>5} {'TS_COL':18} {'LATEST':25} {'STATUS'}")
    print("-" * 118)

    for s in summaries:
        rows = f"{s.rows:,}" if isinstance(s.rows, int) else "-"
        cols = str(s.cols) if isinstance(s.cols, int) else "-"
        ts = s.ts_col or "-"
        latest = s.latest or "-"
        print(f"{s.table:55} {rows:>10} {cols:>5} {ts:18} {latest:25} {s.status}")

    print("-" * 118)

    total_rows = sum(s.rows or 0 for s in summaries)
    empty = sum(1 for s in summaries if s.status == "EMPTY")
    no_ts = sum(1 for s in summaries if s.status == "NO_TS")
    errors = sum(1 for s in summaries if s.status == "ERROR")

    print(f"Total tables : {len(summaries):,}")
    print(f"Total rows   : {total_rows:,}")
    print(f"Empty tables : {empty:,}")
    print(f"No timestamp : {no_ts:,}")
    print(f"Errors       : {errors:,}")

    if errors:
        print()
        print("Errors:")
        for s in summaries:
            if s.error:
                print(f"- {s.table}: {s.error}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    tables = get_agentsam_tables(args)
    summaries = [summarize(args, table) for table in tables]

    if args.json:
        print(json.dumps([asdict(s) for s in summaries], indent=2))
    else:
        print_table(summaries)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
