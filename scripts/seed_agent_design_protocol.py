#!/usr/bin/env python3
"""
seed_agent_design_protocol.py
Adds iam_agent_design_protocol to agentsam_scripts and agentsam_mcp_workflows.
Run AFTER copying iam_agent_design_protocol.txt to scripts/sources/.

Usage:
    cd /Users/samprimeaux/inneranimalmedia
    set -a && source .env.cloudflare && set +a
    python3 scripts/seed_agent_design_protocol.py
"""

import json
import os
import sys
import requests

ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
API_TOKEN  = os.environ["CLOUDFLARE_API_TOKEN"]
DB_ID      = os.environ.get("CF_D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
D1_URL     = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB_ID}/query"
HEADERS    = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}


def d1(sql, params=None):
    r = requests.post(D1_URL, headers=HEADERS, json={"sql": sql, "params": params or []}, timeout=20)
    data = r.json()
    if not r.ok or not data.get("success"):
        print(f"  FAIL: {data.get('errors')}")
        sys.exit(1)
    return data


def run(label, sql, params=None):
    print(f"  >> {label}")
    d1(sql, params)
    print(f"     OK")


SCRIPTS_SQL = """
INSERT OR REPLACE INTO agentsam_scripts (
  id, workspace_id, name, path, description, purpose,
  runner, requires_env, owner_only, safe_to_run,
  run_before, run_after, never_run_with, preferred_for,
  notes, is_active, slug, is_global, body, tenant_id, language
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

WORKFLOW_SQL = """
INSERT OR REPLACE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description, status, priority,
  steps_json, tools_json, acceptance_criteria_json, notes,
  tenant_id, workspace_id, trigger_type, input_schema_json, output_schema_json,
  requires_approval, risk_level, run_count, success_count,
  last_run_at, last_run_status, avg_duration_ms, total_cost_usd,
  version, is_active, subagent_slug, model_id, timeout_seconds,
  category, tags_json, retry_policy_json, on_failure_json,
  max_concurrent_runs, environment, visibility, input_defaults_json,
  last_error, task_type, graph_mode, created_at_unix
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

RETRY  = json.dumps({"max_retries": 2, "backoff": "exponential", "delay_ms": 2000, "retry_on": ["timeout", "network_error", "ollama_unavailable"]})
ON_FAIL = json.dumps({"action": "notify", "notify_channel": "resend"})

STEPS = json.dumps([
    {"step": 1, "id": "preflight",     "name": "Preflight",     "description": "Check CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN. Confirm Ollama running with mxbai-embed-large:latest."},
    {"step": 2, "id": "compile_check", "name": "Compile check", "description": "python3 -m py_compile scripts/ingest.py && python3 -c \"import ast; ast.parse(open('scripts/ingest.py').read())\""},
    {"step": 3, "id": "dry_run",       "name": "Dry run",       "description": "python3 scripts/ingest.py --source-id iam_agent_design_protocol_001 --file scripts/sources/iam_agent_design_protocol.txt --dry-run"},
    {"step": 4, "id": "ingest",        "name": "Ingest",        "description": "python3 scripts/ingest.py --source-id iam_agent_design_protocol_001 --file scripts/sources/iam_agent_design_protocol.txt --verify-query \"minimal footprint prompt injection tool safety corrigibility autonomous work loop rollback\""},
    {"step": 5, "id": "verify",        "name": "Verify",        "description": "Run --verify --top-k 20 with domain-specific query. Assert source chunk in top-20 with score >= 0.65."},
])

