#!/usr/bin/env python3
"""
profiler.py — Phase 1 data quality profiler (pandas/numpy).

For each target table: row count, per-column null rate, uniqueness,
lightweight type conformance, optional FK orphan counts.

Writes ONLY to agentsam_data_quality_snapshots on the platform lane.
Never mutates profiled production tables.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from d1_client import (
    D1Error,
    execute_d1,
    list_active_apps_with_d1,
    platform_database_id,
    query_d1,
    resolve_app_database_id,
    resolve_database_id_by_name,
)

# First-pass tables: platform control plane + high-signal app tables.
# Expand via --tables or PROFILE_TABLES later — keep Phase 1 intentional.
DEFAULT_PLATFORM_TABLES = [
    "client_apps",
    "clients",
    "agentsam_routing_arms",
    "agentsam_tickets",
    "agentsam_agent_run",
    "agentsam_tool_call_log",
]

# Per-app extras (app_key → tables). Empty = schema sample only when --discover.
DEFAULT_APP_TABLES: dict[str, list[str]] = {
    "companionscpas": [],  # discover via --discover if empty
    "fuelnfreetime": [],
}

# Known FK checks: (table, column, ref_table, ref_column) — platform lane only for v1.
FK_CHECKS: list[tuple[str, str, str, str]] = [
    ("client_apps", "client_id", "clients", "id"),
]

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe_ident(name: str) -> str:
    if not _IDENT.match(name or ""):
        raise ValueError(f"unsafe_identifier:{name!r}")
    return name


def _new_id(prefix: str = "dqs") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def list_tables(database_id: str) -> list[str]:
    df = query_d1(
        database_id,
        """
        SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE '_cf_%'
         ORDER BY name
        """,
    )
    if df.empty:
        return []
    return [str(n) for n in df["name"].tolist()]


def table_info(database_id: str, table: str) -> pd.DataFrame:
    t = _safe_ident(table)
    return query_d1(database_id, f"PRAGMA table_info({t})")


def sample_table(database_id: str, table: str, limit: int = 5000) -> pd.DataFrame:
    t = _safe_ident(table)
    lim = max(1, min(int(limit), 50000))
    return query_d1(database_id, f"SELECT * FROM {t} LIMIT {lim}")


def count_rows(database_id: str, table: str) -> int:
    t = _safe_ident(table)
    df = query_d1(database_id, f"SELECT COUNT(*) AS n FROM {t}")
    if df.empty:
        return 0
    return int(df.iloc[0]["n"] or 0)


def infer_type_conformance(series: pd.Series, declared: str | None) -> float:
    """
    Fraction of non-null values that look compatible with declared SQLite affinity.
    1.0 = all ok / unknown affinity; lower = drift.
    """
    s = series.dropna()
    if s.empty:
        return 1.0
    decl = (declared or "").upper()
    vals = s.astype(str)

    if "INT" in decl:
        ok = vals.str.match(r"^-?\d+$", na=False)
        return float(ok.mean())
    if any(x in decl for x in ("REAL", "FLOA", "DOUB", "NUM")):
        coerced = pd.to_numeric(vals, errors="coerce")
        return float(coerced.notna().mean())
    # TEXT / BLOB / anything else — always conforming
    return 1.0


def profile_table(
    *,
    database_id: str,
    app_key: str,
    database_name: str | None,
    table: str,
    run_id: str,
    sample_limit: int = 5000,
) -> list[dict[str, Any]]:
    rows_out: list[dict[str, Any]] = []
    n = count_rows(database_id, table)
    rows_out.append(
        {
            "id": _new_id(),
            "run_id": run_id,
            "app_key": app_key,
            "database_name": database_name,
            "database_id": database_id,
            "table_name": table,
            "column_name": "*",
            "metric": "row_count",
            "metric_value": float(n),
            "metric_detail": None,
            "row_count": n,
        }
    )

    info = table_info(database_id, table)
    if info.empty:
        return rows_out

    sample = sample_table(database_id, table, limit=sample_limit) if n else pd.DataFrame()
    col_types = {
        str(r["name"]): str(r.get("type") or "")
        for _, r in info.iterrows()
        if r.get("name") is not None
    }

    for col, declared in col_types.items():
        if col not in sample.columns:
            # empty table or column only in pragma
            series = pd.Series(dtype=object)
        else:
            series = sample[col]

        null_rate = 1.0 if len(series) == 0 and n == 0 else float(series.isna().mean()) if len(series) else 0.0
        if n > 0 and len(series) == 0:
            null_rate = None  # couldn't sample

        nunique = int(series.nunique(dropna=True)) if len(series) else 0
        uniqueness = float(nunique / len(series)) if len(series) else None
        type_conf = infer_type_conformance(series, declared) if len(series) else 1.0

        for metric, value, detail in [
            ("null_rate", null_rate, json.dumps({"declared_type": declared, "sample_n": len(series)})),
            (
                "uniqueness",
                uniqueness,
                json.dumps({"nunique": nunique, "sample_n": len(series), "approx": n > sample_limit}),
            ),
            (
                "type_conformance",
                type_conf,
                json.dumps({"declared_type": declared, "sample_n": len(series)}),
            ),
        ]:
            if value is None:
                continue
            rows_out.append(
                {
                    "id": _new_id(),
                    "run_id": run_id,
                    "app_key": app_key,
                    "database_name": database_name,
                    "database_id": database_id,
                    "table_name": table,
                    "column_name": col,
                    "metric": metric,
                    "metric_value": float(value),
                    "metric_detail": detail,
                    "row_count": n,
                }
            )

    return rows_out


def profile_fk_orphans(
    *,
    database_id: str,
    app_key: str,
    database_name: str | None,
    run_id: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for table, col, ref_table, ref_col in FK_CHECKS:
        try:
            t = _safe_ident(table)
            c = _safe_ident(col)
            rt = _safe_ident(ref_table)
            rc = _safe_ident(ref_col)
            df = query_d1(
                database_id,
                f"""
                SELECT COUNT(*) AS n
                  FROM {t} child
                 WHERE child.{c} IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM {rt} parent WHERE parent.{rc} = child.{c}
                   )
                """,
            )
            orphan_n = int(df.iloc[0]["n"] or 0) if not df.empty else 0
            out.append(
                {
                    "id": _new_id(),
                    "run_id": run_id,
                    "app_key": app_key,
                    "database_name": database_name,
                    "database_id": database_id,
                    "table_name": table,
                    "column_name": col,
                    "metric": "fk_orphan_count",
                    "metric_value": float(orphan_n),
                    "metric_detail": json.dumps({"ref": f"{ref_table}.{ref_col}"}),
                    "row_count": None,
                }
            )
        except Exception as e:  # noqa: BLE001 — never fail the whole run on one FK
            print(f"[profiler] fk_check_skip {table}.{col}: {e}", file=sys.stderr)
    return out


def write_snapshots(platform_db_id: str, rows: list[dict[str, Any]]) -> int:
    """Append-only writes. Batches of 25 to stay under D1 HTTP limits."""
    if not rows:
        return 0
    sql = """
    INSERT INTO agentsam_data_quality_snapshots (
      id, run_id, app_key, database_name, database_id,
      table_name, column_name, metric, metric_value, metric_detail, row_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    now = int(time.time())
    written = 0
    batch_size = 25
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        # D1 HTTP accepts one statement per request with params; loop is fine for v1.
        for row in chunk:
            execute_d1(
                platform_db_id,
                sql,
                [
                    row["id"],
                    row["run_id"],
                    row["app_key"],
                    row.get("database_name"),
                    row["database_id"],
                    row["table_name"],
                    row["column_name"],
                    row["metric"],
                    row.get("metric_value"),
                    row.get("metric_detail"),
                    row.get("row_count"),
                    now,
                ],
            )
            written += 1
    return written


def ensure_snapshot_table(platform_db_id: str) -> None:
    """Idempotent CREATE — safe if migration already applied."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS agentsam_data_quality_snapshots (
          id              TEXT PRIMARY KEY,
          run_id          TEXT NOT NULL,
          app_key         TEXT NOT NULL,
          database_name   TEXT,
          database_id     TEXT NOT NULL,
          table_name      TEXT NOT NULL,
          column_name     TEXT NOT NULL,
          metric          TEXT NOT NULL,
          metric_value    REAL,
          metric_detail   TEXT,
          row_count       INTEGER,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_dq_snap_run
          ON agentsam_data_quality_snapshots (run_id)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_dq_snap_table_metric
          ON agentsam_data_quality_snapshots (app_key, table_name, column_name, metric, created_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_dq_snap_created
          ON agentsam_data_quality_snapshots (created_at)
        """,
    ]
    for stmt in stmts:
        execute_d1(platform_db_id, stmt)


