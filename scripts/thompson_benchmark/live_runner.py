#!/usr/bin/env python3
"""
LIVE Thompson metrics — real /api/agent/chat per agentsam_ai model.

Writes REAL token/cost/latency via Worker paths (not synthetic Python INSERTs):
  agentsam_agent_run → agentsam_usage_events → agentsam_performance_eto_events
  → applyEtoToRoutingArms (when apply_eto_after_run + quickstart_batch thompson_live_matrix)

Prerequisites:
  1. Deployed Worker with current src/ (git push main or npm run deploy)
  2. AGENT_SESSION_MINT_SECRET in cloudflare.env OR IAM_SESSION cookie
  3. Provider API keys on Worker (OpenAI, Anthropic, Google, etc.)

Usage:
  python3 scripts/thompson_benchmark/live_runner.py --audit-only
  python3 scripts/thompson_benchmark/live_runner.py --dry-run
  python3 scripts/thompson_benchmark/live_runner.py
  python3 scripts/thompson_benchmark/live_runner.py --user info@inneranimals.com --limit 3
  python3 scripts/thompson_benchmark/live_runner.py --continue-on-error --picker-only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from auth_session import load_local_env, resolve_cookie
from d1_client import query
from fixtures import resolve_user
from live_chat import post_apply_eto, post_chat_live
from model_registry import (
    load_active_models,
    load_arms_index,
    load_catalog_index,
    load_pricing_index,
    probe_model_stack,
)
from scenarios import DEFAULT_USER
from validate_spine import validate_run_spine, validate_tool_chain_gaps

ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "artifacts" / "thompson_model_matrix"

LIVE_PROMPT = (
    "Reply with exactly one short sentence confirming your model id. "
    "No markdown, no tools, under 40 words."
)


def fetch_latest_agent_run(user_id: str, model_key: str, since_unix: int) -> Optional[Dict[str, Any]]:
    rows = query(
        """
        SELECT
          id,
          status,
          routing_arm_id,
          agent_ai_id,
          input_tokens,
          output_tokens,
          cost_usd,
          quality_score,
          task_type,
          timed_out,
          sla_breach,
          created_at_unix
        FROM agentsam_agent_run
        WHERE user_id = ?
          AND (ai_model_ref = ? OR model_id = ?)
          AND created_at_unix >= ?
        ORDER BY created_at_unix DESC
        LIMIT 1
        """,
        [user_id, model_key, model_key, since_unix],
    )
    return dict(rows[0]) if rows else None


def wait_for_agent_run(
    user_id: str,
    model_key: str,
    since_unix: int,
    *,
    agent_run_id: Optional[str] = None,
    max_wait_sec: float = 25.0,
) -> Optional[Dict[str, Any]]:
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        if agent_run_id:
            rows = query(
                "SELECT id, status, routing_arm_id, agent_ai_id, input_tokens, output_tokens, "
                "cost_usd, quality_score, task_type, timed_out, sla_breach, created_at_unix "
                "FROM agentsam_agent_run WHERE id = ? LIMIT 1",
                [agent_run_id],
            )
            if rows and rows[0].get("input_tokens") is not None:
                return dict(rows[0])
        else:
            row = fetch_latest_agent_run(user_id, model_key, since_unix)
            if row and (row.get("input_tokens") or 0) > 0:
                return row
        time.sleep(1.5)
    return fetch_latest_agent_run(user_id, model_key, since_unix)


def run_live_matrix(
    *,
    user_ref: str,
    base_url: str,
    audit_only: bool,
    dry_run: bool,
    picker_only: bool,
    continue_on_error: bool,
    limit: Optional[int],
    check_tools: bool,
) -> int:
    load_local_env()
    user = resolve_user(user_ref)
    workspace_id = user["workspace_id"]
    tenant_id = user["tenant_id"]
    user_id = user["user_id"]

    models = load_active_models(picker_only=picker_only)
    if limit is not None:
        models = models[: max(0, limit)]

    print(
        f"LIVE matrix: {len(models)} model(s) | {base_url} | "
        f"workspace={workspace_id} | user={user['email']}"
    )

    pricing_index = load_pricing_index()
    catalog_index = load_catalog_index()
    arms_index = load_arms_index(workspace_id)

    probes: List[Dict[str, Any]] = []
    for m in models:
        probes.append(
            probe_model_stack(
                workspace_id,
                m,
                catalog_index=catalog_index,
                pricing_index=pricing_index,
                arms_index=arms_index,
            )
        )

    bench_ready = [p for p in probes if p.get("bench_ready")]
    print(f"  Infrastructure: {len(bench_ready)}/{len(probes)} bench-ready (arm+pricing+catalog)")

    if audit_only:
        _write_report(user, workspace_id, probes, [], [], audit_only=True)
        return 0

    if dry_run:
        print("\nWould call LIVE /api/agent/chat for:")
        for p in bench_ready:
            arm = p["best_arm"]
            print(
                f"  - {p['model_key']} via {arm['task_type']}/{arm['mode']} "
                f"(arm {arm['id']})"
            )
        skipped = len(probes) - len(bench_ready)
        if skipped:
            print(f"  ({skipped} skipped — fix catalog/pricing/arms first; run --audit-only)")
        return 0

    cookie = resolve_cookie(base_url, user_id=user_id, user_email=user.get("email"))
    print("  Session: ok (cookie or mint)\n")

    live_results: List[Dict[str, Any]] = []
    live_failures: List[Dict[str, Any]] = []

    for i, p in enumerate(bench_ready, 1):
        mk = p["model_key"]
        arm = p["best_arm"]
        tt = arm["task_type"]
        amode = arm["mode"]
        prov = arm.get("provider") or p.get("provider")

        print(f"[{i}/{len(bench_ready)}] LIVE {mk} ({tt}/{amode}) …")
        since_unix = int(time.time()) - 5

        chat = post_chat_live(
            base_url=base_url,
            cookie=cookie,
            workspace_id=workspace_id,
            tenant_id=tenant_id,
            user_id=user_id,
            model_key=mk,
            task_type=tt,
            arm_mode=amode,
            prompt=LIVE_PROMPT,
        )

        if not chat.get("ok"):
            entry = {
                "model_key": mk,
                "provider": prov,
                "status": "chat_failed",
                "error": chat.get("error"),
                "http_status": chat.get("http_status"),
                "latency_ms": chat.get("latency_ms"),
            }
            live_failures.append(entry)
            print(f"  [FAIL] chat: {entry['error']}")
            if not continue_on_error:
                break
            continue

        time.sleep(2.0)
        ar = wait_for_agent_run(
            user_id,
            mk,
            since_unix,
            agent_run_id=chat.get("agent_run_id"),
        )

        if not ar:
            entry = {
                "model_key": mk,
                "status": "no_agent_run_row",
                "chat": chat,
            }
            live_failures.append(entry)
            print("  [FAIL] no agentsam_agent_run row after chat")
            if not continue_on_error:
                break
            continue

        run_id = ar["id"]
        spine = validate_run_spine(run_id)
        tool_gaps = (
            validate_tool_chain_gaps(workspace_id, mk) if check_tools else {"issues": []}
        )

        eto_rows = query(
            """
            SELECT id, reward_score, alpha_delta, beta_delta, is_training_eligible,
                   applied_to_thompson_at, quality_score, latency_ms, cost_usd
            FROM agentsam_performance_eto_events
            WHERE source_table = 'agentsam_agent_run' AND source_id = ?
            LIMIT 1
            """,
            [run_id],
        )
        eto = dict(eto_rows[0]) if eto_rows else None

        entry = {
            "model_key": mk,
            "provider": prov,
            "arm_id": arm["id"],
            "task_type": tt,
            "arm_mode": amode,
            "status": "ok" if spine.get("ok") and eto else "partial",
            "chat_latency_ms": chat.get("latency_ms"),
            "agent_run_id": run_id,
            "d1_input_tokens": ar.get("input_tokens"),
            "d1_output_tokens": ar.get("output_tokens"),
            "d1_cost_usd": ar.get("cost_usd"),
            "sse_input_tokens": chat.get("sse_input_tokens"),
            "sse_output_tokens": chat.get("sse_output_tokens"),
            "spine_validation": spine,
            "eto": eto,
            "tool_chain_gaps": tool_gaps,
        }

        if spine.get("ok") and eto and eto.get("is_training_eligible") == 1:
            live_results.append(entry)
            print(
                f"  [OK] run={run_id} tokens={ar.get('input_tokens')}/{ar.get('output_tokens')} "
                f"cost=${float(ar.get('cost_usd') or 0):.6f} "
                f"reward={float(eto.get('reward_score') or 0):.3f} "
                f"α+{eto.get('alpha_delta')} β+{eto.get('beta_delta')}"
            )
        else:
            entry["status"] = "spine_or_eto_incomplete"
            issues = list(spine.get("issues") or [])
            if not eto:
                issues.append("MISSING_ETO")
            elif eto.get("is_training_eligible") != 1:
                issues.append("ETO_NOT_TRAINING_ELIGIBLE")
            entry["issues"] = issues
            live_failures.append(entry)
            print(f"  [WARN] {', '.join(issues)}")

        if tool_gaps.get("issues"):
            print(f"  [tools] {', '.join(tool_gaps['issues'])}")

        time.sleep(float(os.environ.get("THOMPSON_BENCH_PAUSE_SEC", "1.5")))

    print("\nFlushing pending ETO → routing arms …")
    apply_out = post_apply_eto(base_url, cookie)
    print(f"  apply-eto: {json.dumps(apply_out)[:300]}")

    _write_report(user, workspace_id, probes, live_results, live_failures, audit_only=False)

    print(f"\nLIVE done: {len(live_results)} ok, {len(live_failures)} failed/partial")
    return 0 if not live_failures or continue_on_error else 1


def _write_report(
    user: Dict[str, Any],
    workspace_id: str,
    probes: List[Dict[str, Any]],
    live_ok: List[Dict[str, Any]],
    live_fail: List[Dict[str, Any]],
    *,
    audit_only: bool,
) -> None:
    from matrix_runner import _render_markdown  # reuse markdown template

    issue_counts: Dict[str, int] = {}
    gap_tables: Dict[str, int] = {}
    for p in probes:
        if p.get("bench_ready"):
            continue
        for code in p.get("issues") or []:
            issue_counts[code] = issue_counts.get(code, 0) + 1
        for g in p.get("gaps") or []:
            gap_tables[g] = gap_tables.get(g, 0) + 1

    report = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mode": "audit_only" if audit_only else "live",
        "user_email": user["email"],
        "workspace_id": workspace_id,
        "tenant_id": user["tenant_id"],
        "models_total": len(probes),
        "bench_ready_count": sum(1 for p in probes if p.get("bench_ready")),
        "not_ready_count": sum(1 for p in probes if not p.get("bench_ready")),
        "issue_counts": issue_counts,
        "gap_table_counts": gap_tables,
        "probes": probes,
        "seed_ok": live_ok,
        "seed_failures": live_fail,
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = ARTIFACTS_DIR / f"live_matrix_{ts}.json"
    md_path = ARTIFACTS_DIR / f"live_matrix_{ts}.md"
    json_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    md_body = _render_markdown(report).replace(
        "# Agent Sam — agentsam_ai model matrix",
        "# Agent Sam — LIVE model matrix (real /api/agent/chat)",
    )
    md_path.write_text(md_body, encoding="utf-8")
    (ARTIFACTS_DIR / "LATEST_LIVE_MODEL_MATRIX.json").write_text(
        json.dumps(report, indent=2, default=str), encoding="utf-8"
    )
    (ARTIFACTS_DIR / "LATEST_LIVE_MODEL_MATRIX.md").write_text(md_body, encoding="utf-8")
    print(f"\nReport: {md_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="LIVE Thompson benchmark (real chat API)")
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--base-url", default=os.environ.get("IAM_BASE_URL", "https://inneranimalmedia.com"))
    parser.add_argument("--audit-only", action="store_true", help="Infrastructure probe only")
    parser.add_argument("--dry-run", action="store_true", help="List live targets, no HTTP")
    parser.add_argument("--picker-only", action="store_true")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max models to test")
    parser.add_argument("--no-check-tools", action="store_true")
    args = parser.parse_args()

    load_local_env()
    return run_live_matrix(
        user_ref=args.user,
        base_url=args.base_url.rstrip("/"),
        audit_only=args.audit_only,
        dry_run=args.dry_run,
        picker_only=args.picker_only,
        continue_on_error=args.continue_on_error,
        limit=args.limit,
        check_tools=not args.no_check_tools,
    )


if __name__ == "__main__":
    raise SystemExit(main())
