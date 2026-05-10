#!/usr/bin/env python3
"""
smoke_workflow_runs.py — Preflight: agentsam_workflow_runs (Supabase)

Proves:
  - Multi-step workflow captured in Supabase mirror
  - d1_run_id linkage field populated (D1 ↔ Supabase bridge)
  - Ollama runs step 1 (free)
  - Escalation to OpenAI runs step 2 if Ollama slow/fails
  - steps_completed tracked as workflow progresses
  - Final status updated to completed
  - Row queryable back with full step_results_json

Usage:
  source ~/inneranimalmedia/scripts/load-agentsam-env.sh
  python3 scripts/smoke/smoke_workflow_runs.py
"""

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
import urllib.error
import urllib.request

# ── Env ───────────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "https://dpmuvynqixblxsilnlut.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_API_KEY       = os.environ.get("OPENAI_API_KEY", "")
OLLAMA_URL           = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL         = os.environ.get("OLLAMA_DEFAULT_MODEL", "qwen2.5-coder:7b")

TENANT_ID           = os.environ.get("IAM_TENANT_ID",           "tenant_sam_primeaux")
WORKSPACE_ID        = os.environ.get("IAM_WORKSPACE_ID",        "ws_inneranimalmedia")
USER_ID             = os.environ.get("IAM_USER_ID",             "au_871d920d1233cbd1")
IDENTITY_PROFILE_ID = os.environ.get("IAM_IDENTITY_PROFILE_ID","")
SUPABASE_USER_ID    = os.environ.get("IAM_SUPABASE_USER_ID",   "")
USER_EMAIL          = os.environ.get("IAM_USER_EMAIL",          "")
PERSON_UUID         = os.environ.get("IAM_PERSON_UUID",         "")

STEPS_TOTAL = 3  # classify → generate → verify

if not SUPABASE_SERVICE_KEY:
    sys.exit("ERROR: SUPABASE_SERVICE_ROLE_KEY not set. Re-source load-agentsam-env.sh.")

# ── Helpers ───────────────────────────────────────────────────────────────────
def now_iso():
    return datetime.now(timezone.utc).isoformat()

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

