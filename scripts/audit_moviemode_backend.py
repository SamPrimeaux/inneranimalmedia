#!/usr/bin/env python3
"""Verify MovieMode D1 tables and API surface exist."""
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

TABLES = [
    "media_assets",
    "media_scenes",
    "moviemode_projects",
    "moviemode_timelines",
    "moviemode_render_jobs",
    "moviemode_exports",
]

API_MARKERS = [
    REPO / "src/api/moviemode-api.js",
    REPO / "src/api/r2-api.js",
    REPO / "dashboard/src/lib/fileKind.ts",
    REPO / "dashboard/src/components/FilePreview.tsx",
    REPO / "migrations/341_moviemode_media_backend.sql",
]


def main() -> int:
    mig = (REPO / "migrations/341_moviemode_media_backend.sql").read_text()
    missing = [t for t in TABLES if f"CREATE TABLE IF NOT EXISTS {t}" not in mig]
    if missing:
        print("FAIL migration missing tables:", missing)
        return 1
    for p in API_MARKERS:
        if not p.is_file():
            print("FAIL missing file", p)
            return 1
    print("OK migration defines", len(TABLES), "tables")
    print("OK API / dashboard files present")
    print("Run remote D1 apply + smoke_r2_media_and_multipart.mjs against staging/prod with auth cookie.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
