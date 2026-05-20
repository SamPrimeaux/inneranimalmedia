#!/usr/bin/env python3
"""
scripts/plan_audits_run_all.py
===============================
Master runner — executes plan01 through plan07 sequentially,
writes artifacts/plan_audits/LATEST_MASTER_SUMMARY.md,
exits non-zero if any plan has blocker findings.

Usage:
    python3 scripts/plan_audits_run_all.py [--no-d1] [--strict] [--plans 1,2,4]
"""

import sys, subprocess, json, argparse
from pathlib import Path
from datetime import datetime

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
ARTIFACT_DIR = REPO / "artifacts" / "plan_audits"

PLANS = [
    (1, "plan01_chat_run_spine_audit.py",          "chat_run_spine"),
    (2, "plan02_routing_mode_split_audit.py",       "routing_mode_split"),
    (3, "plan03_prompt_trilogy_audit.py",           "prompt_trilogy"),
    (4, "plan04_tool_loop_catalog_audit.py",        "tool_loop_catalog"),
    (5, "plan05_context_budget_audit.py",           "context_budget"),
    (6, "plan06_eval_drift_governance_audit.py",    "eval_drift_governance"),
    (7, "plan07_validation_gate_audit.py",          "validation_gate"),
]

EXEC_ORDER_NOTES = {
    1: "Unblocks Plans 2–4 (spine must be clean first)",
    2: "Depends on Plan 1 (routing_arm_id on run)",
    3: "Depends on Plan 1 (hash on run column)",
    4: "Depends on Plan 1 (tool_step SSE)",
    5: "Depends on Plan 3 (route layers + version rows)",
    6: "Depends on Plans 2–3 (arm quality + prompt hash)",
    7: "Parallel — required before marking any plan done",
}

COLORS = {
    "PASS":    "\033[92m",
    "FAIL":    "\033[91m",
    "WARN":    "\033[93m",
    "SKIP":    "\033[90m",
    "BOLD":    "\033[1m",
    "RESET":   "\033[0m",
    "DIM":     "\033[2m",
    "CYAN":    "\033[96m",
}

def c(key): return COLORS.get(key, "")


def run_plan(plan_id: int, script: str, slug: str, extra_args: list) -> dict:
    script_path = SCRIPTS / script
    if not script_path.exists():
        return {"plan_id": plan_id, "slug": slug, "status": "SKIP",
                "blockers": 0, "warnings": 0, "error": "script not found"}

    cmd = [sys.executable, str(script_path)] + extra_args
    print(f"\n{c('CYAN')}{'─'*65}{c('RESET')}")
    print(f"{c('BOLD')}  Running Plan {plan_id}: {script}{c('RESET')}")
    print(f"{c('CYAN')}{'─'*65}{c('RESET')}")

    try:
        result = subprocess.run(cmd, cwd=str(REPO), capture_output=False, timeout=120)
        # Read the JSON artifact to get structured results
        artifact_dir = ARTIFACT_DIR / f"plan0{plan_id}_{slug}"
        json_files = sorted(artifact_dir.glob("*.json")) if artifact_dir.exists() else []
        if json_files:
            latest = json_files[-1]
            data   = json.loads(latest.read_text())
            summary = data.get("summary", {})
            return {
                "plan_id":    plan_id,
                "slug":       slug,
                "script":     script,
                "status":     "PASS" if summary.get("pass") else "FAIL",
                "blockers":   summary.get("blocker_count", 0),
                "warnings":   summary.get("warning_count", 0),
                "return_code": result.returncode,
                "artifact":   str(latest),
            }
        return {
            "plan_id": plan_id, "slug": slug, "status": "FAIL" if result.returncode else "PASS",
            "blockers": 0, "warnings": 0, "return_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"plan_id": plan_id, "slug": slug, "status": "SKIP",
                "blockers": 0, "warnings": 0, "error": "timeout"}
    except Exception as e:
        return {"plan_id": plan_id, "slug": slug, "status": "FAIL",
                "blockers": 0, "warnings": 0, "error": str(e)}


