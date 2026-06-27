#!/usr/bin/env python3
"""
Verify published CMS pages have R2 keys and sane route paths.

Usage:
  python3 scripts/cms/verify_publish.py --project inneranimalmedia
  python3 scripts/cms/verify_publish.py --page-id 5de91aa0-10cc-46e5-9607-199d5c2f8467
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import run_d1_query  # noqa: E402

KNOWN_APEX = {
    "inneranimalmedia": "inneranimalmedia.com",
    "meauxbility": "meauxbility.org",
    "fuelnfreetime": "fuelnfreetime.com",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify CMS publish metadata")
    parser.add_argument("--project", help="project_slug filter")
    parser.add_argument("--page-id", help="Single page id")
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args()

    clauses = ["status = 'published'", "COALESCE(is_active, 1) = 1"]
    if args.page_id:
        clauses.append(f"id = '{args.page_id.replace(chr(39), chr(39)+chr(39))}'")
    if args.project:
        clauses.append(f"project_slug = '{args.project.replace(chr(39), chr(39)+chr(39))}'")

    rows = run_d1_query(
        f"""
        SELECT p.id, p.project_slug, p.slug, p.route_path, p.r2_key, p.r2_bucket, t.domain
        FROM cms_pages p
        LEFT JOIN cms_tenants t ON t.slug = p.project_slug
        WHERE {' AND '.join(clauses)}
        ORDER BY p.project_slug, p.route_path
        LIMIT 200
        """,
        remote=not args.local,
    )

    if not rows:
        print("No published pages matched.")
        return 0

    failed = 0
    for row in rows:
        page_id = row["id"]
        slug = row.get("project_slug") or ""
        domain = row.get("domain") or KNOWN_APEX.get(slug, f"{slug}.meauxbility.workers.dev")
        route = row.get("route_path") or f"/{row.get('slug') or ''}"
        live = f"https://{domain}{route if str(route).startswith('/') else '/' + str(route)}"
        r2 = row.get("r2_key")
        ok = bool(r2)
        print(f"{'OK' if ok else 'FAIL'}  {page_id}  {live}")
        if r2:
            print(f"      r2://{row.get('r2_bucket') or 'inneranimalmedia'}/{r2}")
        else:
            failed += 1
            print("      missing r2_key — live render will fail or fall back")

    if failed:
        print(f"\n{failed} published page(s) missing R2 artifacts.")
        return 1
    print(f"\nAll {len(rows)} published page(s) have R2 keys.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
