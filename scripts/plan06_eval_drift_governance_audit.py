#!/usr/bin/env python3
"""
scripts/plan06_eval_drift_governance_audit.py
==============================================
Plan 6 — Eval → routing governance loop

Audit questions:
  1. Are paused arms correlated with drift signals?
  2. Does triggerEvalAfterNRuns fire and update arm avg_quality_score?
  3. Can any code path select paused or degraded catalog rows (Thompson bypass)?
  4. Is there a dashboard surface for drift signals?

Usage:
    python3 scripts/plan06_eval_drift_governance_audit.py [--no-d1] [--strict]
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 6
PLAN_SLUG = "eval_drift_governance"

SQL = {
    "drift_signals": """
        SELECT severity, COUNT(*) AS c
        FROM agentsam_model_drift_signals
        WHERE COALESCE(acknowledged, 0) = 0
        GROUP BY severity;
    """,
    "paused_arms": """
        SELECT id, model_key, is_paused, pause_reason, drift_signal_id, avg_quality_score
        FROM agentsam_routing_arms WHERE is_paused = 1;
    """,
    "eval_suites": "SELECT id, name, suite_type FROM agentsam_eval_suites;",
    "eval_cases_per_suite": """
        SELECT suite_id, COUNT(*) AS case_count FROM agentsam_eval_cases GROUP BY suite_id;
    """,
    "eval_runs_recent": """
        SELECT status, COUNT(*) AS c
        FROM agentsam_eval_runs
        WHERE run_at >= datetime('now', '-30 days')
        GROUP BY status;
    """,
    "arms_quality": """
        SELECT id, model_key, avg_quality_score, thompson_enabled, is_active, is_paused
        FROM agentsam_routing_arms ORDER BY avg_quality_score DESC NULLS LAST;
    """,
    "drift_schema": "PRAGMA table_info(agentsam_model_drift_signals);",
    "arm_schema":   "PRAGMA table_info(agentsam_routing_arms);",
}

CODE_TERMS = [
    # Eval runner
    ("triggerEvalAfterNRuns",      r"triggerEvalAfterNRuns\(",                          "info"),
    ("scheduleRoutingArmQuality",  r"scheduleRoutingArmQualityUpdate|arm.*quality",      "info"),
    ("eval_runner",                r"eval.runner|evalRunner|runEvalSuite",               "info"),

    # Drift / pause governance
    ("syncArmPauseFromDrift",      r"syncRoutingArmPauseFromDrift|armPauseFromDrift",    "info"),
    ("drift_signal_write",         r"agentsam_model_drift_signals",                      "info"),

    # Thompson bypass risks — paused/degraded arms must be filtered
    ("query_arms_candidates",      r"queryRoutingArmsCandidates\(",                      "info"),
    ("pick_arm_thompson",          r"pickRoutingArmByThompson\(",                        "info"),
    ("paused_filter",              r"is_paused\s*=\s*0|is_paused\s*!=\s*1|NOT.*paused", "info"),
    ("degraded_filter",            r"is_degraded\s*=\s*0|NOT.*degraded",                "info"),
    ("budget_exhausted_filter",    r"budget_exhausted\s*=\s*0",                          "info"),

    # Dashboard drift panel
    ("drift_panel_tsx",            r"DriftSignal|drift_signal|ModelDriftPanel",          "info"),
    ("paused_arm_ui",              r"paused.*arm|arm.*paused|PausedArm",                 "info"),

    # Prompt hash regression hook
    ("assembled_prompt_hash",      r"assembled_prompt_hash",                             "info"),
    ("prompt_regression_trigger",  r"prompt.*regression|regression.*prompt",             "warning"),
]


def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []

    if not skip_d1:
        section("D1 — unacknowledged drift signals")
        drift = safe_d1_query(cfg, SQL["drift_signals"])
        if not drift:
            ok("No unacknowledged drift signals")
        else:
            for row in drift:
                print(f"  severity={row['severity']}  count={row['c']}")
                if row["severity"] in ("critical", "high"):
                    findings.append(finding(
                        severity="blocker",
                        category="d1",
                        title=f"{row['c']} unacknowledged {row['severity']} drift signals",
                        evidence=f"agentsam_model_drift_signals: {row}",
                        suggestion="Acknowledge or act on high/critical signals; verify arms are paused if warranted.",
                        targets=["agentsam_model_drift_signals"],
                    ))

        section("D1 — paused routing arms")
        paused = safe_d1_query(cfg, SQL["paused_arms"])
        if not paused:
            ok("No paused arms")
        else:
            for row in paused:
                no_signal = not row.get("drift_signal_id")
                print(f"  arm={row['id']}  model={row['model_key']}  reason={row.get('pause_reason','?')}  signal={row.get('drift_signal_id','none')}")
                if no_signal:
                    findings.append(finding(
                        severity="warning",
                        category="d1",
                        title=f"Arm {row['id']} is paused but has no drift_signal_id",
                        evidence=f"model_key={row['model_key']} pause_reason={row.get('pause_reason')}",
                        suggestion="Link paused arms to a drift_signal_id for audit trail.",
                        targets=["agentsam_routing_arms"],
                    ))

        section("D1 — eval suites and cases")
        suites = safe_d1_query(cfg, SQL["eval_suites"])
        cases  = {r["suite_id"]: r["case_count"] for r in safe_d1_query(cfg, SQL["eval_cases_per_suite"])}
        if not suites:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title="No eval suites defined",
                evidence="agentsam_eval_suites is empty",
                suggestion="Seed at least one eval suite per routing arm type (auto, agent, debug).",
                targets=["agentsam_eval_suites", "agentsam_eval_cases"],
            ))
        else:
            for s in suites:
                cc = cases.get(s["id"], 0)
                print(f"  suite={s['id']} ({s['name']})  cases={cc}")
                if cc == 0:
                    findings.append(finding(
                        severity="warning",
                        category="d1",
                        title=f"Eval suite '{s['name']}' has 0 cases",
                        evidence=f"suite_id={s['id']}",
                        suggestion="Seed eval cases for this suite.",
                        targets=[f"agentsam_eval_cases (suite_id={s['id']})"],
                    ))

        section("D1 — eval runs (30d)")
        runs = safe_d1_query(cfg, SQL["eval_runs_recent"])
        total_runs = sum(r.get("c", 0) for r in runs)
        print(f"  total eval runs (30d): {total_runs}")
        for row in runs:
            print(f"    status={row['status']}  count={row['c']}")
        if total_runs == 0:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title="No eval runs in last 30 days",
                evidence="agentsam_eval_runs empty for 30d window",
                suggestion="Verify triggerEvalAfterNRuns is wired and firing after N agent_run completions.",
                targets=["agentsam_eval_runs", "src/core/eval-runner.js"],
            ))

        section("D1 — arm quality scores")
        arms = safe_d1_query(cfg, SQL["arms_quality"])
        null_quality = [a for a in arms if a.get("avg_quality_score") is None]
        if null_quality and len(null_quality) == len(arms):
            findings.append(finding(
                severity="blocker",
                category="d1",
                title="All routing arms have NULL avg_quality_score",
                evidence="scheduleRoutingArmQualityUpdate has never run or is not writing scores",
                suggestion="Wire triggerEvalAfterNRuns → scheduleRoutingArmQualityUpdate to populate scores.",
                targets=["agentsam_routing_arms.avg_quality_score", "src/core/routing-cron.js"],
            ))
        for a in arms[:5]:
            print(f"  arm={a['id']}  model={a['model_key']}  quality={a.get('avg_quality_score','NULL')}  paused={a.get('is_paused',0)}")

    section("Code grep — eval/drift/Thompson governance")
    for label, pattern, sev in CODE_TERMS:
        hits  = grep_repo(cfg, pattern)
        count = len(hits)

        # Absence of filter is the risk for Thompson bypass
        if label in ("paused_filter", "degraded_filter", "budget_exhausted_filter"):
            if count == 0:
                print(f"  🔴 {label:<40}   0 hits — no exclusion filter found")
                findings.append(finding(
                    severity="blocker",
                    category="code",
                    title=f"No '{label}' in queryRoutingArmsCandidates — Thompson bypass risk",
                    evidence="Paused/degraded arms could be selected",
                    suggestion=f"Add WHERE {label.replace('_filter','').replace('_',' ')} = 0 to arm candidate query.",
                    targets=["src/core/routing.js (queryRoutingArmsCandidates)"],
                ))
            else:
                ok(f"{label}: {count} hits")
            continue

        if label in ("drift_panel_tsx", "paused_arm_ui") and count == 0:
            findings.append(finding(
                severity="warning",
                category="dashboard",
                title=f"No dashboard component for {label}",
                evidence="Zero TSX/JSX hits",
                suggestion="Add drift signals panel to /dashboard/agent settings or model picker.",
                targets=["dashboard/features/agent-chat/"],
            ))
            print(f"  ⚠️  {label:<40}   0 hits — dashboard gap")
            continue

        if label == "prompt_regression_trigger" and count == 0:
            findings.append(finding(
                severity="warning",
                category="code",
                title="No prompt regression trigger on assembled_prompt_hash change",
                evidence="Zero hits for regression trigger logic",
                suggestion="After Plan 3: on assembled_prompt_hash change for a route, trigger eval suite tagged prompt_regression.",
                targets=["src/core/eval-runner.js"],
            ))

        icon = "⚠️ " if (sev == "warning" and count > 0) else "ℹ️ "
        print(f"  {icon} {label:<40} {count:>3} hits")

    return findings


def main():
    p    = add_base_args(f"Plan {PLAN_ID} — eval/drift governance audit")
    args = p.parse_args()
    cfg  = config_from_args(args)
    skip = getattr(args, "no_d1", False)

    print(f"\n{'═'*65}")
    print(f"  PLAN {PLAN_ID} AUDIT — {PLAN_SLUG.upper().replace('_',' ')}")
    print(f"{'═'*65}\n")

    findings = run_audit(cfg, skip)
    payload  = build_report_payload(PLAN_ID, PLAN_SLUG, cfg, findings)
    write_plan_report(PLAN_ID, PLAN_SLUG, cfg, payload)

    blockers = payload["summary"]["blocker_count"]
    warnings = payload["summary"]["warning_count"]
    print(f"\n  blockers={blockers}  warnings={warnings}  pass={payload['summary']['pass']}")
    if getattr(args, "strict", False) and blockers:
        sys.exit(1)


if __name__ == "__main__":
    main()
