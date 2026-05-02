#!/usr/bin/env python3
"""
benchmark-ai-full.py — Comprehensive AI benchmark for Agent Sam
Usage: python3 scripts/benchmark-ai-full.py [prod|sandbox] [--quick]
Requires: SESSION and NEW env vars
"""

import sys
import os
import json
import time
import subprocess
import urllib.request
import urllib.error
from datetime import datetime

# =============================================================================
# CONFIG
# =============================================================================
ENV = sys.argv[1] if len(sys.argv) > 1 else "prod"
QUICK = "--quick" in sys.argv

BASE_URL = (
    "https://inneranimal-dashboard.meauxbility.workers.dev"
    if ENV == "sandbox"
    else "https://inneranimalmedia.com"
)

SESSION = os.environ.get("SESSION", "")
NEW = os.environ.get("NEW", "")

if not SESSION:
    print("ERROR: SESSION env var not set.\n  export SESSION=your-cookie-value")
    sys.exit(1)
if not NEW:
    print("ERROR: NEW env var not set.\n  export NEW=your-ingest-secret")
    sys.exit(1)

# =============================================================================
# MODELS
# =============================================================================
ALL_MODELS = [
    ("claude-haiku-4-5-20251001", "anthropic"),
    ("claude-sonnet-4-6", "anthropic"),
    ("gemini-2.5-flash", "google"),
    ("gemini-3-flash-preview", "google"),
    ("gpt-4.1-nano", "openai"),
    ("gpt-5.4-nano", "openai"),
    ("@cf/meta/llama-4-scout-17b-16e-instruct", "workers_ai"),
    ("auto", "auto"),
]

QUICK_MODELS = [
    ("claude-haiku-4-5-20251001", "anthropic"),
    ("gemini-2.5-flash", "google"),
    ("gpt-4.1-nano", "openai"),
    ("@cf/meta/llama-4-scout-17b-16e-instruct", "workers_ai"),
    ("auto", "auto"),
]

MODELS = QUICK_MODELS if QUICK else ALL_MODELS

# =============================================================================
# TEST PROMPTS
# =============================================================================
PROMPTS = {
    "question": "What is a Cloudflare Durable Object and when should you use one? Reply in 2 sentences.",
    "sql": "Write a SQL query to find the top 5 most expensive AI model calls in the last 7 days from a spend_ledger table with columns: model_key, provider, cost_usd, created_at",
    "shell": "Write a bash one-liner to find all .js files modified in the last 24 hours",
    "code": "Write a Cloudflare Worker fetch handler in JS that validates a Bearer token against env.SECRET and returns 401 if invalid",
    "summarize": "tldr: Cloudflare Workers run JS at the edge, D1 is SQLite, R2 is object storage, Durable Objects provide state",
}

QUICK_INTENTS = ["question", "sql", "code"]
ALL_INTENTS = list(PROMPTS.keys())
INTENTS = QUICK_INTENTS if QUICK else ALL_INTENTS

# Auto routing verification prompts
AUTO_ROUTING_TESTS = {
    "question": "What is Agent Sam and what can it do?",
    "sql": "write a SQL query to count all rows in the ai_models table",
    "shell": "run a bash command to list all running pm2 processes",
    "code": "write a javascript debounce function",
    "summarize": "tldr the difference between R2 and KV storage",
}

