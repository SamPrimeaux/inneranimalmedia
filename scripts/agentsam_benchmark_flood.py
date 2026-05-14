#!/usr/bin/env python3
"""
agentsam_benchmark_flood.py
────────────────────────────
Runs a configurable prompt suite against every target model,
captures exact token counts + latency + cost, writes every run
to ai_api_test_runs via D1.

Usage:
  python3 scripts/agentsam_benchmark_flood.py              # all models, default suite
  python3 scripts/agentsam_benchmark_flood.py --models gpt-5.4-mini,gemini-2.5-flash
  python3 scripts/agentsam_benchmark_flood.py --suite routing
  python3 scripts/agentsam_benchmark_flood.py --dry-run    # print calls, don't hit APIs

Requires env vars (or .env.agentsam.local):
  OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY
"""

import os, sys, json, time, hashlib, uuid, subprocess, textwrap, argparse
from datetime import datetime, timezone
from pathlib import Path

# ── load .env if present ─────────────────────────────────────────────────────
env_file = Path(__file__).parent.parent / ".env.agentsam.local"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

# ── args ─────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--models",  default="", help="Comma-separated model keys to run")
parser.add_argument("--suite",   default="default", help="Test suite name")
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--workers", type=int, default=1, help="Parallel workers (future)")
args = parser.parse_args()

DRY_RUN      = args.dry_run
DB           = "inneranimalmedia-business"
WORKSPACE_ID = "ws_inneranimalmedia"
TENANT_ID    = "tenant_sam_primeaux"
RUN_GROUP_ID = f"bench_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

RED  = "\033[91m"; YEL = "\033[93m"; GRN = "\033[92m"
CYN  = "\033[96m"; DIM = "\033[2m";  RST = "\033[0m"; BOLD = "\033[1m"

def hdr(t):  print(f"\n{BOLD}{CYN}{'═'*66}{RST}\n{BOLD}  {t}{RST}\n{'═'*66}")
def ok(m):   print(f"  {GRN}✓{RST}  {m}")
def warn(m): print(f"  {YEL}⚠{RST}  {m}")
def err(m):  print(f"  {RED}✗{RST}  {m}")
def info(m): print(f"  {DIM}{m}{RST}")

# ── MODEL REGISTRY ────────────────────────────────────────────────────────────
# provider: openai | anthropic | google
# Costs in USD per million tokens (input / output)
MODELS = [
    # ── OpenAI ──────────────────────────────────────────────────────────────
    {"key":"gpt-4.1-nano",        "provider":"openai",    "model_id":"gpt-4.1-nano",
     "in_per_m":0.10,  "out_per_m":0.40},
    {"key":"gpt-4.1-mini",        "provider":"openai",    "model_id":"gpt-4.1-mini",
     "in_per_m":0.40,  "out_per_m":1.60},
    {"key":"gpt-4.1",             "provider":"openai",    "model_id":"gpt-4.1",
     "in_per_m":2.00,  "out_per_m":8.00},
    # ── Google ───────────────────────────────────────────────────────────────
    {"key":"gemini-2.5-flash",    "provider":"google",    "model_id":"gemini-2.5-flash-preview-05-20",
     "in_per_m":0.15,  "out_per_m":0.60},
    {"key":"gemini-2.5-pro",      "provider":"google",    "model_id":"gemini-2.5-pro-preview-05-06",
     "in_per_m":1.25,  "out_per_m":10.00},
    # ── Anthropic ────────────────────────────────────────────────────────────
    {"key":"claude-haiku-4-5",    "provider":"anthropic", "model_id":"claude-haiku-4-5-20251001",
     "in_per_m":0.80,  "out_per_m":4.00},
    {"key":"claude-sonnet-4-5",   "provider":"anthropic", "model_id":"claude-sonnet-4-5-20251022",
     "in_per_m":3.00,  "out_per_m":15.00},
]

# filter if --models passed
if args.models:
    wanted = set(args.models.split(","))
    MODELS = [m for m in MODELS if m["key"] in wanted]
    if not MODELS:
        err(f"No models matched: {args.models}")
        sys.exit(1)

