#!/usr/bin/env python3
"""
Benchmark every active agentsam_ai model — audit stack gaps + seed spine + validate.

Usage (repo root):
  python3 scripts/thompson_benchmark/matrix_runner.py --audit-only
  python3 scripts/thompson_benchmark/matrix_runner.py --seed
  python3 scripts/thompson_benchmark/matrix_runner.py --seed --picker-only
  python3 scripts/thompson_benchmark/matrix_runner.py --seed --continue-on-error
  python3 scripts/thompson_benchmark/matrix_runner.py --user info@inneranimals.com
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from fixtures import resolve_user
from model_registry import (
    load_active_models,
    load_arms_index,
    load_catalog_index,
    load_pricing_index,
    probe_model_stack,
)
from run_builder import thompson_run
from scenarios import DEFAULT_USER
from validate_spine import validate_run_spine, validate_tool_chain_gaps

ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "artifacts" / "thompson_model_matrix"


def _cached_ratio_for(model: Dict[str, Any], pricing: Dict[str, Any] | None) -> float:
    if not pricing or not pricing.get("supports_prompt_cache"):
        return 0.0
    prov = (model.get("provider") or "").lower()
    if prov == "anthropic":
        return 0.40
    if prov == "openai":
        return 0.25
    if prov == "google":
        return 0.15
    return 0.0


def build_scenario(
    user_ref: str,
    probe: Dict[str, Any],
    *,
    outcome: str = "completed",
    suffix: str = "",
) -> Dict[str, Any] | None:
    best = probe.get("best_arm")
    if not best or not probe.get("bench_ready"):
        return None
    model_key = probe["model_key"]
    safe_key = model_key.replace("/", "_").replace("@", "cf_").replace(".", "_")[:48]
    name = f"matrix_{safe_key}{suffix}"[:80]
    scenario: Dict[str, Any] = {
        "user": user_ref,
        "scenario_name": name,
        "task_type": best["task_type"],
        "mode": best["mode"],
        "model_key": model_key,
        "provider": best.get("provider") or probe.get("provider"),
        "outcome": outcome,
        "is_smoke_test": 0,
    }
    ratio = _cached_ratio_for(
        {"provider": probe.get("provider")},
        probe.get("pricing"),
    )
    if ratio > 0 and outcome == "completed":
        scenario["cached_input_ratio"] = ratio
    return scenario


def run_matrix(
    *,
    user_ref: str,
    audit_only: bool,
    seed: bool,
    picker_only: bool,
    continue_on_error: bool,
    with_failure: bool,
    check_tools: bool,
) -> int:
    user = resolve_user(user_ref)
    workspace_id = user["workspace_id"]
    models = load_active_models(picker_only=picker_only)

    print(f"Matrix: {len(models)} agentsam_ai model(s) | workspace={workspace_id} | user={user['email']}")

    print("Loading pricing, catalog, and routing arms (batched D1)...")
    try:
        pricing_index = load_pricing_index()
        catalog_index = load_catalog_index()
        arms_index = load_arms_index(workspace_id)
    except Exception as exc:
        print(f"[FAIL] Batched D1 preload: {exc}", file=sys.stderr)
        return 1

    probes: List[Dict[str, Any]] = []
    for m in models:
        try:
            p = probe_model_stack(
                workspace_id,
                m,
                catalog_index=catalog_index,
                pricing_index=pricing_index,
                arms_index=arms_index,
            )
        except Exception as exc:
            p = {
                "agentsam_ai_id": m.get("id"),
                "model_key": m.get("model_key"),
                "provider": m.get("provider"),
                "issues": [f"PROBE_ERROR:{exc}"],
                "gaps": [],
                "bench_ready": False,
                "probe_error": str(exc),
            }
        probes.append(p)

    bench_ready = [p for p in probes if p["bench_ready"]]
    not_ready = [p for p in probes if not p["bench_ready"]]

    issue_counts: Counter[str] = Counter()
    gap_tables: Counter[str] = Counter()
    for p in not_ready:
        for code in p["issues"]:
            issue_counts[code] += 1
        for g in p.get("gaps") or []:
            gap_tables[g] += 1

    seed_results: List[Dict[str, Any]] = []
    seed_failures: List[Dict[str, Any]] = []

    if seed and not audit_only:
        print(f"\nSeeding {len(bench_ready)} bench-ready model(s)...")
        for p in bench_ready:
            for outcome, suffix in (("completed", ""), ("failed", "_fail") if with_failure else (("completed", ""),)):
                scenario = build_scenario(user_ref, p, outcome=outcome, suffix=suffix)
                if not scenario:
                    continue
                label = f"{p['model_key']}{suffix or ''}"
                print(f"\n→ {label} ({scenario['task_type']}/{scenario['mode']})")
                try:
                    result = thompson_run(scenario)
                    validation = validate_run_spine(result["run_id"])
                    tool_gaps = (
                        validate_tool_chain_gaps(workspace_id, p["model_key"])
                        if check_tools
                        else {"issues": []}
                    )
                    entry = {
                        "model_key": p["model_key"],
                        "agentsam_ai_id": p["agentsam_ai_id"],
                        "outcome": outcome,
                        "scenario_name": scenario["scenario_name"],
                        "seed": result,
                        "spine_validation": validation,
                        "tool_chain_gaps": tool_gaps,
                    }
                    if not validation["ok"]:
                        entry["status"] = "seeded_spine_invalid"
                        seed_failures.append(entry)
                        print(f"  [spine] INVALID: {', '.join(validation['issues'])}")
                    else:
                        entry["status"] = "ok"
                        seed_results.append(entry)
                        print(f"  [spine] OK run={result['run_id']} reward={result['reward_score']:.3f}")
                    if tool_gaps.get("issues"):
                        print(f"  [tools] {', '.join(tool_gaps['issues'])}")
                except Exception as exc:
                    entry = {
                        "model_key": p["model_key"],
                        "outcome": outcome,
                        "status": "seed_error",
                        "error": str(exc),
                    }
                    seed_failures.append(entry)
                    print(f"  [FAIL] {exc}")
                    if not continue_on_error:
                        break
                if not continue_on_error and seed_failures and seed_failures[-1].get("status") == "seed_error":
                    break

    report = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "user_email": user["email"],
        "workspace_id": workspace_id,
        "tenant_id": user["tenant_id"],
        "models_total": len(models),
        "bench_ready_count": len(bench_ready),
        "not_ready_count": len(not_ready),
        "issue_counts": dict(issue_counts.most_common()),
        "gap_table_counts": dict(gap_tables.most_common()),
        "probes": probes,
        "seed_ok": seed_results,
        "seed_failures": seed_failures,
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = ARTIFACTS_DIR / f"model_matrix_{ts}.json"
    md_path = ARTIFACTS_DIR / f"model_matrix_{ts}.md"
    latest_json = ARTIFACTS_DIR / "LATEST_MODEL_MATRIX.json"
    latest_md = ARTIFACTS_DIR / "LATEST_MODEL_MATRIX.md"

    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    md_path.write_text(_render_markdown(report), encoding="utf-8")
    latest_json.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    latest_md.write_text(_render_markdown(report), encoding="utf-8")

    print(f"\nReport: {md_path}")
    print(f"        {json_path}")

    _print_summary(report)

    if seed_failures and not continue_on_error:
        return 1
    if seed and seed_failures:
        return 1 if any(f.get("status") == "seed_error" for f in seed_failures) else 0
    return 0 if bench_ready or audit_only else 1


def _print_summary(report: Dict[str, Any]) -> None:
    print("\n── Summary ──")
    print(f"  Models: {report['models_total']} total, {report['bench_ready_count']} bench-ready")
    if report.get("issue_counts"):
        print("  Top issues (not bench-ready):")
        for code, n in list(report["issue_counts"].items())[:8]:
            print(f"    {code}: {n}")
    if report.get("gap_table_counts"):
        print("  Tables to fix:")
        for tbl, n in report["gap_table_counts"].items():
            print(f"    {tbl}: {n} model(s)")
    ok = len(report.get("seed_ok") or [])
    bad = len(report.get("seed_failures") or [])
    if ok or bad:
        print(f"  Seeded: {ok} OK, {bad} failed/invalid")


def _render_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# Agent Sam — agentsam_ai model matrix",
        "",
        f"- **Generated:** {report['generated_at']}",
        f"- **User:** {report['user_email']}",
        f"- **Workspace:** `{report['workspace_id']}`",
        f"- **Models:** {report['models_total']} active | **Bench-ready:** {report['bench_ready_count']}",
        "",
        "## Issue frequency (models not bench-ready)",
        "",
    ]
    if report.get("issue_counts"):
        lines.append("| Issue | Count |")
        lines.append("|-------|------:|")
        for code, n in sorted(report["issue_counts"].items(), key=lambda x: -x[1]):
            lines.append(f"| `{code}` | {n} |")
    else:
        lines.append("_All models bench-ready._")

    lines.extend(["", "## Tables missing data", ""])
    if report.get("gap_table_counts"):
        lines.append("| Table | Models affected |")
        lines.append("|-------|----------------:|")
        for tbl, n in report["gap_table_counts"].items():
            lines.append(f"| `{tbl}` | {n} |")
    else:
        lines.append("_None._")

    lines.extend(["", "## Per-model status", ""])
    lines.append("| Model | Provider | Ready | Issues | Best arm |")
    lines.append("|-------|----------|:-----:|--------|----------|")
    for p in report.get("probes") or []:
        best = p.get("best_arm") or {}
        arm_s = (
            f"{best.get('task_type','?')}/{best.get('mode','?')}"
            if best
            else "—"
        )
        issues_s = ", ".join(p.get("issues") or []) or "—"
        ready = "yes" if p.get("bench_ready") else "no"
        lines.append(
            f"| `{p['model_key']}` | {p.get('provider','?')} | {ready} | {issues_s} | {arm_s} |"
        )

    if report.get("seed_ok") or report.get("seed_failures"):
        lines.extend(["", "## Seed results", ""])
        lines.append("| Model | Outcome | Status | Run ID | Reward | Spine |")
        lines.append("|-------|---------|--------|--------|-------:|-------|")
        for row in report.get("seed_ok") or []:
            s = row.get("seed") or {}
            v = row.get("spine_validation") or {}
            lines.append(
                f"| `{row['model_key']}` | {row.get('outcome')} | ok | `{s.get('run_id','')}` | "
                f"{s.get('reward_score', 0):.3f} | ok |"
            )
        for row in report.get("seed_failures") or []:
            err = row.get("error") or ", ".join((row.get("spine_validation") or {}).get("issues") or [])
            lines.append(
                f"| `{row.get('model_key','?')}` | {row.get('outcome','?')} | "
                f"{row.get('status')} | — | — | {err} |"
            )

    lines.extend(
        [
            "",
            "## Spine tables exercised on successful seed",
            "",
            "- `agentsam_agent_run` — run identity, routing_arm_id, agent_ai_id, quality_score",
            "- `agentsam_usage_events` — tokens_in/out, model, ref_table/ref_id",
            "- `agentsam_performance_eto_events` — reward_score, alpha/beta deltas, training eligible",
            "",
            "## Tables flagged when empty (live traffic, not seeded)",
            "",
            "- `agentsam_tool_call_log` — no recent rows for model (7d)",
            "- `agentsam_execution_performance_metrics` — no EPM rows for model",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit + benchmark all agentsam_ai models"
    )
    parser.add_argument("--user", default=DEFAULT_USER, help="auth_users email / au_* / user_key")
    parser.add_argument(
        "--audit-only",
        action="store_true",
        help="Probe only; no D1 writes (default if neither --seed nor --audit-only)",
    )
    parser.add_argument("--seed", action="store_true", help="Seed bench-ready models")
    parser.add_argument("--picker-only", action="store_true", help="Only picker_eligible models")
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Keep seeding after a model fails",
    )
    parser.add_argument(
        "--with-failure",
        action="store_true",
        help="Also seed a failed-outcome run per bench-ready model",
    )
    parser.add_argument(
        "--check-tools",
        action="store_true",
        default=True,
        help="Flag empty tool_call_log / EPM for each model (default on)",
    )
    parser.add_argument(
        "--no-check-tools",
        action="store_true",
        help="Skip tool_call_log / EPM gap checks",
    )
    args = parser.parse_args()

    audit_only = args.audit_only or not args.seed
    seed = bool(args.seed)

    return run_matrix(
        user_ref=args.user,
        audit_only=audit_only,
        seed=seed,
        picker_only=args.picker_only,
        continue_on_error=args.continue_on_error,
        with_failure=args.with_failure,
        check_tools=not args.no_check_tools,
    )


if __name__ == "__main__":
    raise SystemExit(main())