# =============================================================================
# HTTP HELPER
# =============================================================================
def post_json(url, body=None, headers=None, timeout=45):
    """Make a POST request, return (status, data, latency_ms)"""
    start = time.time()
    try:
        req_body = json.dumps(body).encode() if body else b""
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
        req = urllib.request.Request(url, data=req_body, headers=req_headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            latency = int((time.time() - start) * 1000)
            data = json.loads(resp.read().decode())
            return resp.status, data, latency
    except urllib.error.HTTPError as e:
        latency = int((time.time() - start) * 1000)
        try:
            data = json.loads(e.read().decode())
        except:
            data = {"error": str(e)}
        return e.code, data, latency
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return 0, {"error": str(e)}, latency

def get_url(url, headers=None, timeout=10):
    start = time.time()
    try:
        req_headers = headers or {}
        req = urllib.request.Request(url, headers=req_headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            latency = int((time.time() - start) * 1000)
            return resp.status, latency
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return 0, latency

# =============================================================================
# RESULT TRACKING
# =============================================================================
results = []

def record(model, intent, status, latency, tokens_in=None, tokens_out=None, error=None, note=None):
    results.append({
        "model": model,
        "intent": intent,
        "status": status,
        "latency": latency,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "error": error,
        "note": note,
    })
    symbol = "✅" if status == "PASS" else "❌"
    tok = f"{tokens_in}in/{tokens_out}out" if tokens_in else ""
    err = f"| {error[:60]}" if error else ""
    nt = f"| {note[:60]}" if note else ""
    print(f"    {symbol} {status} {latency}ms {tok} {err}{nt}")

# =============================================================================
# MAIN
# =============================================================================
print()
print("=" * 65)
print("  AGENT SAM — FULL AI BENCHMARK")
print(f"  Target:  {BASE_URL}")
print(f"  Mode:    {'QUICK' if QUICK else 'FULL'}")
print(f"  Time:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 65)

# =============================================================================
# INFRASTRUCTURE
# =============================================================================
print()
print("── INFRASTRUCTURE CHECKS " + "─" * 40)

# Dashboard
status, latency = get_url(f"{BASE_URL}/dashboard/agent")
print(f"  Dashboard:    HTTP {status} | {latency}ms")

# RAG
status, data, latency = post_json(
    f"{BASE_URL}/api/rag/query",
    body={"query": "what is Agent Sam", "top_k": 3},
    headers={"X-Ingest-Secret": NEW}
)
rag_ok = "PASS" if data.get("ok") else "FAIL"
print(f"  RAG query:    {rag_ok} | {latency}ms | score:{data.get('top_score','?')} | chunks:{data.get('chunks_injected','?')}")

# Vertex
status, data, latency = post_json(
    f"{BASE_URL}/api/agent/vertex-test",
    headers={"X-Ingest-Secret": NEW}
)
vertex_ok = "PASS" if data.get("ok") else f"FAIL: {data.get('error','?')}"
print(f"  Vertex JWT:   {vertex_ok} | {latency}ms")

# Browse
status, data, latency = post_json(
    f"{BASE_URL}/api/agent/browse",
    body={"url": "https://inneranimalmedia.com", "action": "title"},
    headers={"X-Ingest-Secret": NEW},
    timeout=25
)
browse_ok = "PASS" if data.get("ok") else f"FAIL: {data.get('error','?')}"
print(f"  Browse:       {browse_ok} | {latency}ms | \"{data.get('content','?')[:50]}\"")

# =============================================================================
# AI MODEL TESTS
# =============================================================================
print()
print("── AI MODEL TESTS " + "─" * 46)

for model, provider in MODELS:
    print(f"\n  ▸ {model} ({provider})")
    for intent in INTENTS:
        prompt = PROMPTS[intent]
        print(f"    [{intent}] ", end="", flush=True)

        http_status, data, latency = post_json(
            f"{BASE_URL}/api/agent/chat",
            body={"messages": [{"role": "user", "content": prompt}], "model": model, "stream": False},
            headers={"Cookie": f"session={SESSION}"},
            timeout=45
        )

        if "error" in data:
            record(model, intent, "FAIL", latency, error=data["error"])
        else:
            msg = data.get("message") or data.get("content") or data.get("response") or ""
            if msg:
                tok_in = data.get("input_tokens") or data.get("usage", {}).get("input_tokens")
                tok_out = data.get("output_tokens") or data.get("usage", {}).get("output_tokens")
                auto_note = f"routed→{data.get('auto_model','')}" if model == "auto" else None
                record(model, intent, "PASS", latency, tok_in, tok_out, note=auto_note)
            else:
                record(model, intent, "FAIL", latency, error="empty response")

        time.sleep(0.4)

# =============================================================================
# AUTO ROUTING VERIFICATION
# =============================================================================
print()
print("── AUTO ROUTING VERIFICATION " + "─" * 36)

for intent, prompt in AUTO_ROUTING_TESTS.items():
    print(f"  [auto→{intent}] ", end="", flush=True)
    http_status, data, latency = post_json(
        f"{BASE_URL}/api/agent/chat",
        body={"messages": [{"role": "user", "content": prompt}], "model": "auto", "stream": False},
        headers={"Cookie": f"session={SESSION}"},
        timeout=30
    )
    if "error" in data:
        print(f"❌ {latency}ms | {data['error'][:60]}")
    else:
        auto_model = data.get("auto_model", "?")
        routing_rule = data.get("routing_rule", "?")
        print(f"✅ {latency}ms → model:{auto_model} rule:{routing_rule}")
    time.sleep(0.3)

# =============================================================================
# SUMMARY
# =============================================================================
print()
print("=" * 65)
print("  RESULTS SUMMARY")
print("=" * 65)
print()

passed = [r for r in results if r["status"] == "PASS"]
failed = [r for r in results if r["status"] == "FAIL"]

print(f"  {'MODEL':<42} {'INTENT':<12} {'STATUS':<6} {'LATENCY':<10} {'TOKENS'}")
print(f"  {'─'*42} {'─'*12} {'─'*6} {'─'*10} {'─'*15}")

for r in results:
    sym = "✅" if r["status"] == "PASS" else "❌"
    tok = f"{r['tokens_in']}/{r['tokens_out']}" if r.get("tokens_in") else (r.get("error","")[:20] if r["status"]=="FAIL" else "")
    print(f"  {r['model']:<42} {r['intent']:<12} {sym} {r['status']:<4} {str(r['latency'])+'ms':<10} {tok}")

print()
total = len(results)
pct = round(len(passed) * 100 / total) if total else 0
print(f"  PASS: {len(passed)}/{total} ({pct}%)")
print(f"  FAIL: {len(failed)}/{total}")

if passed:
    lats = [r["latency"] for r in passed]
    print(f"  Latency — min:{min(lats)}ms avg:{int(sum(lats)/len(lats))}ms max:{max(lats)}ms")

if failed:
    print()
    print("  FAILURES:")
    for r in failed:
        print(f"    ❌ {r['model']} [{r['intent']}] — {r.get('error','?')[:80]}")

print()

# Per-model latency ranking (passed only)
model_stats = {}
for r in passed:
    m = r["model"]
    if m not in model_stats:
        model_stats[m] = []
    model_stats[m].append(r["latency"])

if model_stats:
    print("  MODEL LATENCY RANKING (avg, passed tests only):")
    ranked = sorted(model_stats.items(), key=lambda x: sum(x[1])/len(x[1]))
    for i, (m, lats) in enumerate(ranked, 1):
        avg = int(sum(lats)/len(lats))
        print(f"  {i:>2}. {m:<45} avg:{avg}ms  ({len(lats)} tests)")

print()
print(f"  Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 65)

sys.exit(0 if not failed else 1)