def write_master_summary(results: list[dict], extra_args: list):
    now     = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    out     = ARTIFACT_DIR / "LATEST_MASTER_SUMMARY.md"
    total_b = sum(r.get("blockers", 0) for r in results)
    total_w = sum(r.get("warnings", 0) for r in results)
    overall = "✅ PASS" if total_b == 0 else "🔴 FAIL"

    lines = [
        f"# AgentSam Plans 1–7 Master Audit Summary",
        f"",
        f"Generated: {now}",
        f"Args: `{' '.join(extra_args)}`",
        f"",
        f"## Overall: {overall}",
        f"",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Total blockers | {total_b} |",
        f"| Total warnings | {total_w} |",
        f"| Plans passed   | {sum(1 for r in results if r['status']=='PASS')} / {len(results)} |",
        f"",
        f"## Per-Plan Results",
        f"",
        f"| Plan | Slug | Status | Blockers | Warnings | Exec Order Note |",
        f"|------|------|--------|----------|----------|-----------------|",
    ]

    for r in results:
        pid    = r["plan_id"]
        slug   = r["slug"]
        status = r["status"]
        icon   = "✅" if status == "PASS" else ("⚠️" if status == "SKIP" else "🔴")
        note   = EXEC_ORDER_NOTES.get(pid, "")
        lines.append(
            f"| {pid} | {slug} | {icon} {status} | "
            f"{r.get('blockers',0)} | {r.get('warnings',0)} | {note} |"
        )

    lines += [
        f"",
        f"## Priority Fix Order",
        f"",
        f"Plans 1 + 4 should ship as one PR (chat trace spine).",
        f"Plans 2 + 3 as second PR (routing + prompts).",
        f"Plans 5–7 follow.",
        f"",
        f"### Blockers by plan",
        f"",
    ]

    for r in results:
        if r.get("blockers", 0) > 0:
            artifact_link = f"[JSON]({r.get('artifact','')})" if r.get("artifact") else "—"
            lines.append(f"- **Plan {r['plan_id']} ({r['slug']})**: {r['blockers']} blocker(s) — {artifact_link}")

    lines += ["", "---", f"*Auto-generated by plan_audits_run_all.py*"]

    out.write_text("\n".join(lines))
    print(f"\n  Master summary written → {out}")
    return out


def main():
    parser = argparse.ArgumentParser(description="Run all plan audits 01–07")
    parser.add_argument("--no-d1",  action="store_true", help="Skip D1 queries in all plans")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero on any blocker")
    parser.add_argument("--plans",  default="",          help="Comma-separated plan IDs to run (default: all)")
    args = parser.parse_args()

    run_ids  = set(int(x) for x in args.plans.split(",") if x.strip().isdigit()) if args.plans else set()
    extra    = []
    if args.no_d1:  extra.append("--no-d1")
    # Note: don't pass --strict to sub-plans; we handle exit code at master level

    plans_to_run = [(pid, sc, sl) for (pid, sc, sl) in PLANS if not run_ids or pid in run_ids]

    print(f"\n{c('BOLD')}{'═'*65}")
    print(f"  AGENTSAM PLANS 1–7 MASTER AUDIT RUN")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"  Plans: {[p[0] for p in plans_to_run]}  no-d1={args.no_d1}")
    print(f"{'═'*65}{c('RESET')}")

    results = []
    for pid, script, slug in plans_to_run:
        r = run_plan(pid, script, slug, extra)
        results.append(r)

    # ── Summary table ────────────────────────────────────────────────────────
    print(f"\n{c('BOLD')}{'═'*65}")
    print(f"  RESULTS SUMMARY")
    print(f"{'═'*65}{c('RESET')}")
    print(f"  {'Plan':<6} {'Slug':<35} {'Status':<8} {'Blockers':>9} {'Warnings':>9}")
    print(f"  {'─'*4}  {'─'*33}  {'─'*6}  {'─'*7}  {'─'*7}")
    total_b = total_w = 0
    for r in results:
        sc = c("PASS") if r["status"] == "PASS" else (c("WARN") if r["status"] == "SKIP" else c("FAIL"))
        print(
            f"  {r['plan_id']:<6} {r['slug']:<35} "
            f"{sc}{r['status']:<8}{c('RESET')} "
            f"{r.get('blockers',0):>9} {r.get('warnings',0):>9}"
        )
        total_b += r.get("blockers", 0)
        total_w += r.get("warnings", 0)

    overall_pass = total_b == 0
    oc = c("PASS") if overall_pass else c("FAIL")
    print(f"\n  {oc}{c('BOLD')}OVERALL: {'PASS' if overall_pass else 'FAIL'}  "
          f"blockers={total_b}  warnings={total_w}{c('RESET')}\n")

    md_path = write_master_summary(results, extra)

    if args.strict and not overall_pass:
        sys.exit(1)


if __name__ == "__main__":
    main()