def run_profile(
    *,
    app_keys: list[str] | None,
    tables: list[str] | None,
    discover: bool,
    sample_limit: int,
    dry_run: bool,
) -> str:
    run_id = f"run_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:8]}"
    platform_db = platform_database_id()
    print(f"[profiler] run_id={run_id} platform_db={platform_db}")

    if not dry_run:
        ensure_snapshot_table(platform_db)

    targets: list[tuple[str, str, str | None, list[str]]] = []
    # (app_key, database_id, database_name, tables)

    # Always profile platform lane
    platform_tables = tables or DEFAULT_PLATFORM_TABLES
    if discover:
        platform_tables = list_tables(platform_db)[:40]  # cap for safety
    targets.append(("inneranimalmedia", platform_db, "inneranimalmedia-business", platform_tables))

    apps = list_active_apps_with_d1(platform_db_id=platform_db)
    for app in apps:
        key = app["app_key"]
        if key == "inneranimalmedia":
            continue
        if app_keys and key not in app_keys:
            continue
        if not app_keys and key not in DEFAULT_APP_TABLES and not discover:
            # default: only companions + fuel when not discovering everything
            if key not in ("companionscpas", "fuelnfreetime"):
                continue
        try:
            db_id = resolve_app_database_id(key, platform_db_id=platform_db)
        except D1Error as e:
            print(f"[profiler] skip_app {key}: {e}", file=sys.stderr)
            continue
        db_name = None
        for d in app.get("d1_databases") or []:
            if d.get("database_id") == db_id:
                db_name = d.get("database_name")
                break
        app_tables = tables or DEFAULT_APP_TABLES.get(key) or []
        if discover or not app_tables:
            try:
                app_tables = list_tables(db_id)[:25]
            except D1Error as e:
                print(f"[profiler] list_tables_fail {key}: {e}", file=sys.stderr)
                continue
        targets.append((key, db_id, db_name, app_tables))

    all_rows: list[dict[str, Any]] = []
    for app_key, db_id, db_name, tbls in targets:
        print(f"[profiler] app={app_key} tables={len(tbls)}")
        for table in tbls:
            try:
                all_rows.extend(
                    profile_table(
                        database_id=db_id,
                        app_key=app_key,
                        database_name=db_name,
                        table=table,
                        run_id=run_id,
                        sample_limit=sample_limit,
                    )
                )
            except Exception as e:  # noqa: BLE001
                print(f"[profiler] table_fail {app_key}.{table}: {e}", file=sys.stderr)

        if app_key == "inneranimalmedia":
            all_rows.extend(
                profile_fk_orphans(
                    database_id=db_id,
                    app_key=app_key,
                    database_name=db_name,
                    run_id=run_id,
                )
            )

    print(f"[profiler] metrics={len(all_rows)}")
    if dry_run:
        # summarize without write
        if all_rows:
            df = pd.DataFrame(all_rows)
            print(df.groupby(["app_key", "metric"]).size().to_string())
        return run_id

    written = write_snapshots(platform_db, all_rows)
    print(f"[profiler] written={written} run_id={run_id}")
    return run_id


def main() -> int:
    p = argparse.ArgumentParser(description="IAM D1 data quality profiler (Phase 1)")
    p.add_argument("--apps", help="Comma-separated app_keys (default: platform + companions + fuel)")
    p.add_argument("--tables", help="Comma-separated table names (overrides defaults)")
    p.add_argument("--discover", action="store_true", help="Profile first N tables found via sqlite_master")
    p.add_argument("--sample-limit", type=int, default=5000)
    p.add_argument("--dry-run", action="store_true", help="Compute metrics, do not write snapshots")
    args = p.parse_args()

    app_keys = [a.strip() for a in (args.apps or "").split(",") if a.strip()] or None
    tables = [t.strip() for t in (args.tables or "").split(",") if t.strip()] or None

    try:
        run_profile(
            app_keys=app_keys,
            tables=tables,
            discover=args.discover,
            sample_limit=args.sample_limit,
            dry_run=args.dry_run,
        )
    except D1Error as e:
        print(f"[profiler] fatal: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    # silence unused numpy import warning in some linters — used by pandas internally
    _ = np
    raise SystemExit(main())
