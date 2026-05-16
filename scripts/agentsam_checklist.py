#!/usr/bin/env python3
"""
agentsam_checklist.py
---------------------
Feeds the audit findings into gpt-4o-mini and gets back a prioritized
bullet-point to-do checklist. Saves as checklist.md in repo root.

Usage:
    python3 scripts/agentsam_checklist.py

Requires:
    pip install openai
    OPENAI_API_KEY in environment (or .env.cloudflare)
"""

import os
import sys
from pathlib import Path
from datetime import datetime

try:
    from openai import OpenAI
except ImportError:
    sys.exit("Run: pip install openai")

# ── Load API key ──────────────────────────────────────────────────────────────
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    # Try reading from .env.cloudflare
    env_file = Path("/Users/samprimeaux/inneranimalmedia/.env.cloudflare")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
if not api_key:
    sys.exit("OPENAI_API_KEY not found in environment or .env.cloudflare")

client = OpenAI(api_key=api_key)

# ── Audit context ─────────────────────────────────────────────────────────────
AUDIT_CONTEXT = """
You are a senior Cloudflare Workers + AI agent architect. 
The developer is building "Agent Sam" — a self-hosted Cursor replacement 
running on Cloudflare Workers, D1, R2, Durable Objects, with a React SPA dashboard.
Goal: Agent Sam fully replaces Cursor as primary dev environment.

=== AUDIT RESULTS ===

Total agentsam_* D1 tables: 84
LIVE  (data + code refs): 75 (89%)
ORPHAN (data, no code ref): 3 (3%)
GHOST (code ref, no data): 6 (7%)
DEAD: 0

--- GHOST TABLES (code references them but they're empty) ---
- agentsam_approval_queue
  Purpose: agent designs elaborate workflows → user approves → agentic multistep execution
  Status: schema is solid, not yet wired end-to-end
  
- agentsam_artifact_skills
  Purpose: unclear/redundant — agentsam_skill already exists with stockpiled data
  Decision: likely drop or merge

- agentsam_compaction_events
  Purpose: rollup/summarize massive collected rows, tie to vectorize/RAG
  Status: orphan alongside agentsam_context_digest — pick one, implement it

- agentsam_guardrail_events
  Purpose: log guardrail violations
  Status: empty because system isn't functional enough to hit guardrails yet
  Decision: defer until core system is stable

- agentsam_skill_revision
  Purpose: skill version history
  Decision: likely drop — redundant

- agentsam_user_feature_override
  Status: unclear utility right now, defer

--- ORPHAN TABLES (data exists, nothing reads it) ---
- agentsam_capability_aliases
- agentsam_context_digest  (use this OR compaction_events for RAG rollup)
- agentsam_guardrail_rulesets  (defer — system not stable enough yet)

--- HIGH-VALUE STRUCTURAL FIXES (P3 watch list) ---
- agentsam_prompt_versions: LIVE but placeholder junk — needs real versioning
- agentsam_prompt_routes: LIVE but routing is functionally broken (classifyIntent() always returns unclassified)
- agentsam_prompt_cache_keys: LIVE but prompt caching not implemented anywhere
- agentsam_subagent_profile: LIVE but severely underutilized — needs subagent_python_primeaux personal agent
- agentsam_workflows: LIVE but triggers/conditions not refined — should be agentic workforce (click-and-forget)
- agentsam_routing_arms: LIVE — Thompson Sampling arms exist but never called by selectAutoModel()
- agentsam_model_routing_rules: MISSING from D1 entirely — routing dead
- agentsam_eval_runs: LIVE — no promotion threshold defined, evals are dashboards not gates

--- SCHEMA HIGHLIGHTS ---
agentsam_workflows has: workflow_type, trigger_type, default_mode, risk_level, 
  requires_approval, quality_gate_json, max_concurrent_nodes, timeout_ms
agentsam_workflow_runs has: full observability (tokens, cost, duration, supabase sync, 
  graph_mode, kill_reason, heartbeat)
agentsam_workflow_nodes has: node_type (agent/db_query/mcp_tool/script/approval_gate/
  eval/branch/webhook/terminal/retry/parallel/join)
agentsam_workflow_edges has: condition_type (always/threshold/status/elapsed/cost/field/risk/manual/timeout)
agentsam_approval_queue has: full approval lifecycle (tool/workflow/command/script/deploy/
  db_write/r2_write/github_write/terminal/hook) with risk levels and expiry

--- KNOWN BROKEN SYSTEMS ---
- classifyIntent() always returns 'unclassified' — AI routing dead
- selectAutoModel() defined but never called
- Provider waterfall (Ollama → Workers AI → Gemini → OpenAI → Anthropic) not executing
- Frontend not yet pumping data to these tables — seeding via scripts only
- agentsam_slash_commands redundant vs agentsam_commands (has every CF command + more)

--- GOAL ---
Every table that should be driving autonomous agentic behavior needs:
1. A clear owner (which route/handler reads/writes it)
2. A trigger (how does data get in — app, agent, schedule, webhook)
3. A consumer (what acts on it — worker route, workflow node, subagent)
"""

SYSTEM_PROMPT = """
You are a precise technical project manager for an AI agent system.
Output ONLY a structured markdown checklist.
Format: grouped by priority phase, each item is a checkbox with a one-line action.
No preamble, no explanation after the list, no narrative.
Be specific and actionable. Use the developer's own terminology.
Max 60 items total. Group into phases.
"""

USER_PROMPT = f"""
Based on this audit of Agent Sam's D1 tables and codebase, generate a prioritized 
to-do checklist that will move Agent Sam from its current broken state to 
fully replacing Cursor as a development environment.

{AUDIT_CONTEXT}

Group into these phases:
1. UNBLOCK (fix what's actively broken/preventing use)
2. WIRE (connect orphaned/ghost tables to live code)  
3. BUILD (implement missing systems from scratch)
4. REFINE (improve what works but underperforms)
5. CUT (drop/merge redundant tables/systems)

Each item must be specific enough to act on immediately.
"""

# ── Call API ──────────────────────────────────────────────────────────────────
print("Calling gpt-4o-mini...")

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": USER_PROMPT},
    ],
    temperature=0.3,
    max_tokens=2000,
)

checklist = response.choices[0].message.content.strip()

# ── Save output ───────────────────────────────────────────────────────────────
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
output = f"# Agent Sam — Audit Checklist\n_Generated: {timestamp}_\n\n{checklist}\n"

out_path = Path("/Users/samprimeaux/inneranimalmedia/agentsam_checklist.md")
out_path.write_text(output)

print(f"\nSaved to: {out_path}")
print(f"Tokens used: {response.usage.total_tokens}")
print("\n" + "=" * 60)
print(checklist)
print("=" * 60)
