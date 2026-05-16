#!/usr/bin/env python3
"""
seed_plan.py
------------
Creates a real agentsam_plans row + agentsam_plan_tasks rows in remote D1
from the audit checklist. First live use of these tables.

Usage:
    python3 scripts/seed_plan.py

Requires: wrangler CLI authenticated, run from repo root.
"""

import subprocess
import json
import sys
from datetime import datetime, timezone

DB_NAME    = "inneranimalmedia-business"
TENANT_ID  = "iam"
WORKSPACE  = "agentsam"
TODAY      = datetime.now(timezone.utc).strftime("%Y-%m-%d")
PLAN_ID    = f"plan_{TODAY.replace('-','')}_stabilization"

# ── Task definitions from checklist (phase → priority mapping) ────────────────
# UNBLOCK=P0, WIRE=P1, BUILD=P2, REFINE=P3, CUT=P3

TASKS = [
    # UNBLOCK — P0
    dict(title="Fix classifyIntent() — must return classified results not 'unclassified'",
         priority="P0", category="backend",
         tables_involved='["agentsam_routing_arms","agentsam_model_routing_rules"]',
         routes_involved='["classifyIntent","selectAutoModel"]',
         notes="Root cause: vocab mismatch or dead code path. This blocks all AI routing."),

    dict(title="Call selectAutoModel() in the request pipeline — currently defined but never invoked",
         priority="P0", category="backend",
         tables_involved='["agentsam_ai","agentsam_routing_arms"]',
         routes_involved='["selectAutoModel"]',
         notes="Provider waterfall: Ollama→Workers AI→Gemini→OpenAI→Anthropic (via proxy only)"),

    dict(title="Wire provider waterfall so it actually executes in correct priority order",
         priority="P0", category="backend",
         tables_involved='["agentsam_ai"]',
         notes="Verify each provider SSE stream still works end-to-end after wiring"),

    dict(title="Fix dashboard 404s — static assets exist in R2 but worker serves wrong path",
         priority="P0", category="infra",
         notes="Files in R2 but worker looking at wrong prefix. Check worker.js SPA_ROUTES + R2 key structure"),

    dict(title="Consolidate agentsam_slash_commands into agentsam_commands — remove redundancy",
         priority="P0", category="db",
         tables_involved='["agentsam_slash_commands","agentsam_commands"]'),

    # WIRE — P1
    dict(title="Wire agentsam_approval_queue to workflow lifecycle — add /api/approvals route",
         priority="P1", category="backend",
         tables_involved='["agentsam_approval_queue","agentsam_workflow_runs"]',
         notes="Schema is solid. Need: POST to create, PATCH to approve/deny, frontend surface for pending"),

    dict(title="Connect agentsam_context_digest as rollup sink — vectorize digests for RAG memory",
         priority="P1", category="backend",
         tables_involved='["agentsam_context_digest","agentsam_compaction_events"]',
         notes="Pick context_digest as primary. compaction_events = audit log of when compaction ran"),

    dict(title="Wire agentsam_capability_aliases — data exists, nothing reads it",
         priority="P1", category="backend",
         tables_involved='["agentsam_capability_aliases"]'),

    dict(title="Build frontend data pump — app should write to tables, not just seed scripts",
         priority="P1", category="frontend",
         notes="Highest leverage unblock: every action in the UI should create DB records"),

    # BUILD — P2
    dict(title="Create agentsam_model_routing_rules table — currently MISSING from D1",
         priority="P2", category="db",
         tables_involved='["agentsam_model_routing_rules"]',
         notes="Missing entirely. Routing dead without it. Write migration, seed initial rules"),

    dict(title="Implement prompt caching — structure system prompt for cache eligibility",
         priority="P2", category="backend",
         tables_involved='["agentsam_prompt_cache_keys"]',
         notes="Stable system prompt sections qualify for cache. ~10x token cost reduction on hits"),

    dict(title="Replace agentsam_prompt_versions placeholder data with real versioning",
         priority="P2", category="backend",
         tables_involved='["agentsam_prompt_versions"]',
         notes="Current rows are junk. Define promotion criteria: candidate→staging→production"),

    dict(title="Fix agentsam_prompt_routes — routing functionally broken, not driving decisions",
         priority="P2", category="backend",
         tables_involved='["agentsam_prompt_routes"]'),

    dict(title="Add subagent_python_primeaux to agentsam_subagent_profile",
         priority="P2", category="db",
         tables_involved='["agentsam_subagent_profile"]',
         notes="Personal supercharged agent: knows repo structure, CF stack, workflow patterns, Sam's style"),

    dict(title="Define agentsam_workflows triggers/conditions for click-and-forget agentic runs",
         priority="P2", category="backend",
         tables_involved='["agentsam_workflows","agentsam_workflow_nodes","agentsam_workflow_edges"]',
         notes="Every workflow needs: trigger_type, condition on edges, quality_gate_json defined"),

    dict(title="Wire Thompson Sampling — agentsam_routing_arms must be called by selectAutoModel()",
         priority="P2", category="backend",
         tables_involved='["agentsam_routing_arms"]',
         notes="Arms exist, sampling logic exists, never connected. One function call away"),

    dict(title="Define eval promotion thresholds — evals must be gates not dashboards",
         priority="P2", category="backend",
         tables_involved='["agentsam_eval_runs"]',
         notes="Threshold: candidate beats production baseline by X% over N runs → auto-promote"),

    # REFINE — P3
    dict(title="Add parallel tool call support to autonomous work loop — read ops should not serialize",
         priority="P3", category="backend",
         notes="4 parallel read ops = 75% wall time reduction on planning phase"),

    dict(title="Add prompt injection firewall — tool results must not be treated as instructions",
         priority="P3", category="backend",
         notes="External data (R2, D1 results, fetched pages) = user-level trust, not operator-level"),

    dict(title="Refine agentsam_workflow_nodes — verify all node_types have handlers",
         priority="P3", category="backend",
         tables_involved='["agentsam_workflow_nodes"]'),

    dict(title="Wire agentsam_guardrail_events once system is stable enough to hit guardrails",
         priority="P3", category="backend",
         tables_involved='["agentsam_guardrail_events","agentsam_guardrail_rulesets"]',
         notes="Defer — don't guard a broken system"),

    # CUT — P3
    dict(title="Merge agentsam_artifact_skills into agentsam_skill — drop redundant table",
         priority="P3", category="db",
         tables_involved='["agentsam_artifact_skills","agentsam_skill"]'),

    dict(title="Drop agentsam_skill_revision — confirmed redundant",
         priority="P3", category="db",
         tables_involved='["agentsam_skill_revision"]'),
]