# ── TEST SUITES ───────────────────────────────────────────────────────────────
# Each test: name, system, prompt, expected_contains, max_tokens, intent_category
SUITES = {

"default": [
    {   "name": "one_liner_speed",
        "intent": "nano",
        "system": "Reply in one sentence only.",
        "prompt": "What is the capital of France?",
        "expected_contains": "Paris",
        "max_tokens": 20,
    },
    {   "name": "code_gen_python",
        "intent": "code",
        "system": "You are a senior Python engineer. Output only code, no explanation.",
        "prompt": "Write a Python function that returns the nth Fibonacci number using memoization.",
        "expected_contains": "def",
        "max_tokens": 300,
    },
    {   "name": "json_structured_output",
        "intent": "structured",
        "system": "Always respond with valid JSON only. No markdown fences.",
        "prompt": 'Return a JSON object with keys: "city", "country", "population_millions" for Tokyo.',
        "expected_contains": "Tokyo",
        "expected_json_shape": '{"city":"string","country":"string","population_millions":"number"}',
        "max_tokens": 100,
    },
    {   "name": "reasoning_chain",
        "intent": "reasoning",
        "system": "Think step by step.",
        "prompt": "A train leaves Chicago at 2pm going 60mph. Another leaves Detroit (280 miles away) at 3pm going 80mph toward Chicago. When do they meet?",
        "expected_contains": "",
        "max_tokens": 400,
    },
    {   "name": "tool_routing_intent",
        "intent": "routing",
        "system": "You are an intent classifier. Output one word: search, code, write, calculate, or chat.",
        "prompt": "Fix the bug in my JavaScript async function that causes a race condition.",
        "expected_contains": "code",
        "max_tokens": 10,
    },
    {   "name": "long_context_summary",
        "intent": "summarize",
        "system": "Summarize in 2 sentences maximum.",
        "prompt": textwrap.dedent("""
            The Thompson sampling algorithm is a Bayesian approach to the multi-armed bandit problem.
            It maintains a Beta distribution for each arm, where alpha represents successes and beta
            represents failures. At each step, it samples from each arm's distribution and picks the
            arm with the highest sample. Over time, arms with higher true success rates accumulate
            more alpha weight and are sampled more often. This naturally balances exploration of
            uncertain arms with exploitation of proven ones, without requiring explicit epsilon tuning.
            The algorithm is particularly effective when reward distributions are non-stationary,
            as the Beta posteriors update continuously from observed outcomes.
        """).strip(),
        "expected_contains": "Thompson",
        "max_tokens": 80,
    },
],

"routing": [
    {   "name": "classify_code",
        "intent": "routing",
        "system": "Classify the intent. Output exactly one token: code|search|write|calculate|chat|tool",
        "prompt": "Debug why my Python script throws a KeyError on line 42.",
        "expected_contains": "code", "max_tokens": 5,
    },
    {   "name": "classify_search",
        "intent": "routing",
        "system": "Classify the intent. Output exactly one token: code|search|write|calculate|chat|tool",
        "prompt": "What is the current price of Cloudflare stock?",
        "expected_contains": "search", "max_tokens": 5,
    },
    {   "name": "classify_calculate",
        "intent": "routing",
        "system": "Classify the intent. Output exactly one token: code|search|write|calculate|chat|tool",
        "prompt": "What is 15% of $847.50?",
        "expected_contains": "calculate", "max_tokens": 5,
    },
    {   "name": "classify_write",
        "intent": "routing",
        "system": "Classify the intent. Output exactly one token: code|search|write|calculate|chat|tool",
        "prompt": "Write a professional email declining a vendor proposal.",
        "expected_contains": "write", "max_tokens": 5,
    },
    {   "name": "classify_tool",
        "intent": "routing",
        "system": "Classify the intent. Output exactly one token: code|search|write|calculate|chat|tool",
        "prompt": "Create a new GitHub issue for the login bug.",
        "expected_contains": "tool", "max_tokens": 5,
    },
],

"cost": [
    {   "name": "minimal_tokens",
        "intent": "nano",
        "system": "One word answer only.",
        "prompt": "Sky color?",
        "expected_contains": "", "max_tokens": 5,
    },
    {   "name": "medium_output",
        "intent": "standard",
        "system": "Be concise.",
        "prompt": "Explain how HTTPS TLS handshake works in 5 bullet points.",
        "expected_contains": "", "max_tokens": 250,
    },
    {   "name": "heavy_output",
        "intent": "power",
        "system": "Be thorough.",
        "prompt": "Design a database schema for a multi-tenant SaaS billing system with usage-based pricing, tier caps, and invoice generation. Include table names, key columns, and relationships.",
        "expected_contains": "", "max_tokens": 800,
    },
],

}

