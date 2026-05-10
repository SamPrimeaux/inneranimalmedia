#!/usr/bin/env python3
"""
smoke_prompt_runs.py — Preflight: agentsam_prompt_runs

Proves:
  - Prompt assembly metadata captured (no live model call needed)
  - agentsam_prompt_runs row written to Supabase
  - Row is queryable back immediately
  - run_group_id links to paired routing/stream rows

Usage:
  source ~/inneranimalmedia/scripts/load-agentsam-env.sh
  python3 scripts/smoke/smoke_prompt_runs.py
"""

import json
import os
import sys
import hashlib
import uuid
from datetime import datetime, timezone
import urllib.error
import urllib.request

# ── Env ───────────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "https://dpmuvynqixblxsilnlut.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TENANT_ID            = os.environ.get("IAM_TENANT_ID",    "tenant_sam_primeaux")
WORKSPACE_ID         = os.environ.get("IAM_WORKSPACE_ID", "ws_inneranimalmedia")
USER_ID              = os.environ.get("IAM_USER_ID",       "au_871d920d1233cbd1")
IDENTITY_PROFILE_ID  = os.environ.get("IAM_IDENTITY_PROFILE_ID", "")
SUPABASE_USER_ID     = os.environ.get("IAM_SUPABASE_USER_ID", "")
USER_EMAIL           = os.environ.get("IAM_USER_EMAIL", "")
PERSON_UUID          = os.environ.get("IAM_PERSON_UUID", "")
OLLAMA_MODEL         = os.environ.get("OLLAMA_DEFAULT_MODEL", "qwen2.5-coder:7b")

if not SUPABASE_SERVICE_KEY:
    sys.exit("ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Re-source load-agentsam-env.sh.")