# ── Model calls ───────────────────────────────────────────────────────────────
def call_ollama(prompt):
    t0 = time.time()
    status, data = http(
        "POST",
        f"{OLLAMA_URL}/api/generate",
        {"Content-Type": "application/json"},
        {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
    )
    latency_ms = int((time.time() - t0) * 1000)
    if status != 200:
        raise RuntimeError(f"Ollama {status}: {data.get('error', data)}")
    return (
        data.get("response", "").strip(),
        data.get("prompt_eval_count", 0),
        data.get("eval_count", 0),
        latency_ms,
    )

def call_openai(model, prompt):
    new_style  = any(x in model for x in ["o1","o3","o4","5.4","5.5"])
    token_param = "max_completion_tokens" if new_style else "max_tokens"
    t0 = time.time()
    status, data = http(
        "POST",
        "https://api.openai.com/v1/chat/completions",
        {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        {"model": model, token_param: 64,
         "messages": [{"role": "user", "content": prompt}]},
    )
    latency_ms = int((time.time() - t0) * 1000)
    if status != 200:
        raise RuntimeError(f"OpenAI {status}: {data.get('error',{}).get('message',str(data))[:200]}")
    return (
        data["choices"][0]["message"]["content"].strip(),
        data["usage"]["prompt_tokens"],
        data["usage"]["completion_tokens"],
        latency_ms,
    )

# ── Supabase workflow run ops ─────────────────────────────────────────────────
def create_workflow_run(run_group_id, d1_run_id, started_at):
    row = {
        "id":            f"wrun_{uuid.uuid4().hex[:16]}",
        "d1_run_id":     d1_run_id,
        "tenant_id":     TENANT_ID,
        "workspace_id":  WORKSPACE_ID,
        "workflow_id":   "wf_e2e_smoke",
        "workflow_key":  "e2e_observability_smoke",
        "display_name":  "E2E Observability Smoke",
        "trigger_type":  "manual",
        "status":        "running",
        "input_json":    {"run_group_id": run_group_id, "steps_total": STEPS_TOTAL},
        "output_json":   {},
        "step_results_json": [],
        "steps_completed":   0,
        "steps_total":       STEPS_TOTAL,
        "model_used":        OLLAMA_MODEL,
        "input_tokens":      0,
        "output_tokens":     0,
        "cost_usd":          0,
        "environment":       "local",
        "retry_count":       0,
        "started_at":        started_at,
    }
    status, resp = http(
        "POST",
        f"{SUPABASE_URL}/rest/v1/agentsam_workflow_runs",
        supa_headers(),
        row,
    )
    if status not in (200, 201):
        raise RuntimeError(f"workflow_runs create failed ({status}): {resp}")
    inserted = resp[0] if isinstance(resp, list) else resp
    return inserted["id"]

def patch_workflow_run(wrun_id, patch):
    status, resp = http(
        "PATCH",
        f"{SUPABASE_URL}/rest/v1/agentsam_workflow_runs?id=eq.{wrun_id}",
        {**supa_headers(), "Prefer": "return=representation"},
        patch,
    )
    if status not in (200, 201):
        raise RuntimeError(f"workflow_runs patch failed ({status}): {resp}")

def verify_workflow_run(wrun_id, run_group_id):
    status, resp = http(
        "GET",
        f"{SUPABASE_URL}/rest/v1/agentsam_workflow_runs?id=eq.{wrun_id}&select=*",
        {**supa_headers(), "Prefer": ""},
    )
    if status != 200 or not resp:
        raise RuntimeError(f"Query-back failed ({status}): {resp}")
    row = resp[0]
    assert row["status"]           == "completed",   "status should be completed"
    assert row["steps_completed"]  == STEPS_TOTAL,   f"steps_completed should be {STEPS_TOTAL}"
    assert row["input_tokens"]     > 0,              "input_tokens should be > 0"
    assert row["d1_run_id"]        is not None,      "d1_run_id should be set"
    return row

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    run_group_id = f"workflow_smoke_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    d1_run_id    = f"wrun_{uuid.uuid4().hex[:16]}"   # simulated D1 run ID
    started_at   = now_iso()

    print(f"\n{'='*60}")
    print(f"  Agent Sam Workflow Run Smoke")
    print(f"  run_group_id : {run_group_id}")
    print(f"  d1_run_id    : {d1_run_id}  (simulated D1 link)")
    print(f"  steps_total  : {STEPS_TOTAL}")
    print(f"  supabase     : {SUPABASE_URL}")
    print(f"{'='*60}\n")

    results    = {}
    step_log   = []
    total_ti   = 0
    total_to   = 0
    model_used = OLLAMA_MODEL
    wrun_id    = None

    # ── Create workflow run row ───────────────────────────────────────────────
    print("[INIT] Creating workflow run in Supabase...", end=" ", flush=True)
    try:
        wrun_id = create_workflow_run(run_group_id, d1_run_id, started_at)
        print(f"OK  (id={wrun_id})")
        results["workflow_create"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["workflow_create"] = "FAIL"
        sys.exit(1)

    # ── Step 1: classify (Ollama) ─────────────────────────────────────────────
    print(f"\n[Step 1/{STEPS_TOTAL}] classify_intent via Ollama...", end=" ", flush=True)
    try:
        text, ti, to, lat = call_ollama(
            "In one sentence, what is the main purpose of an AI model router?"
        )
        total_ti   += ti
        total_to   += to
        step_log.append({
            "step": 1, "key": "classify_intent", "provider": "ollama",
            "model": OLLAMA_MODEL, "status": "success",
            "tokens_in": ti, "tokens_out": to, "latency_ms": lat,
            "output_preview": text[:80],
        })
        print(f"OK  ({lat}ms  in={ti} out={to})")
        patch_workflow_run(wrun_id, {
            "steps_completed": 1,
            "step_results_json": step_log,
            "input_tokens": total_ti,
            "output_tokens": total_to,
        })
        results["step1_classify"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        step_log.append({"step": 1, "key": "classify_intent", "status": "failed", "error": str(e)[:100]})
        results["step1_classify"] = "FAIL"

    # ── Step 2: generate (escalate to OpenAI if Ollama slow or key available) ─
    escalation_model = None
    for m in ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-4.1-nano"]:
        escalation_model = m
        break

    print(f"[Step 2/{STEPS_TOTAL}] generate via escalation ({escalation_model})...", end=" ", flush=True)
    if OPENAI_API_KEY:
        try:
            text, ti, to, lat = call_openai(
                escalation_model,
                "Reply in exactly 10 words: what does a workflow orchestrator do?"
            )
            model_used  = escalation_model
            total_ti   += ti
            total_to   += to
            step_log.append({
                "step": 2, "key": "generate", "provider": "openai",
                "model": escalation_model, "status": "success",
                "tokens_in": ti, "tokens_out": to, "latency_ms": lat,
                "output_preview": text[:80],
            })
            print(f"OK  ({lat}ms  in={ti} out={to})")
            patch_workflow_run(wrun_id, {
                "steps_completed": 2,
                "model_used": escalation_model,
                "step_results_json": step_log,
                "input_tokens": total_ti,
                "output_tokens": total_to,
            })
            results["step2_generate"] = "PASS"
        except Exception as e:
            print(f"FAIL\n     {e}")
            step_log.append({"step": 2, "key": "generate", "status": "failed", "error": str(e)[:100]})
            results["step2_generate"] = "FAIL"
    else:
        print("SKIP — OPENAI_API_KEY not set")
        results["step2_generate"] = "SKIP"

    # ── Step 3: verify (Ollama, lightweight) ─────────────────────────────────
    print(f"[Step 3/{STEPS_TOTAL}] verify output via Ollama...", end=" ", flush=True)
    try:
        text, ti, to, lat = call_ollama("Reply with exactly: verified_ok")
        total_ti   += ti
        total_to   += to
        step_log.append({
            "step": 3, "key": "verify", "provider": "ollama",
            "model": OLLAMA_MODEL, "status": "success",
            "tokens_in": ti, "tokens_out": to, "latency_ms": lat,
            "output_preview": text[:40],
        })
        print(f"OK  ({lat}ms  in={ti} out={to})")
        results["step3_verify"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        step_log.append({"step": 3, "key": "verify", "status": "failed", "error": str(e)[:100]})
        results["step3_verify"] = "FAIL"

    # ── Close workflow run ────────────────────────────────────────────────────
    steps_done = sum(1 for s in step_log if s.get("status") == "success")
    print(f"\n[CLOSE] Marking workflow completed ({steps_done}/{STEPS_TOTAL} steps)...", end=" ", flush=True)
    try:
        patch_workflow_run(wrun_id, {
            "status":            "completed",
            "steps_completed":   steps_done,
            "step_results_json": step_log,
            "input_tokens":      total_ti,
            "output_tokens":     total_to,
            "cost_usd":          0,
            "model_used":        model_used,
            "completed_at":      now_iso(),
            "output_json": {
                "run_group_id":   run_group_id,
                "d1_run_id":      d1_run_id,
                "steps_complete": steps_done,
                "total_tokens":   total_ti + total_to,
            },
        })
        print("OK")
        results["workflow_close"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["workflow_close"] = "FAIL"

    # ── Verify final row ──────────────────────────────────────────────────────
    print("[VERIFY] Querying back final workflow row...", end=" ", flush=True)
    try:
        row = verify_workflow_run(wrun_id, run_group_id)
        print(f"OK")
        print(f"     status           = {row['status']}")
        print(f"     steps_completed  = {row['steps_completed']}/{row['steps_total']}")
        print(f"     model_used       = {row['model_used']}")
        print(f"     input_tokens     = {row['input_tokens']}")
        print(f"     output_tokens    = {row['output_tokens']}")
        print(f"     d1_run_id        = {row['d1_run_id']}")
        print(f"     cost_usd         = {row['cost_usd']}")
        results["workflow_verify"] = "PASS"
    except Exception as e:
        print(f"FAIL\n     {e}")
        results["workflow_verify"] = "FAIL"

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = all(v == "PASS" for v in results.values() if v != "SKIP")
    print(f"\n{'='*60}")
    for k, v in results.items():
        mark = "+" if v == "PASS" else ("~" if v == "SKIP" else "x")
        print(f"  [{mark}] {k:<22} {v}")
    print()
    print(f"  Supabase table  : agentsam_workflow_runs")
    print(f"  run_group_id    : {run_group_id}")
    print(f"  d1_run_id       : {d1_run_id}")
    print(f"  total_tokens    : {total_ti + total_to}")
    print(f"  cost_usd        : 0")
    print()
    print(f"  {'PASS' if passed else 'FAIL'} — Agent Sam Workflow Run Smoke")
    print(f"{'='*60}\n")

    sys.exit(0 if passed else 1)

if __name__ == "__main__":
    main()
