#!/usr/bin/env python3
"""
index-codebase-live.py — smoke-describe AGENTSAMVECTORIZE, then embed priority codebase snapshot.

Run before any large indexing job:
  python3 scripts/index-codebase-live.py
  python3 scripts/index-codebase-live.py --dry-run
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--describe-only", action="store_true")
    args = parser.parse_args()

    embed_script = _REPO / "scripts" / "embed-codebase.py"
    cmd = [sys.executable, str(embed_script)]
    if args.describe_only:
        cmd.append("--describe-only")
    elif args.dry_run:
        cmd.append("--dry-run")
        cmd.append("--priority-snapshot")
    else:
        cmd.append("--priority-snapshot")

    print("▶ index-codebase-live: AGENTSAMVECTORIZE smoke + priority snapshot embed\n")
    proc = subprocess.run(cmd, cwd=str(_REPO))
    raise SystemExit(proc.returncode)


if __name__ == "__main__":
    main()
