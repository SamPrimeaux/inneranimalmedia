#!/usr/bin/env python3
"""
agentsam_benchmark_flood_v2.py
──────────────────────────────
Full benchmark across OpenAI / Anthropic / Google / Workers AI.
Writes real token counts, latency, cost, quality to:
  • D1  → ai_api_test_runs + agentsam_routing_arms (Thompson update)
  • Supabase → model_performance_snapshots (rollup upsert)

ZERO NULL POLICY: every field is populated before insert.
Computed fields that can't be measured are derived from model pricing
rather than left NULL.

Usage:
  python3 scripts/agentsam_benchmark_flood_v2.py --mini          # pipeline validation only (1 call/provider)
  python3 scripts/agentsam_benchmark_flood_v2.py --suite default  # full default suite
  python3 scripts/agentsam_benchmark_flood_v2.py --suite routing  # intent classification only
  python3 scripts/agentsam_benchmark_flood_v2.py --suite cost     # token burn test
  python3 scripts/agentsam_benchmark_flood_v2.py --providers openai,google
  python3 scripts/agentsam_benchmark_flood_v2.py --skip-expensive # skip opus/gpt-5.4-pro/gemini-3.1-pro
"""

import os, sys, json, time, hashlib, uuid, subprocess, textwrap, argparse, statistics
from datetime import datetime, timezone
from pathlib import Path
import urllib.request, urllib.error

# ── env load ─────────────────────────────────────────────────────────────────
for env_file in [".env.agentsam.local", ".env"]:
    p = Path(__file__).parent.parent / env_file
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

# ── args ─────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--mini",           action="store_true", help="Pipeline validation: 1 call per provider")
parser.add_argument("--suite",          default="default")
parser.add_argument("--providers",      default="", help="Comma-separated: openai,anthropic,google,workers_ai")
parser.add_argument("--skip-expensive", action="store_true", help="Skip opus/gpt-5.4-pro/gemini-3.1-pro")
parser.add_argument("--dry-run",        action="store_true")
args = parser.parse_args()

DRY_RUN      = args.dry_run
MINI         = args.mini
DB           = "inneranimalmedia-business"
WORKSPACE_ID = "ws_inneranimalmedia"
TENANT_ID    = "tenant_sam_primeaux"
RUN_GROUP_ID = f"bench_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
TODAY        = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NOW_ISO      = datetime.now(timezone.utc).isoformat()

# Provider filter
PROVIDER_FILTER = set(args.providers.split(",")) if args.providers else None

# ── colour ───────────────────────────────────────────────────────────────────
R="\033[91m"; Y="\033[93m"; G="\033[92m"; C="\033[96m"; D="\033[2m"; X="\033[0m"; B="\033[1m"
def hdr(t):  print(f"\n{B}{C}{'═'*68}{X}\n{B}  {t}{X}\n{'═'*68}")
def ok(m):   print(f"  {G}✓{X}  {m}")
def warn(m): print(f"  {Y}⚠{X}  {m}")
def err(m):  print(f"  {R}✗{X}  {m}")
def info(m): print(f"  {D}{m}{X}")

