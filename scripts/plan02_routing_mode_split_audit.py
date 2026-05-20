#!/usr/bin/env python3
"""
scripts/plan02_routing_mode_split_audit.py
==========================================
Plan 2 — Split routing from mode (read-only audit)

Audit questions:
  1. Where does code still read agent_mode_configs for model selection?
  2. Is model_preference column gone (migration 339)?
  3. Are routing_arm_id + Supabase routing_decisions populated on recent runs?
  4. When is Thompson enabled vs deterministic?

Usage:
    python3 scripts/plan02_routing_mode_split_audit.py [--no-d1] [--strict]
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 2
PLAN_SLUG = "routing_mode_split"

# ── D1 QUERIES ───────────────────────────────────────────────────────────────

SQL = {
    "mode_configs_schema": "PRAGMA table_info(agent_mode_configs);",
    "agent_run_schema":    "PRAGMA table_info(agentsam_agent_run);",
    "routing_arms_schema": "PRAGMA table_info(agentsam_routing_arms);",
    "routing_decisions_schema": "PRAGMA table_info(agentsam_routing_decisions);",

    "arm_fill_rate": """
        SELECT
          COUNT(*) AS runs_7d,
          SUM(CASE WHEN routing_arm_id IS NOT NULL AND trim(routing_arm_id) != '' THEN 1 ELSE 0 END) AS with_arm,
          SUM(CASE WHEN model_used IS NOT NULL AND trim(model_used) != '' THEN 1 ELSE 0 END) AS with_model
        FROM agentsam_agent_run
        WHERE created_at >= datetime('now', '-7 days');
    """,

    "active_arms": """
        SELECT id, task_type, mode, model_key, fallback_model_key,
               thompson_enabled, is_active, is_paused, weight
        FROM agentsam_routing_arms
        WHERE is_active = 1
        ORDER BY task_type, mode;
    """,

    "mode_configs_rows": """
        SELECT mode, model_preference, escalation_model, max_tool_calls, temperature
        FROM agent_mode_configs
        LIMIT 20;
    """,

    "routing_decisions_recent": """
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN routing_arm_id IS NOT NULL THEN 1 ELSE 0 END) AS with_arm
        FROM agentsam_routing_decisions
        WHERE created_at >= datetime('now', '-7 days');
    """,

    "auto_mode_runs": """
        SELECT
          COALESCE(mode, 'unknown') AS mode,
          COUNT(*) AS c,
          SUM(CASE WHEN routing_arm_id IS NOT NULL THEN 1 ELSE 0 END) AS with_arm
        FROM agentsam_agent_run
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY mode ORDER BY c DESC;
    """,
}

# ── CODE GREP TERMS ──────────────────────────────────────────────────────────

# (label, pattern, severity_if_found)
CODE_TERMS = [
    # Model reads from mode_configs — should be gone
    ("mode_configs_model_read",   r"modeConfig\.(model|escalation_model|model_preference)",   "blocker"),
    ("escalation_model_read",     r"escalation_model",                                         "blocker"),
    ("loadModeConfig_call",       r"loadModeConfig\(",                                          "warning"),
    ("mode_configs_select",       r"SELECT.*agent_mode_configs|agent_mode_configs.*SELECT",     "warning"),

    # Routing arm resolution
    ("resolveRoutingArm",         r"resolveRoutingArm\(",                                       "info"),
    ("pickRoutingArmByThompson",  r"pickRoutingArmByThompson\(",                                "info"),
    ("thompson_flag",             r"isThompsonRoutingSamplingEnabled|thompsonEnabled",           "info"),
    ("deterministic_override",    r"body\.model\s*!==\s*['\"]auto['\"]|explicitModel",          "info"),

    # routing_arm_id being set on agent_run (should be present)
    ("routing_arm_id_write",      r"routing_arm_id\s*[:=]",                                    "info"),
    ("write_supabase_decision",   r"writeSupabaseRoutingDecision|syncRoutingDecision",           "info"),

    # Failover — should use arms only, not mode_configs
    ("failover_pool",             r"failoverPool|escalationPool|fallbackModelKey",              "info"),
    ("model_preference_col",      r"model_preference",                                          "warning"),
]

# ── AUDIT ────────────────────────────────────────────────────────────────────

def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []

    # ── D1 checks ────────────────────────────────────────────────────────────
    if not skip_d1:
        section("D1 — agent_mode_configs schema")
        mode_cols = safe_d1_query(cfg, SQL["mode_configs_schema"])
        col_names = [r.get("name") for r in mode_cols]
        print(f"  columns: {col_names}")

        if "model_preference" in col_names:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title="agent_mode_configs still has model_preference column",
                evidence=f"PRAGMA columns: {col_names}",
                suggestion="Confirm migration 339 ran. DROP COLUMN model_preference or verify it's unused.",
                targets=["agentsam_migrations (check 339)"],
            ))
        else:
            ok("model_preference column absent — migration 339 applied")

        if "escalation_model" in col_names:
            findings.append(finding(
                severity="warning",
                category="d1",
                title="agent_mode_configs.escalation_model still present",
                evidence=f"Column exists in schema",
                suggestion="Remove from failover chain; use agentsam_routing_arms.fallback_model_key only.",
                targets=["agent_mode_configs", "src/api/agent.js ~6140"],
            ))

        section("D1 — routing_arm_id fill rate (7d)")
        fill = safe_d1_query(cfg, SQL["arm_fill_rate"])
        if fill:
            row = fill[0]
            total = row.get("runs_7d", 0) or 0
            with_arm = row.get("with_arm", 0) or 0
            pct = (with_arm / total * 100) if total else 0
            msg = f"{with_arm}/{total} runs have routing_arm_id ({pct:.1f}%)"
            print(f"  {msg}")
            sev = "blocker" if pct < 50 else ("warning" if pct < 90 else "info")
            findings.append(finding(
                severity=sev,
                category="d1",
                title=f"routing_arm_id fill rate: {pct:.1f}%",
                evidence=msg,
                suggestion="Ensure scheduleAgentsamChatAgentRunStart sets routing_arm_id from resolveRoutingArm result.",
                targets=["agentsam_agent_run", "src/core/agent-run-routing.js"],
            ))

        section("D1 — active routing arms")
        arms = safe_d1_query(cfg, SQL["active_arms"])
        print(f"  {len(arms)} active arms")
        thompson_arms = [a for a in arms if a.get("thompson_enabled")]
        det_arms      = [a for a in arms if not a.get("thompson_enabled")]
        print(f"  Thompson-enabled: {len(thompson_arms)}  |  Deterministic: {len(det_arms)}")
        if not arms:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title="No active routing arms found",
                evidence="agentsam_routing_arms is empty or all inactive",
                suggestion="Seed routing arms for auto/agent/debug/multitask/ask modes.",
                targets=["agentsam_routing_arms"],
            ))
        if not thompson_arms:
            findings.append(finding(
                severity="warning",
                category="d1",
                title="No Thompson-enabled arms — Auto routing not data-driven",
                evidence="thompson_enabled = 0 on all active arms",
                suggestion="Set thompson_enabled = 1 on auto-mode arms to activate sampling.",
                targets=["agentsam_routing_arms"],
            ))

        section("D1 — per-mode arm coverage vs actual chat runs")
        mode_runs = safe_d1_query(cfg, SQL["auto_mode_runs"])
        arm_modes = {a.get("mode") for a in arms}
        for row in mode_runs:
            m = row.get("mode", "unknown")
            c = row.get("c", 0)
            wa = row.get("with_arm", 0)
            covered = "✅" if m in arm_modes else "⚠️ "
            arm_pct = (wa / c * 100) if c else 0
            print(f"  {covered} mode={m}  runs={c}  arm_set={m in arm_modes}  arm_id_filled={arm_pct:.0f}%")
            if m not in arm_modes and c > 0:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title=f"Mode '{m}' has {c} runs but no routing arm",
                    evidence=f"{c} agentsam_agent_run rows with mode={m}, no matching arm",
                    suggestion=f"Add agentsam_routing_arms row for mode='{m}'.",
                    targets=["agentsam_routing_arms"],
                ))

        section("D1 — routing_decisions (7d)")
        dec = safe_d1_query(cfg, SQL["routing_decisions_recent"])
        if dec:
            row = dec[0]
            print(f"  decisions (7d): {row.get('total',0)}  with arm: {row.get('with_arm',0)}")
            if (row.get("total", 0) or 0) == 0:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title="No routing_decisions rows in last 7d",
                    evidence="agentsam_routing_decisions empty for 7d window",
                    suggestion="Verify writeSupabaseRoutingDecision is called on every auto pick.",
                    targets=["src/core/agent-run-routing.js", "agentsam_routing_decisions"],
                ))

        section("D1 — agent_run schema (Plan 2 pin columns)")
        ar_cols = safe_d1_query(cfg, SQL["agent_run_schema"])
        ar_col_names = [r.get("name") for r in ar_cols]
        for col in ["routing_arm_id", "model_used"]:
            if col not in ar_col_names:
                findings.append(finding(
                    severity="blocker",
                    category="d1",
                    title=f"agentsam_agent_run missing column: {col}",
                    evidence=f"PRAGMA shows: {ar_col_names}",
                    suggestion=f"ALTER TABLE agentsam_agent_run ADD COLUMN {col} TEXT;",
                    targets=["agentsam_agent_run", "migrations/"],
                ))
            else:
                ok(f"agentsam_agent_run.{col} present")

    # ── Code grep ────────────────────────────────────────────────────────────
    section("Code grep — routing vs mode separation")
    for label, pattern, sev in CODE_TERMS:
        hits = grep_repo(cfg, pattern)
        count = len(hits)
        icon  = "🔴" if (sev == "blocker" and count > 0) else ("⚠️ " if sev == "warning" else "ℹ️ ")
        print(f"  {icon} {label:<35} {count:>3} hits")

        if count > 0 and sev in ("blocker", "warning"):
            sample = list(hits.values())[0][:5] if hits else []
            targets = [h.as_target() for h in sample]
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
        "mode_configs_model_read":
            "Remove modeConfig.model/escalation_model from failover pool; use routingArm.fallback_model_key.",
        "escalation_model_read":
            "Replace with agentsam_routing_arms.fallback_model_key. Remove escalation_model from loadModeConfig.",
        "loadModeConfig_call":
            "loadModeConfig is OK for tool caps/temperature but must NOT return model keys. Audit each call site.",
        "mode_configs_select":
            "Ensure SELECT only fetches non-model columns (max_tool_calls, temperature, tool_policy_json).",
        "model_preference_col":
            "model_preference should be gone after migration 339. Verify column dropped.",
    }
    return m.get(label, "Review and align with routing_arms as single model source.")


# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    p = add_base_args(f"Plan {PLAN_ID} — routing/mode split audit")
    args = p.parse_args()
    cfg  = config_from_args(args)
    skip = getattr(args, "no_d1", False)

    print(f"\n{'═'*65}")
    print(f"  PLAN {PLAN_ID} AUDIT — {PLAN_SLUG.upper().replace('_',' ')}")
    print(f"{'═'*65}\n")

    findings = run_audit(cfg, skip)
    payload  = build_report_payload(PLAN_ID, PLAN_SLUG, cfg, findings=findings, summary={})
    write_plan_report(PLAN_ID, PLAN_SLUG, payload)

    blockers = payload["summary"]["blocker_count"]
    warnings = payload["summary"]["warning_count"]
    print(f"\n  blockers={blockers}  warnings={warnings}  pass={payload['summary']['pass']}")

    if getattr(args, "strict", False) and blockers:
        sys.exit(1)


if __name__ == "__main__":
    main()
