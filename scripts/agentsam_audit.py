#!/usr/bin/env python3
"""
agentsam_audit.py
-----------------
Audits all agentsam_* D1 tables vs live codebase usage.
Produces a gap analysis: what exists, what's empty, what's referenced,
what's orphaned, and per-table health verdicts.

Usage:
    python3 agentsam_audit.py

Requires:
    - wrangler CLI authenticated
    - Run from repo root: /Users/samprimeaux/inneranimalmedia
"""

import subprocess
import json
import sys
import os
from pathlib import Path
from collections import defaultdict

# ── Config ───────────────────────────────────────────────────────────────────
DB_NAME   = "inneranimalmedia-business"
REPO_ROOT = Path("/Users/samprimeaux/inneranimalmedia")
SCAN_DIRS = ["worker.js", "src/", "dashboard/"]  # relative to REPO_ROOT
GREP_EXTS = {".js", ".ts", ".tsx", ".jsx", ".py", ".json", ".toml", ".jsonc"}

# Tables we know need special attention — gets flagged in report
WATCH_LIST = {
    "agentsam_prompt_versions":    "suspected placeholder/junk data — needs real versioning",
    "agentsam_prompt_routes":      "severely underutilized — routing is functionally broken",
    "agentsam_prompt_cache_keys":  "nonexistent or empty — prompt caching not implemented",
    "agentsam_subagent_profile":   "underutilized — needs subagent_python_primeaux + richer profiles",
    "agentsam_workflows":          "high potential — needs trigger/condition refinement to be agentic workforce",
    "agentsam_routing_arms":       "Thompson Sampling arms — verify tied to live classifyIntent()",
    "agentsam_model_routing_rules":"performance fields likely all null — routing dead",
    "agentsam_eval_runs":          "no promotion threshold defined — evals are dashboards not gates",
}