# ── MODEL REGISTRY ────────────────────────────────────────────────────────────
# All costs in USD per million tokens (in / out)
# expensive=True → skipped with --skip-expensive
MODELS = [
    # ── OpenAI GPT-5.4 family ───────────────────────────────────────────────
    {"key":"gpt-5.4-nano",   "provider":"openai",     "model_id":"gpt-5.4-nano",
     "in_m":0.20,  "out_m":1.25,  "ctx":400000,  "tier":"nano",     "expensive":False},
    {"key":"gpt-5.4-mini",   "provider":"openai",     "model_id":"gpt-5.4-mini",
     "in_m":0.75,  "out_m":4.50,  "ctx":400000,  "tier":"mini",     "expensive":False},
    {"key":"gpt-5.4",        "provider":"openai",     "model_id":"gpt-5.4",
     "in_m":2.50,  "out_m":15.00, "ctx":1050000, "tier":"standard", "expensive":False},
    {"key":"gpt-5.4-pro",    "provider":"openai",     "model_id":"gpt-5.4-pro",
     "in_m":30.00, "out_m":180.00,"ctx":1050000, "tier":"max",      "expensive":True},
    # ── Anthropic Claude ────────────────────────────────────────────────────
    {"key":"claude-haiku-4-5",  "provider":"anthropic", "model_id":"claude-haiku-4-5-20251001",
     "in_m":1.00,  "out_m":5.00,  "ctx":200000,  "tier":"mini",     "expensive":False},
    {"key":"claude-sonnet-4-6", "provider":"anthropic", "model_id":"claude-sonnet-4-6",
     "in_m":3.00,  "out_m":15.00, "ctx":1000000, "tier":"standard", "expensive":False},
    {"key":"claude-opus-4-7",   "provider":"anthropic", "model_id":"claude-opus-4-7",
     "in_m":5.00,  "out_m":25.00, "ctx":1000000, "tier":"max",      "expensive":True},
    # ── Google Gemini ────────────────────────────────────────────────────────
    {"key":"gemini-2.5-flash-lite", "provider":"google", "model_id":"gemini-2.5-flash-lite",
     "in_m":0.10,  "out_m":0.40,  "ctx":1048576, "tier":"nano",     "expensive":False},
    {"key":"gemini-2.5-flash",      "provider":"google", "model_id":"gemini-2.5-flash",
     "in_m":0.30,  "out_m":2.50,  "ctx":1048576, "tier":"mini",     "expensive":False},
    {"key":"gemini-2.5-pro",        "provider":"google", "model_id":"gemini-2.5-pro",
     "in_m":1.25,  "out_m":10.00, "ctx":1048576, "tier":"standard", "expensive":False},
    {"key":"gemini-3.1-pro-preview","provider":"google", "model_id":"gemini-3.1-pro-preview",
     "in_m":2.00,  "out_m":12.00, "ctx":1048576, "tier":"max",      "expensive":True},
    # ── Cloudflare Workers AI ────────────────────────────────────────────────
    {"key":"cf-granite-micro",  "provider":"workers_ai",
     "model_id":"@cf/ibm-granite/granite-4.0-h-micro",
     "in_m":0.017, "out_m":0.112, "ctx":128000,  "tier":"nano",     "expensive":False},
    {"key":"cf-glm-flash",      "provider":"workers_ai",
     "model_id":"@cf/zai-org/glm-4.7-flash",
     "in_m":0.060, "out_m":0.400, "ctx":131072,  "tier":"mini",     "expensive":False},
    {"key":"cf-kimi-k2",        "provider":"workers_ai",
     "model_id":"@cf/moonshotai/kimi-k2.6",
     "in_m":0.950, "out_m":4.000, "ctx":262144,  "tier":"standard", "expensive":False},
    {"key":"cf-qwen-coder",     "provider":"workers_ai",
     "model_id":"@cf/qwen/qwen2.5-coder-32b-instruct",
     "in_m":0.660, "out_m":1.000, "ctx":32768,   "tier":"standard", "expensive":False},
]

# filter expensive / provider
if args.skip_expensive if hasattr(args,'skip_expensive') else False:
    MODELS = [m for m in MODELS if not m["expensive"]]
if PROVIDER_FILTER:
    MODELS = [m for m in MODELS if m["provider"] in PROVIDER_FILTER]

# ── TEST SUITES ───────────────────────────────────────────────────────────────
MINI_TEST = [{
    "name":"pipeline_validation", "intent":"nano",
    "system":"Reply with exactly one word.",
    "prompt":"What is 2+2?",
    "expected_contains":"4", "max_tokens":5,
}]

SUITES = {
"default": [
    {"name":"one_liner_speed",    "intent":"nano",
     "system":"Reply in one sentence only.",
     "prompt":"What is the capital of France?",
     "expected_contains":"Paris", "max_tokens":20},
    {"name":"code_gen_python",    "intent":"code",
     "system":"Output only Python code, no explanation.",
     "prompt":"Write a Python function that returns the nth Fibonacci number using memoization.",
     "expected_contains":"def", "max_tokens":300},
    {"name":"json_output",        "intent":"structured",
     "system":"Respond with valid JSON only. No markdown.",
     "prompt":'Return JSON: {"city":string,"country":string,"population_millions":number} for Tokyo.',
     "expected_contains":"Tokyo",
     "expected_json_shape":'{"city":"string","country":"string","population_millions":"number"}',
     "max_tokens":80},
    {"name":"reasoning_chain",    "intent":"reasoning",
     "system":"Think step by step. Show your work.",
     "prompt":"Train A leaves Chicago 2pm at 60mph. Train B leaves Detroit (280mi away) 3pm at 80mph toward Chicago. When do they meet?",
     "expected_contains":"", "max_tokens":400},
    {"name":"intent_classify",    "intent":"routing",
     "system":"Classify intent. Output ONE word: search|code|write|calculate|chat|tool",
     "prompt":"Fix the async race condition in my JavaScript fetch handler.",
     "expected_contains":"code", "max_tokens":5},
    {"name":"summarize",          "intent":"summarize",
     "system":"Summarize in 2 sentences max.",
     "prompt":"Thompson sampling maintains a Beta(α,β) distribution per arm. At each step it samples θ~Beta(α,β) for each arm and selects argmax. After observing reward r∈{0,1}, it updates α←α+r, β←β+(1-r). Over time high-reward arms accumulate larger α and are selected more often, balancing explore/exploit without explicit ε.",
     "expected_contains":"Thompson", "max_tokens":80},
],
"routing": [
    {"name":"classify_code",       "intent":"routing",
     "system":"One word only: search|code|write|calculate|chat|tool",
     "prompt":"Debug why my Python dict raises KeyError at line 42.",
     "expected_contains":"code", "max_tokens":5},
    {"name":"classify_search",     "intent":"routing",
     "system":"One word only: search|code|write|calculate|chat|tool",
     "prompt":"What is the current ETH/USD price?",
     "expected_contains":"search", "max_tokens":5},
    {"name":"classify_calculate",  "intent":"routing",
     "system":"One word only: search|code|write|calculate|chat|tool",
     "prompt":"What is 15% tip on a $84.50 bill?",
     "expected_contains":"calculate", "max_tokens":5},
    {"name":"classify_write",      "intent":"routing",
     "system":"One word only: search|code|write|calculate|chat|tool",
     "prompt":"Draft a professional email declining a vendor proposal.",
     "expected_contains":"write", "max_tokens":5},
    {"name":"classify_tool",       "intent":"routing",
     "system":"One word only: search|code|write|calculate|chat|tool",
     "prompt":"Create a GitHub issue for the login page bug.",
     "expected_contains":"tool", "max_tokens":5},
],
"cost": [
    {"name":"minimal",   "intent":"nano",     "system":"One word.",   "prompt":"Sky color?",         "expected_contains":"", "max_tokens":3},
    {"name":"medium",    "intent":"standard", "system":"Be concise.", "prompt":"List 5 HTTP status codes and what they mean.", "expected_contains":"200", "max_tokens":150},
    {"name":"heavy",     "intent":"power",    "system":"Be thorough.",
     "prompt":"Design a schema for multi-tenant SaaS billing: usage-based pricing, tier caps, invoice generation. Include table names and key columns.",
     "expected_contains":"", "max_tokens":600},
],
}

