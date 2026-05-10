#!/usr/bin/env python3
"""
smoke_routing_decisions.py — Preflight: agentsam_routing_decisions

Proves:
  - Ollama local model responds (cost = 0)
  - classifyIntent logic runs and produces a routing decision
  - agentsam_routing_decisions row written to Supabase
  - Row is queryable back immediately
  - run_group_id links this to any paired D1 usage_events row

Usage:
  source ~/inneranimalmedia/scripts/load-agentsam-env.sh
  python3 scripts/smoke/smoke_routing_decisions.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

# ── Env ───────────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "https://dpmuvynqixblxsilnlut.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OLLAMA_URL           = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL         = os.environ.get("OLLAMA_DEFAULT_MODEL", "qwen2.5-coder:7b")

TENANT_ID    = os.environ.get("IAM_TENANT_ID",    "tenant_sam_primeaux")
WORKSPACE_ID = os.environ.get("IAM_WORKSPACE_ID", "ws_inneranimalmedia")
USER_ID      = os.environ.get("IAM_USER_ID",       "au_871d920d1233cbd1")

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
        with urllib.request.urlopen(req, timeout=60) as r:
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

# ── Step 1: Ollama classifyIntent ─────────────────────────────────────────────
def classify_intent_via_ollama(run_group_id):
    classify_prompt = (
        "You are a model router for an AI platform. "
        "Given this user request, output ONLY a JSON object with keys: "
        "intent (string), task_type (string), suggested_model (string), reasoning (string). "
        "No markdown, no explanation.\n\n"
        'User request: "Fix the null pointer bug in my Python script and add a unit test."\n'
        f"run_group_id: {run_group_id}"
    )

    t0 = time.time()
    status, data = http(
        "POST",
        f"{OLLAMA_URL}/api/generate",
        {"Content-Type": "application/json"},
        {"model": OLLAMA_MODEL, "prompt": classify_prompt, "stream": False},
    )
    latency_ms = int((time.time() - t0) * 1000)

    if status != 200:
        raise RuntimeError(f"Ollama {status}: {data}")

    raw_text   = data.get("response", "").strip()
    tokens_in  = data.get("prompt_eval_count", 0)
    tokens_out = data.get("eval_count", 0)

    try:
        clean = raw_text
        if clean.startswith("```"):
            parts = clean.split("```")
            clean = parts[1]
            if clean.startswith("json\n"):
                clean = clean[5:]
        parsed = json.loads(clean)
    except Exception:
        parsed = {
            "intent":          "code_fix",
            "task_type":       "coding",
            "suggested_model": OLLAMA_MODEL,
            "reasoning":       raw_text[:200],
        }

    return parsed, latency_ms, tokens_in, tokens_out

# ── Step 2: write to Supabase ─────────────────────────────────────────────────
def write_routing_decision(run_group_id, classification, latency_ms, tokens_in, tokens_out):
    row = {
        "d1_auth_user_id":          USER_ID,
        "tenant_id":                TENANT_ID,
        "workspace_id":             WORKSPACE_ID,
        "session_id":               f"sess_{uuid.uuid4().hex[:12]}",
        "request_id":               f"req_{uuid.uuid4().hex[:12]}",
        "run_group_id":             run_group_id,
        "task_type":                classification.get("task_type", "coding"),
        "mode":                     "agent",
        "intent":                   classification.get("intent", "code_fix"),
        "requested_model":          "auto",
        "resolved_requested_model": OLLAMA_MODEL,
        "selected_model":           classification.get("suggested_model", OLLAMA_MODEL),
        "provider":                 "ollama",
        "api_platform":             "local",
        "tools_required":           False,
        "supports_tools_required":  False,
        "routing_strategy":         "classify_intent",
        "routing_arm_id":           None,
        "chain_json":               [{"step": "classify_intent", "model": OLLAMA_MODEL}],
        "override_happened":        False,
        "fallback_used":            False,
        "estimated_input_tokens":   tokens_in,
        "estimated_output_tokens":  tokens_out,
        "estimated_cost_usd":       0,
        "latency_ms":               latency_ms,
        "success":                  True,
        "metadata": {
            "smoke_test":   True,
            "script":       "smoke_routing_decisions.py",
            "run_group_id": run_group_id,
            "ollama_model": OLLAMA_MODEL,
            "reasoning":    classification.get("reasoning", "")[:300],
        },
    }

    status, resp = http(
        "POST",
        f"{SUPABASE_URL}/rest/v1/agentsam_routing_decisions",
        supa_headers(),
        row,
    )

    if status not in (200, 201):
        raise RuntimeError(f"Supabase write failed ({status}): {resp}")

    inserted = resp[0] if isinstance(resp, list) else resp
    return inserted.get("id")

# ── Step 3: query back ────────────────────────────────────────────────────────
def verify_row(row_id, run_group_id):
    url     = f"{SUPABASE_URL}/rest/v1/agentsam_routing_decisions?id=eq.{row_id}&select=*"
    headers = {**supa_headers(), "Prefer": ""}
    status, resp = http("GET", url, headers)

    if status != 200 or not resp:
        raise RuntimeError(f"Query-back failed ({status}): {resp}")

    row = resp[0]
    assert row["run_group_id"]       == run_group_id,     "run_group_id mismatch"
    assert row["provider"]           == "ollama",          "provider mismatch"
    assert row["routing_strategy"]   == "classify_intent", "routing_strategy mismatch"
    assert row["success"]            is True,              "success should be True"
    assert row["estimated_cost_usd"] == 0,                 "cost should be 0"
    return row

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    run_group_id = f"routing_smoke_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    print(f"\n{'='*60}")
    print(f"  Agent Sam Routing Decision Smoke")
    print(f"  run_group_id : {run_group_id}")
    print(f"  ollama_model : {OLLAMA_MODEL}")
    print(f"  ollama_url   : {OLLAMA_URL}")
    print(f"  supabase     : {SUPABASE_URL}")
    print(f"{'='*60}\n")

    results = {}

    print("[1/3] Calling Ollama classifyIntent...", end=" ", flush=True)
    try:
        classification, latency_ms, tokens_in, tokens_out = classify_intent_via_ollama(run_group_id)
        print(f"OK  ({latency_ms}ms  in={tokens_in} out={tokens_out})")
        print(f"     intent={classification.get('intent')}  "
              f"task_type={classification.get('task_type')}  "
              f"selected={classification.get('suggested_model')}")
        results["ollama_classify"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["ollama_classify"] = "FAIL"
        classification = {
            "intent": "code_fix", "task_type": "coding",
            "suggested_model": OLLAMA_MODEL, "reasoning": f"ollama_error: {e}",
        }
        latency_ms = tokens_in = tokens_out = 0

    print("[2/3] Writing to agentsam_routing_decisions...", end=" ", flush=True)
    row_id = None
    try:
        row_id = write_routing_decision(
            run_group_id, classification, latency_ms, tokens_in, tokens_out
        )
        print(f"OK  (id={row_id})")
        results["supabase_write"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["supabase_write"] = "FAIL"

    print("[3/3] Querying back proof row...", end=" ", flush=True)
    if row_id:
        try:
            row = verify_row(row_id, run_group_id)
            print(f"OK")
            print(f"     selected_model   = {row['selected_model']}")
            print(f"     routing_strategy = {row['routing_strategy']}")
            print(f"     cost_usd         = {row['estimated_cost_usd']}")
            print(f"     latency_ms       = {row['latency_ms']}")
            print(f"     tokens_in/out    = {row['estimated_input_tokens']} / {row['estimated_output_tokens']}")
            results["supabase_verify"] = "PASS"
        except Exception as e:
            print(f"FAIL\n     {e}")
            results["supabase_verify"] = "FAIL"
    else:
        print("SKIP (write failed, no row_id)")
        results["supabase_verify"] = "SKIP"

    passed = all(v == "PASS" for v in results.values())
    print(f"\n{'='*60}")
    for k, v in results.items():
        mark = "+" if v == "PASS" else ("~" if v == "SKIP" else "x")
        print(f"  [{mark}] {k:<22} {v}")
    print()
    print(f"  Supabase table  : agentsam_routing_decisions")
    print(f"  run_group_id    : {run_group_id}")
    print(f"  provider        : ollama")
    print(f"  cost_usd        : 0")
    print()
    print(f"  {'PASS' if passed else 'FAIL'} — Agent Sam Routing Decision Smoke")
    print(f"{'='*60}\n")

    sys.exit(0 if passed else 1)

if __name__ == "__main__":
    main()
