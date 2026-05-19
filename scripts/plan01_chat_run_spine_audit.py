#!/usr/bin/env python3
"""
plan01_chat_run_spine_audit.py — Plan 1: one spine per chat turn (read-only).

Audits:
  - agentsam_workflow_runs.workflow_key = 'agent_chat_tool_session' (synthetic tool ledger)
  - agentsam_tool_call_log.agent_run_id population
  - agentsam_agent_run vs run_group_id linkage
  - Code + dashboard still depending on wrun_* / workflow_step SSE

Target architecture:
  Container: agentsam_agent_run (chatAgentRunId)
  Steps:     agentsam_tool_call_log
  Stop:      new agent_chat_tool_session workflow rows for normal chat

Usage (repo root):
  python3 scripts/plan01_chat_run_spine_audit.py
  python3 scripts/plan01_chat_run_spine_audit.py --local
  python3 scripts/plan01_chat_run_spine_audit.py --no-d1 --strict

Output:
  artifacts/plan_audits/plan01_chat_run_spine/LATEST_PLAN01_CHAT_RUN_SPINE.json
  artifacts/plan_audits/plan01_chat_run_spine/LATEST_PLAN01_CHAT_RUN_SPINE.md

Guide: docs/agentsam_knowledge/plans_1_7_python_audit_guide.md
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# scripts/lib
_LIB = Path(__file__).resolve().parent / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from plan_audit_common import (  # noqa: E402
    AuditConfig,
    add_base_args,
    build_report_payload,
    config_from_args,
    finding,
    grep_repo,
    qident,
    safe_d1_query,
    summarize_grep,
    table_columns,
    table_exists,
    write_plan_report,
)

PLAN_ID = 1
PLAN_SLUG = "chat_run_spine"
WORKFLOW_KEY = "agent_chat_tool_session"

CODE_TERMS = [
    "agent_chat_tool_session",
    "CHAT_TOOL_SESSION_LEDGER_KIND",
    "createChatToolSessionLedger",
    "appendChatToolSessionLedgerStep",
    "finalizeChatToolSessionLedger",
    "createAgentChatToolLedgerRun",
    "appendAgentChatToolLedgerStep",
    "finalizeAgentChatToolLedger",
    "scheduleAgentsamChatAgentRunStart",
    "chatAgentRunId",
    "agentsam_tool_call_log",
    "insertChatToolSessionParentExecution",
    "syncWorkflowRunToSupabase",
]

DASHBOARD_TERMS = [
    "workflow_step",
    "workflow_start",
    "workflow_complete",
    "WorkflowRunBoard",
]

AGENT_RUN_OPTIONAL_COLS = [
    "routing_arm_id",
    "assembled_prompt_hash",
    "prompt_layer_keys_json",
    "prompt_version_ids_json",
]


def pct(num: float, den: float) -> Optional[float]:
    if den <= 0:
        return None
    return round(100.0 * num / den, 2)


def query_tool_session_volume(cfg: AuditConfig, days: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {"days": days, "available": False}
    if not table_exists(cfg, "agentsam_workflow_runs"):
        out["error"] = "agentsam_workflow_runs missing"
        return out

    cols = set(table_columns(cfg, "agentsam_workflow_runs"))
    date_filter = ""
    if "created_at" in cols:
        date_filter = f"AND created_at >= datetime('now', '-{int(days)} days')"
    elif "started_at" in cols:
        date_filter = f"AND started_at >= unixepoch('now', '-{int(days)} days')"

    ok, rows = safe_d1_query(
        cfg,
        f"""
        SELECT status, COUNT(*) AS c
        FROM {qident("agentsam_workflow_runs")}
        WHERE workflow_key = '{WORKFLOW_KEY.replace("'", "''")}'
        {date_filter}
        GROUP BY status
        ORDER BY c DESC;
        """,
    )
    out["available"] = ok
    if not ok:
        out["error"] = rows
        return out
    by_status = {str(r.get("status") or ""): int(r.get("c") or 0) for r in rows}
    out["by_status"] = by_status
    out["total"] = sum(by_status.values())
    return out


def query_tool_call_log_linkage(cfg: AuditConfig, days: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {"days": days, "available": False}
    if not table_exists(cfg, "agentsam_tool_call_log"):
        out["error"] = "agentsam_tool_call_log missing"
        return out

    cols = set(table_columns(cfg, "agentsam_tool_call_log"))
    if "agent_run_id" not in cols:
        out["error"] = "agent_run_id column missing on agentsam_tool_call_log"
        return out

    time_clause = ""
    if "created_at" in cols:
        time_clause = f"WHERE created_at >= unixepoch('now', '-{int(days)} days')"
    elif "started_at" in cols:
        time_clause = f"WHERE started_at >= datetime('now', '-{int(days)} days')"

    ok, rows = safe_d1_query(
        cfg,
        f"""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN agent_run_id IS NOT NULL AND TRIM(CAST(agent_run_id AS TEXT)) != ''
              THEN 1 ELSE 0 END) AS with_agent_run_id
        FROM {qident("agentsam_tool_call_log")}
        {time_clause};
        """,
    )
    out["available"] = ok
    if not ok:
        out["error"] = rows
        return out
    row = rows[0] if rows else {}
    total = int(row.get("total") or 0)
    filled = int(row.get("with_agent_run_id") or 0)
    out["total"] = total
    out["with_agent_run_id"] = filled
    out["missing_agent_run_id"] = total - filled
    out["pct_with_agent_run_id"] = pct(filled, total)
    return out


def query_run_group_join(cfg: AuditConfig, limit: int = 40) -> Dict[str, Any]:
    out: Dict[str, Any] = {"available": False, "limit": limit}
    if not table_exists(cfg, "agentsam_workflow_runs"):
        out["error"] = "agentsam_workflow_runs missing"
        return out
    if not table_exists(cfg, "agentsam_agent_run"):
        out["error"] = "agentsam_agent_run missing"
        return out

    wr_cols = set(table_columns(cfg, "agentsam_workflow_runs"))
    if "run_group_id" not in wr_cols:
        out["note"] = "run_group_id not on agentsam_workflow_runs — skip join sample"
        out["available"] = True
        out["samples"] = []
        return out

    ok, rows = safe_d1_query(
        cfg,
        f"""
        SELECT
          wr.id AS workflow_run_id,
          wr.run_group_id,
          wr.status AS wr_status,
          ar.id AS agent_run_id,
          ar.status AS ar_status
        FROM {qident("agentsam_workflow_runs")} wr
        LEFT JOIN {qident("agentsam_agent_run")} ar
          ON ar.id = wr.run_group_id
        WHERE wr.workflow_key = '{WORKFLOW_KEY.replace("'", "''")}'
        ORDER BY wr.rowid DESC
        LIMIT {int(limit)};
        """,
    )
    out["available"] = ok
    if not ok:
        out["error"] = rows
        return out

    samples = []
    matched = 0
    for r in rows:
        rg = r.get("run_group_id")
        ar = r.get("agent_run_id")
        has_match = ar is not None and str(ar).strip() != ""
        if has_match:
            matched += 1
        samples.append(
            {
                "workflow_run_id": r.get("workflow_run_id"),
                "run_group_id": rg,
                "agent_run_id": ar,
                "wr_status": r.get("wr_status"),
                "ar_status": r.get("ar_status"),
            }
        )
    out["samples"] = samples
    out["sample_size"] = len(samples)
    out["matched_agent_run"] = matched
    out["pct_matched"] = pct(matched, len(samples))
    return out


def query_recent_agent_runs(cfg: AuditConfig, days: int = 7) -> Dict[str, Any]:
    out: Dict[str, Any] = {"days": days, "available": False}
    if not table_exists(cfg, "agentsam_agent_run"):
        out["error"] = "agentsam_agent_run missing"
        return out

    cols = set(table_columns(cfg, "agentsam_agent_run"))
    time_clause = ""
    if "created_at" in cols:
        time_clause = f"WHERE created_at >= datetime('now', '-{int(days)} days')"

    sel = ["COUNT(*) AS total"]
    if "routing_arm_id" in cols:
        sel.append(
            "SUM(CASE WHEN routing_arm_id IS NOT NULL AND TRIM(routing_arm_id) != '' "
            "THEN 1 ELSE 0 END) AS with_routing_arm_id"
        )

    ok, rows = safe_d1_query(
        cfg,
        f"SELECT {', '.join(sel)} FROM {qident('agentsam_agent_run')} {time_clause};",
    )
    out["available"] = ok
    if not ok:
        out["error"] = rows
        return out
    row = rows[0] if rows else {}
    out["total"] = int(row.get("total") or 0)
    if "with_routing_arm_id" in row:
        w = int(row.get("with_routing_arm_id") or 0)
        out["with_routing_arm_id"] = w
        out["pct_with_routing_arm_id"] = pct(w, out["total"])
    out["columns_present"] = sorted(cols)
    out["plan_columns"] = {c: c in cols for c in AGENT_RUN_OPTIONAL_COLS}
    return out


def analyze_code_grep(cfg: AuditConfig) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    findings: List[Dict[str, Any]] = []
    code_hits = grep_repo(cfg, CODE_TERMS)
    dash_hits = grep_repo(
        cfg,
        DASHBOARD_TERMS,
        scan_roots=("dashboard",),
    )
    summary = {
        "code": summarize_grep(code_hits),
        "dashboard": summarize_grep(dash_hits),
    }

    ledger_create = code_hits.get("createAgentChatToolLedgerRun", [])
    if ledger_create:
        findings.append(
            finding(
                "blocker",
                "code",
                "Chat tool ledger still creates synthetic workflow runs",
                f"{len(ledger_create)} references to createAgentChatToolLedgerRun",
                "Refactor createAgentChatToolLedgerRun to in-memory ledger with runId=chatAgentRunId; "
                "remove INSERT agentsam_workflow_runs for agent_chat_tool_session.",
                [h.as_target() for h in ledger_create[:12]],
            )
        )

    wf_key_hits = code_hits.get("agent_chat_tool_session", [])
    if wf_key_hits:
        findings.append(
            finding(
                "warning",
                "code",
                f"workflow_key '{WORKFLOW_KEY}' still referenced in Worker",
                f"{len(wf_key_hits)} grep hits",
                "Retire writes; keep read-only for historical rows or migrate dashboard to agent_run_id.",
                [h.as_target() for h in wf_key_hits[:15]],
            )
        )

    if dash_hits.get("workflow_step"):
        findings.append(
            finding(
                "warning",
                "dashboard",
                "Dashboard SSE still listens for workflow_step",
                f"{len(dash_hits['workflow_step'])} hits in dashboard/",
                "Emit tool_step (or workflow_step with run_id=chatAgentRunId) from agent.js; "
                "update useAgentChatStream.ts and WorkflowRunBoard.tsx.",
                [h.as_target() for h in dash_hits["workflow_step"][:12]],
            )
        )

    if not code_hits.get("scheduleAgentsamChatAgentRunStart"):
        findings.append(
            finding(
                "blocker",
                "code",
                "scheduleAgentsamChatAgentRunStart not found in scan roots",
                "Canonical agentsam_agent_run start may be missing from src/",
                "Verify chat path still calls scheduleAgentsamChatAgentRunStart in src/api/agent.js.",
                ["src/api/agent.js"],
            )
        )

    append_hits = code_hits.get("appendAgentChatToolLedgerStep", [])
    if append_hits:
        findings.append(
            finding(
                "info",
                "code",
                "appendAgentChatToolLedgerStep is the tool-step write hook",
                f"{len(append_hits)} definition/call sites",
                "Ensure this path writes only agentsam_tool_call_log (drop step_results_json UPDATE).",
                [h.as_target() for h in append_hits[:8]],
            )
        )

    return summary, findings


def build_findings_from_metrics(
    metrics: Dict[str, Any],
    code_findings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    findings = list(code_findings)

    vol7 = metrics.get("tool_session_workflow_runs_7d") or {}
    if vol7.get("available") and int(vol7.get("total") or 0) > 0:
        findings.append(
            finding(
                "warning",
                "d1",
                "Recent synthetic agent_chat_tool_session workflow runs exist",
                f"Last 7d: {vol7.get('total')} rows — by_status={vol7.get('by_status')}",
                "Stop creating new rows; use agentsam_agent_run + agentsam_tool_call_log only.",
                ["agentsam_workflow_runs.workflow_key"],
            )
        )
    elif vol7.get("available"):
        findings.append(
            finding(
                "info",
                "d1",
                "No agent_chat_tool_session workflow runs in last 7 days",
                "total=0",
                "May already be cut over or agent mode unused in window.",
                [],
            )
        )

    tcl = metrics.get("tool_call_log_7d") or {}
    if tcl.get("available"):
        pct_val = tcl.get("pct_with_agent_run_id")
        missing = int(tcl.get("missing_agent_run_id") or 0)
        if pct_val is not None and pct_val < 95.0 and int(tcl.get("total") or 0) > 0:
            findings.append(
                finding(
                    "blocker" if missing > 10 else "warning",
                    "d1",
                    "tool_call_log rows missing agent_run_id",
                    f"{missing}/{tcl.get('total')} missing ({pct_val}% filled)",
                    "Set agent_run_id=chatAgentRunId in appendAgentChatToolLedgerStep / scheduleToolCallLog.",
                    ["agentsam_tool_call_log.agent_run_id"],
                )
            )
        elif int(tcl.get("total") or 0) > 0:
            findings.append(
                finding(
                    "info",
                    "d1",
                    "tool_call_log agent_run_id linkage looks healthy (7d window)",
                    f"{tcl.get('with_agent_run_id')}/{tcl.get('total')} ({pct_val}%)",
                    "",
                    [],
                )
            )

    join = metrics.get("run_group_join_sample") or {}
    if join.get("available") and join.get("sample_size"):
        pm = join.get("pct_matched")
        if pm is not None and pm < 80.0:
            findings.append(
                finding(
                    "warning",
                    "d1",
                    "run_group_id on tool-session workflow runs often lacks matching agent_run",
                    f"{join.get('matched_agent_run')}/{join.get('sample_size')} matched ({pm}%)",
                    "Align run_group_id with chatAgentRunId on create; or remove workflow run entirely.",
                    [],
                )
            )

    ar = metrics.get("agent_run_7d") or {}
    plan_cols = ar.get("plan_columns") or {}
    missing_cols = [c for c, ok in plan_cols.items() if not ok]
    if missing_cols:
        findings.append(
            finding(
                "info",
                "d1",
                "agentsam_agent_run missing Plan 3 pin columns (expected until migration)",
                ", ".join(missing_cols),
                "Add assembled_prompt_hash / prompt_layer_keys_json when implementing Plan 3.",
                ["agentsam_agent_run"],
            )
        )

    return findings


def suggested_patches() -> List[str]:
    return [
        "src/api/agent.js: createAgentChatToolLedgerRun — no INSERT agentsam_workflow_runs; ledger.runId = chatAgentRunId",
        "src/api/agent.js: appendAgentChatToolLedgerStep — only INSERT agentsam_tool_call_log; remove step_results_json UPDATE",
        "src/api/agent.js: finalizeAgentChatToolLedger — no workflow finalize; rely on scheduleAgentsamChatAgentRunInsert",
        "src/api/agent.js: SSE emit run_id=chatAgentRunId (tool_step or alias workflow_step)",
        "dashboard/features/agent-chat/hooks/useAgentChatStream.ts — consume agent_run_id as run_id",
        "Optional SQL view: v_agent_chat_tool_trace JOIN agentsam_agent_run.id = agentsam_tool_call_log.agent_run_id",
    ]


def run_audit(cfg: AuditConfig, *, skip_d1: bool) -> Dict[str, Any]:
    metrics: Dict[str, Any] = {}
    if not skip_d1:
        print("[plan01] D1 queries (remote=%s)..." % cfg.remote)
        metrics["tool_session_workflow_runs_7d"] = query_tool_session_volume(cfg, 7)
        metrics["tool_session_workflow_runs_30d"] = query_tool_session_volume(cfg, 30)
        metrics["tool_call_log_7d"] = query_tool_call_log_linkage(cfg, 7)
        metrics["run_group_join_sample"] = query_run_group_join(cfg, 40)
        metrics["agent_run_7d"] = query_recent_agent_runs(cfg, 7)
    else:
        metrics["d1_skipped"] = True

    print("[plan01] repo grep...")
    grep_summary, code_findings = analyze_code_grep(cfg)

    findings = build_findings_from_metrics(metrics, code_findings)

    # Pass heuristics for summary block
    tcl = metrics.get("tool_call_log_7d") or {}
    vol7 = metrics.get("tool_session_workflow_runs_7d") or {}
    code_blockers = sum(1 for f in code_findings if f.get("severity") == "blocker")

    summary = {
        "doctrine": "chatAgentRunId = agentsam_agent_run.id; tools = agentsam_tool_call_log",
        "synthetic_workflow_key": WORKFLOW_KEY,
        "tool_session_runs_7d": vol7.get("total") if vol7.get("available") else None,
        "tool_call_log_pct_agent_run_id_7d": tcl.get("pct_with_agent_run_id"),
        "code_ledger_create_sites": (
            (grep_summary.get("code") or {}).get("createAgentChatToolLedgerRun", {}).get("hit_count", 0)
        ),
        "cutover_ready": (
            code_blockers == 0
            and (tcl.get("pct_with_agent_run_id") or 0) >= 95.0
            and int(vol7.get("total") or 0) == 0
        ),
    }

    return build_report_payload(
        PLAN_ID,
        PLAN_SLUG,
        cfg,
        summary=summary,
        findings=findings,
        metrics=metrics,
        grep_summary=grep_summary,
        suggested_patches=suggested_patches(),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Plan 1 audit: one chat run spine")
    add_base_args(parser)
    args = parser.parse_args()
    cfg = config_from_args(args)

    print(f"[plan01] repo={cfg.root}")
    report = run_audit(cfg, skip_d1=args.no_d1)

    latest_json, latest_md = write_plan_report(PLAN_ID, PLAN_SLUG, report, root=cfg.root)
    s = report["summary"]
    print("")
    print("[plan01] done")
    print(f"  pass={s.get('pass')} blockers={s.get('blocker_count')} warnings={s.get('warning_count')}")
    print(f"  cutover_ready={s.get('cutover_ready')}")
    print(f"  json: {latest_json}")
    print(f"  md:   {latest_md}")

    if args.strict and not s.get("pass"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