tests = MINI_TEST if MINI else SUITES.get(args.suite, SUITES["default"])

# ── D1 helper ─────────────────────────────────────────────────────────────────
def d1(sql, label="q"):
    if DRY_RUN:
        return []
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True, timeout=30
    )
    if r.returncode != 0:
        return []
    try:
        p = json.loads(r.stdout)
        return p[0].get("results",[]) if p else []
    except:
        return []

def esc(v):
    if v is None: return "''"
    s = str(v).replace("'","''")
    return f"'{s[:4000]}'"

def d1_insert(table, row):
    cols = ",".join(row.keys())
    vals = ",".join(esc(v) for v in row.values())
    return d1(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({vals})", f"ins:{table}")

# ── Supabase helper ───────────────────────────────────────────────────────────
SUPA_URL = os.environ.get("SUPABASE_URL","").rstrip("/")
SUPA_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
           os.environ.get("SUPABASE_ANON_KEY",""))

def supa_upsert(table, rows):
    """Upsert rows into Supabase via REST API. Returns (ok, error)."""
    if DRY_RUN or not SUPA_URL or not SUPA_KEY:
        return False, "Supabase not configured"
    url = f"{SUPA_URL}/rest/v1/{table}"
    data = json.dumps(rows if isinstance(rows, list) else [rows]).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SUPA_KEY}",
            "apikey": SUPA_KEY,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200,201,204), None
    except urllib.error.HTTPError as e:
        return False, f"{e.code}: {e.read().decode()[:200]}"
    except Exception as ex:
        return False, str(ex)

def supa_ok():
    """Quick connectivity check."""
    if not SUPA_URL or not SUPA_KEY:
        return False, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"
    url = f"{SUPA_URL}/rest/v1/model_performance_snapshots?limit=1"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SUPA_KEY}",
        "apikey": SUPA_KEY,
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status == 200, None
    except Exception as ex:
        return False, str(ex)

# ── Routing arm lookup ────────────────────────────────────────────────────────
_arm_cache = {}
def get_arm_id(model_key):
    if model_key in _arm_cache:
        return _arm_cache[model_key]
    rows = d1(f"SELECT id FROM agentsam_routing_arms WHERE model_key='{model_key}' AND is_active=1 LIMIT 1")
    arm_id = rows[0]["id"] if rows else f"arm_{model_key.replace('.','_').replace('/','_').replace('-','_')[:30]}"
    _arm_cache[model_key] = arm_id
    return arm_id

# ── HTTP POST helper with TTFT streaming ─────────────────────────────────────
def _post_stream(url, headers, body_dict, want_ttft=True):
    """POST and measure wall latency + TTFT from SSE stream."""
    body_dict["stream"] = True
    data = json.dumps(body_dict).encode()
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")
    t0   = time.time()
    ttft_ms = 0
    full_body = b""
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            http_status = resp.status
            first_tok   = False
            for raw_line in resp:
                chunk = raw_line if isinstance(raw_line, bytes) else raw_line.encode()
                full_body += chunk
                if not first_tok and chunk.strip().startswith(b"data:") and b"[DONE]" not in chunk:
                    # check there's actual content
                    try:
                        payload = chunk.strip()[5:].strip()
                        obj = json.loads(payload)
                        # OpenAI: choices[0].delta.content; Anthropic: delta.text
                        content = (obj.get("choices",[{}])[0].get("delta",{}).get("content") or
                                   obj.get("delta",{}).get("text"))
                        if content:
                            ttft_ms = int((time.time()-t0)*1000)
                            first_tok = True
                    except:
                        pass
        latency = int((time.time()-t0)*1000)
        return http_status, full_body, latency, ttft_ms or latency, None
    except urllib.error.HTTPError as e:
        latency = int((time.time()-t0)*1000)
        return e.code, e.read(), latency, latency, str(e)
    except Exception as ex:
        latency = int((time.time()-t0)*1000)
        return 0, b"", latency, latency, str(ex)