TOOLS    = json.dumps(["ollama_embed", "vectorize_upsert", "vectorize_query", "execute_code"])
CRITERIA = json.dumps([
    "py_compile passes before execution",
    "Source chunk appears in topK=20 with score >= 0.65",
    "Upsert returns valid mutation_id",
    "15 sections covering all design principles ingested",
])
TAGS     = json.dumps(["agent-design", "mcp", "rollback", "corrigibility", "tool-safety", "prompt-injection", "autonomous", "anthropic", "knowledge-base"])
DEFAULTS = json.dumps({
    "chunk_size_chars": 900,
    "chunk_overlap_chars": 100,
    "min_verify_score": 0.65,
    "top_k": 20,
    "verify_query": "minimal footprint prompt injection tool safety corrigibility autonomous work loop rollback",
    "use_metadata_filter": False,
})

IN_SCHEMA  = json.dumps({"source_id": "string", "force_reingest": "boolean"})
OUT_SCHEMA = json.dumps({"chunk_count": "integer", "top_score": "number", "mutation_id": "string", "status": "string"})


def main():
    print("\n=== agentsam_scripts ===")
    run(
        "ingest-agent-design-protocol",
        SCRIPTS_SQL,
        [
            "script_ingest_agent_design_protocol",
            "ws_sam_primeaux",
            "Ingest: Agent Sam Design Protocol",
            "scripts/sources/iam_agent_design_protocol.txt",
            "Ingests the Agent Sam tooling, scripts, backups, rollback, MCP, model limits, and Anthropic design principles knowledge document. 15 sections covering minimal footprint, prompt injection defense, tool safety levels, parallel tool calls, script writing protocol, Python quality gates, backup/rollback patterns, MCP architecture, eval and promotion gates, model use strategy, prompt caching, multi-agent coordination, corrigibility, and the autonomous work loop. Source ID: iam_agent_design_protocol_001.",
            "ingest",
            "bash",
            1, 1, 1,
            None, None, None,
            "agent_design,mcp,rollback,corrigibility,tool_safety,autonomous,knowledge_base",
            "Run --verify --top-k 20 with domain-specific query. Dense index: generic queries may rank below existing content. Source: scripts/sources/iam_agent_design_protocol.txt.",
            1,
            "ingest-agent-design-protocol",
            1,
            "set -a && source .env.cloudflare && set +a && python3 -m py_compile scripts/ingest.py && python3 scripts/ingest.py --source-id iam_agent_design_protocol_001 --file scripts/sources/iam_agent_design_protocol.txt --verify-query \"minimal footprint prompt injection tool safety corrigibility autonomous work loop rollback\"",
            "sam_primeaux",
            "python",
        ],
    )

    print("\n=== agentsam_mcp_workflows ===")
    run(
        "Agent Sam Design Protocol Knowledge Base",
        WORKFLOW_SQL,
        [
            "wf_iam_agent_design_protocol_001",
            "iam_agent_design_protocol_knowledge_base",
            "Agent Sam Design Protocol Knowledge Base",
            "Agent Sam tooling, scripts, backups, rollback, MCP, model limits, and Anthropic design principles. 15 sections. Covers minimal footprint, prompt injection defense, tool safety levels, parallel tool calls, Python quality gates, backup/rollback patterns, MCP vs RAG, eval promotion gates, model use strategy, prompt caching, multi-agent coordination, corrigibility, and the complete autonomous work loop.",
            "ready",
            "high",
            STEPS,
            TOOLS,
            CRITERIA,
            "15 sections. Script: scripts/ingest.py. Source: scripts/sources/iam_agent_design_protocol.txt. Env: .env.cloudflare.",
            "sam_primeaux",
            "ws_sam_primeaux",
            "manual",
            IN_SCHEMA,
            OUT_SCHEMA,
            0, "low",
            0, 0,
            None, None,
            0.0, 0.0,
            1, 1,
            "subagent_toolbox",
            "gpt-5.4-nano",
            60,
            "knowledge",
            TAGS,
            RETRY,
            ON_FAIL,
            1,
            "production",
            "workspace",
            DEFAULTS,
            None,
            "knowledge_document",
            0,
            1747382820,
        ],
    )

    print("\nAll done.")


if __name__ == "__main__":
    main()