suite_tests = SUITES.get(args.suite, SUITES["default"])

# ── HTTP CALLERS ──────────────────────────────────────────────────────────────
try:
    import urllib.request as urlreq
    import urllib.error
except ImportError:
    pass

def _post(url, headers, body):
    data = json.dumps(body).encode()
    req  = urlreq.Request(url, data=data, headers=headers, method="POST")
    try:
        t0 = time.time()
        with urlreq.urlopen(req, timeout=60) as resp:
            latency = int((time.time()-t0)*1000)
            raw = resp.read().decode()
            return resp.status, json.loads(raw), latency, None
    except urllib.error.HTTPError as e:
        latency = int((time.time()-t0)*1000)
        raw = e.read().decode()
        try:    body_err = json.loads(raw)
        except: body_err = {"error":raw}
        return e.code, body_err, latency, str(e)
    except Exception as ex:
        return 0, {}, 0, str(ex)

def call_openai(model_id, system, prompt, max_tokens):
    key = os.environ.get("OPENAI_API_KEY","")
    if not key: return None, "OPENAI_API_KEY not set"
    status, resp, lat, ex = _post(
        "https://api.openai.com/v1/chat/completions",
        {"Content-Type":"application/json", "Authorization":f"Bearer {key}"},
        {"model":model_id, "max_tokens":max_tokens,
         "messages":[{"role":"system","content":system},
                     {"role":"user","content":prompt}]}
    )
    if ex or status >= 400:
        return None, resp.get("error",{}).get("message", str(resp))
    usage = resp.get("usage",{})
    text  = resp["choices"][0]["message"]["content"]
    ttft  = 0  # not available in non-streaming
    return {
        "text": text, "stop": resp["choices"][0].get("finish_reason",""),
        "in_tok": usage.get("prompt_tokens",0),
        "out_tok": usage.get("completion_tokens",0),
        "cached_tok": usage.get("prompt_tokens_details",{}).get("cached_tokens",0),
        "latency_ms": lat, "ttft_ms": ttft,
        "raw": resp,
    }, None

def call_anthropic(model_id, system, prompt, max_tokens):
    key = os.environ.get("ANTHROPIC_API_KEY","")
    if not key: return None, "ANTHROPIC_API_KEY not set"
    status, resp, lat, ex = _post(
        "https://api.anthropic.com/v1/messages",
        {"Content-Type":"application/json",
         "x-api-key": key,
         "anthropic-version":"2023-06-01"},
        {"model":model_id, "max_tokens":max_tokens,
         "system": system,
         "messages":[{"role":"user","content":prompt}]}
    )
    if ex or status >= 400:
        return None, resp.get("error",{}).get("message", str(resp))
    usage = resp.get("usage",{})
    text  = resp["content"][0]["text"] if resp.get("content") else ""
    return {
        "text": text, "stop": resp.get("stop_reason",""),
        "in_tok":     usage.get("input_tokens",0),
        "out_tok":    usage.get("output_tokens",0),
        "cached_tok": usage.get("cache_read_input_tokens",0),
        "latency_ms": lat, "ttft_ms": 0,
        "raw": resp,
    }, None