def _post_plain(url, headers, body_dict):
    data = json.dumps(body_dict).encode()
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")
    t0   = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            lat = int((time.time()-t0)*1000)
            return resp.status, json.loads(resp.read()), lat, lat, None
    except urllib.error.HTTPError as e:
        lat = int((time.time()-t0)*1000)
        try:    body_err = json.loads(e.read())
        except: body_err = {"error": str(e)}
        return e.code, body_err, lat, lat, str(e)
    except Exception as ex:
        return 0, {}, 0, 0, str(ex)

# ── PROVIDER CALLERS ─────────────────────────────────────────────────────────
def call_openai(mdl, system, prompt, max_tokens):
    key = os.environ.get("OPENAI_API_KEY","")
    if not key: return None, "OPENAI_API_KEY missing"
    # Use streaming for TTFT
    status, raw, lat, ttft, ex = _post_stream(
        "https://api.openai.com/v1/chat/completions",
        {"Content-Type":"application/json","Authorization":f"Bearer {key}"},
        {"model":mdl["model_id"],"max_tokens":max_tokens,
         "messages":[{"role":"system","content":system},{"role":"user","content":prompt}]},
    )
    if ex and status >= 400:
        return None, str(ex)
    # Reassemble streaming response — collect all delta content + final usage chunk
    text = ""; in_tok = 0; out_tok = 0; cached_tok = 0
    try:
        for line in raw.split(b"\n"):
            if not line.startswith(b"data:") or b"[DONE]" in line:
                continue
            obj = json.loads(line[5:])
            if obj.get("choices"):
                delta = obj["choices"][0].get("delta",{})
                text += delta.get("content","")
            if obj.get("usage"):
                u = obj["usage"]
                in_tok     = u.get("prompt_tokens",0)
                out_tok    = u.get("completion_tokens",0)
                cached_tok = u.get("prompt_tokens_details",{}).get("cached_tokens",0)
    except:
        pass
    # fallback: try non-stream parse if above gave nothing
    if not in_tok:
        try:
            obj = json.loads(raw)
            u = obj.get("usage",{})
            in_tok  = u.get("prompt_tokens",0)
            out_tok = u.get("completion_tokens",0)
            if not text and obj.get("choices"):
                text = obj["choices"][0].get("message",{}).get("content","")
        except:
            pass
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached_tok":cached_tok,
            "lat":lat,"ttft":ttft,"stop":"stop"}, None

def call_anthropic(mdl, system, prompt, max_tokens):
    key = os.environ.get("ANTHROPIC_API_KEY","")
    if not key: return None, "ANTHROPIC_API_KEY missing"
    status, raw, lat, ttft, ex = _post_stream(
        "https://api.anthropic.com/v1/messages",
        {"Content-Type":"application/json",
         "x-api-key":key,"anthropic-version":"2023-06-01"},
        {"model":mdl["model_id"],"max_tokens":max_tokens,
         "system":system,"messages":[{"role":"user","content":prompt}]},
    )
    if ex and status >= 400:
        return None, str(ex)
    text=""; in_tok=0; out_tok=0; cached_tok=0; stop=""
    try:
        for line in raw.split(b"\n"):
            if not line.startswith(b"data:"):
                continue
            obj = json.loads(line[5:])
            t = obj.get("type","")
            if t == "content_block_delta":
                text += obj.get("delta",{}).get("text","")
            elif t == "message_delta":
                stop = obj.get("delta",{}).get("stop_reason","")
                u = obj.get("usage",{})
                out_tok += u.get("output_tokens",0)
            elif t == "message_start":
                u = obj.get("message",{}).get("usage",{})
                in_tok     = u.get("input_tokens",0)
                cached_tok = u.get("cache_read_input_tokens",0)
    except:
        pass
    if not in_tok:
        try:
            obj = json.loads(raw)
            u = obj.get("usage",{})
            in_tok  = u.get("input_tokens",0)
            out_tok = u.get("output_tokens",0)
            if obj.get("content"):
                text = obj["content"][0].get("text","")
            stop = obj.get("stop_reason","")
        except:
            pass
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached_tok":cached_tok,
            "lat":lat,"ttft":ttft,"stop":stop}, None

