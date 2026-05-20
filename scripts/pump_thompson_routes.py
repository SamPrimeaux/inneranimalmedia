#!/usr/bin/env python3
"""
Pump REAL metrics into Thompson routing (production Worker + D1).

This is NOT an audit and NOT synthetic SQL (see thompson_benchmark/seed.py for fake rows).

Per chat turn the Worker writes:
  agentsam_agent_run → agentsam_usage_events → agentsam_performance_eto_events
Then POST /api/agent/routing/apply-eto updates agentsam_routing_arms (α/β, totals).

Prerequisites:
  - Deployed Worker (git push main or npm run deploy)
  - cloudflare.env or .env.agentsam.local with AGENT_SESSION_MINT_SECRET
    OR IAM_SESSION / ~/.iam-session-cookie

Examples:
  # Thompson auto-routing — 5 real picks (costs provider $)
  python3 scripts/pump_thompson_routes.py --auto --rounds 5

  # One pinned model (train a specific arm)
  python3 scripts/pump_thompson_routes.py --model gpt-4.1-mini --rounds 3

  # Smoke: 1 auto chat + before/after arm snapshot
  python3 scripts/pump_thompson_routes.py --smoke

  # Full catalog matrix (same as live_runner.py)
  python3 scripts/pump_thompson_routes.py --matrix --limit 3 --continue-on-error
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

_REPO = Path(__file__).resolve().parent.parent
_BENCH = _REPO / "scripts" / "thompson_benchmark"
if str(_BENCH) not in sys.path:
    sys.path.insert(0, str(_BENCH))

from auth_session import load_local_env, resolve_cookie  # noqa: E402
from d1_client import query  # noqa: E402
from fixtures import resolve_user  # noqa: E402
from live_chat import api_mode_for_arm, post_apply_eto, post_chat_live  # noqa: E402
from validate_spine import validate_run_spine  # noqa: E402

DEFAULT_USER = os.environ.get("THOMPSON_USER", "info@inneranimals.com")
PROMPT_AUTO = (
    "Reply with exactly one short sentence naming your model. "
    "No markdown, no tools, under 30 words."
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_arm_snapshot(workspace_id: str, limit: int = 25) -> List[Dict[str, Any]]:
    rows = query(
        """
        SELECT
          id,
          model_key,
          task_type,
          mode,
          success_alpha,
          success_beta,
          total_executions,
          decayed_score,
          cost_mean,
          latency_mean,
          is_paused,
          is_eligible
        FROM agentsam_routing_arms
        WHERE workspace_id = ?
          AND is_active = 1
        ORDER BY total_executions DESC, decayed_score DESC
        LIMIT ?
        """,
        [workspace_id, limit],
    )
    return [dict(r) for r in rows]


def print_arm_snapshot(arms: List[Dict[str, Any]], *, title: str) -> None:
    print(f"\n{title}")
    print("-" * 72)
    if not arms:
        print("  (no arms for workspace)")
        return
    for a in arms[:15]:
        print(
            f"  {a.get('model_key','?'):28} {a.get('task_type')}/{a.get('mode'):8} "
            f"α={float(a.get('success_alpha') or 1):.2f} β={float(a.get('success_beta') or 1):.2f} "
            f"n={int(a.get('total_executions') or 0):4} "
            f"score={float(a.get('decayed_score') or 0):.4f}"
            f"{' PAUSED' if a.get('is_paused') else ''}"
        )
    if len(arms) > 15:
        print(f"  … +{len(arms) - 15} more")


def wait_for_agent_run(
    user_id: str,
    since_unix: int,
    *,
    agent_run_id: Optional[str] = None,
    model_hint: Optional[str] = None,
    max_wait_sec: float = 30.0,
) -> Optional[Dict[str, Any]]:
    deadline = time.time() + max_wait_sec
    while time.time() < deadline:
        if agent_run_id:
            rows = query(
                """
                SELECT id, status, routing_arm_id, ai_model_ref, model_id,
                       input_tokens, output_tokens, cost_usd, quality_score, task_type
                FROM agentsam_agent_run
                WHERE id = ?
                LIMIT 1
                """,
                [agent_run_id],
            )
        else:
            rows = query(
                """
                SELECT id, status, routing_arm_id, ai_model_ref, model_id,
                       input_tokens, output_tokens, cost_usd, quality_score, task_type
                FROM agentsam_agent_run
                WHERE user_id = ?
                  AND created_at_unix >= ?
                  AND (? IS NULL OR ai_model_ref = ? OR model_id = ?)
                ORDER BY created_at_unix DESC
                LIMIT 1
                """,
                [user_id, since_unix, model_hint, model_hint, model_hint],
            )
        if rows and (rows[0].get("input_tokens") is not None or rows[0].get("status") == "completed"):
            return dict(rows[0])
        time.sleep(1.5)
    return None


def run_chat_turn(
    *,
    base_url: str,
    cookie: str,
    workspace_id: str,
    tenant_id: str,
    user_id: str,
    model: str,
    task_type: str,
    arm_mode: str,
    prompt: str,
) -> Dict[str, Any]:
    since_unix = int(time.time()) - 5
    chat = post_chat_live(
        base_url=base_url,
        cookie=cookie,
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        user_id=user_id,
        model_key=model,
        task_type=task_type,
        arm_mode=arm_mode,
        prompt=prompt,
    )
    if not chat.get("ok"):
        return {"ok": False, "chat": chat, "since_unix": since_unix}

    time.sleep(2.0)
    model_hint = None if model == "auto" else model
    ar = wait_for_agent_run(
        user_id,
        since_unix,
        agent_run_id=chat.get("agent_run_id"),
        model_hint=model_hint,
    )
    if not ar:
        return {"ok": False, "chat": chat, "error": "no_agent_run_row", "since_unix": since_unix}

    run_id = ar["id"]
    spine = validate_run_spine(run_id)
    eto_rows = query(
        """
        SELECT id, reward_score, alpha_delta, beta_delta,
               is_training_eligible, applied_to_thompson_at, cost_usd, latency_ms
        FROM agentsam_performance_eto_events
        WHERE source_table = 'agentsam_agent_run' AND source_id = ?
        LIMIT 1
        """,
        [run_id],
    )
    eto = dict(eto_rows[0]) if eto_rows else None

    ok = bool(spine.get("ok")) and eto is not None and eto.get("is_training_eligible") == 1
    return {
        "ok": ok,
        "chat": chat,
        "agent_run": ar,
        "spine": spine,
        "eto": eto,
        "run_id": run_id,
        "since_unix": since_unix,
        "issues": [] if ok else list(spine.get("issues") or []) + ([] if eto else ["MISSING_ETO"]),
    }


def pump_auto_or_pinned(
    *,
    user_ref: str,
    base_url: str,
    models: List[str],
    rounds: int,
    task_type: str,
    arm_mode: str,
    apply_eto: bool,
    dry_run: bool,
) -> int:
    load_local_env()
    user = resolve_user(user_ref)
    ws = user["workspace_id"]
    tid = user["tenant_id"]
    uid = user["user_id"]

    targets = models if models else ["auto"]
    api_mode = api_mode_for_arm(task_type, arm_mode)

    print(f"[pump] {_now_iso()}")
    print(f"[pump] base={base_url} workspace={ws} user={user['email']}")
    print(f"[pump] models={targets} rounds={rounds} task={task_type} mode={arm_mode} (api={api_mode})")

    before = fetch_arm_snapshot(ws)
    print_arm_snapshot(before, title="Routing arms BEFORE (top by total_executions)")

    if dry_run:
        print("\n[dry-run] Would POST /api/agent/chat for:")
        for m in targets:
            for r in range(rounds):
                print(f"  round {r + 1}: model={m}")
        if apply_eto:
            print("  then POST /api/agent/routing/apply-eto")
        return 0

    cookie = resolve_cookie(base_url, user_id=uid, user_email=user.get("email"))
    print("[pump] session ok\n")

    results: List[Dict[str, Any]] = []
    failures = 0

    for m in targets:
        for r in range(rounds):
            label = f"{m} #{r + 1}/{rounds}"
            print(f"[pump] LIVE {label} …")
            out = run_chat_turn(
                base_url=base_url,
                cookie=cookie,
                workspace_id=ws,
                tenant_id=tid,
                user_id=uid,
                model=m,
                task_type=task_type,
                arm_mode=arm_mode,
                prompt=PROMPT_AUTO,
            )
            if not out.get("ok"):
                failures += 1
                err = out.get("error") or (out.get("chat") or {}).get("error") or out.get("issues")
                print(f"  FAIL: {err}")
                results.append({"model": m, "round": r + 1, "status": "fail", "detail": out})
                continue

            ar = out["agent_run"]
            eto = out["eto"]
            print(
                f"  OK run={out['run_id']} picked={ar.get('ai_model_ref') or ar.get('model_id')} "
                f"arm={ar.get('routing_arm_id')} "
                f"tok={ar.get('input_tokens')}/{ar.get('output_tokens')} "
                f"${float(ar.get('cost_usd') or 0):.6f} "
                f"reward={float(eto.get('reward_score') or 0):.3f}"
            )
            results.append({
                "model": m,
                "round": r + 1,
                "status": "ok",
                "run_id": out["run_id"],
                "picked_model": ar.get("ai_model_ref") or ar.get("model_id"),
                "routing_arm_id": ar.get("routing_arm_id"),
                "cost_usd": ar.get("cost_usd"),
                "eto_reward": eto.get("reward_score"),
            })
            time.sleep(float(os.environ.get("THOMPSON_PUMP_PAUSE_SEC", "2")))

    if apply_eto:
        print("\n[pump] POST /api/agent/routing/apply-eto …")
        apply_out = post_apply_eto(base_url, cookie)
        arms_updated = apply_out.get("armsUpdated") or apply_out.get("arms_updated")
        print(f"  {json.dumps(apply_out, default=str)[:400]}")
        if arms_updated is not None:
            print(f"  armsUpdated={arms_updated}")

    after = fetch_arm_snapshot(ws)
    print_arm_snapshot(after, title="Routing arms AFTER")

    # Pending ETO sanity
    pending = query(
        """
        SELECT COUNT(*) AS n
        FROM agentsam_performance_eto_events
        WHERE is_training_eligible = 1 AND applied_to_thompson_at IS NULL
        """
    )
    pend_n = int((pending[0] if pending else {}).get("n") or 0)
    print(f"\n[pump] pending ETO (eligible, not applied): {pend_n}")

    ok_count = sum(1 for x in results if x.get("status") == "ok")
    print(f"[pump] done: {ok_count} ok, {failures} failed")

    out_dir = _REPO / "artifacts" / "thompson_model_matrix"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": _now_iso(),
        "mode": "pump",
        "workspace_id": ws,
        "user": user["email"],
        "targets": targets,
        "rounds": rounds,
        "results": results,
        "failures": failures,
        "pending_eto": pend_n,
    }
    latest = out_dir / "LATEST_PUMP_THOMPSON.json"
    latest.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"[pump] report: {latest}")

    return 0 if failures == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pump real chat metrics into Thompson routing (live API, not synthetic audits)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--user", default=DEFAULT_USER, help="auth_users email, au_* id, or user_key")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("IAM_BASE_URL", "https://inneranimalmedia.com"),
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Use model=auto (Thompson bandit picks). Default when no --model.",
    )
    parser.add_argument(
        "--model",
        action="append",
        dest="models",
        metavar="KEY",
        help="Pinned model_key (repeatable). Omit with --auto for bandit routing.",
    )
    parser.add_argument("--rounds", type=int, default=1, help="Chat turns per model (default 1)")
    parser.add_argument("--task-type", default="chat", dest="task_type")
    parser.add_argument("--arm-mode", default="agent", dest="arm_mode")
    parser.add_argument("--smoke", action="store_true", help="Shorthand: --auto --rounds 1")
    parser.add_argument("--dry-run", action="store_true", help="Print plan only, no HTTP spend")
    parser.add_argument("--no-apply-eto", action="store_true", help="Skip apply-eto flush at end")
    parser.add_argument(
        "--matrix",
        action="store_true",
        help="Run full bench-ready catalog matrix via live_runner.py",
    )
    parser.add_argument("--limit", type=int, default=None, help="With --matrix: max models")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--audit-only", action="store_true", help="With --matrix: infra probe only")
    args = parser.parse_args()

    if args.matrix:
        from live_runner import run_live_matrix  # noqa: E402

        load_local_env()
        return run_live_matrix(
            user_ref=args.user,
            base_url=args.base_url.rstrip("/"),
            audit_only=args.audit_only,
            dry_run=args.dry_run,
            picker_only=False,
            continue_on_error=args.continue_on_error,
            limit=args.limit,
            check_tools=True,
        )

    if args.smoke:
        args.auto = True
        args.rounds = 1

    use_auto = args.auto or not args.models
    models: List[str] = []
    if args.models:
        models = list(args.models)
    elif use_auto:
        models = ["auto"]

    return pump_auto_or_pinned(
        user_ref=args.user,
        base_url=args.base_url.rstrip("/"),
        models=models,
        rounds=max(1, args.rounds),
        task_type=args.task_type,
        arm_mode=args.arm_mode,
        apply_eto=not args.no_apply_eto,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
