#!/usr/bin/env python3
"""
test_supabase.py — quick end-to-end Supabase capability check
Run: python3 scripts/test_supabase.py
"""

VERSION = "1.1.0"
import os, json, time
from pathlib import Path
import urllib.request, urllib.error

for env in [".env.agentsam.local", ".env"]:
    p = Path(__file__).parent.parent / env
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

URL = os.environ.get("SUPABASE_URL","").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
      os.environ.get("SUPABASE_ANON_KEY",""))

G="\033[92m"; R="\033[91m"; Y="\033[93m"; C="\033[96m"; D="\033[2m"; X="\033[0m"; B="\033[1m"
def ok(m):   print(f"  {G}✓{X}  {m}")
def fail(m): print(f"  {R}✗{X}  {m}")
def warn(m): print(f"  {Y}⚠{X}  {m}")
def hdr(t):  print(f"\n{B}{C}── {t}{X}")

def req(method, path, body=None, extra_headers={}):
    url  = f"{URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    hdrs = {"Authorization":f"Bearer {KEY}","apikey":KEY,"Content-Type":"application/json",**extra_headers}
    r    = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    t0   = time.time()
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            raw = resp.read()
            body = json.loads(raw) if raw else {}
            return resp.status, body, int((time.time()-t0)*1000)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}"), int((time.time()-t0)*1000)
    except Exception as ex:
        return 0, {"error":str(ex)}, int((time.time()-t0)*1000)

print(f"\n{B}Supabase capability test{X}")
print(f"  URL: {URL or R+'NOT SET'+X}")
print(f"  Key: {'set ('+KEY[:12]+'...)' if KEY else R+'NOT SET'+X}")

if not URL or not KEY:
    fail("Missing env vars — check .env.agentsam.local")
    raise SystemExit(1)

# 1. ping
hdr("1. Connectivity ping")
status, body, ms = req("GET", "model_performance_snapshots?limit=1")
if status == 200:
    ok(f"Connected — {ms}ms  (rows returned: {len(body)})")
elif status == 401:
    fail(f"401 Unauthorized — service_role key wrong or expired")
elif status == 404:
    fail(f"404 — table model_performance_snapshots not found (run migration first)")
else:
    fail(f"HTTP {status} — {body}")

# 2. read tables
hdr("2. Key table reads")
for table in ["model_performance_snapshots","agentsam_eval_runs",
              "agentsam_routing_decisions","agentsam_tool_call_events",
              "agent_memory","documents"]:
    status, body, ms = req("GET", f"{table}?limit=1")
    if status == 200:
        ok(f"{table:<40} {ms}ms  rows_sample={len(body)}")
    else:
        fail(f"{table:<40} HTTP {status}")

# 3. write test (INSERT + DELETE)
hdr("3. Write capability — model_performance_snapshots")
test_row = {
    "workspace_id":   "ws_inneranimalmedia",
    "snapshot_date":  "2000-01-01",
    "model_key":      "_test_ping_delete_me",
    "provider":       "test",
    "task_type":      "test",
    "mode":           "test",
    "total_runs":     1,
    "passed_runs":    1,
    "failed_runs":    0,
    "avg_latency_ms": 1.0,
    "p95_latency_ms": 1.0,
    "avg_cost_usd":   0.0,
    "total_cost_usd": 0.0,
    "avg_tokens_in":  1,
    "avg_tokens_out": 1,
    "quality_score":  1.0,
    "computed_at":    "2000-01-01T00:00:00Z",
}
status, body, ms = req("POST", "model_performance_snapshots",
                        body=test_row,
                        extra_headers={"Prefer":"return=minimal"})
if status in (200,201,204) or (status == 0 and ms < 10000):
    ok(f"INSERT succeeded — {ms}ms")
    # cleanup
    status2, _, ms2 = req("DELETE",
        "model_performance_snapshots?model_key=eq._test_ping_delete_me&snapshot_date=eq.2000-01-01")
    ok(f"DELETE cleanup — {ms2}ms") if status2 in (200,204) else warn(f"cleanup HTTP {status2}")
else:
    fail(f"INSERT failed HTTP {status}: {body}")

# 4. upsert test
hdr("4. Upsert (merge-duplicates) capability")
status, body, ms = req("POST", "model_performance_snapshots",
                        body={**test_row,"total_runs":2},
                        extra_headers={"Prefer":"resolution=merge-duplicates,return=minimal"})
if status in (200,201,204):
    ok(f"UPSERT succeeded — {ms}ms")
    req("DELETE","model_performance_snapshots?model_key=eq._test_ping_delete_me&snapshot_date=eq.2000-01-01")
else:
    fail(f"UPSERT failed HTTP {status}: {body}")

# 5. agent_memory write
hdr("5. agent_memory write (expires_at column check)")
status, body, ms = req("POST", "agent_memory",
    body={"workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux",
          "user_id":"test","session_id":"sess_test_ping","role":"user",
          "content":"_test_ping_delete_me","memory_type":"test","expires_at":None},
    extra_headers={"Prefer":"return=minimal"})
if status in (200,201,204):
    ok(f"agent_memory INSERT with expires_at — {ms}ms")
    req("DELETE","agent_memory?session_id=eq.sess_test_ping")
elif status == 400 and "expires_at" in str(body):
    fail(f"expires_at column still missing — run migration")
else:
    warn(f"HTTP {status}: {body}")

# 6. summary
hdr("Summary")
print(f"""
  If all ✓ above:
    python3 scripts/agentsam_benchmark_v3.py \\
      --suite routing \\
      --providers openai,anthropic,google \\
      --budget-usd 0.25
""")
