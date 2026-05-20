#!/usr/bin/env python3
"""
scripts/plan05_context_budget_audit.py
=======================================
Plan 5 — Context pipeline: route-driven budgets

Audit questions:
  1. Does buildSystemPrompt enforce token_budget from route (hard cap or hint)?
  2. Are include_rag / include_workspace_ctx / memory_limit used as hard gates?
  3. Is context duplicated across agent_messages + digest + RAG in same turn?
  4. Is topK hardcoded vs route.memory_limit?

Usage:
    python3 scripts/plan05_context_budget_audit.py [--no-d1] [--strict]
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 5
PLAN_SLUG = "context_budget"

SQL = {
    "route_budgets": """
        SELECT route_key, token_budget, memory_limit, include_rag,
               include_workspace_ctx, include_active_plan, include_recent_memory, max_tools
        FROM agentsam_prompt_routes WHERE is_active = 1 ORDER BY priority;
    """,
    "digest_recent": """
        SELECT COUNT(*) AS c FROM agentsam_context_digest
        WHERE created_at >= datetime('now', '-7 days');
    """,
}

CODE_TERMS = [
    # Hard-cap enforcement (want to see token_budget as a limiting variable)
    ("token_budget_enforced",     r"token_budget\b",                                          "info"),
    ("body_tokens_sum",           r"body_tokens|sum.*tokens|tokens.*sum",                     "info"),
    ("budget_exceeded_check",     r"budget.*exceeded|tokens.*>\s*token_budget|tokensOver",    "info"),

    # include_* as booleans (want to see if checks, not just reads)
    ("include_rag_gate",          r"include_rag\s*[=!]=|if.*include_rag|include_rag.*0",     "info"),
    ("include_workspace_gate",    r"include_workspace_ctx|include_workspace",                 "info"),
    ("include_active_plan_gate",  r"include_active_plan",                                     "info"),

    # topK hardcoded (should be route.memory_limit)
    ("topk_hardcoded",            r"\btopK\s*[:=]\s*[0-9]+|\btopk\s*[:=]\s*[0-9]+",         "blocker"),
    ("topk_from_route",           r"topK.*memory_limit|memory_limit.*topK",                  "info"),

    # Context duplication sources
    ("agent_messages_inject",     r"agent_messages.*context|context.*agent_messages",         "info"),
    ("context_digest_inject",     r"agentsam_context_digest",                                 "info"),
    ("rag_inject",                r"resolveVectorContext\(",                                   "info"),
    ("fetchActivePlan",           r"fetchActivePlanContextFragment\(",                        "info"),

    # Simple ask gate (minimal context path)
    ("isSimpleAsk",               r"isSimpleAskMessage\(",                                    "info"),
    ("simple_ask_route",          r"max_tools\s*[:=]\s*0|maxTools.*0",                       "info"),
]


def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []

    if not skip_d1:
        section("D1 — route budget configuration")
        routes = safe_d1_query(cfg, SQL["route_budgets"])
        null_budget = [r["route_key"] for r in routes if not r.get("token_budget")]
        null_memory = [r["route_key"] for r in routes if not r.get("memory_limit")]

        for r in routes:
            print(
                f"  {r.get('route_key','?'):<35} "
                f"budget={r.get('token_budget','NULL'):<7} "
                f"mem_limit={r.get('memory_limit','NULL'):<5} "
                f"rag={r.get('include_rag',0)}  "
                f"ws={r.get('include_workspace_ctx',0)}"
            )

        if null_budget:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title=f"{len(null_budget)} active route(s) have NULL token_budget",
                evidence=f"Routes: {null_budget}",
                suggestion="Set token_budget on all routes. Use 4000 for minimal, 12000 for agent, 32000 for heavy.",
                targets=["agentsam_prompt_routes"] + [f"route:{r}" for r in null_budget[:5]],
            ))

        if null_memory:
            findings.append(finding(
                severity="warning",
                category="d1",
                title=f"{len(null_memory)} route(s) have NULL memory_limit (topK uncontrolled)",
                evidence=f"Routes: {null_memory}",
                suggestion="Set memory_limit on all routes; resolveVectorContext should use route.memory_limit as topK.",
                targets=["agentsam_prompt_routes"],
            ))

        section("D1 — agentsam_context_digest usage (7d)")
        try:
            dig = safe_d1_query(cfg, SQL["digest_recent"])
            c   = dig[0].get("c", 0) if dig else 0
            print(f"  digest rows (7d): {c}")
            if c == 0:
                findings.append(finding(
                    severity="info",
                    category="d1",
                    title="agentsam_context_digest has no rows in last 7d",
                    evidence="May be unused or write path broken",
                    suggestion="Verify digest is the single long-workspace blob injector; stop duplicating via RAG + messages.",
                    targets=["agentsam_context_digest", "src/api/agent.js (buildSystemPrompt)"],
                ))
        except Exception as e:
            dim(f"  digest query skipped: {e}")

    section("Code grep — context budget enforcement")
    for label, pattern, sev in CODE_TERMS:
        hits  = grep_repo(cfg, pattern)
        count = len(hits)

        # topK hardcoded: presence is the problem
        if label == "topk_hardcoded" and count > 0:
            targets = [f"{h['file']}:{h['line']}" for h in hits[:5]]
            print(f"  🔴 {label:<40} {count:>3} hits — hardcoded topK")
            findings.append(finding(
                severity="blocker",
                category="code",
                title=f"topK hardcoded at {count} site(s) — not using route.memory_limit",
                evidence="; ".join(targets[:3]),
                suggestion="Replace hardcoded topK with: const topK = route?.memory_limit ?? 5;",
                targets=targets,
            ))
            continue

        # budget_exceeded_check: absence is the problem
        if label == "budget_exceeded_check" and count == 0:
            print(f"  🔴 {label:<40}   0 hits — NO HARD BUDGET GATE")
            findings.append(finding(
                severity="blocker",
                category="code",
                title="No token_budget hard-cap check found in buildSystemPrompt",
                evidence="Zero grep hits for budget enforcement logic",
                suggestion=(
                    "In buildSystemPrompt: sum body_tokens from loaded versions; "
                    "stop adding layers once sum >= route.token_budget."
                ),
                targets=["src/api/agent.js (buildSystemPrompt)"],
            ))
            continue

        icon = "⚠️ " if (sev == "warning" and count > 0) else "ℹ️ "
        print(f"  {icon} {label:<40} {count:>3} hits")

    return findings


def main():
    p    = add_base_args(f"Plan {PLAN_ID} — context budget audit")
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