def call_google(mdl, system, prompt, max_tokens):
    key = os.environ.get("GOOGLE_AI_API_KEY",
          os.environ.get("GEMINI_API_KEY",
          os.environ.get("GOOGLE_API_KEY","")))
    if not key: return None, "GOOGLE_AI_API_KEY missing"
    # Google doesn't support SSE the same way — use plain POST + measure
    status, resp, lat, ttft, ex = _post_plain(
        f"https://generativelanguage.googleapis.com/v1beta/models/{mdl['model_id']}:generateContent?key={key}",
        {"Content-Type":"application/json"},
        {"systemInstruction":{"parts":[{"text":system}]},
         "contents":[{"role":"user","parts":[{"text":prompt}]}],
         "generationConfig":{"maxOutputTokens":max_tokens}},
    )
    if ex and status >= 400:
        return None, str(resp.get("error",{}).get("message", str(resp)))
    u    = resp.get("usageMetadata",{})
    cands= resp.get("candidates",[{}])
    text = "".join(p.get("text","") for p in cands[0].get("content",{}).get("parts",[]) if cands) if cands else ""
    stop = cands[0].get("finishReason","stop") if cands else "stop"
    in_tok     = u.get("promptTokenCount",0)
    out_tok    = u.get("candidatesTokenCount",0)
    cached_tok = u.get("cachedContentTokenCount",0)
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached_tok":cached_tok,
            "lat":lat,"ttft":lat,"stop":stop}, None  # ttft=lat (no streaming)

def call_workers_ai(mdl, system, prompt, max_tokens):
    acct  = os.environ.get("CF_ACCOUNT_ID","")
    token = os.environ.get("CF_API_TOKEN",os.environ.get("CLOUDFLARE_API_TOKEN",""))
    if not acct or not token: return None, "CF_ACCOUNT_ID or CF_API_TOKEN missing"
    status, resp, lat, ttft, ex = _post_plain(
        f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{mdl['model_id']}",
        {"Content-Type":"application/json","Authorization":f"Bearer {token}"},
        {"messages":[{"role":"system","content":system},{"role":"user","content":prompt}],
         "max_tokens":max_tokens},
    )
    if ex and status >= 400:
        return None, str(resp)
    result = resp.get("result",{})
    text   = result.get("response","")
    usage  = result.get("usage",{})
    in_tok  = usage.get("prompt_tokens", usage.get("input_tokens",0))
    out_tok = usage.get("completion_tokens", usage.get("output_tokens",0))
    # Workers AI often omits token counts — estimate from text length if 0
    if not in_tok:
        in_tok = max(1, int((len(system)+len(prompt))/4))
    if not out_tok:
        out_tok = max(1, int(len(text)/4))
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached_tok":0,
            "lat":lat,"ttft":lat,"stop":"stop"}, None

CALLERS = {
    "openai":     call_openai,
    "anthropic":  call_anthropic,
    "google":     call_google,
    "workers_ai": call_workers_ai,
}

# ── Cost calculation ──────────────────────────────────────────────────────────
def cost_usd(in_tok, out_tok, mdl):
    return (in_tok/1_000_000)*mdl["in_m"] + (out_tok/1_000_000)*mdl["out_m"]

# ── Assertion checks ──────────────────────────────────────────────────────────
def assert_check(text, expected_contains, expected_json_shape=""):
    if not expected_contains and not expected_json_shape:
        return -1   # no assertion defined
    passed = True
    if expected_contains:
        passed = expected_contains.lower() in text.lower()
    if passed and expected_json_shape:
        try:
            parsed = json.loads(text)
            shape  = json.loads(expected_json_shape)
            passed = all(k in parsed for k in shape)
        except:
            passed = False
    return 1 if passed else 0

# ── Quality score (0–1) ───────────────────────────────────────────────────────
def quality_score(test, result, assertion_passed):
    """Heuristic quality: assertion weight + output length penalty + latency score."""
    if result is None:
        return 0.0
    s = 0.0
    # assertion
    if assertion_passed == 1:  s += 0.60
    elif assertion_passed == 0: s += 0.00
    else:                       s += 0.40  # no assertion = neutral
    # output not empty
    if result["text"]: s += 0.20
    # latency score (< 2s = full, < 5s = partial)
    if result["lat"] < 2000:   s += 0.20
    elif result["lat"] < 5000: s += 0.10
    return round(min(s, 1.0), 4)

# ── Run state ─────────────────────────────────────────────────────────────────
run_rows     = []    # all D1 rows written this session
model_totals = {}    # per model: {calls, success, in_tok, out_tok, cost, lats, q_scores}

# ── PIPELINE VALIDATION ───────────────────────────────────────────────────────
hdr(f"{'MINI PIPELINE TEST' if MINI else 'BENCHMARK FLOOD v2'}  |  suite={args.suite}  |  group={RUN_GROUP_ID}")
print(f"  Providers : {', '.join(set(m['provider'] for m in MODELS))}")
print(f"  Models    : {len(MODELS)}")
print(f"  Tests     : {len(tests)}")
print(f"  Total API : {len(MODELS)*len(tests)} calls")
if DRY_RUN: print(f"  {Y}DRY RUN{X}")

# D1 connectivity
d1_ok = bool(d1("SELECT 1 AS ping", "d1_ping"))
print(f"  D1        : {'✓ connected' if d1_ok else R+'✗ FAILED'+X}")

# Supabase connectivity
supa_conn, supa_err = supa_ok()
supa_status = "✓ connected" if supa_conn else f"⚠ {supa_err or 'not reachable'}"
print(f"  Supabase  : {supa_status}")

