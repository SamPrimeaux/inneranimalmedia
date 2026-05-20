#!/usr/bin/env python3
"""
SYNTHETIC Thompson seeder — catalog-sampled cost/latency, NOT real API calls.

For REAL token metrics and Thompson training data use:
  python3 scripts/thompson_benchmark/live_runner.py

Usage (repo root):
  python3 scripts/thompson_benchmark/seed.py --dry-run
  python3 scripts/thompson_benchmark/seed.py --scenario gpt54nano_chat_agent
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_builder import thompson_run
from scenarios import SCENARIOS, SCENARIOS_BY_NAME


def main() -> int:
    parser = argparse.ArgumentParser(
        description="SYNTHETIC Thompson seeder — use live_runner.py for real metrics"
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate scenarios only")
    parser.add_argument("--scenario", action="append", dest="scenarios", metavar="NAME")
    parser.add_argument("--user", help="Override auth_users ref (email / au_* / user_key)")
    parser.add_argument("--list", action="store_true", help="List scenario names and exit")
    parser.add_argument(
        "--all-models",
        action="store_true",
        help="Synthetic matrix audit only — use: python3 scripts/thompson_benchmark/live_runner.py",
    )
    parser.add_argument(
        "--audit-only",
        action="store_true",
        help="With --all-models: probe only, no writes",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="With --all-models: keep going after a seed failure",
    )
    args = parser.parse_args()

    if args.all_models:
        from matrix_runner import run_matrix
        from scenarios import DEFAULT_USER

        return run_matrix(
            user_ref=args.user or DEFAULT_USER,
            audit_only=args.audit_only or args.dry_run,
            seed=not args.audit_only and not args.dry_run,
            picker_only=False,
            continue_on_error=args.continue_on_error,
            with_failure=False,
            check_tools=True,
        )

    if args.list:
        for name in SCENARIOS_BY_NAME:
            print(name)
        return 0

    if args.scenarios:
        selected = []
        for name in args.scenarios:
            if name not in SCENARIOS_BY_NAME:
                print(f"Unknown scenario: {name}", file=sys.stderr)
                return 1
            selected.append(dict(SCENARIOS_BY_NAME[name]))
    else:
        selected = [dict(s) for s in SCENARIOS]

    if args.user:
        for s in selected:
            s["user"] = args.user

    if args.dry_run:
        print(f"Would run {len(selected)} scenario(s):")
        for s in selected:
            print(f"  - {s['scenario_name']}: {s['task_type']}/{s['mode']} {s['model_key']}")
        return 0

    results = []
    for s in selected:
        print(f"\n→ {s['scenario_name']}")
        try:
            results.append(thompson_run(s))
        except Exception as exc:
            print(f"  [FAIL] {exc}", file=sys.stderr)
            return 1

    print(f"\nDone: {len(results)} run(s) seeded.")
    for r in results:
        print(f"  {r['run_id']} arm={r['arm_id']} reward={r['reward_score']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
