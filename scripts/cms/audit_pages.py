#!/usr/bin/env python3
"""
Audit cms_pages in D1 — find missing domains, R2 keys, orphaned drafts.

Usage:
  python3 scripts/cms/audit_pages.py
  python3 scripts/cms/audit_pages.py --project meauxbility
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import print_table, run_d1_query  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit CMS pages in platform D1")
    parser.add_argument("--project", help="Filter by project_slug")
    parser.add_argument("--local", action="store_true", help="Use local D1 instead of remote")
    args = parser.parse_args()

    where = "status != 'archived'"
    if args.project:
        where += f" AND project_slug = '{args.project.replace(chr(39), chr(39)+chr(39))}'"

    rows = run_d1_query(
        f"""
        SELECT id, project_slug, slug, route_path, title, status, r2_key, published_at, updated_at
        FROM cms_pages
        WHERE {where}
        ORDER BY project_slug, sort_order, route_path
        LIMIT 500
        """,
        remote=not args.local,
    )

    print(f"\n=== CMS pages ({len(rows)} rows) ===\n")
    print_table(
        rows,
        ["project_slug", "slug", "route_path", "status", "r2_key", "title"],
    )

    issues = []
    for row in rows:
        pid = row.get("id")
        status = str(row.get("status") or "").lower()
        r2 = row.get("r2_key")
        if status == "published" and not r2:
            issues.append((pid, "published_without_r2_key"))
        if status == "draft" and r2:
            issues.append((pid, "draft_has_published_r2_key"))

    if issues:
        print(f"\n=== Issues ({len(issues)}) ===")
        for page_id, kind in issues:
            print(f"  {page_id}: {kind}")
        return 1

    print("\nNo structural issues detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
