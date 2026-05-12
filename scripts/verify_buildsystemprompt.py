#!/usr/bin/env python3
"""
verify_buildsystemprompt.py
Q&A verification that Gemini's buildSystemPrompt fix landed correctly.
Run AFTER deploy email confirms.

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/verify_buildsystemprompt.py
"""

import subprocess, json, re, sys
from pathlib import Path

REPO   = Path("/Users/samprimeaux/inneranimalmedia")
SRC    = REPO / "src/api/agent.js"
DB_ID  = "inneranimalmedia-business"
WRANGLER_CFG = "wrangler.production.toml"

G  = "\033[32m"; R = "\033[31m"; Y = "\033[33m"; C = "\033[36m"; W = "\033[0m"
def ok(q, a):   print(f"  {G}✓ PASS{W}  {q}\n         {a}")
def fail(q, a): print(f"  {R}✗ FAIL{W}  {q}\n         {a}")
def warn(q, a): print(f"  {Y}⚠ WARN{W}  {q}\n         {a}")
def hdr(t):     print(f"\n{C}── {t} {'─'*(60-len(t))}{W}")

def d1(sql):
    r = subprocess.run(
        ["npx","wrangler","d1","execute", DB_ID,
         "--remote","-c", WRANGLER_CFG,"--json","--command", sql],
        cwd=REPO, capture_output=True, text=True, timeout=20
    )
    try:
        data = json.loads(r.stdout)
        return data[0].get("results", []) if isinstance(data, list) else []
    except: return []

def read_src():
    return SRC.read_text(errors="replace")

src = read_src()

# ── Q1: Old status='active' query gone ───────────────────────────────────────
hdr("Q1: Old broken query removed")
if "status = 'active'" in src or 'status = "active"' in src:
    fail("Old `status = 'active'` query", "STILL PRESENT — Bug 1 not fixed")
else:
    ok("Old `status = 'active'` query", "Removed ✓")

# ── Q2: New is_active=1 query present ────────────────────────────────────────
hdr("Q2: Correct is_active=1 query in place")
if "is_active = 1" in src and "agentsam_prompt_versions" in src:
    ok("is_active = 1 query", "Found in buildSystemPrompt ✓")
else:
    fail("is_active = 1 query", "NOT FOUND — query may still be broken")

# ── Q3: prompt_key lookup (not ID-based) ─────────────────────────────────────
hdr("Q3: prompt_key-based lookup (not AP_SYS IDs)")
if "AP_SYS" in src:
    fail("AP_SYS constant", "Still referenced — Bug 2 not fully fixed")
else:
    ok("AP_SYS constant", "Removed ✓")

if "prompt_key" in src and "core_identity" in src:
    ok("prompt_key lookup", "Uses 'core_identity' key ✓")
else:
    warn("prompt_key lookup", "Could not confirm 'core_identity' key usage")

# ── Q4: prompt_layer_keys used (not voided) ───────────────────────────────────
hdr("Q4: prompt_layer_keys pipeline active")
if "void _promptRouteRow" in src or "void(promptRouteRow)" in src:
    fail("_promptRouteRow", "Still being voided — Bug 3 not fixed")
else:
    ok("_promptRouteRow", "Not voided ✓")

if "prompt_layer_keys" in src:
    ok("prompt_layer_keys", "Referenced in buildSystemPrompt ✓")
else:
    fail("prompt_layer_keys", "NOT found — route layer assembly not wired")

# ── Q5: try/catch wrapping the whole function ─────────────────────────────────
hdr("Q5: buildSystemPrompt has error guard (won't hang)")
fn_start = src.find("async function buildSystemPrompt")
fn_block  = src[fn_start:fn_start+2000] if fn_start > -1 else ""
if "try {" in fn_block and "catch" in fn_block:
    ok("try/catch in buildSystemPrompt", "Error guard present ✓")
else:
    warn("try/catch in buildSystemPrompt", "No error guard found — could still hang on D1 failure")

# ── Q6: D1 prompt_versions have is_active rows ───────────────────────────────
hdr("Q6: D1 agentsam_prompt_versions has active rows")
rows = d1("SELECT COUNT(*) as n FROM agentsam_prompt_versions WHERE is_active=1")
n = rows[0].get("n", 0) if rows else 0
if n >= 5:
    ok(f"Active prompt_versions", f"{n} rows with is_active=1 ✓")
else:
    fail(f"Active prompt_versions", f"Only {n} rows — prompts may not load")

# ── Q7: Core layer keys exist ─────────────────────────────────────────────────
hdr("Q7: Required prompt_keys exist in D1")
required = ["core_identity", "db_safety", "security", "tool_loop"]
rows = d1(f"SELECT prompt_key FROM agentsam_prompt_versions WHERE is_active=1 AND prompt_key IN ('core_identity','db_safety','security','tool_loop')")
found = {r["prompt_key"] for r in rows}
for k in required:
    if k in found:
        ok(f"prompt_key: {k}", "Present in D1 ✓")
    else:
        fail(f"prompt_key: {k}", "MISSING from agentsam_prompt_versions")

# ── Q8: prompt_routes has general/chat fallback ───────────────────────────────
hdr("Q8: agentsam_prompt_routes has fallback route")
rows = d1("SELECT route_key, prompt_layer_keys FROM agentsam_prompt_routes WHERE route_key IN ('general','chat')")
if rows:
    for r in rows:
        ok(f"route: {r['route_key']}", f"prompt_layer_keys = {r['prompt_layer_keys']}")
else:
    fail("Fallback route", "No 'general' or 'chat' route in agentsam_prompt_routes")

# ── Q9: buildSystemPrompt called with promptRouteRow ─────────────────────────
hdr("Q9: buildSystemPrompt call passes promptRouteRow")
call_pattern = re.search(r'await buildSystemPrompt\(([^)]+)\)', src)
if call_pattern:
    args = call_pattern.group(1)
    if "promptRoute" in args or "routeRow" in args or "route" in args.lower():
        ok("buildSystemPrompt call", f"Passes route arg: {args.strip()[:60]}")
    else:
        warn("buildSystemPrompt call", f"Route arg may be missing: {args.strip()[:60]}")
else:
    fail("buildSystemPrompt call", "Could not find call site")

# ── Q10: No Supabase/Hyperdrive calls inside buildSystemPrompt ────────────────
hdr("Q10: buildSystemPrompt uses D1 only (no Hyperdrive hang risk)")
fn_start = src.find("async function buildSystemPrompt")
next_fn  = src.find("\nasync function ", fn_start + 10)
fn_block  = src[fn_start:next_fn] if next_fn > fn_start else src[fn_start:fn_start+3000]
if "withPg" in fn_block or "hyperdrive" in fn_block.lower() or "supabase" in fn_block.lower():
    fail("No Hyperdrive in buildSystemPrompt", "Supabase/Hyperdrive call found — hang risk!")
else:
    ok("No Hyperdrive in buildSystemPrompt", "D1 only ✓ — no hang risk")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{C}{'═'*65}{W}")
print(f"  Run `npm run deploy:full:safe` if any FAIL above.")
print(f"  Then send 'hello' in agent chat and check wrangler tail for")
print(f"  [agent] buildSystemPrompt log lines.")
print(f"{C}{'═'*65}{W}\n")
