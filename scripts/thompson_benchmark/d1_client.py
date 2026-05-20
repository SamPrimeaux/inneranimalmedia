#!/usr/bin/env python3
"""Thin D1 client for Thompson benchmark seeding (remote production DB)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, List, Mapping, Optional, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"


def _wrangler_base(remote: bool = True) -> List[str]:
    cmd: List[str] = []
    wrapper = REPO_ROOT / "scripts" / "with-cloudflare-env.sh"
    if wrapper.is_file():
        cmd.append(str(wrapper))
    cmd.extend(["npx", "wrangler", "d1", "execute", DEFAULT_DB])
    if remote:
        cmd.append("--remote")
    cmd.extend(["-c", DEFAULT_CONFIG, "--json"])
    return cmd


def query(sql: str, params: Optional[Sequence[Any]] = None) -> List[Mapping[str, Any]]:
    """
    Run a parameterized SELECT (or INSERT) against remote D1.
    Params use SQLite ? placeholders only.
    """
    bound = _bind_sql(sql, params or ())
    cmd = _wrangler_base(remote=True) + ["--command", bound]
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"D1 query failed (exit {proc.returncode}):\n{proc.stderr[-2000:]}\nSQL: {bound[:500]}"
        )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"D1 JSON parse failed: {exc}\nstdout={proc.stdout[:500]}") from exc

    if isinstance(payload, list) and payload:
        block = payload[0]
        if not block.get("success", True):
            raise RuntimeError(f"D1 error: {block}")
        return list(block.get("results") or [])
    return []


def _bind_sql(sql: str, params: Sequence[Any]) -> str:
    """Inline ? placeholders for wrangler --command (no native param API)."""
    if not params:
        return sql.strip()
    out: List[str] = []
    parts = sql.split("?")
    if len(parts) != len(params) + 1:
        raise ValueError(f"Expected {len(params)} placeholders, found {len(parts) - 1} in SQL")
    for i, part in enumerate(parts[:-1]):
        out.append(part)
        out.append(_sql_literal(params[i]))
    out.append(parts[-1])
    return "".join(out).strip()


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("'", "''")
    return f"'{s}'"


def table_columns(table: str) -> List[str]:
    rows = query(f"PRAGMA table_info({table});")
    return [str(r["name"]) for r in rows if r.get("name")]
