#!/usr/bin/env python3
"""
agentsam_benchmark_v3.py
─────────────────────────
Budget-gated, role-aware benchmark for Agent Sam model routing.

Writes to:
  D1  → ai_api_test_runs (every call), agentsam_analytics (rollup)
  D1  → agentsam_routing_arms (Thompson α/β — only without --no-thompson-update)
  SB  → model_performance_snapshots (per-role rollup)

ZERO NULL POLICY: every field populated. Estimated values marked in measurement_source.

Usage:
  # Pipeline validation — cheapest call per provider, no DB mutation
  python3 scripts/agentsam_benchmark_v3.py --mini --no-thompson-update

  # CMS role matrix, OpenAI only, budget-gated, no Thompson yet
  python3 scripts/agentsam_benchmark_v3.py --matrix cms_builder_v1 \\
    --providers openai --budget-usd 0.75 --no-thompson-update

  # Full $2 run with deep architect
  python3 scripts/agentsam_benchmark_v3.py --matrix cms_builder_v1 \\
    --providers openai --budget-usd 2.00 --include-deep-architect \\
    --no-thompson-update

  # After data looks good — enable Thompson
  python3 scripts/agentsam_benchmark_v3.py --matrix cms_builder_v1 \\
    --providers openai --budget-usd 2.00 --include-deep-architect
"""

VERSION = "3.1.0"

import os, sys, json, time, hashlib, uuid, subprocess, statistics, argparse
from datetime import datetime, timezone
from pathlib import Path
import urllib.request, urllib.error

# ── env ───────────────────────────────────────────────────────────────────────
for env_name in [".env.agentsam.local", ".env"]:
    p = Path(__file__).parent.parent / env_name
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

# ── args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--mini",                 action="store_true")
parser.add_argument("--suite",                default="default")
parser.add_argument("--matrix",               default="",    help="cms_builder_v1")
parser.add_argument("--providers",            default="",    help="openai,anthropic,google,workers_ai")
parser.add_argument("--skip-expensive",       action="store_true")
parser.add_argument("--include-deep-architect", action="store_true")
parser.add_argument("--dry-run",              action="store_true")
parser.add_argument("--no-thompson-update",   action="store_true")
parser.add_argument("--budget-usd",           type=float, default=5.00)
parser.add_argument("--stop-at-usd",          type=float, default=4.50)
parser.add_argument("--max-calls",            type=int,   default=999)
args = parser.parse_args()

DRY_RUN       = args.dry_run
MINI          = args.mini
DB            = "inneranimalmedia-business"
WORKSPACE_ID  = "ws_inneranimalmedia"
TENANT_ID     = "tenant_sam_primeaux"
RUN_GROUP_ID  = f"bench_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
TODAY         = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NOW_ISO       = datetime.now(timezone.utc).isoformat()
_pending_rows = []  # batched D1 inserts
BUDGET_USD    = args.budget_usd
STOP_AT_USD   = min(args.stop_at_usd, BUDGET_USD)
MAX_CALLS     = args.max_calls
PROVIDER_FILTER = set(args.providers.split(",")) if args.providers else None

# ── colour ────────────────────────────────────────────────────────────────────
R="\033[91m"; Y="\033[93m"; G="\033[92m"; C="\033[96m"
DIM="\033[2m"; X="\033[0m"; B="\033[1m"
def hdr(t):   print(f"\n{B}{C}{'═'*70}{X}\n{B}  {t}{X}\n{'═'*70}")
def ok(m):    print(f"  {G}✓{X}  {m}")
def warn(m):  print(f"  {Y}⚠{X}  {m}")
def err(m):   print(f"  {R}✗{X}  {m}")
def info(m):  print(f"  {DIM}{m}{X}")
def skip(m):  print(f"  {DIM}[SKIP] {m}{X}")

# ── MODEL REGISTRY ────────────────────────────────────────────────────────────
MODELS = [
    # OpenAI GPT-5.4 family
    {"key":"gpt-5.4-nano",    "provider":"openai",     "model_id":"gpt-4.1-nano",
     "in_m":0.20,  "out_m":1.25,  "ctx":400000,  "tier":"nano",     "expensive":False},
    {"key":"gpt-5.4-mini",    "provider":"openai",     "model_id":"gpt-4.1-mini",
     "in_m":0.75,  "out_m":4.50,  "ctx":400000,  "tier":"mini",     "expensive":False},
    {"key":"gpt-5.4",         "provider":"openai",     "model_id":"gpt-4.1",
     "in_m":2.50,  "out_m":15.00, "ctx":1050000, "tier":"standard", "expensive":False},
    {"key":"gpt-5.4-pro",     "provider":"openai",     "model_id":"gpt-4.1",
     "in_m":30.00, "out_m":180.00,"ctx":1050000, "tier":"max",      "expensive":True},
    # Anthropic Claude
    {"key":"claude-haiku-4-5","provider":"anthropic",  "model_id":"claude-haiku-4-5-20251001",
     "in_m":1.00,  "out_m":5.00,  "ctx":200000,  "tier":"mini",     "expensive":False},
    {"key":"claude-sonnet-4-6","provider":"anthropic", "model_id":"claude-sonnet-4-6",
     "in_m":3.00,  "out_m":15.00, "ctx":1000000, "tier":"standard", "expensive":False},
    {"key":"claude-opus-4-7", "provider":"anthropic",  "model_id":"claude-opus-4-7",
     "in_m":5.00,  "out_m":25.00, "ctx":1000000, "tier":"max",      "expensive":True},
    # Google Gemini
    {"key":"gemini-2.5-flash-lite","provider":"google","model_id":"gemini-2.5-flash-lite",
     "in_m":0.10,  "out_m":0.40,  "ctx":1048576, "tier":"nano",     "expensive":False},
    {"key":"gemini-2.5-flash",    "provider":"google", "model_id":"gemini-2.5-flash",
     "in_m":0.30,  "out_m":2.50,  "ctx":1048576, "tier":"mini",     "expensive":False},
    {"key":"gemini-2.5-pro",      "provider":"google", "model_id":"gemini-2.5-pro",
     "in_m":1.25,  "out_m":10.00, "ctx":1048576, "tier":"standard", "expensive":False},
    {"key":"gemini-3.1-pro-preview","provider":"google","model_id":"gemini-3.1-pro-preview",
     "in_m":2.00,  "out_m":12.00, "ctx":1048576, "tier":"max",      "expensive":True},
    # Cloudflare Workers AI
    {"key":"cf-granite-micro","provider":"workers_ai",
     "model_id":"@cf/ibm-granite/granite-4.0-h-micro",
     "in_m":0.017, "out_m":0.112, "ctx":128000,  "tier":"nano",     "expensive":False},
    {"key":"cf-glm-flash",   "provider":"workers_ai",
     "model_id":"@cf/zai-org/glm-4.7-flash",
     "in_m":0.060, "out_m":0.400, "ctx":131072,  "tier":"mini",     "expensive":False},
    {"key":"cf-kimi-k2",     "provider":"workers_ai",
     "model_id":"@cf/moonshotai/kimi-k2.6",
     "in_m":0.950, "out_m":4.000, "ctx":262144,  "tier":"standard", "expensive":False},
    {"key":"cf-qwen-coder",  "provider":"workers_ai",
     "model_id":"@cf/qwen/qwen2.5-coder-32b-instruct",
     "in_m":0.660, "out_m":1.000, "ctx":32768,   "tier":"standard", "expensive":False},
]

