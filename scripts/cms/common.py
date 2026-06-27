#!/usr/bin/env python3
"""Shared helpers for CMS maintenance scripts (D1 via wrangler)."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_D1 = os.environ.get("IAM_D1_DB", "inneranimalmedia-business")


def run_d1_query(sql: str, *, db: str = DEFAULT_D1, remote: bool = True) -> list[dict[str, Any]]:
    flag = "--remote" if remote else "--local"
    env = os.environ.copy()
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        db,
        flag,
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "d1 execute failed")
    raw = proc.stdout.strip()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse wrangler output: {raw[:400]}") from exc
    if isinstance(payload, list) and payload:
        results = payload[0].get("results", [])
        return results if isinstance(results, list) else []
    if isinstance(payload, dict):
        results = payload.get("results", [])
        return results if isinstance(results, list) else []
    return []


def print_table(rows: list[dict[str, Any]], columns: list[str]) -> None:
    if not rows:
        print("(no rows)")
        return
    widths = {c: max(len(c), *(len(str(r.get(c, ""))) for r in rows)) for c in columns}
    header = " | ".join(c.ljust(widths[c]) for c in columns)
    print(header)
    print("-+-".join("-" * widths[c] for c in columns))
    for row in rows:
        print(" | ".join(str(row.get(c, "")).ljust(widths[c]) for c in columns))