def call_google(model_id, system, prompt, max_tokens):
    key = os.environ.get("GOOGLE_AI_API_KEY",
          os.environ.get("GEMINI_API_KEY",
          os.environ.get("GOOGLE_API_KEY","")))
    if not key: return None, "GOOGLE_AI_API_KEY not set"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={key}"
    status, resp, lat, ex = _post(
        url,
        {"Content-Type":"application/json"},
        {"systemInstruction":{"parts":[{"text":system}]},
         "contents":[{"role":"user","parts":[{"text":prompt}]}],
         "generationConfig":{"maxOutputTokens":max_tokens}}
    )
    if ex or status >= 400:
        return None, str(resp.get("error", resp))
    usage = resp.get("usageMetadata",{})
    cands = resp.get("candidates",[{}])
    text  = ""
    if cands:
        parts = cands[0].get("content",{}).get("parts",[])
        text  = "".join(p.get("text","") for p in parts)
    return {
        "text": text,
        "stop": cands[0].get("finishReason","") if cands else "",
        "in_tok":     usage.get("promptTokenCount",0),
        "out_tok":    usage.get("candidatesTokenCount",0),
        "cached_tok": usage.get("cachedContentTokenCount",0),
        "latency_ms": lat, "ttft_ms": 0,
        "raw": resp,
    }, None

CALLERS = {
    "openai":    call_openai,
    "anthropic": call_anthropic,
    "google":    call_google,
}

# ── D1 WRITER ─────────────────────────────────────────────────────────────────
def escape(s):
    if s is None: return "''"
    return "'" + str(s).replace("'","''")[:4000] + "'"

def write_run(row: dict):
    cols = list(row.keys())
    vals = [escape(row[c]) for c in cols]
    sql  = f"INSERT OR REPLACE INTO ai_api_test_runs ({','.join(cols)}) VALUES ({','.join(vals)})"
    if DRY_RUN:
        info(f"  [DRY] would write id={row.get('id','?')} to D1")
        return True
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    return r.returncode == 0

# ── COST CALC ─────────────────────────────────────────────────────────────────
def calc_cost(in_tok, out_tok, in_per_m, out_per_m):
    return (in_tok/1_000_000)*in_per_m, (out_tok/1_000_000)*out_per_m

# ── MAIN LOOP ─────────────────────────────────────────────────────────────────
hdr(f"BENCHMARK FLOOD  |  suite={args.suite}  |  group={RUN_GROUP_ID}")
print(f"  Models: {', '.join(m['key'] for m in MODELS)}")
print(f"  Tests : {len(suite_tests)}")
print(f"  Total : {len(MODELS)*len(suite_tests)} API calls")
if DRY_RUN:
    print(f"  {YEL}DRY RUN — no API calls or D1 writes{RST}")

totals = {"calls":0,"success":0,"fail":0,"in_tok":0,"out_tok":0,"cost":0.0}
results_by_model = {}