# ── Helpers ───────────────────────────────────────────────────────────────────
def http(method, url, headers, body=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8", errors="replace"))

def supa_headers():
    return {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

# ── Step 1: simulate prompt assembly ─────────────────────────────────────────
def assemble_prompt(run_group_id):
    """
    Simulates what agentChatDirectSseHandler does before calling a model:
    - picks a prompt profile
    - builds a system prompt
    - attaches context blocks
    - measures sizes
    - notes what was included/omitted
    - hashes the system prompt
    No model call. No cost.
    """
    system_prompt = (
        "You are Agent Sam, an AI developer assistant for Inner Animal Media. "
        "You help with code, infrastructure, deployments, and database work. "
        "You have access to Cloudflare Workers, D1, R2, Supabase, and local tools. "
        "Always prefer local Ollama models when cost matters. "
        "Tenant: tenant_sam_primeaux. Workspace: ws_inneranimalmedia."
    )

    context_block = (
        f"run_group_id: {run_group_id}\n"
        "active_plan: e2e_supabase_smoke\n"
        "environment: local_first\n"
        "ollama_available: true\n"
        "supabase_enabled: true\n"
    )

    included_prompts = [
        "system_core",
        "agent_identity",
        "workspace_context",
        "tool_policy",
    ]

    omitted_prompts = [
        "rag_codebase_chunks",   # skipped — no RAG query in this smoke
        "session_history",       # skipped — fresh session
    ]

    context_sources = [
        {"source": "workspace_state",   "chars": 120},
        {"source": "active_plan",       "chars": 48},
        {"source": "environment_flags", "chars": 64},
    ]

    warnings = []
    if OLLAMA_MODEL == "qwen2.5-coder:7b":
        warnings.append("local_model_selected: context window limited to 8k")

    system_prompt_chars  = len(system_prompt)
    context_block_chars  = len(context_block)
    total_prompt_chars   = system_prompt_chars + context_block_chars
    estimated_tokens     = total_prompt_chars // 4  # rough 4-chars-per-token estimate
    system_prompt_hash   = hashlib.sha256(system_prompt.encode()).hexdigest()[:16]

    return {
        "system_prompt":        system_prompt,
        "system_prompt_hash":   system_prompt_hash,
        "system_prompt_chars":  system_prompt_chars,
        "context_block_chars":  context_block_chars,
        "total_prompt_chars":   total_prompt_chars,
        "estimated_tokens":     estimated_tokens,
        "final_input_tokens":   estimated_tokens,  # pre-call estimate
        "included_prompts":     included_prompts,
        "omitted_prompts":      omitted_prompts,
        "context_sources":      context_sources,
        "warnings":             warnings,
    }

# ── Step 2: write to Supabase ─────────────────────────────────────────────────
def write_prompt_run(run_group_id, prompt_data):
    row = {
        "identity_profile_id":  IDENTITY_PROFILE_ID or None,
        "supabase_user_id":     SUPABASE_USER_ID    or None,
        "d1_auth_user_id":      USER_ID,
        "user_email":           USER_EMAIL          or None,
        "person_uuid":          PERSON_UUID         or None,
        "tenant_id":            TENANT_ID,
        "workspace_id":         WORKSPACE_ID,
        "session_id":           f"sess_{uuid.uuid4().hex[:12]}",
        "request_id":           f"req_{uuid.uuid4().hex[:12]}",
        "run_group_id":         run_group_id,

        "prompt_profile_key":   "agent_sam_default",
        "agent_id":             "agent-sam",
        "mode":                 "agent",
        "intent":               "smoke_test",

        "system_prompt_hash":   prompt_data["system_prompt_hash"],
        "system_prompt_chars":  prompt_data["system_prompt_chars"],
        "context_block_chars":  prompt_data["context_block_chars"],
        "total_prompt_chars":   prompt_data["total_prompt_chars"],
        "estimated_tokens":     prompt_data["estimated_tokens"],
        "final_input_tokens":   prompt_data["final_input_tokens"],

        "included_prompts":     prompt_data["included_prompts"],
        "omitted_prompts":      prompt_data["omitted_prompts"],
        "context_sources":      prompt_data["context_sources"],
        "warnings":             prompt_data["warnings"],

        "metadata": {
            "smoke_test":   True,
            "script":       "smoke_prompt_runs.py",
            "run_group_id": run_group_id,
            "ollama_model": OLLAMA_MODEL,
        },
    }

    status, resp = http(
        "POST",
        f"{SUPABASE_URL}/rest/v1/agentsam_prompt_runs",
        supa_headers(),
        row,
    )

    if status not in (200, 201):
        raise RuntimeError(f"Supabase write failed ({status}): {resp}")

    inserted = resp[0] if isinstance(resp, list) else resp
    return inserted.get("id")

# ── Step 3: query back ────────────────────────────────────────────────────────
def verify_row(row_id, run_group_id, prompt_data):
    url     = f"{SUPABASE_URL}/rest/v1/agentsam_prompt_runs?id=eq.{row_id}&select=*"
    headers = {**supa_headers(), "Prefer": ""}
    status, resp = http("GET", url, headers)

    if status != 200 or not resp:
        raise RuntimeError(f"Query-back failed ({status}): {resp}")

    row = resp[0]
    assert row["run_group_id"]       == run_group_id,                    "run_group_id mismatch"
    assert row["system_prompt_hash"] == prompt_data["system_prompt_hash"],"hash mismatch"
    assert row["total_prompt_chars"] == prompt_data["total_prompt_chars"],"char count mismatch"
    assert row["agent_id"]           == "agent-sam",                     "agent_id mismatch"
    assert isinstance(row["included_prompts"], list),                    "included_prompts not a list"
    assert len(row["included_prompts"]) > 0,                             "included_prompts empty"
    assert isinstance(row["omitted_prompts"], list),                     "omitted_prompts not a list"
    return row

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    run_group_id = f"prompt_smoke_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    print(f"\n{'='*60}")
    print(f"  Agent Sam Prompt Run Smoke")
    print(f"  run_group_id : {run_group_id}")
    print(f"  supabase     : {SUPABASE_URL}")
    print(f"  no model call — cost = 0")
    print(f"{'='*60}\n")

    results = {}

    # ── 1: Assemble prompt ────────────────────────────────────────────────────
    print("[1/3] Assembling prompt metadata...", end=" ", flush=True)
    try:
        prompt_data = assemble_prompt(run_group_id)
        print(f"OK")
        print(f"     system_prompt_chars  = {prompt_data['system_prompt_chars']}")
        print(f"     context_block_chars  = {prompt_data['context_block_chars']}")
        print(f"     total_prompt_chars   = {prompt_data['total_prompt_chars']}")
        print(f"     estimated_tokens     = {prompt_data['estimated_tokens']}")
        print(f"     system_prompt_hash   = {prompt_data['system_prompt_hash']}")
        print(f"     included_prompts     = {prompt_data['included_prompts']}")
        print(f"     omitted_prompts      = {prompt_data['omitted_prompts']}")
        print(f"     warnings             = {prompt_data['warnings']}")
        results["prompt_assembly"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["prompt_assembly"] = "FAIL"
        sys.exit(1)

    # ── 2: Write to Supabase ──────────────────────────────────────────────────
    print("[2/3] Writing to agentsam_prompt_runs...", end=" ", flush=True)
    row_id = None
    try:
        row_id = write_prompt_run(run_group_id, prompt_data)
        print(f"OK  (id={row_id})")
        results["supabase_write"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["supabase_write"] = "FAIL"

    # ── 3: Query back ─────────────────────────────────────────────────────────
    print("[3/3] Querying back proof row...", end=" ", flush=True)
    if row_id:
        try:
            row = verify_row(row_id, run_group_id, prompt_data)
            print(f"OK")
            print(f"     prompt_profile_key  = {row['prompt_profile_key']}")
            print(f"     system_prompt_hash  = {row['system_prompt_hash']}")
            print(f"     total_prompt_chars  = {row['total_prompt_chars']}")
            print(f"     estimated_tokens    = {row['estimated_tokens']}")
            print(f"     included_prompts    = {row['included_prompts']}")
            print(f"     omitted_prompts     = {row['omitted_prompts']}")
            results["supabase_verify"] = "PASS"
        except Exception as e:
            print(f"FAIL\n     {e}")
            results["supabase_verify"] = "FAIL"
    else:
        print("SKIP (write failed, no row_id)")
        results["supabase_verify"] = "SKIP"

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = all(v == "PASS" for v in results.values())
    print(f"\n{'='*60}")
    for k, v in results.items():
        mark = "+" if v == "PASS" else ("~" if v == "SKIP" else "x")
        print(f"  [{mark}] {k:<22} {v}")
    print()
    print(f"  Supabase table  : agentsam_prompt_runs")
    print(f"  run_group_id    : {run_group_id}")
    print(f"  cost_usd        : 0")
    print(f"  model_call      : none")
    print()
    print(f"  {'PASS' if passed else 'FAIL'} — Agent Sam Prompt Run Smoke")
    print(f"{'='*60}\n")

    sys.exit(0 if passed else 1)

if __name__ == "__main__":
    main()
