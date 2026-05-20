#!/usr/bin/env python3
"""
scripts/plan04_tool_loop_catalog_audit.py
==========================================
Plan 4 — Tool loop: catalog-native, parallel, bounded

Audit questions:
  1. Is AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS verified against agentsam_tools in D1?
  2. Does chat still write step_results_json on workflow_runs (duplicate trace)?
  3. Are approvals misrouted to agentsam_todo instead of approval queue?
  4. Is scheduleToolCallLog used on all dispatch paths?
  5. Are there sequential await chains in the tool loop (parallelization opportunity)?

Usage:
    python3 scripts/plan04_tool_loop_catalog_audit.py [--no-d1] [--strict]
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 4
PLAN_SLUG = "tool_loop_catalog"

SQL = {
    "tool_catalog_sample": """
        SELECT tool_name, is_active, category
        FROM agentsam_tools
        WHERE is_active = 1
        ORDER BY category, tool_name;
    """,
    "tool_log_recent": """
        SELECT tool_name, COUNT(*) AS calls,
               SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors,
               AVG(duration_ms) AS avg_ms
        FROM agentsam_tool_call_log
        WHERE created_at >= unixepoch('now', '-7 days')
        GROUP BY tool_name ORDER BY calls DESC LIMIT 30;
    """,
    "tool_log_agent_run_coverage": """
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN agent_run_id IS NOT NULL AND trim(agent_run_id)!='' THEN 1 ELSE 0 END) AS with_run_id
        FROM agentsam_tool_call_log
        WHERE created_at >= unixepoch('now', '-7 days');
    """,
    "tool_log_schema":         "PRAGMA table_info(agentsam_tool_call_log);",
    "tools_schema":            "PRAGMA table_info(agentsam_tools);",
    "approval_queue_schema":   "PRAGMA table_info(agentsam_approval_queue);",
    "step_results_recent": """
        SELECT COUNT(*) AS wrun_with_steps
        FROM agentsam_workflow_runs
        WHERE step_results_json IS NOT NULL
          AND workflow_key = 'agent_chat_tool_session'
          AND created_at >= datetime('now', '-7 days');
    """,
}

# Minimum tool names to assert — cross-check against D1 catalog
MINIMUM_TOOLS_EXPECTED = [
    "d1_query", "r2_read", "r2_write", "terminal_run",
    "github_file", "cdt_take_screenshot", "read_file",
    "write_file", "list_files", "search_files",
]

CODE_TERMS = [
    # Catalog constant — should be DB-driven
    ("minimum_tools_const",       r"AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS",                  "warning"),
    ("select_mcp_tools",          r"selectMcpToolsForDeterministicAgentChat",             "info"),

    # Dispatch paths
    ("dispatchToolCall",          r"dispatchToolCall\(",                                   "info"),
    ("dispatchToolCallWithBudget",r"dispatchToolCallWithBudget\(",                         "info"),
    ("scheduleToolCallLog",       r"scheduleToolCallLog\(",                                "info"),
    ("scheduleAgentsamTool",      r"scheduleAgentsamToolCallLog\(",                        "info"),

    # Duplicate trace — step_results_json (to retire after Plan 1 cutover)
    ("step_results_json",         r"step_results_json",                                    "blocker"),
    ("appendLedgerStep",          r"appendAgentChatToolLedgerStep|appendChatToolLedgerStep","warning"),

    # Parallel execution — sequential awaits in for loops
    ("sequential_for_await",      r"for\s*\(.*\bawait\b|for\s+await\s*\(",                "warning"),
    ("promise_all_tools",         r"Promise\.all\(.*tool|awaitToolBatch|parallelToolBatch","info"),

    # Approval misrouting
    ("approval_via_todo",         r"agentsam_todo.*approv|approv.*agentsam_todo",          "blocker"),
    ("createApprovalRequest",     r"createApprovalRequest\(",                              "info"),
    ("approval_queue_write",      r"agentsam_approval_queue",                              "info"),

    # SSE event rename (tool_step not workflow_step)
    ("sse_workflow_step_emit",    r"emit\(['\"]workflow_step['\"]",                        "warning"),
    ("sse_tool_step_emit",        r"emit\(['\"]tool_step['\"]",                            "info"),
]


def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []

    if not skip_d1:
        # ── Tool catalog coverage ────────────────────────────────────────────
        section("D1 — agentsam_tools catalog")
        catalog = safe_d1_query(cfg, SQL["tool_catalog_sample"])
        catalog_names = {r["tool_name"] for r in catalog}
        print(f"  {len(catalog_names)} active tools in catalog")

        missing_from_catalog = [t for t in MINIMUM_TOOLS_EXPECTED if t not in catalog_names]
        if missing_from_catalog:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title=f"Minimum tools missing from agentsam_tools: {missing_from_catalog}",
                evidence=f"Expected: {MINIMUM_TOOLS_EXPECTED}",
                suggestion=(
                    "Seed these rows in agentsam_tools. "
                    "Replace AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS constant with D1-driven startup assert."
                ),
                targets=["agentsam_tools", "src/api/agent.js (AGENT_CHAT_MINIMUM_AGENTSAM_TOOLS)"],
            ))
        else:
            ok(f"All {len(MINIMUM_TOOLS_EXPECTED)} minimum tools present in catalog")

        # ── Tool log coverage ────────────────────────────────────────────────
        section("D1 — tool_call_log agent_run_id coverage (7d)")
        cov = safe_d1_query(cfg, SQL["tool_log_agent_run_coverage"])
        if cov:
            row   = cov[0]
            total = row.get("total", 0) or 0
            with_ = row.get("with_run_id", 0) or 0
            pct   = (with_ / total * 100) if total else 0
            print(f"  total={total}  with agent_run_id={with_} ({pct:.1f}%)")
            sev = "blocker" if pct < 50 else ("warning" if pct < 90 else "info")
            if sev != "info":
                findings.append(finding(
                    severity=sev,
                    category="d1",
                    title=f"tool_call_log agent_run_id fill rate: {pct:.1f}%",
                    evidence=f"{with_}/{total} rows have agent_run_id",
                    suggestion="Ensure all scheduleToolCallLog calls pass chatAgentRunId as agent_run_id.",
                    targets=["agentsam_tool_call_log", "src/core/agentsam-ops-ledger.js"],
                ))

        # ── Most-called tools ─────────────────────────────────────────────────
        section("D1 — top tools (7d)")
        top = safe_d1_query(cfg, SQL["tool_log_recent"])
        for row in top[:10]:
            err_pct = ((row.get("errors", 0) or 0) / max(row.get("calls", 1), 1)) * 100
            icon = "⚠️ " if err_pct > 20 else "  "
            print(f"  {icon} {row['tool_name']:<35} calls={row['calls']:>5}  errors={err_pct:.0f}%  avg_ms={row.get('avg_ms') or '?'}")
            if err_pct > 30:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title=f"Tool '{row['tool_name']}' has {err_pct:.0f}% error rate (7d)",
                    evidence=f"{row['errors']}/{row['calls']} calls failed",
                    suggestion="Investigate dispatch path for this tool; check catalog is_active flag.",
                    targets=[f"agentsam_tool_call_log (tool_name={row['tool_name']})"],
                ))

        # ── step_results_json (duplicate trace) ──────────────────────────────
        section("D1 — step_results_json on chat workflow runs (7d)")
        try:
            sr = safe_d1_query(cfg, SQL["step_results_recent"])
            if sr and (sr[0].get("wrun_with_steps", 0) or 0) > 0:
                findings.append(finding(
                    severity="blocker",
                    category="d1",
                    title=f"{sr[0]['wrun_with_steps']} chat workflow_runs still have step_results_json (7d)",
                    evidence="Duplicate tool trace in workflow_runs.step_results_json",
                    suggestion=(
                        "After Plan 1 cutover: stop writing step_results_json in appendChatToolLedgerStep. "
                        "agentsam_tool_call_log is the only tool trace."
                    ),
                    targets=["agentsam_workflow_runs.step_results_json", "src/api/agent.js (appendLedgerStep)"],
                ))
            else:
                ok("No recent chat workflow_runs with step_results_json")
        except Exception as e:
            dim(f"  step_results_json query skipped: {e}")

        # ── Approval queue schema ─────────────────────────────────────────────
        section("D1 — agentsam_approval_queue schema")
        aq = safe_d1_query(cfg, SQL["approval_queue_schema"])
        if not aq:
            findings.append(finding(
                severity="warning",
                category="d1",
                title="agentsam_approval_queue table missing or empty schema",
                evidence="PRAGMA returned no columns",
                suggestion="Verify table exists. Approval requests must go here, not agentsam_todo.",
                targets=["agentsam_approval_queue", "migrations/"],
            ))
        else:
            ok(f"agentsam_approval_queue exists ({len(aq)} columns)")

        # ── Tool log schema ───────────────────────────────────────────────────
        section("D1 — tool_call_log schema check")
        tl_cols = [r.get("name") for r in safe_d1_query(cfg, SQL["tool_log_schema"])]
        for col in ["agent_run_id", "duration_ms", "tool_name", "status", "execution_step_id"]:
            if col not in tl_cols:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title=f"agentsam_tool_call_log missing column: {col}",
                    evidence=f"Schema: {tl_cols}",
                    suggestion=f"ALTER TABLE agentsam_tool_call_log ADD COLUMN {col} TEXT;",
                    targets=["agentsam_tool_call_log"],
                ))
            else:
                ok(f"tool_call_log.{col} present")

    # ── Code grep ────────────────────────────────────────────────────────────
    section("Code grep — tool dispatch and trace paths")
    for label, pattern, sev in CODE_TERMS:
        hits  = grep_repo(cfg, pattern)
        count = len(hits)
        icon  = "🔴" if (sev == "blocker" and count > 0) else ("⚠️ " if (sev == "warning" and count > 0) else "ℹ️ ")

        # parallel hint: absence of Promise.all with tools is a gap
        if label == "promise_all_tools":
            if count == 0:
                warn(f"{label}: 0 hits — no parallel batch detected")
                findings.append(finding(
                    severity="warning",
                    category="code",
                    title="No parallel tool execution found (Promise.all / awaitToolBatch)",
                    evidence="Zero grep hits for batch tool pattern",
                    suggestion=(
                        "In runAgentToolLoop, batch independent tools with Promise.all. "
                        "Cap concurrency at 4. Still write individual tool_call_log rows."
                    ),
                    targets=["src/api/agent.js (runAgentToolLoop)"],
                ))
            else:
                ok(f"{label}: {count} hits — parallel pattern present")
            continue

        print(f"  {icon} {label:<40} {count:>3} hits")
        if count > 0 and sev in ("blocker", "warning"):
            targets = [f"{h['file']}:{h['line']}" for h in hits[:5]]
            findings.append(finding(
                severity=sev,
                category="code",
                title=f"{label} — {count} site(s)",
                evidence="; ".join(targets[:3]),
                suggestion=_suggestion(label),
                targets=targets,
            ))

    return findings


def _suggestion(label: str) -> str:
    m = {
        "minimum_tools_const":
            "Replace constant with D1 read: SELECT tool_name FROM agentsam_tools WHERE is_active=1 AND is_minimum=1.",
        "step_results_json":
            "Remove step_results_json writes from chat tool ledger. Only agentsam_tool_call_log as trace.",
        "appendLedgerStep":
            "After Plan 1: route appendChatToolLedgerStep to only INSERT tool_call_log, no workflow_runs update.",
        "sequential_for_await":
            "Candidate for parallel execution. Batch independent tool calls with Promise.all + concurrency cap.",
        "approval_via_todo":
            "Approvals must go to agentsam_approval_queue, not agentsam_todo. Fix routing.",
        "sse_workflow_step_emit":
            "After Plan 1: rename SSE emit to tool_step with agent_run_id (not wrun_*).",
    }
    return m.get(label, "Review against Plan 4 catalog-native tool loop target.")


def main():
    p    = add_base_args(f"Plan {PLAN_ID} — tool loop catalog audit")
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