for mdl in MODELS:
    hdr(f"  {mdl['key']}  ({mdl['provider']})")
    results_by_model[mdl["key"]] = []
    caller = CALLERS.get(mdl["provider"])
    if not caller:
        err(f"No caller for provider: {mdl['provider']}")
        continue

    for test in suite_tests:
        name     = test["name"]
        system   = test["system"]
        prompt   = test["prompt"]
        max_tok  = test.get("max_tokens", 256)
        expected = test.get("expected_contains","")

        started_at = datetime.now(timezone.utc).isoformat()
        totals["calls"] += 1

        if DRY_RUN:
            ok(f"[DRY] {name:<30} max_tok={max_tok}")
            continue

        result, error = caller(mdl["model_id"], system, prompt, max_tok)
        completed_at  = datetime.now(timezone.utc).isoformat()

        success = 1 if (result and not error) else 0
        if success:
            totals["success"] += 1
        else:
            totals["fail"] += 1

        in_tok  = result["in_tok"]  if result else 0
        out_tok = result["out_tok"] if result else 0
        cached  = result["cached_tok"] if result else 0
        lat     = result["latency_ms"] if result else 0
        ttft    = result["ttft_ms"]    if result else 0
        text    = result["text"]       if result else ""
        stop    = result["stop"]       if result else ""
        raw     = json.dumps(result["raw"]) if result else "{}"

        in_cost, out_cost = calc_cost(in_tok, out_tok, mdl["in_per_m"], mdl["out_per_m"])
        total_cost = in_cost + out_cost
        totals["in_tok"]  += in_tok
        totals["out_tok"] += out_tok
        totals["cost"]    += total_cost

        # assertion
        assertion_passed = -1
        if expected:
            assertion_passed = 1 if expected.lower() in text.lower() else 0

        # json shape check
        schema_valid = -1
        if test.get("expected_json_shape"):
            try:
                parsed = json.loads(text)
                shape  = json.loads(test["expected_json_shape"])
                schema_valid = 1 if all(k in parsed for k in shape) else 0
            except:
                schema_valid = 0

        prompt_hash   = hashlib.sha256(prompt.encode()).hexdigest()[:16]
        response_hash = hashlib.sha256(text.encode()).hexdigest()[:16] if text else ""
        run_id        = str(uuid.uuid4())

        row = {
            "id":                    run_id,
            "run_group_id":          RUN_GROUP_ID,
            "parent_batch_id":       "",
            "custom_id":             f"{mdl['key']}_{name}",
            "comparison_key":        name,
            "test_suite":            args.suite,
            "test_name":             name,
            "mode":                  test.get("intent","default"),
            "provider":              mdl["provider"],
            "provider_account":      "",
            "model":                 mdl["key"],
            "status":                "succeeded" if success else "failed",
            "http_status":           200 if success else 500,
            "success":               success,
            "error_code":            "",
            "error_message":         error or "",
            "request_payload_json":  json.dumps({"system":system,"prompt":prompt,"max_tokens":max_tok}),
            "response_payload_json": raw[:4000],
            "response_text":         text[:2000],
            "structured_output_json":"",
            "schema_name":           test.get("expected_json_shape","")[:200],
            "schema_valid":          schema_valid,
            "stop_reason":           stop,
            "input_tokens":          in_tok,
            "output_tokens":         out_tok,
            "cached_tokens":         cached,
            "total_tokens":          in_tok + out_tok,
            "input_cost_usd":        round(in_cost,8),
            "output_cost_usd":       round(out_cost,8),
            "tool_cost_usd":         0,
            "total_cost_usd":        round(total_cost,8),
            "latency_ms":            lat,
            "time_to_first_token_ms":ttft,
            "started_at":            started_at,
            "completed_at":          completed_at,
            "created_at":            started_at,
            "inference_geo":         "",
            "endpoint":              "",
            "prompt_hash":           prompt_hash,
            "response_hash":         response_hash,
            "expected_contains":     expected[:200],
            "expected_json_shape":   test.get("expected_json_shape","")[:500],
            "assertion_passed":      assertion_passed,
            "notes":                 "",
            "workspace_id":          WORKSPACE_ID,
            "tenant_id":             TENANT_ID,
            "prompt_id":             "",
            "experiment_id":         RUN_GROUP_ID,
        }

        wrote = write_run(row)
        results_by_model[mdl["key"]].append(row)

        status_icon = f"{GRN}✓{RST}" if success else f"{RED}✗{RST}"
        assert_icon = (f"{GRN}PASS{RST}" if assertion_passed==1
                       else f"{RED}FAIL{RST}" if assertion_passed==0
                       else f"{DIM}---{RST}")
        db_icon     = f"{GRN}D1✓{RST}" if wrote else f"{RED}D1✗{RST}"

        print(f"  {status_icon} {name:<30} "
              f"in={in_tok:>5} out={out_tok:>5} "
              f"${total_cost:.6f}  {lat:>5}ms  "
              f"assert={assert_icon}  {db_icon}")

        if error:
            err(f"    {error[:120]}")