if MINI:
    print(f"\n  {B}Running mini pipeline test — 1 call per provider{X}")

print()

# ── MAIN BENCHMARK LOOP ───────────────────────────────────────────────────────
for mdl in MODELS:
    if args.skip_expensive and mdl.get("expensive"):
        info(f"  [SKIP expensive] {mdl['key']}")
        continue

    hdr(f"{mdl['key']}  ({mdl['provider']})  ${mdl['in_m']}/M in  ${mdl['out_m']}/M out")
    caller  = CALLERS.get(mdl["provider"])
    arm_id  = get_arm_id(mdl["key"])
    mt      = model_totals.setdefault(mdl["key"], {
        "provider":mdl["provider"],"tier":mdl["tier"],"calls":0,"success":0,
        "in_tok":0,"out_tok":0,"cost":0.0,"lats":[],"q_scores":[],"arm_id":arm_id,
    })

    for test in tests:
        name     = test["name"]
        max_tok  = test.get("max_tokens",256)
        expected = test.get("expected_contains","")

        if DRY_RUN:
            ok(f"[DRY] {name:<30} max_tok={max_tok}")
            continue

        started_at = datetime.now(timezone.utc).isoformat()
        mt["calls"] += 1

        result, error = caller(mdl, test["system"], test["prompt"], max_tok)

        completed_at = datetime.now(timezone.utc).isoformat()
        success      = 1 if result and not error else 0

        # ── zero-NULL field extraction ───────────────────────────────────────
        in_tok     = int(result["in_tok"])    if result else 0
        out_tok    = int(result["out_tok"])   if result else 0
        cached_tok = int(result["cached_tok"])if result else 0
        lat        = int(result["lat"])       if result else 0
        ttft       = int(result["ttft"])      if result else 0
        text       = str(result["text"])      if result else ""
        stop       = str(result["stop"])      if result else "error"

        # estimate tokens if API returned 0 (Workers AI issue)
        if in_tok == 0 and result:
            in_tok  = max(1, int((len(test["system"])+len(test["prompt"]))/4))
        if out_tok == 0 and text:
            out_tok = max(1, int(len(text)/4))

        total_cost   = cost_usd(in_tok, out_tok, mdl)
        in_cost      = (in_tok/1_000_000)*mdl["in_m"]
        out_cost     = (out_tok/1_000_000)*mdl["out_m"]
        assertion    = assert_check(text, expected, test.get("expected_json_shape",""))
        qs           = quality_score(test, result, assertion)

        prompt_hash  = hashlib.sha256(test["prompt"].encode()).hexdigest()[:16]
        resp_hash    = hashlib.sha256(text.encode()).hexdigest()[:16] if text else "0"*16
        run_id       = str(uuid.uuid4())

        # ── accumulators ────────────────────────────────────────────────────
        if success: mt["success"] += 1
        mt["in_tok"]   += in_tok
        mt["out_tok"]  += out_tok
        mt["cost"]     += total_cost
        mt["lats"].append(lat)
        mt["q_scores"].append(qs)

        # ── D1 row: ai_api_test_runs ─────────────────────────────────────────
        row = {
            "id":                     run_id,
            "run_group_id":           RUN_GROUP_ID,
            "parent_batch_id":        RUN_GROUP_ID,
            "custom_id":              f"{mdl['key']}_{name}",
            "comparison_key":         name,
            "test_suite":             args.suite,
            "test_name":              name,
            "mode":                   test.get("intent","default"),
            "provider":               mdl["provider"],
            "provider_account":       WORKSPACE_ID,
            "model":                  mdl["key"],
            "status":                 "succeeded" if success else "failed",
            "http_status":            200 if success else 500,
            "success":                success,
            "error_code":             "" if success else "api_error",
            "error_message":          "" if success else str(error or "")[:500],
            "request_payload_json":   json.dumps({"system":test["system"][:200],"prompt":test["prompt"][:200],"max_tokens":max_tok}),
            "response_payload_json":  json.dumps({"text":text[:500],"stop":stop,"in_tok":in_tok,"out_tok":out_tok}),
            "response_text":          text[:2000],
            "structured_output_json": "",
            "schema_name":            test.get("expected_json_shape","")[:200],
            "schema_valid":           assert_check(text,"",test.get("expected_json_shape","")) if test.get("expected_json_shape") else -1,
            "stop_reason":            stop,
            "input_tokens":           in_tok,
            "output_tokens":          out_tok,
            "cached_tokens":          cached_tok,
            "total_tokens":           in_tok + out_tok,
            "input_cost_usd":         round(in_cost,8),
            "output_cost_usd":        round(out_cost,8),
            "tool_cost_usd":          0.0,
            "total_cost_usd":         round(total_cost,8),
            "latency_ms":             lat,
            "time_to_first_token_ms": ttft,
            "started_at":             started_at,
            "completed_at":           completed_at,
            "created_at":             started_at,
            "inference_geo":          "cloudflare-workers" if mdl["provider"]=="workers_ai" else "api",
            "endpoint":               mdl["model_id"],
            "prompt_hash":            prompt_hash,
            "response_hash":          resp_hash,
            "expected_contains":      expected[:200],
            "expected_json_shape":    test.get("expected_json_shape","")[:500],
            "assertion_passed":       assertion,
            "notes":                  f"tier={mdl['tier']} arm={arm_id} q={qs}",
            "workspace_id":           WORKSPACE_ID,
            "tenant_id":              TENANT_ID,
            "prompt_id":              prompt_hash,
            "experiment_id":          RUN_GROUP_ID,
        }

        d1_insert("ai_api_test_runs", row)
        run_rows.append(row)

        # ── terminal output ───────────────────────────────────────────────────
        s_icon = f"{G}✓{X}" if success else f"{R}✗{X}"
        a_icon = (f"{G}PASS{X}" if assertion==1 else f"{R}FAIL{X}" if assertion==0 else f"{D}---{X}")
        print(f"  {s_icon} {name:<30} in={in_tok:>5} out={out_tok:>5}  "
              f"${total_cost:.6f}  {lat:>5}ms  ttft={ttft:>5}ms  "
              f"q={qs:.2f}  assert={a_icon}")
        if error:
            err(f"    {str(error)[:100]}")