# ── Helpers ──────────────────────────────────────────────────────────────────
def run_d1(sql: str) -> list[dict]:
    """Execute SQL against remote D1, return rows as list of dicts."""
    cmd = [
        "wrangler", "d1", "execute", DB_NAME,
        "--remote",
        "--json",
        "--command", sql
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return [{"__error__": result.stderr.strip()}]
        data = json.loads(result.stdout)
        # wrangler returns array of result sets
        if isinstance(data, list) and data:
            return data[0].get("results", [])
        return []
    except subprocess.TimeoutExpired:
        return [{"__error__": "timeout"}]
    except json.JSONDecodeError as e:
        return [{"__error__": f"JSON parse: {e}"}]


def grep_codebase(term: str) -> list[str]:
    """Return list of 'file:line' matches for term across scanned paths."""
    hits = []
    for target in SCAN_DIRS:
        full = REPO_ROOT / target
        if not full.exists():
            continue
        if full.is_file():
            files = [full]
        else:
            files = [
                p for p in full.rglob("*")
                if p.is_file() and p.suffix in GREP_EXTS
            ]
        for f in files:
            try:
                for i, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
                    if term in line:
                        rel = str(f.relative_to(REPO_ROOT))
                        hits.append(f"{rel}:{i}")
            except Exception:
                pass
    return hits


def get_schema(table: str) -> list[dict]:
    return run_d1(f"PRAGMA table_info({table});")


def get_row_count(table: str) -> int:
    rows = run_d1(f"SELECT COUNT(*) as n FROM {table};")
    if rows and "__error__" not in rows[0]:
        return rows[0].get("n", 0)
    return -1


def sample_rows(table: str, n: int = 3) -> list[dict]:
    return run_d1(f"SELECT * FROM {table} LIMIT {n};")


# ── Main audit ───────────────────────────────────────────────────────────────
def main():
    print("=" * 72)
    print("  AGENT SAM — agentsam_* TABLE AUDIT")
    print("=" * 72)
    print(f"  DB    : {DB_NAME} (remote)")
    print(f"  Root  : {REPO_ROOT}")
    print()

    # 1. Enumerate all agentsam_* tables
    print("[ 1/4 ] Enumerating agentsam_* tables from D1...")
    table_rows = run_d1(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name;"
    )
    if not table_rows or "__error__" in table_rows[0]:
        print(f"  ERROR: {table_rows}")
        sys.exit(1)

    tables = [r["name"] for r in table_rows]
    print(f"  Found {len(tables)} tables.\n")

    # 2. Per-table: row count + schema + grep
    print("[ 2/4 ] Scanning each table (row counts, schema, codebase refs)...")
    audit = {}
    for tbl in tables:
        row_count = get_row_count(tbl)
        schema    = get_schema(tbl)
        cols      = [c["name"] for c in schema if "__error__" not in c]
        refs      = grep_codebase(tbl)
        sample    = sample_rows(tbl, 3) if row_count > 0 else []
        audit[tbl] = {
            "row_count": row_count,
            "columns":   cols,
            "col_count": len(cols),
            "refs":      refs,
            "ref_count": len(refs),
            "sample":    sample,
        }
        status = "OK" if row_count > 0 and refs else ("EMPTY" if row_count == 0 else "ORPHAN")
        print(f"  {tbl:<45} rows={row_count:>4}  refs={len(refs):>3}  [{status}]")

    # 3. Tables in watch list missing from D1
    print()
    print("[ 3/4 ] Cross-checking WATCH_LIST against discovered tables...")
    missing_watch = [t for t in WATCH_LIST if t not in audit]
    if missing_watch:
        for t in missing_watch:
            print(f"  MISSING FROM D1: {t}")
            print(f"    Note: {WATCH_LIST[t]}")
    else:
        print("  All watch-list tables present in D1.")

    # 4. Full report
    print()
    print("=" * 72)
    print("  DETAILED REPORT")
    print("=" * 72)

    categories = {
        "DEAD  (empty + no refs)":       [],
        "ORPHAN (has data, no refs)":    [],
        "GHOST  (has refs, no data)":    [],
        "LIVE   (data + refs)":          [],
        "PARTIAL (refs only, no data)":  [],
    }

    for tbl, info in sorted(audit.items()):
        has_data = info["row_count"] > 0
        has_refs = info["ref_count"] > 0
        if has_data and has_refs:
            categories["LIVE   (data + refs)"].append(tbl)
        elif has_data and not has_refs:
            categories["ORPHAN (has data, no refs)"].append(tbl)
        elif not has_data and has_refs:
            categories["GHOST  (has refs, no data)"].append(tbl)
        else:
            categories["DEAD  (empty + no refs)"].append(tbl)

    for cat, tbls in categories.items():
        if not tbls:
            continue
        print(f"\n  ── {cat} ({'─' * (50 - len(cat))})")
        for tbl in tbls:
            info = audit[tbl]
            print(f"\n    {tbl}")
            print(f"      Rows  : {info['row_count']}")
            print(f"      Cols  : {info['col_count']}  {info['columns']}")
            if info["refs"]:
                # Show first 5 refs
                for r in info["refs"][:5]:
                    print(f"      ref   : {r}")
                if len(info["refs"]) > 5:
                    print(f"      ...and {len(info['refs']) - 5} more refs")
            if tbl in WATCH_LIST:
                print(f"      WATCH : {WATCH_LIST[tbl]}")
            if info["sample"]:
                print(f"      Sample row keys: {list(info['sample'][0].keys())}")

    # 5. Priority action list
    print()
    print("=" * 72)
    print("  PRIORITY ACTION LIST")
    print("=" * 72)

    dead   = categories["DEAD  (empty + no refs)"]
    orphan = categories["ORPHAN (has data, no refs)"]
    ghost  = categories["GHOST  (has refs, no data)"]

    priority = 1
    if ghost:
        print(f"\n  P{priority}. GHOST tables — code references tables that have no data:")
        for t in ghost:
            print(f"     - {t}")
            if t in WATCH_LIST:
                print(f"       {WATCH_LIST[t]}")
        priority += 1

    if orphan:
        print(f"\n  P{priority}. ORPHAN tables — data exists but nothing in codebase reads it:")
        for t in orphan:
            print(f"     - {t}")
            if t in WATCH_LIST:
                print(f"       {WATCH_LIST[t]}")
        priority += 1

    if dead:
        print(f"\n  P{priority}. DEAD tables — empty AND unreferenced (schema only):")
        for t in dead:
            print(f"     - {t}")
        priority += 1

    # Specific known improvements
    print(f"\n  P{priority}. HIGH-VALUE STRUCTURAL FIXES (from watch list):")
    for tbl, note in WATCH_LIST.items():
        if tbl in audit:
            info = audit[tbl]
            verdict = "LIVE" if info["row_count"] > 0 and info["ref_count"] > 0 else \
                      "ORPHAN" if info["row_count"] > 0 else \
                      "GHOST" if info["ref_count"] > 0 else "DEAD"
            print(f"     [{verdict}] {tbl}")
            print(f"            {note}")
        else:
            print(f"     [MISSING] {tbl}")
            print(f"            {note}")

    print()
    print("=" * 72)
    print("  QUICK STATS")
    print("=" * 72)
    total = len(tables)
    live_n  = len(categories["LIVE   (data + refs)"])
    dead_n  = len(dead)
    orp_n   = len(orphan)
    ghost_n = len(ghost)
    print(f"  Total agentsam_* tables : {total}")
    print(f"  LIVE  (healthy)         : {live_n}  ({100*live_n//total if total else 0}%)")
    print(f"  ORPHAN (data, no ref)   : {orp_n}  ({100*orp_n//total if total else 0}%)")
    print(f"  GHOST  (ref, no data)   : {ghost_n}  ({100*ghost_n//total if total else 0}%)")
    print(f"  DEAD   (empty+no ref)   : {dead_n}  ({100*dead_n//total if total else 0}%)")
    print()
    print("  Run complete. Fix GHOSTs first, then ORPHANs, then DEADs.")
    print("=" * 72)


if __name__ == "__main__":
    main()
