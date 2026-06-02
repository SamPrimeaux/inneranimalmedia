#!/usr/bin/env python3
"""Rewrite evidence JSON screenshotPath values to inneranimalmedia/reports/ R2 keys."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

STAGE = Path(os.environ.get("QUALITY_REPORT_STAGE_DIR", "quality-report"))
DATE = os.environ.get("REPORT_DATE", "")
TIME = os.environ.get("REPORT_TIME", "")
BUCKET = os.environ.get("R2_BUCKET", "inneranimalmedia")
RUN_PREFIX = os.environ.get(
    "QUALITY_REPORT_R2_PREFIX",
    f"reports/quality-report/{DATE}/{TIME}" if DATE and TIME else "",
)


def main() -> int:
    if not RUN_PREFIX:
        print("rewrite-quality-evidence-paths: REPORT_DATE and REPORT_TIME required", file=sys.stderr)
        return 1

    evidence_dir = STAGE / "evidence"
    if not evidence_dir.is_dir():
        return 0

    for path in evidence_dir.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue

        slug = path.stem
        r2_shot = f"{RUN_PREFIX}/screenshots/{slug}.png"
        data["screenshotPath"] = r2_shot
        data["r2_bucket"] = BUCKET
        data["r2_key"] = r2_shot
        data["r2_reports_prefix"] = RUN_PREFIX

        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"  evidence {path.name} → {r2_shot}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