# ── POST-RUN: THOMPSON ARM UPDATE ─────────────────────────────────────────────
if not DRY_RUN and run_rows:
    hdr("THOMPSON ARM UPDATE")
    for mk, mt in model_totals.items():
        if mt["calls"] == 0:
            continue
        successes = mt["success"]
        failures  = mt["calls"] - mt["success"]
        avg_lat   = int(statistics.mean(mt["lats"])) if mt["lats"] else 0
        avg_q     = round(statistics.mean(mt["q_scores"]),4) if mt["q_scores"] else 0.0
        sql = f"""
UPDATE agentsam_routing_arms SET
  success_count      = COALESCE(success_count,0)      + {successes},
  failure_count      = COALESCE(failure_count,0)      + {failures},
  total_executions   = COALESCE(total_executions,0)   + {mt['calls']},
  alpha_successes    = COALESCE(alpha_successes,1)    + {successes},
  beta_failures      = COALESCE(beta_failures,1)      + {failures},
  avg_latency_ms     = COALESCE(avg_latency_ms,0)*0.8 + {avg_lat}*0.2,
  avg_cost_usd       = {round(mt['cost']/max(mt['calls'],1),8)},
  last_used_at       = datetime('now')
WHERE model_key = '{mk}'
""".strip()
        rows = d1(sql, f"thompson:{mk}")
        ok(f"{mk:<42} +{successes}α +{failures}β  avg_lat={avg_lat}ms  q={avg_q}")