# ── D1 helper ─────────────────────────────────────────────────────────────────
def run_d1(sql: str) -> list[dict]:
    result = subprocess.run(
        ["wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--command", sql],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        print(f"  D1 ERROR: {result.stderr.strip()[:200]}")
        return []
    try:
        data = json.loads(result.stdout)
        return data[0].get("results", []) if isinstance(data, list) and data else []
    except Exception as e:
        print(f"  JSON ERROR: {e}")
        return []

def escape(s: str) -> str:
    return s.replace("'", "''")

# ── Seed plan ─────────────────────────────────────────────────────────────────
def seed_plan():
    print("=" * 64)
    print("  SEEDING agentsam_plans + agentsam_plan_tasks")
    print("=" * 64)

    # Upsert plan row
    plan_sql = f"""
    INSERT INTO agentsam_plans (
      id, tenant_id, workspace_id, plan_date, plan_type, title, status,
      morning_brief, tasks_total, risk_level, requires_approval,
      available_providers, default_model
    ) VALUES (
      '{PLAN_ID}',
      '{TENANT_ID}',
      '{WORKSPACE}',
      '{TODAY}',
      'sprint',
      'Agent Sam Stabilization — Replace Cursor Sprint',
      'active',
      'Audit complete. 84 agentsam_* tables: 75 live, 6 ghost, 3 orphan. Priority: unblock routing, fix dashboard, wire approval queue, seed subagent_python_primeaux.',
      {len(TASKS)},
      'high',
      0,
      '["openai","google","workers_ai","anthropic"]',
      'gpt-4o-mini'
    ) ON CONFLICT(id) DO UPDATE SET
      tasks_total = {len(TASKS)},
      status = 'active',
      updated_at = unixepoch();
    """
    print(f"\n[1/2] Inserting plan: {PLAN_ID}")
    run_d1(plan_sql.strip())
    print(f"      tasks_total = {len(TASKS)}")

    # Delete existing tasks for this plan (clean reseed)
    run_d1(f"DELETE FROM agentsam_plan_tasks WHERE plan_id = '{PLAN_ID}';")

    # Insert tasks
    print(f"\n[2/2] Inserting {len(TASKS)} tasks...")
    errors = 0
    for i, t in enumerate(TASKS, 1):
        task_sql = f"""
        INSERT INTO agentsam_plan_tasks (
          plan_id, tenant_id, workspace_id, order_index,
          title, priority, category, status,
          tables_involved, routes_involved, notes,
          files_involved, depends_on, quality_gate_json
        ) VALUES (
          '{PLAN_ID}',
          '{TENANT_ID}',
          '{WORKSPACE}',
          {i},
          '{escape(t["title"])}',
          '{t["priority"]}',
          '{t["category"]}',
          'todo',
          '{t.get("tables_involved", "[]")}',
          '{t.get("routes_involved", "[]")}',
          '{escape(t.get("notes", ""))}',
          '[]',
          '[]',
          '{{}}'
        );
        """
        result = run_d1(task_sql.strip())
        status = "OK" if result is not None else "ERR"
        if status == "ERR":
            errors += 1
        print(f"  [{i:02d}/{len(TASKS)}] {t['priority']} {t['category']:<10} {status}  {t['title'][:55]}")

    # Verify
    print("\n── Verification ─────────────────────────────────────────")
    counts = run_d1(f"""
        SELECT
          (SELECT COUNT(*) FROM agentsam_plans WHERE id='{PLAN_ID}') as plans,
          (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}') as tasks,
          (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}' AND priority='P0') as p0,
          (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}' AND priority='P1') as p1,
          (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}' AND priority='P2') as p2,
          (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}' AND priority='P3') as p3;
    """)
    if counts:
        c = counts[0]
        print(f"  Plans seeded  : {c.get('plans')}")
        print(f"  Tasks seeded  : {c.get('tasks')}")
        print(f"  P0 (UNBLOCK)  : {c.get('p0')}")
        print(f"  P1 (WIRE)     : {c.get('p1')}")
        print(f"  P2 (BUILD)    : {c.get('p2')}")
        print(f"  P3 (REFINE/CUT): {c.get('p3')}")
    print(f"  Errors        : {errors}")
    print(f"\n  Plan ID: {PLAN_ID}")
    print("=" * 64)

if __name__ == "__main__":
    seed_plan()