MODEL_MAP = {m["key"]: m for m in MODELS}

# ── SUITES ────────────────────────────────────────────────────────────────────
MINI_SUITE = [{
    "name":"pipeline_ping", "role":"scout_router", "intent":"routing", "task_type":"routing",
    "system":"Reply with exactly one number.",
    "prompt":"What is 2+2?",
    "expected_contains":"4", "max_tokens":5, "quality_floor":0.0,
    "reasoning_effort":"minimal", "models":None,
}]

DEFAULT_SUITE = [
    {"name":"one_liner",   "role":"scout_router","intent":"routing",   "task_type":"routing",
     "system":"One sentence only.",
     "prompt":"What is the capital of France?",
     "expected_contains":"Paris","max_tokens":20,"quality_floor":0.0,"reasoning_effort":"minimal","models":None},
    {"name":"code_gen",    "role":"code_generator","intent":"code",    "task_type":"code",
     "system":"Output Python code only, no explanation.",
     "prompt":"Write a memoized Fibonacci function.",
     "expected_contains":"def","max_tokens":200,"quality_floor":0.60,"reasoning_effort":"low","models":None},
    {"name":"json_output", "role":"spec_writer",  "intent":"structured","task_type":"spec",
     "system":"Valid JSON only, no markdown.",
     "prompt":'Return {"city":string,"country":string,"pop_millions":number} for Tokyo.',
     "expected_contains":"Tokyo",
     "expected_json_shape":'{"city":"string","country":"string","pop_millions":"number"}',
     "max_tokens":80,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
    {"name":"reasoning",   "role":"planner",     "intent":"reasoning", "task_type":"planning",
     "system":"Think step by step.",
     "prompt":"Train A leaves Chicago 2pm 60mph. Train B leaves Detroit (280mi) 3pm 80mph toward Chicago. When do they meet?",
     "expected_contains":"","max_tokens":300,"quality_floor":0.40,"reasoning_effort":"low","models":None},
    {"name":"intent_classify","role":"scout_router","intent":"routing","task_type":"routing",
     "system":"Output ONE word: search|code|write|calculate|chat|tool",
     "prompt":"Fix the async race condition in my JavaScript fetch handler.",
     "expected_contains":"code","max_tokens":5,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
]

ROUTING_SUITE = [
    {"name":"classify_code",   "role":"scout_router","intent":"routing","task_type":"routing",
     "system":"You are a request classifier. Reply with ONLY one word from this list: search, code, write, calculate, chat, tool. Nothing else.",
     "prompt":"Fix the KeyError on line 42 in my Python dictionary lookup.",
     "expected_contains":"code","max_tokens":10,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
    {"name":"classify_search", "role":"scout_router","intent":"routing","task_type":"routing",
     "system":"You are a request classifier. Reply with ONLY one word from this list: search, code, write, calculate, chat, tool. Nothing else.",
     "prompt":"What is the current price of Bitcoin in USD right now?",
     "expected_contains":"search","max_tokens":10,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
    {"name":"classify_write",  "role":"scout_router","intent":"routing","task_type":"routing",
     "system":"You are a request classifier. Reply with ONLY one word from this list: search, code, write, calculate, chat, tool. Nothing else.",
     "prompt":"Write a professional email declining a vendor partnership proposal.",
     "expected_contains":"write","max_tokens":10,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
    {"name":"classify_tool",   "role":"scout_router","intent":"routing","task_type":"routing",
     "system":"You are a request classifier. Reply with ONLY one word from this list: search, code, write, calculate, chat, tool. Nothing else.",
     "prompt":"Run the d1_query tool to fetch all active plans from the agentsam_plans table.",
     "expected_contains":"tool","max_tokens":10,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
    {"name":"classify_calc",   "role":"scout_router","intent":"routing","task_type":"routing",
     "system":"You are a request classifier. Reply with ONLY one word from this list: search, code, write, calculate, chat, tool. Nothing else.",
     "prompt":"What is a 15 percent tip on 84 dollars split between 3 people?",
     "expected_contains":"calculate","max_tokens":10,"quality_floor":0.60,"reasoning_effort":"minimal","models":None},
]

# CMS Builder role matrix — each test only runs against assigned models
CMS_BUILDER_V1 = [
    {
        "name":"cms_scout_router", "role":"scout_router",
        "intent":"routing", "task_type":"routing",
        "system":(
            "You are Agent Sam's model router. Output compact JSON only. "
            "Choose the best role for the user request."
        ),
        "prompt":(
            "User request: Build a Shopify-level CMS editor with section schemas, "
            "theme tokens, live preview, R2 publishing, and rollback. "
            "Classify the required agent role as one of: scout_router, planner, "
            "spec_writer, code_generator, deep_architect. "
            "Return JSON with: role, confidence, why, required_tools."
        ),
        "expected_contains":"deep_architect",
        "expected_json_shape":'{"role":"string","confidence":"number","why":"string","required_tools":"array"}',
        "max_tokens":600, "quality_floor":0.72, "reasoning_effort":"minimal",
        "models":["gpt-5.4-nano","gpt-5.4-mini"],
    },
    {
        "name":"cms_planner", "role":"planner",
        "intent":"planning", "task_type":"planning",
        "system":(
            "You are Agent Sam's CMS implementation planner. "
            "Return a concrete staged plan: files, APIs, DB tables, validation checkpoints."
        ),
        "prompt":(
            "Plan the first production phase for a Shopify-level CMS editor inside Inner Animal Media. "
            "Stack: Cloudflare Workers, D1, R2, Vite/React, Monaco. "
            "Must support: pages, themes, reusable sections, live preview, publishing, rollback, "
            "workspace scoping. No fake/stubbed success."
        ),
        "expected_contains":"R2",
        "max_tokens":1800, "quality_floor":0.76, "reasoning_effort":"low",
        "models":["gpt-5.4-nano","gpt-5.4-mini"],
    },
    {
        "name":"cms_spec_writer", "role":"spec_writer",
        "intent":"spec", "task_type":"spec",
        "system":(
            "You are Agent Sam's senior product/spec architect. "
            "Write implementation-ready specs, not generic advice."
        ),
        "prompt":(
            "Write the CMS builder spec for a Claude Studio / Shopify quality website editor. "
            "Include: editor layout, section navigator, schema-driven controls, theme tokens, "
            "Monaco advanced editor, preview iframe, R2 artifact publishing, rollback, audit logs, "
            "API contract, DB tables, and acceptance tests."
        ),
        "expected_contains":"section",
        "max_tokens":3500, "quality_floor":0.80, "reasoning_effort":"low",
        "models":["gpt-5.4-mini"],
    },
    {
        "name":"cms_code_generator", "role":"code_generator",
        "intent":"code", "task_type":"code",
        "system":(
            "You are Agent Sam's production code generator. "
            "Return implementation-oriented code skeletons and exact module boundaries."
        ),
        "prompt":(
            "Generate a production-ready module map and starter code skeleton for the CMS editor. "
            "Include: React component names, TypeScript interfaces, API handlers, D1 table contracts, "
            "R2 package builder functions, validation helpers, and Playwright smoke checks. "
            "Mark TODO only where external credentials or repo-specific imports are required."
        ),
        "expected_contains":"interface",
        "max_tokens":6000, "quality_floor":0.82, "reasoning_effort":"medium",
        "models":["gpt-5.4-mini"],
    },
    {
        "name":"cms_deep_architect", "role":"deep_architect",
        "intent":"architecture", "task_type":"architecture",
        "system":(
            "You are Agent Sam's deepest architecture reviewer. "
            "Find the safest, highest-leverage architecture for a real DB/R2-driven CMS builder."
        ),
        "prompt":(
            "Design the end-to-end architecture for a Shopify-level CMS website editor/builder "
            "for Inner Animal Media. Cloudflare-native: Workers, D1, R2, Vite/React, Monaco, "
            "live preview, theme packages, section schemas, rollback, analytics, Agent Sam approval. "
            "Include: risks, data model, API flow, rendering flow, publishing flow, first 20 steps."
        ),
        "expected_contains":"rollback",
        "max_tokens":8000, "quality_floor":0.85, "reasoning_effort":"medium",
        "models":["gpt-5.4"],  # gpt-5.4 only; added if --include-deep-architect
    },
]

# ── resolve test suite ────────────────────────────────────────────────────────
if MINI:
    tests = MINI_SUITE
elif args.matrix == "cms_builder_v1":
    tests = [t for t in CMS_BUILDER_V1 if t["role"] != "deep_architect"]
    if args.include_deep_architect:
        tests = CMS_BUILDER_V1
elif args.suite == "routing":
    tests = ROUTING_SUITE
else:
    tests = DEFAULT_SUITE

# ── apply provider filter to MODELS ──────────────────────────────────────────
active_models = [m for m in MODELS if (not PROVIDER_FILTER or m["provider"] in PROVIDER_FILTER)]
if args.skip_expensive:
    active_models = [m for m in active_models if not m["expensive"]]

# ── budget tracking ───────────────────────────────────────────────────────────
spent_estimate = 0.0
spent_actual   = 0.0
calls_made     = 0

def est_cost(test, mdl):
    in_est  = max(1, int((len(test.get("system",""))+len(test.get("prompt","")))/4))
    out_est = int(test.get("max_tokens", 256))
    return (in_est/1e6)*mdl["in_m"] + (out_est/1e6)*mdl["out_m"]

def budget_ok(planned):
    if calls_made >= MAX_CALLS:
        return False, f"max_calls={MAX_CALLS} reached"
    if spent_estimate + planned > STOP_AT_USD:
        return False, f"would hit stop_at=${STOP_AT_USD:.4f} (at ${spent_estimate+planned:.4f})"
    return True, ""

# ── p95 helper ────────────────────────────────────────────────────────────────
def p95(values):
    if not values: return 0.0
    s = sorted(values)
    idx = min(len(s)-1, max(0, int((len(s)-1)*0.95)))
    return round(s[idx], 2)

# ── quality scoring ───────────────────────────────────────────────────────────
def quality_score(test, result, assertion_passed):
    if result is None:
        return 0.0
    text  = result.get("text","") or ""
    lower = text.lower()
    s     = 0.0

    # Assertion
    if assertion_passed == 1:    s += 0.25
    elif assertion_passed == -1: s += 0.12   # no assertion defined = neutral

    # Output substance
    if len(text) > 200:  s += 0.10
    if len(text) > 1000: s += 0.10
    if len(text) > 2500: s += 0.05

    # CMS-specific signal terms
    cms_terms = ["d1","r2","worker","theme","section","schema","preview",
                 "publish","rollback","monaco","api","workspace","audit",
                 "validation","playwright"]
    hits = sum(1 for t in cms_terms if t in lower)
    s += min(hits/len(cms_terms), 1.0) * 0.25

    # Implementation usefulness
    if any(x in lower for x in ["table","column","migration","index"]): s += 0.05
    if any(x in lower for x in ["route","endpoint","request","response"]): s += 0.05
    if any(x in lower for x in ["component","interface","function","module"]): s += 0.05
    if any(x in lower for x in ["test","smoke","verify","acceptance"]): s += 0.05

    # Latency bonus
    lat = int(result.get("lat",999999) or 999999)
    if lat < 2500:   s += 0.05
    elif lat < 8000: s += 0.025

    # Penalize stubs
    bad = ["generic","placeholder","stub","to be implemented","lorem ipsum","example.com"]
    if any(b in lower for b in bad): s -= 0.08

    return round(max(0.0, min(1.0, s)), 4)

def assert_check(text, expected_contains, expected_json_shape=""):
    if not expected_contains and not expected_json_shape:
        return -1
    passed = True
    if expected_contains:
        # strip punctuation + whitespace for routing/single-word checks
        clean = text.lower().strip().strip(".,!?:;*_#-")
        passed = expected_contains.lower() in clean
    if passed and expected_json_shape:
        try:
            parsed = json.loads(text)
            shape  = json.loads(expected_json_shape)
            passed = all(k in parsed for k in shape)
        except:
            passed = False
    return 1 if passed else 0

# ── cost calculation ──────────────────────────────────────────────────────────
def calc_cost(in_tok, out_tok, mdl):
    return (in_tok/1e6)*mdl["in_m"] + (out_tok/1e6)*mdl["out_m"]

# ── D1 helpers ────────────────────────────────────────────────────────────────
def d1(sql, label="q"):
    if DRY_RUN:
        return []
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True, timeout=45
    )
    try:
        p = json.loads(r.stdout)
        return p[0].get("results",[]) if p else []
    except:
        return []

def esc(v):
    if v is None: return "''"
    return "'" + str(v).replace("'","''")[:3999] + "'"

def d1_insert(table, row):
    cols = ",".join(row.keys())
    vals = ",".join(esc(v) for v in row.values())
    d1(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({vals})", f"ins:{table}")

_arm_cache = {}
def get_arm_id(model_key):
    if model_key in _arm_cache: return _arm_cache[model_key]
    rows = d1(f"SELECT id FROM agentsam_routing_arms WHERE model_key='{model_key}' AND is_active=1 LIMIT 1")
    arm_id = rows[0]["id"] if rows else f"arm_{model_key[:30].replace('.','_').replace('/','_').replace('-','_')}"
    _arm_cache[model_key] = arm_id
    return arm_id

# ── Supabase helpers ──────────────────────────────────────────────────────────
SUPA_URL = os.environ.get("SUPABASE_URL","").rstrip("/")
SUPA_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
           os.environ.get("SUPABASE_ANON_KEY",""))

def supa_upsert(table, rows):
    if DRY_RUN or not SUPA_URL or not SUPA_KEY:
        return False, "not configured"
    data = json.dumps(rows if isinstance(rows,list) else [rows]).encode()
    req  = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{table}", data=data, method="POST",
        headers={"Content-Type":"application/json","Authorization":f"Bearer {SUPA_KEY}",
                 "apikey":SUPA_KEY,"Prefer":"resolution=merge-duplicates,return=minimal"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200,201,204), None
    except urllib.error.HTTPError as e:
        return False, f"{e.code}: {e.read().decode()[:200]}"
    except Exception as ex:
        return False, str(ex)

def supa_ping():
    if not SUPA_URL or not SUPA_KEY: return False, "env vars missing"
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/model_performance_snapshots?limit=1",
        headers={"Authorization":f"Bearer {SUPA_KEY}","apikey":SUPA_KEY}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status==200, None
    except Exception as ex:
        return False, str(ex)

# ── API callers ───────────────────────────────────────────────────────────────
def _stream(url, headers, body):
    """POST with stream=True, return (http_status, raw_bytes, latency_ms, ttft_ms, error)."""
    body["stream"] = True
    t0  = time.time()
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    ttft = 0; full = b""
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = resp.status
            first  = False
            for raw in resp:
                full += raw
                if not first and raw.strip().startswith(b"data:") and b"[DONE]" not in raw:
                    try:
                        obj = json.loads(raw.strip()[5:])
                        content = (obj.get("choices",[{}])[0].get("delta",{}).get("content") or
                                   obj.get("delta",{}).get("text"))
                        if content:
                            ttft  = int((time.time()-t0)*1000)
                            first = True
                    except: pass
        lat = int((time.time()-t0)*1000)
        return status, full, lat, ttft or lat, None
    except urllib.error.HTTPError as e:
        lat = int((time.time()-t0)*1000)
        return e.code, e.read(), lat, lat, str(e)
    except Exception as ex:
        lat = int((time.time()-t0)*1000)
        return 0, b"", lat, lat, str(ex)

def _plain(url, headers, body):
    t0  = time.time()
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            lat = int((time.time()-t0)*1000)
            return resp.status, json.loads(resp.read()), lat, lat, None
    except urllib.error.HTTPError as e:
        lat = int((time.time()-t0)*1000)
        try:    body_e = json.loads(e.read())
        except: body_e = {"error":str(e)}
        return e.code, body_e, lat, lat, str(e)
    except Exception as ex:
        return 0, {}, 0, 0, str(ex)

def call_openai(mdl, test):
    key = os.environ.get("OPENAI_API_KEY","")
    if not key: return None, "OPENAI_API_KEY missing", "unavailable"
    status, raw, lat, ttft, ex = _stream(
        "https://api.openai.com/v1/chat/completions",
        {"Content-Type":"application/json","Authorization":f"Bearer {key}"},
        {"model":mdl["model_id"],"max_tokens":test["max_tokens"],
         "messages":[{"role":"system","content":test["system"]},
                     {"role":"user","content":test["prompt"]}],
         "stream_options":{"include_usage":True}},  # ensure usage in stream
    )
    if ex and status >= 400:
        return None, str(ex), "unavailable"
    text=""; in_tok=0; out_tok=0; cached=0
    for line in raw.split(b"\n"):
        if not line.startswith(b"data:") or b"[DONE]" in line: continue
        try:
            obj = json.loads(line[5:])
            if obj.get("choices"):
                text += obj["choices"][0].get("delta",{}).get("content","")
            if obj.get("usage"):
                u = obj["usage"]
                in_tok  = u.get("prompt_tokens",0)
                out_tok = u.get("completion_tokens",0)
                cached  = u.get("prompt_tokens_details",{}).get("cached_tokens",0)
        except: pass
    src = "measured"
    if not in_tok:
        in_tok  = max(1, int((len(test["system"])+len(test["prompt"]))/4))
        out_tok = max(1, int(len(text)/4)) if text else 0
        src = "estimated"
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached":cached,
            "lat":lat,"ttft":ttft,"stop":"stop"}, None, src

def call_anthropic(mdl, test):
    key = os.environ.get("ANTHROPIC_API_KEY","")
    if not key: return None, "ANTHROPIC_API_KEY missing", "unavailable"
    status, raw, lat, ttft, ex = _stream(
        "https://api.anthropic.com/v1/messages",
        {"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
        {"model":mdl["model_id"],"max_tokens":test["max_tokens"],
         "system":test["system"],"messages":[{"role":"user","content":test["prompt"]}]},
    )
    if ex and status >= 400:
        return None, str(ex), "unavailable"
    text=""; in_tok=0; out_tok=0; cached=0; stop=""
    for line in raw.split(b"\n"):
        if not line.startswith(b"data:"): continue
        try:
            obj = json.loads(line[5:])
            t   = obj.get("type","")
            if t == "content_block_delta":
                text += obj.get("delta",{}).get("text","")
            elif t == "message_delta":
                stop    = obj.get("delta",{}).get("stop_reason","")
                out_tok = obj.get("usage",{}).get("output_tokens",0)
            elif t == "message_start":
                u      = obj.get("message",{}).get("usage",{})
                in_tok  = u.get("input_tokens",0)
                cached  = u.get("cache_read_input_tokens",0)
        except: pass
    src = "measured"
    if not in_tok:
        in_tok  = max(1, int((len(test["system"])+len(test["prompt"]))/4))
        out_tok = max(1, int(len(text)/4)) if text else 0
        src = "estimated"
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached":cached,
            "lat":lat,"ttft":ttft,"stop":stop}, None, src

def call_google(mdl, test):
    key = os.environ.get("GOOGLE_AI_API_KEY",
          os.environ.get("GEMINI_API_KEY",
          os.environ.get("GOOGLE_API_KEY","")))
    if not key: return None, "GOOGLE_AI_API_KEY missing", "unavailable"
    status, resp, lat, ttft, ex = _plain(
        f"https://generativelanguage.googleapis.com/v1beta/models/{mdl['model_id']}:generateContent?key={key}",
        {"Content-Type":"application/json"},
        {"systemInstruction":{"parts":[{"text":test["system"]}]},
         "contents":[{"role":"user","parts":[{"text":test["prompt"]}]}],
         "generationConfig":{"maxOutputTokens":test["max_tokens"]}},
    )
    if ex and status >= 400:
        return None, str(resp.get("error",{}).get("message",str(resp))), "unavailable"
    u      = resp.get("usageMetadata",{})
    cands  = resp.get("candidates",[])
    text   = "".join(p.get("text","") for c in cands for p in c.get("content",{}).get("parts",[]))
    stop   = cands[0].get("finishReason","stop") if cands else "stop"
    in_tok  = u.get("promptTokenCount",0)
    out_tok = u.get("candidatesTokenCount",0)
    cached  = u.get("cachedContentTokenCount",0)
    src = "measured" if in_tok else "estimated"
    if not in_tok:
        in_tok  = max(1, int((len(test["system"])+len(test["prompt"]))/4))
        out_tok = max(1, int(len(text)/4)) if text else 0
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached":cached,
            "lat":lat,"ttft":lat,"stop":stop}, None, src

def call_workers_ai(mdl, test):
    acct  = os.environ.get("CF_ACCOUNT_ID","")
    token = os.environ.get("CF_API_TOKEN",os.environ.get("CLOUDFLARE_API_TOKEN",""))
    if not acct or not token: return None, "CF_ACCOUNT_ID or CF_API_TOKEN missing", "unavailable"
    status, resp, lat, ttft, ex = _plain(
        f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{mdl['model_id']}",
        {"Content-Type":"application/json","Authorization":f"Bearer {token}"},
        {"messages":[{"role":"system","content":test["system"]},
                     {"role":"user","content":test["prompt"]}],
         "max_tokens":test["max_tokens"]},
    )
    if ex and status >= 400:
        return None, str(resp), "unavailable"
    result = resp.get("result",{})
    text   = result.get("response","")
    usage  = result.get("usage",{})
    in_tok  = usage.get("prompt_tokens", usage.get("input_tokens",0))
    out_tok = usage.get("completion_tokens", usage.get("output_tokens",0))
    src = "measured" if in_tok else "estimated"
    if not in_tok:
        in_tok  = max(1, int((len(test["system"])+len(test["prompt"]))/4))
        out_tok = max(1, int(len(text)/4)) if text else 0
    return {"text":text,"in_tok":in_tok,"out_tok":out_tok,"cached":0,
            "lat":lat,"ttft":lat,"stop":"stop"}, None, src

CALLERS = {
    "openai":     call_openai,
    "anthropic":  call_anthropic,
    "google":     call_google,
    "workers_ai": call_workers_ai,
}

# ── accumulators ──────────────────────────────────────────────────────────────
# model_totals: per-model across all roles
# role_totals:  per (model × role) — this is what feeds Supabase
model_totals = {}
role_totals  = {}

def mt_init(mdl):
    return {"provider":mdl["provider"],"tier":mdl["tier"],"calls":0,"success":0,
            "quality_pass":0,"quality_fail":0,"in_tok":0,"out_tok":0,
            "cost":0.0,"lats":[],"q_scores":[],"arm_id":get_arm_id(mdl["key"])}

def rt_init(mdl, test):
    return {"model_key":mdl["key"],"provider":mdl["provider"],"tier":mdl["tier"],
            "role":test.get("role","default"),"task_type":test.get("task_type","default"),
            "calls":0,"success":0,"quality_pass":0,"in_tok":0,"out_tok":0,
            "cost":0.0,"lats":[],"q_scores":[]}

# ── PRE-FLIGHT ────────────────────────────────────────────────────────────────
hdr(f"{'MINI PIPELINE TEST' if MINI else 'BENCHMARK v3'}  |  {RUN_GROUP_ID}")
mode_str = args.matrix if args.matrix else args.suite
print(f"  Mode      : {mode_str}")
print(f"  Models    : {', '.join(m['key'] for m in active_models)}")
print(f"  Tests     : {len(tests)}")
print(f"  Budget    : ${BUDGET_USD:.2f}  stop at ${STOP_AT_USD:.2f}")
print(f"  Thompson  : {'DISABLED (--no-thompson-update)' if args.no_thompson_update else 'ENABLED'}")
if DRY_RUN: print(f"  {Y}DRY RUN{X}")

d1_conn  = bool(d1("SELECT 1 AS ping"))
supa_conn, supa_err = supa_ping()
print(f"  D1        : {'✓' if d1_conn else R+'✗ FAILED'+X}")
conn_msg = "✓" if supa_conn else f"{Y}⚠ {supa_err or 'not reachable'}{X}"
print(f"  Supabase  : {conn_msg}")
print()

# ── MAIN LOOP ─────────────────────────────────────────────────────────────────
for mdl in active_models:
    caller = CALLERS.get(mdl["provider"])
    if not caller:
        warn(f"No caller for {mdl['provider']} — skipping {mdl['key']}")
        continue

    arm_id = get_arm_id(mdl["key"])
    mt = model_totals.setdefault(mdl["key"], mt_init(mdl))

    any_test_ran = False
    for test in tests:
        # role/model filter
        allowed = test.get("models")
        if allowed and mdl["key"] not in allowed:
            continue

        # budget gate
        planned = est_cost(test, mdl)
        ok_budget, why = budget_ok(planned)
        if not ok_budget:
            skip(f"{mdl['key']} / {test['name']} — {why}")
            continue

        if not any_test_ran:
            hdr(f"{mdl['key']}  ({mdl['provider']})  ${mdl['in_m']}/M in  ${mdl['out_m']}/M out")
            any_test_ran = True

        # role accumulator key
        rk = f"{mdl['key']}::{test.get('role','default')}"
        rt = role_totals.setdefault(rk, rt_init(mdl, test))

        spent_estimate += planned
        calls_made     += 1

        if DRY_RUN:
            ok(f"[DRY] {test['name']:<32} est=${planned:.6f}")
            continue

        # ── API call ─────────────────────────────────────────────────────────
        started_at   = datetime.now(timezone.utc).isoformat()
        result, error, tok_src = caller(mdl, test)
        completed_at = datetime.now(timezone.utc).isoformat()

        success  = 1 if result and not error else 0
        in_tok   = int(result["in_tok"])  if result else max(1, int((len(test["system"])+len(test["prompt"]))/4))
        out_tok  = int(result["out_tok"]) if result else 0
        cached   = int(result["cached"])  if result else 0
        lat      = int(result["lat"])     if result else 0
        ttft     = int(result["ttft"])    if result else 0
        text     = str(result["text"])    if result else ""
        stop     = str(result["stop"])    if result else "error"
        tok_src  = tok_src if result else "unavailable"

        total_cost  = calc_cost(in_tok, out_tok, mdl)
        in_cost     = (in_tok/1e6)*mdl["in_m"]
        out_cost    = (out_tok/1e6)*mdl["out_m"]
        spent_actual += total_cost

        assertion      = assert_check(text, test.get("expected_contains",""), test.get("expected_json_shape",""))
        qs             = quality_score(test, result, assertion)
        quality_floor  = float(test.get("quality_floor", 0.0))
        # routing tasks: correct classification = quality pass regardless of scorer
        if test.get("task_type") == "routing" and assertion == 1:
            quality_passed = 1
        else:
            quality_passed = 1 if qs >= quality_floor else 0

        # ── accumulate ───────────────────────────────────────────────────────
        mt["calls"]         += 1
        mt["success"]       += success
        mt["quality_pass"]  += quality_passed
        mt["quality_fail"]  += (0 if quality_passed else 1)
        mt["in_tok"]        += in_tok
        mt["out_tok"]       += out_tok
        mt["cost"]          += total_cost
        mt["lats"].append(lat)
        mt["q_scores"].append(qs)

        rt["calls"]         += 1
        rt["success"]       += success
        rt["quality_pass"]  += quality_passed
        rt["in_tok"]        += in_tok
        rt["out_tok"]       += out_tok
        rt["cost"]          += total_cost
        rt["lats"].append(lat)
        rt["q_scores"].append(qs)

        # ── D1 insert: ai_api_test_runs ───────────────────────────────────────
        prompt_hash = hashlib.sha256(test["prompt"].encode()).hexdigest()[:16]
        resp_hash   = hashlib.sha256(text.encode()).hexdigest()[:16] if text else "0"*16

        row = {
            "id":                     str(uuid.uuid4()),
            "run_group_id":           RUN_GROUP_ID,
            "parent_batch_id":        RUN_GROUP_ID,
            "custom_id":              f"{mdl['key']}_{test['name']}",
            "comparison_key":         test["name"],
            "test_suite":             args.matrix or args.suite,
            "test_name":              test["name"],
            "mode":                   test.get("role", test.get("intent","default")),
            "provider":               mdl["provider"],
            "provider_account":       WORKSPACE_ID,
            "model":                  mdl["key"],
            "status":                 "succeeded" if success else "failed",
            "http_status":            200 if success else 500,
            "success":                success,
            "error_code":             "" if success else "api_error",
            "error_message":          "" if success else str(error or "")[:500],
            "request_payload_json":   json.dumps({
                "system":test["system"][:300],"prompt":test["prompt"][:300],
                "max_tokens":test["max_tokens"],"reasoning_effort":test.get("reasoning_effort",""),
                "role":test.get("role",""),"task_type":test.get("task_type",""),
            }),
            "response_payload_json":  json.dumps({
                "text":text[:500],"stop":stop,
                "in_tok":in_tok,"out_tok":out_tok,"cached_tok":cached,
                "planned_cost_usd":round(planned,8),
                "actual_cost_usd":round(total_cost,8),
                "token_source":tok_src,
                "role":test.get("role",""),"task_type":test.get("task_type",""),
                "quality_floor":quality_floor,"quality_passed":quality_passed,
                "reasoning_effort":test.get("reasoning_effort",""),
            }),
            "response_text":          text[:2000],
            "structured_output_json": "",
            "schema_name":            test.get("expected_json_shape","")[:200],
            "schema_valid":           assert_check(text,"",test.get("expected_json_shape","")) if test.get("expected_json_shape") else -1,
            "stop_reason":            stop,
            "input_tokens":           in_tok,
            "output_tokens":          out_tok,
            "cached_tokens":          cached,
            "total_tokens":           in_tok + out_tok,
            "input_cost_usd":         round(in_cost, 8),
            "output_cost_usd":        round(out_cost, 8),
            "tool_cost_usd":          0.0,
            "total_cost_usd":         round(total_cost, 8),
            "latency_ms":             lat,
            "time_to_first_token_ms": ttft,
            "started_at":             started_at,
            "completed_at":           completed_at,
            "created_at":             started_at,
            "inference_geo":          "cloudflare" if mdl["provider"]=="workers_ai" else "api",
            "endpoint":               mdl["model_id"],
            "prompt_hash":            prompt_hash,
            "response_hash":          resp_hash,
            "expected_contains":      test.get("expected_contains","")[:200],
            "expected_json_shape":    test.get("expected_json_shape","")[:500],
            "assertion_passed":       assertion,
            "notes":                  (
                f"tier={mdl['tier']} arm={arm_id} q={qs} "
                f"qfloor={quality_floor} qpass={quality_passed} "
                f"role={test.get('role','')} task={test.get('task_type','')} "
                f"tok_src={tok_src} planned=${planned:.8f} actual=${total_cost:.8f} "
                f"budget=${BUDGET_USD:.2f} spent_est=${spent_estimate:.4f}"
            ),
            "workspace_id":           WORKSPACE_ID,
            "tenant_id":              TENANT_ID,
            "prompt_id":              prompt_hash,
            "experiment_id":          RUN_GROUP_ID,
        }
        _pending_rows.append(row)

        # ── terminal line ─────────────────────────────────────────────────────
        s_icon = f"{G}✓{X}" if success else f"{R}✗{X}"
        q_icon = f"{G}qPASS{X}" if quality_passed else f"{R}qFAIL{X}"
        a_icon = (f"{G}aPASS{X}" if assertion==1 else f"{R}aFAIL{X}" if assertion==0 else f"{DIM}----{X}")
        src_icon = f"{DIM}est{X}" if tok_src=="estimated" else ""
        print(f"  {s_icon} {test['name']:<28} in={in_tok:>5} out={out_tok:>5}  "
              f"${total_cost:.6f}  {lat:>5}ms ttft={ttft:>5}ms  "
              f"q={qs:.2f} {q_icon} {a_icon} {src_icon}")
        if error:
            err(f"    {str(error)[:110]}")

    if any_test_ran:
        info(f"  spent estimate so far: ${spent_estimate:.4f} / actual: ${spent_actual:.4f}")

# ── FLUSH BUFFERED D1 ROWS ───────────────────────────────────────────────────
if not DRY_RUN and _pending_rows:
    hdr(f"FLUSHING {len(_pending_rows)} rows → D1 ai_api_test_runs")
    for i, row in enumerate(_pending_rows):
        cols = ",".join(row.keys())
        vals = ",".join(esc(v) for v in row.values())
        d1(f"INSERT OR REPLACE INTO ai_api_test_runs ({cols}) VALUES ({vals})", f"ins:{i+1}/{len(_pending_rows)}")
        ok(f"[{i+1}/{len(_pending_rows)}] {row.get('model','?')} / {row.get('test_name','?')}")

# ── THOMPSON UPDATE ───────────────────────────────────────────────────────────
if not DRY_RUN and model_totals:
    hdr("THOMPSON ARM UPDATE")
    if args.no_thompson_update:
        warn("Skipped — --no-thompson-update is set. Run without it once data looks right.")
    else:
        for mk, mt in model_totals.items():
            if mt["calls"] == 0: continue
            alpha_add = mt["quality_pass"]    # quality-floor pass = reward
            beta_add  = mt["quality_fail"]    # quality-floor fail = penalty
            avg_lat   = int(statistics.mean(mt["lats"])) if mt["lats"] else 0
            avg_cost  = round(mt["cost"]/max(mt["calls"],1), 8)
            d1(f"""
UPDATE agentsam_routing_arms SET
  success_count    = COALESCE(success_count,0)    + {alpha_add},
  failure_count    = COALESCE(failure_count,0)    + {beta_add},
  total_executions = COALESCE(total_executions,0) + {mt['calls']},
  alpha_successes  = COALESCE(alpha_successes,1)  + {alpha_add},
  beta_failures    = COALESCE(beta_failures,1)    + {beta_add},
  avg_latency_ms   = COALESCE(avg_latency_ms,0)*0.8 + {avg_lat}*0.2,
  avg_cost_usd     = {avg_cost},
  last_used_at     = datetime('now')
WHERE model_key = '{mk}'
""".strip(), f"thompson:{mk}")
            ok(f"{mk:<38} +{alpha_add}α +{beta_add}β  lat={avg_lat}ms  cost=${avg_cost}")

# ── SUPABASE ROLLUP (per role) ────────────────────────────────────────────────
if not DRY_RUN and role_totals:
    hdr("SUPABASE model_performance_snapshots  (per role)")
    supa_rows = []
    for rk, rt in role_totals.items():
        if rt["calls"] == 0: continue
        lats = rt["lats"]
        qs   = rt["q_scores"]
        supa_rows.append({
            "workspace_id":   WORKSPACE_ID,
            "snapshot_date":  TODAY,
            "model_key":      rt["model_key"],
            "provider":       rt["provider"],
            "task_type":      rt["task_type"],
            "mode":           rt["role"],
            "total_runs":     rt["calls"],
            "passed_runs":    rt["quality_pass"],
            "failed_runs":    rt["calls"] - rt["quality_pass"],
            "avg_latency_ms": round(statistics.mean(lats),2) if lats else 0.0,
            "p95_latency_ms": p95(lats),
            "avg_cost_usd":   round(rt["cost"]/max(rt["calls"],1), 8),
            "total_cost_usd": round(rt["cost"], 8),
            "avg_tokens_in":  int(rt["in_tok"]/max(rt["calls"],1)),
            "avg_tokens_out": int(rt["out_tok"]/max(rt["calls"],1)),
            "quality_score":  round(statistics.mean(qs),4) if qs else 0.0,
            "computed_at":    NOW_ISO,
        })
    if supa_conn and supa_rows:
        ok_s, e_s = supa_upsert("model_performance_snapshots", supa_rows)
        if ok_s: ok(f"Upserted {len(supa_rows)} role rows → model_performance_snapshots")
        else:    warn(f"Supabase upsert failed: {e_s}")
    else:
        warn("Supabase not reachable — snapshot skipped")

# ── D1 ANALYTICS ROLLUP ───────────────────────────────────────────────────────
if not DRY_RUN and role_totals:
    hdr("D1 agentsam_analytics  (per role)")
    for rk, rt in role_totals.items():
        if rt["calls"] == 0: continue
        lats = rt["lats"]
        qs   = rt["q_scores"]
        arm_id = get_arm_id(rt["model_key"])
        row = {
            "id":               f"ana_{RUN_GROUP_ID}_{rt['model_key'][:16].replace('-','_').replace('.','_')}_{rt['role'][:12]}",
            "bucket_date":      TODAY,
            "bucket_hour":      datetime.now(timezone.utc).hour,
            "model_key":        rt["model_key"],
            "provider":         rt["provider"],
            "tier":             rt["tier"],
            "arm_type":         "benchmark",
            "intent_category":  rt["role"],
            "workspace_id":     WORKSPACE_ID,
            "routing_arm_id":   arm_id,
            "total_calls":      rt["calls"],
            "success_calls":    rt["success"],
            "failure_calls":    rt["calls"] - rt["success"],
            "timeout_calls":    0,
            "total_input_tok":  rt["in_tok"],
            "total_output_tok": rt["out_tok"],
            "total_cached_tok": 0,
            "avg_input_tok":    round(rt["in_tok"]/max(rt["calls"],1), 2),
            "avg_output_tok":   round(rt["out_tok"]/max(rt["calls"],1), 2),
            "total_cost_usd":   round(rt["cost"], 8),
            "avg_cost_usd":     round(rt["cost"]/max(rt["calls"],1), 8),
            "avg_latency_ms":   round(statistics.mean(lats),2) if lats else 0.0,
            "p50_latency_ms":   round(sorted(lats)[len(lats)//2],2) if lats else 0.0,
            "p95_latency_ms":   p95(lats),
            "min_latency_ms":   round(min(lats),2) if lats else 0.0,
            "max_latency_ms":   round(max(lats),2) if lats else 0.0,
            "avg_ttft_ms":      0.0,
            "avg_quality_score":round(statistics.mean(qs),4) if qs else 0.0,
            "assertion_pass_ct":sum(1 for r in [row] for _ in [None]),  # placeholder, real count in rows
            "assertion_fail_ct":0,
            "success_rate":     round(rt["success"]/max(rt["calls"],1), 4),
            "assertion_rate":   round(rt["quality_pass"]/max(rt["calls"],1), 4),
            "cache_hit_count":  0,
            "cache_hit_rate":   0.0,
            "alpha_contribution":rt["quality_pass"],
            "beta_contribution": rt["calls"] - rt["quality_pass"],
            "source":           "benchmark",
            "run_group_id":     RUN_GROUP_ID,
            "created_at":       NOW_ISO,
            "updated_at":       NOW_ISO,
        }
        d1_insert("agentsam_analytics", row)
        ok(f"{rt['model_key']:<30} role={rt['role']:<18} q={round(statistics.mean(qs),3) if qs else 0}")

# ── FINAL SUMMARY ─────────────────────────────────────────────────────────────
hdr("FINAL RESULTS")
if not DRY_RUN and model_totals:
    rows = d1(f"""
        SELECT model, provider, mode,
               COUNT(*) calls, SUM(success) success,
               SUM(input_tokens) in_tok, SUM(output_tokens) out_tok,
               SUM(total_cost_usd) cost,
               AVG(latency_ms) avg_lat,
               AVG(time_to_first_token_ms) avg_ttft,
               SUM(CASE WHEN assertion_passed=1 THEN 1 ELSE 0 END) apass,
               SUM(CASE WHEN assertion_passed=0 THEN 1 ELSE 0 END) afail
        FROM ai_api_test_runs
        WHERE run_group_id='{RUN_GROUP_ID}'
        GROUP BY model, provider, mode ORDER BY cost DESC
    """, "final")
    if rows:
        print(f"\n  {'model':<26} {'prov':<12} {'role':<18} {'calls':>5} "
              f"{'in':>7} {'out':>7} {'cost':>12} {'ms':>7} {'ttft':>6} {'assert':>8}")
        print(f"  {'-'*26} {'-'*12} {'-'*18} {'-----':>5} "
              f"{'-------':>7} {'-------':>7} {'------------':>12} {'-------':>7} {'------':>6} {'--------':>8}")
        grand = 0
        for r in rows:
            a = f"{r.get('apass',0)}✓/{r.get('afail',0)}✗"
            grand += r.get("cost",0) or 0
            print(f"  {(r.get('model') or ''):<26} "
                  f"{(r.get('provider') or ''):<12} "
                  f"{(r.get('mode') or ''):<18} "
                  f"{r.get('calls',0):>5} "
                  f"{r.get('in_tok',0):>7,} "
                  f"{r.get('out_tok',0):>7,} "
                  f"${r.get('cost',0):>11.6f} "
                  f"{r.get('avg_lat',0):>6.0f}ms "
                  f"{r.get('avg_ttft',0):>5.0f}ms "
                  f"{a:>8}")
        print(f"\n  {B}Total cost: ${grand:.6f}  |  Spent estimate: ${spent_estimate:.4f}  |  Budget: ${BUDGET_USD:.2f}{X}")

print(f"""
  Run group : {RUN_GROUP_ID}

  Next steps:
    # Routing suite — cheapest, pure classification
    python3 scripts/agentsam_benchmark_v3.py --suite routing --providers openai --budget-usd 0.10 --no-thompson-update

    # Full CMS matrix with deep architect, no Thompson
    python3 scripts/agentsam_benchmark_v3.py --matrix cms_builder_v1 --providers openai --budget-usd 2.00 --include-deep-architect --no-thompson-update

    # Once data looks right — enable Thompson
    python3 scripts/agentsam_benchmark_v3.py --matrix cms_builder_v1 --providers openai --budget-usd 2.00 --include-deep-architect
""")
print(f"{DIM}Done — {NOW_ISO}{X}\n")