# ── POST-RUN: SUPABASE ROLLUP ─────────────────────────────────────────────────
if not DRY_RUN and run_rows:
    hdr("SUPABASE model_performance_snapshots UPSERT")
    supa_rows = []
    for mk, mt in model_totals.items():
        if mt["calls"] == 0:
            continue
        lats   = mt["lats"]
        qs     = mt["q_scores"]
        supa_rows.append({
            "workspace_id":   WORKSPACE_ID,
            "snapshot_date":  TODAY,
            "model_key":      mk,
            "provider":       mt["provider"],
            "task_type":      args.suite,
            "mode":           "benchmark",
            "total_runs":     mt["calls"],
            "passed_runs":    mt["success"],
            "failed_runs":    mt["calls"] - mt["success"],
            "avg_latency_ms": round(statistics.mean(lats),2) if lats else 0.0,
            "p95_latency_ms": round(sorted(lats)[int(len(lats)*0.95)] if len(lats)>1 else lats[0] if lats else 0, 2),
            "avg_cost_usd":   round(mt["cost"]/max(mt["calls"],1), 8),
            "total_cost_usd": round(mt["cost"], 8),
            "avg_tokens_in":  int(mt["in_tok"]/max(mt["calls"],1)),
            "avg_tokens_out": int(mt["out_tok"]/max(mt["calls"],1)),
            "success_rate":   round(mt["success"]/max(mt["calls"],1), 4),
            "quality_score":  round(statistics.mean(qs),4) if qs else 0.0,
            "computed_at":    NOW_ISO,
        })

    if supa_conn and supa_rows:
        ok_s, e_s = supa_upsert("model_performance_snapshots", supa_rows)
        if ok_s:
            ok(f"Upserted {len(supa_rows)} rows → model_performance_snapshots")
        else:
            warn(f"Supabase upsert failed: {e_s}")
    else:
        warn("Supabase not reachable — snapshot not written")

    # Also upsert into agentsam_analytics in D1 (rollup)
    hdr("D1 agentsam_analytics ROLLUP")
    for mk, mt in model_totals.items():
        if mt["calls"] == 0: continue
        lats = mt["lats"]
        ana = {
            "id":              f"ana_{RUN_GROUP_ID}_{mk[:20].replace('-','_').replace('.','_')}",
            "bucket_date":     TODAY,
            "bucket_hour":     datetime.now(timezone.utc).hour,
            "model_key":       mk,
            "provider":        mt["provider"],
            "arm_type":        "benchmark",
            "intent_category": args.suite,
            "workspace_id":    WORKSPACE_ID,
            "total_calls":     mt["calls"],
            "success_calls":   mt["success"],
            "failure_calls":   mt["calls"]-mt["success"],
            "timeout_calls":   0,
            "total_input_tok": mt["in_tok"],
            "total_output_tok":mt["out_tok"],
            "total_cost_usd":  round(mt["cost"],8),
            "avg_latency_ms":  round(statistics.mean(lats),2) if lats else 0.0,
            "p50_latency_ms":  round(sorted(lats)[len(lats)//2],2) if lats else 0.0,
            "p95_latency_ms":  round(sorted(lats)[int(len(lats)*0.95)] if len(lats)>1 else lats[0] if lats else 0,2),
            "avg_quality_score":round(statistics.mean(mt["q_scores"]),4) if mt["q_scores"] else 0.0,
            "cache_hit_count": 0,
            "routing_arm_id":  mt["arm_id"],
            "created_at":      NOW_ISO,
            "updated_at":      NOW_ISO,
        }
        # check if table has the v2 schema first
        existing = d1(f"SELECT id FROM agentsam_analytics WHERE id='{ana['id']}'")
        if existing:
            d1(f"DELETE FROM agentsam_analytics WHERE id='{ana['id']}'")
        result = d1_insert("agentsam_analytics", ana)
        if result is not None:
            ok(f"{mk:<40} analytics row written")
        else:
            warn(f"{mk:<40} analytics write failed (schema mismatch? run redesign first)")

# ── FINAL COST + QUALITY TABLE ────────────────────────────────────────────────
hdr("FINAL BENCHMARK RESULTS")
if not DRY_RUN and model_totals:
    rows = d1(f"""
        SELECT model, provider,
               COUNT(*) calls,
               SUM(success) success,
               SUM(input_tokens) in_tok, SUM(output_tokens) out_tok,
               SUM(total_cost_usd) cost,
               AVG(latency_ms) avg_lat,
               AVG(time_to_first_token_ms) avg_ttft,
               SUM(CASE WHEN assertion_passed=1 THEN 1 ELSE 0 END) pass,
               SUM(CASE WHEN assertion_passed=0 THEN 1 ELSE 0 END) fail,
               AVG(CAST(SUBSTR(notes, INSTR(notes,'q=')+2, 4) AS REAL)) avg_q
        FROM ai_api_test_runs
        WHERE run_group_id='{RUN_GROUP_ID}'
        GROUP BY model, provider ORDER BY cost DESC
    """, "final_summary")

    if rows:
        print(f"\n  {'model':<28} {'prov':<12} {'calls':>5} {'succ':>5} {'in_tok':>8} "
              f"{'out_tok':>8} {'cost':>12} {'avg_ms':>7} {'ttft':>6} {'assert':>8} {'q':>5}")
        print(f"  {'-'*28} {'-'*12} {'-----':>5} {'-----':>5} {'--------':>8} "
              f"{'--------':>8} {'------------':>12} {'-------':>7} {'------':>6} {'--------':>8} {'-----':>5}")
        grand_cost = 0
        for r in rows:
            pa = r.get("pass",0) or 0
            fa = r.get("fail",0) or 0
            ar = f"{pa}✓/{fa}✗" if (pa+fa)>0 else "n/a"
            grand_cost += r.get("cost",0) or 0
            q  = r.get("avg_q") or 0
            print(f"  {(r.get('model') or ''):<28} "
                  f"{(r.get('provider') or ''):<12} "
                  f"{r.get('calls',0):>5} "
                  f"{r.get('success',0):>5} "
                  f"{r.get('in_tok',0):>8,} "
                  f"{r.get('out_tok',0):>8,} "
                  f"${r.get('cost',0):>11.6f} "
                  f"{r.get('avg_lat',0):>6.0f}ms "
                  f"{r.get('avg_ttft',0):>5.0f}ms "
                  f"{ar:>8} "
                  f"{q:>5.2f}")
        print(f"\n  {B}Total run cost: ${grand_cost:.6f}{X}")

hdr("NEXT STEPS")
print(f"""
  Run routing suite (intent classification accuracy):
    python3 scripts/agentsam_benchmark_flood_v2.py --suite routing

  Run cost-only suite (token burn by tier):
    python3 scripts/agentsam_benchmark_flood_v2.py --suite cost

  Skip expensive models (no opus/pro):
    python3 scripts/agentsam_benchmark_flood_v2.py --skip-expensive

  View this run in D1:
    npx wrangler d1 execute {DB} --remote --command \\
      "SELECT model, test_name, success, input_tokens, output_tokens, total_cost_usd, latency_ms, time_to_first_token_ms, assertion_passed \\
       FROM ai_api_test_runs WHERE run_group_id='{RUN_GROUP_ID}' ORDER BY total_cost_usd DESC"

  Run group: {RUN_GROUP_ID}
""")
print(f"{D}Done — {NOW_ISO}{X}\n")
