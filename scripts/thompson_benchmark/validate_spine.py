#!/usr/bin/env python3
"""Post-seed validation: agent_run ↔ usage_events ↔ ETO linkage."""

from __future__ import annotations

from typing import Any, Dict, List

try:
    from .d1_client import query
except ImportError:
    from d1_client import query

SPINE_TABLES = (
    "agentsam_agent_run",
    "agentsam_usage_events",
    "agentsam_performance_eto_events",
)


def validate_run_spine(run_id: str) -> Dict[str, Any]:
    """
  Verify the three-table benchmark spine for one agentsam_agent_run.id.
  Returns ok, issues[], and row snapshots.
    """
    issues: List[str] = []

    ar_rows = query(
        """
        SELECT
          id,
          user_id,
          workspace_id,
          tenant_id,
          conversation_id,
          status,
          routing_arm_id,
          agent_ai_id,
          agent_id,
          ai_model_ref,
          model_id,
          input_tokens,
          output_tokens,
          cost_usd,
          quality_score,
          task_type,
          timed_out,
          sla_breach,
          person_uuid,
          created_at_unix
        FROM agentsam_agent_run
        WHERE id = ?
        LIMIT 1
        """,
        [run_id],
    )
    if not ar_rows:
        return {"ok": False, "issues": ["MISSING_AGENT_RUN"], "run_id": run_id}

    ar = dict(ar_rows[0])

    if not ar.get("routing_arm_id"):
        issues.append("AGENT_RUN_NO_ROUTING_ARM_ID")
    if not ar.get("tenant_id"):
        issues.append("AGENT_RUN_NO_TENANT_ID")
    if not ar.get("user_id"):
        issues.append("AGENT_RUN_NO_USER_ID")
    if not ar.get("workspace_id"):
        issues.append("AGENT_RUN_NO_WORKSPACE_ID")
    if ar.get("agent_ai_id") is None:
        issues.append("AGENT_RUN_NO_AGENT_AI_ID")
    if ar.get("quality_score") is None:
        issues.append("AGENT_RUN_NO_QUALITY_SCORE")
    if not ar.get("task_type"):
        issues.append("AGENT_RUN_NO_TASK_TYPE")
    if not ar.get("input_tokens") and ar.get("input_tokens") != 0:
        issues.append("AGENT_RUN_NO_INPUT_TOKENS")

    ue_rows = query(
        """
        SELECT
          id,
          tenant_id,
          workspace_id,
          user_id,
          model,
          tokens_in,
          tokens_out,
          cost_usd,
          ref_table,
          ref_id,
          routing_arm_id,
          ai_model_id,
          event_type,
          duration_ms,
          succeeded,
          conversation_id,
          created_at
        FROM agentsam_usage_events
        WHERE ref_table = 'agentsam_agent_run'
          AND ref_id = ?
        LIMIT 1
        """,
        [run_id],
    )
    ue = dict(ue_rows[0]) if ue_rows else None
    if not ue:
        issues.append("MISSING_USAGE_EVENT")
    else:
        if not ue.get("model"):
            issues.append("USAGE_EVENT_NO_MODEL")
        if ue.get("tokens_in") is None:
            issues.append("USAGE_EVENT_NO_TOKENS_IN")
        if ue.get("ref_table") != "agentsam_agent_run":
            issues.append("USAGE_EVENT_BAD_REF_TABLE")
        if ue.get("ref_id") != run_id:
            issues.append("USAGE_EVENT_BAD_REF_ID")
        if not ue.get("routing_arm_id"):
            issues.append("USAGE_EVENT_NO_ROUTING_ARM_ID")
        if ar.get("routing_arm_id") and ue.get("routing_arm_id") != ar.get("routing_arm_id"):
            issues.append("USAGE_ARM_MISMATCH_AGENT_RUN")

    eto_rows = query(
        """
        SELECT
          id,
          source_table,
          source_id,
          agent_run_id,
          usage_event_id,
          routing_arm_id,
          model_key,
          provider,
          reward_score,
          alpha_delta,
          beta_delta,
          is_training_eligible,
          applied_to_thompson_at,
          quality_score,
          latency_ms,
          cost_usd
        FROM agentsam_performance_eto_events
        WHERE source_table = 'agentsam_agent_run'
          AND source_id = ?
        LIMIT 1
        """,
        [run_id],
    )
    eto = dict(eto_rows[0]) if eto_rows else None
    if not eto:
        issues.append("MISSING_ETO_EVENT")
    else:
        if eto.get("is_training_eligible") != 1:
            issues.append("ETO_NOT_TRAINING_ELIGIBLE")
        if not eto.get("routing_arm_id"):
            issues.append("ETO_NO_ROUTING_ARM_ID")
        if not eto.get("usage_event_id"):
            issues.append("ETO_NO_USAGE_EVENT_ID")
        if ue and eto.get("usage_event_id") != ue.get("id"):
            issues.append("ETO_USAGE_EVENT_MISMATCH")
        if eto.get("agent_run_id") != run_id:
            issues.append("ETO_AGENT_RUN_MISMATCH")
        if eto.get("reward_score") is None:
            issues.append("ETO_NO_REWARD_SCORE")

    return {
        "ok": len(issues) == 0,
        "issues": issues,
        "run_id": run_id,
        "agent_run": ar,
        "usage_event": ue,
        "eto_event": eto,
    }


def validate_tool_chain_gaps(workspace_id: str, model_key: str) -> Dict[str, Any]:
    """
    Read-only checks for tables often missing wiring (no seed writes).
    """
    issues: List[str] = []

    tool_rows = query(
        """
        SELECT COUNT(*) AS n
        FROM agentsam_tool_call_log tcl
        INNER JOIN agentsam_agent_run ar ON ar.id = tcl.agent_run_id
        WHERE tcl.workspace_id = ?
          AND ar.ai_model_ref = ?
          AND tcl.created_at > unixepoch('now', '-7 days')
        """,
        [workspace_id, model_key],
    )
    recent_tools = int((tool_rows[0] if tool_rows else {}).get("n") or 0)

    cmd_rows = query(
        """
        SELECT COUNT(*) AS n
        FROM agentsam_command_run
        WHERE workspace_id = ?
          AND created_at > unixepoch('now', '-7 days')
        """,
        [workspace_id],
    )
    recent_cmds = int((cmd_rows[0] if cmd_rows else {}).get("n") or 0)

    epm_rows = query(
        """
        SELECT COUNT(*) AS n
        FROM agentsam_execution_performance_metrics
        WHERE workspace_id = ?
          AND model_key = ?
        """,
        [workspace_id, model_key],
    )
    epm_count = int((epm_rows[0] if epm_rows else {}).get("n") or 0)

    if recent_tools == 0:
        issues.append("NO_RECENT_TOOL_CALL_LOG_7D")
    if epm_count == 0:
        issues.append("NO_EPM_ROWS_FOR_MODEL")

    return {
        "model_key": model_key,
        "workspace_id": workspace_id,
        "recent_tool_call_log_7d": recent_tools,
        "recent_command_run_7d_workspace": recent_cmds,
        "epm_rows": epm_count,
        "issues": issues,
    }