# ── FINAL COST TABLE ──────────────────────────────────────────────────────────
if not DRY_RUN:
    hdr("COST + PERFORMANCE SUMMARY")

    # pull live from D1 for this run group
    summary = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",
         f"""SELECT model, provider,
                COUNT(*) calls,
                SUM(success) success,
                SUM(input_tokens) in_tok,
                SUM(output_tokens) out_tok,
                SUM(total_cost_usd) cost,
                AVG(latency_ms) avg_lat,
                SUM(CASE WHEN assertion_passed=1 THEN 1 ELSE 0 END) asserts_pass,
                SUM(CASE WHEN assertion_passed=0 THEN 1 ELSE 0 END) asserts_fail
         FROM ai_api_test_runs
         WHERE run_group_id='{RUN_GROUP_ID}'
         GROUP BY model, provider ORDER BY cost DESC"""],
        capture_output=True, text=True
    )
    try:
        rows = json.loads(summary.stdout)[0].get("results",[])
        print(f"\n  {'model':<30} {'provider':<12} {'calls':>5} {'succ':>5} "
              f"{'in_tok':>8} {'out_tok':>8} {'cost':>12} {'avg_ms':>8} {'assert':>8}")
        print(f"  {'-'*30} {'-'*12} {'-----':>5} {'-----':>5} "
              f"{'--------':>8} {'--------':>8} {'------------':>12} {'--------':>8} {'--------':>8}")
        g_cost = 0
        for r in rows:
            pa = r.get("asserts_pass",0)
            fa = r.get("asserts_fail",0)
            ar = f"{pa}✓/{fa}✗" if (pa+fa) > 0 else "n/a"
            g_cost += r.get("cost",0) or 0
            print(f"  {(r.get('model') or ''):<30} "
                  f"{(r.get('provider') or ''):<12} "
                  f"{r.get('calls',0):>5} "
                  f"{r.get('success',0):>5} "
                  f"{r.get('in_tok',0):>8,} "
                  f"{r.get('out_tok',0):>8,} "
                  f"${r.get('cost',0):>11.6f} "
                  f"{(r.get('avg_lat') or 0):>7.0f}ms "
                  f"{ar:>8}")
        print(f"\n  {BOLD}Total run cost: ${g_cost:.6f}{RST}  |  "
              f"Calls: {totals['calls']}  |  "
              f"Success: {totals['success']}  |  "
              f"Fail: {totals['fail']}")
    except Exception as e:
        warn(f"Could not fetch summary from D1: {e}")

    # also update analytics rollup for today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rollup_sql = f"""
INSERT OR REPLACE INTO agentsam_analytics
  (bucket_date, model_key, provider, arm_type, workspace_id,
   total_calls, success_calls, failure_calls,
   total_input_tok, total_output_tok, total_cost_usd,
   avg_latency_ms, updated_at)
SELECT
  '{today}',
  model,
  provider,
  'benchmark',
  workspace_id,
  COUNT(*),
  SUM(success),
  SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),
  SUM(input_tokens),
  SUM(output_tokens),
  SUM(total_cost_usd),
  AVG(latency_ms),
  datetime('now')
FROM ai_api_test_runs
WHERE run_group_id = '{RUN_GROUP_ID}'
GROUP BY model, provider, workspace_id
"""
    # only try if agentsam_analytics has the right schema
    r2 = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",rollup_sql],
        capture_output=True, text=True
    )
    if r2.returncode == 0:
        ok("Analytics rollup written to agentsam_analytics")
    else:
        warn(f"Analytics rollup skipped (schema mismatch — run analytics redesign first): {r2.stderr[:80]}")

hdr("NEXT STEPS")
print(f"""
  1. View results in D1:
       npx wrangler d1 execute {DB} --remote --command \\
         "SELECT model, test_name, success, total_cost_usd, latency_ms, assertion_passed
          FROM ai_api_test_runs WHERE run_group_id='{RUN_GROUP_ID}' ORDER BY model, test_name"

  2. Compare routing intent classification accuracy:
       python3 scripts/agentsam_benchmark_flood.py --suite routing

  3. Cost-only breakdown:
       python3 scripts/agentsam_benchmark_flood.py --suite cost

  4. Wire results to Thompson arms:
       UPDATE agentsam_routing_arms SET
         success_count = success_count + (SELECT SUM(success) FROM ai_api_test_runs
                         WHERE model=model_key AND run_group_id='{RUN_GROUP_ID}'),
         total_executions = total_executions + (SELECT COUNT(*) FROM ai_api_test_runs
                            WHERE model=model_key AND run_group_id='{RUN_GROUP_ID}')
       WHERE model_key IN (SELECT DISTINCT model FROM ai_api_test_runs
                           WHERE run_group_id='{RUN_GROUP_ID}');
""")

print(f"\n{DIM}Run group: {RUN_GROUP_ID}{RST}\n")
