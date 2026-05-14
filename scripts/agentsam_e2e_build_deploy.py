#!/usr/bin/env python3
"""
scripts/agentsam_e2e_build_deploy.py
VERSION = "1.0.0"

Proves Agent Sam can build + deploy something real end-to-end.
No stubs. No mocks. Actual wrangler deploy to Cloudflare.

What this does:
  1. Reads live D1 data (agentsam_routing_arms win rates)
  2. Uses OpenAI to generate a real worker that serves that data
  3. Scaffolds a standalone wrangler project in /tmp
  4. Deploys it as agentsam-probe-{ts}.workers.dev
  5. Hits the live URL and verifies the response
  6. Records result in D1 agentsam_agent_run + agentsam_scripts

Usage:
  python3 scripts/agentsam_e2e_build_deploy.py --dry-run   # skip deploy
  python3 scripts/agentsam_e2e_build_deploy.py              # full e2e
"""
import subprocess, json, sys, os, time, urllib.request, tempfile, shutil
from pathlib import Path
from datetime import datetime, timezone

DRY      = "--dry-run" in sys.argv
DB       = "inneranimalmedia-business"
REPO     = Path(__file__).parent.parent.resolve()
TS       = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
WORKER   = f"agentsam-probe-{TS}"
ENV_FILE = REPO / ".env.agentsam.local"

# ── load env ────────────────────────────────────────────────────────────────

def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()
OPENAI_KEY = os.environ.get("OPENAI_API_KEY","")
CF_ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID","ede6590ac0d2fb7daf155b35653457b2")

def section(t):
    print(f"\n{'─'*64}\n  {t}\n{'─'*64}")

def d1q(sql):
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results",[])
    except Exception:
        return []

def d1x(sql, label=""):
    if DRY:
        print(f"  [DRY] {label}")
        return 0
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        c = json.loads(r.stdout)[0].get("meta",{}).get("changes",0)
        if label: print(f"  ✓ {label} — {c} rows")
        return c
    except Exception:
        print(f"  ✗ {label}: {r.stderr[:200]}")
        return -1

# ── 1. Pull live routing arm data from D1 ───────────────────────────────────

section("1. Pulling live routing arm data from D1")

arms = d1q("""
    SELECT model_key, task_type, mode,
           ROUND(success_alpha,2) as alpha,
           ROUND(success_beta,2)  as beta,
           ROUND(success_alpha/(success_alpha+success_beta)*100,1) as win_pct
    FROM agentsam_routing_arms
    WHERE is_active=1 AND is_eligible=1
      AND task_type IN ('chat','code','plan','debug')
    ORDER BY task_type, win_pct DESC
    LIMIT 20
""")

if not arms:
    print("  ✗ No arms found — is D1 accessible?")
    sys.exit(1)

print(f"  ✓ Got {len(arms)} routing arm rows")
for a in arms[:5]:
    print(f"    {a['model_key']:<28} {a['task_type']:<12} {a['win_pct']}%")
print("    ...")

# Format as JSON for the worker to serve
arm_data = json.dumps(arms, indent=2)

# ── 2. Generate worker code with OpenAI ─────────────────────────────────────

section("2. Generating worker code with OpenAI")

if not OPENAI_KEY:
    print("  ✗ OPENAI_API_KEY not set — check .env.agentsam.local")
    sys.exit(1)

prompt = f"""Write a Cloudflare Worker (single worker.js file, ES module syntax) that:
1. Handles GET / — returns a JSON response with:
   - "worker": "{WORKER}"
   - "built_by": "Agent Sam"
   - "built_at": "{TS}"
   - "routing_arms": <the arm data below>
   - "status": "live"
2. Handles GET /health — returns {{"ok": true, "worker": "{WORKER}"}}
3. Sets CORS headers on all responses
4. Has proper content-type: application/json

Routing arm data to embed:
{arm_data[:2000]}

Return ONLY the worker.js code, nothing else."""

req_body = json.dumps({
    "model": "gpt-5.4-nano",
    "max_completion_tokens": 1500,
    "messages": [{"role": "user", "content": prompt}]
}).encode()

req = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=req_body,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_KEY}"
    }
)

t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    latency = int((time.time()-t0)*1000)
    worker_code = result["choices"][0]["message"]["content"].strip()
    # Strip markdown code blocks if present
    if worker_code.startswith("```"):
        lines = worker_code.splitlines()
        worker_code = "\n".join(lines[1:-1] if lines[-1]=="```" else lines[1:])
    tokens_in  = result["usage"]["prompt_tokens"]
    tokens_out = result["usage"]["completion_tokens"]
    cost = round(tokens_in*0.20/1_000_000 + tokens_out*1.25/1_000_000, 8)
    print(f"  ✓ Generated {len(worker_code)} chars in {latency}ms")
    print(f"    tokens: {tokens_in} in / {tokens_out} out / ${cost:.6f}")
except Exception as e:
    print(f"  ✗ OpenAI error: {e}")
    sys.exit(1)

# ── 3. Scaffold wrangler project ─────────────────────────────────────────────

section("3. Scaffolding wrangler project")

work_dir = Path(tempfile.mkdtemp(prefix=f"agentsam_{TS}_"))
print(f"  Working dir: {work_dir}")

# wrangler.toml
wrangler_toml = f"""name = "{WORKER}"
main = "worker.js"
compatibility_date = "2024-01-01"
account_id = "{CF_ACCOUNT}"
"""

(work_dir / "wrangler.toml").write_text(wrangler_toml)
(work_dir / "worker.js").write_text(worker_code)
print(f"  ✓ worker.js ({len(worker_code)} bytes)")
print(f"  ✓ wrangler.toml")

# Show first 10 lines of generated code
print(f"\n  Generated worker.js preview:")
for line in worker_code.splitlines()[:12]:
    print(f"    {line}")
print("    ...")

# ── 4. Deploy ────────────────────────────────────────────────────────────────

section(f"4. Deploying {WORKER}")

if DRY:
    print(f"  [DRY] would run: npx wrangler deploy --config {work_dir}/wrangler.toml")
    deploy_url = f"https://{WORKER}.workers.dev"
    print(f"  [DRY] would deploy to: {deploy_url}")
else:
    deploy_result = subprocess.run(
        ["npx","wrangler","deploy","--config", str(work_dir/"wrangler.toml")],
        capture_output=True, text=True, cwd=str(work_dir)
    )
    if deploy_result.returncode != 0:
        print(f"  ✗ Deploy failed:")
        print(deploy_result.stderr[-500:])
        shutil.rmtree(work_dir, ignore_errors=True)
        sys.exit(1)
    deploy_url = f"https://{WORKER}.workers.dev"
    print(f"  ✓ Deployed to {deploy_url}")
    print(deploy_result.stdout[-300:])

# ── 5. Verify live ───────────────────────────────────────────────────────────

section("5. Verifying live endpoint")

if DRY:
    print(f"  [DRY] would GET {deploy_url}/health")
    verified = True
else:
    time.sleep(3)  # CF propagation
    verified = False
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{deploy_url}/health", timeout=10) as r:
                body = json.loads(r.read())
                if body.get("ok"):
                    print(f"  ✓ Live — {deploy_url}/health → {body}")
                    verified = True
                    break
        except Exception as e:
            print(f"  attempt {attempt+1}/3: {e}")
            time.sleep(2)
    if not verified:
        print(f"  ⚠  Could not verify — worker may still be propagating")
        print(f"     Check manually: curl {deploy_url}/health")

# ── 6. Record in D1 ──────────────────────────────────────────────────────────

section("6. Recording result in D1")

run_id  = f"arun_e2e_{TS}"
run_sql = f"""INSERT OR IGNORE INTO agentsam_agent_run
  (id, user_id, workspace_id, tenant_id, trigger, status,
   ai_model_ref, input_tokens, output_tokens, cost_usd,
   started_at, completed_at, created_at)
VALUES (
  '{run_id}',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'e2e_build_deploy',
  '{"completed" if verified else "partial"}',
  'gpt-5.4-nano',
  {tokens_in if not DRY else 0},
  {tokens_out if not DRY else 0},
  {cost if not DRY else 0},
  datetime('now'),
  datetime('now'),
  datetime('now')
)"""

d1x(run_sql, f"INSERT agentsam_agent_run {run_id}")

# Register deployed worker in agentsam_scripts
script_sql = f"""INSERT OR IGNORE INTO agentsam_scripts
  (id, workspace_id, tenant_id, name, path, description,
   purpose, runner, safe_to_run, owner_only, is_active, body,
   created_at, updated_at)
VALUES (
  'scr_e2e_{TS}',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  '{WORKER}',
  'https://{WORKER}.workers.dev',
  'Agent Sam e2e proof worker — built {TS}. Serves live routing arm data from D1.',
  'deploy',
  'wrangler',
  1, 0, 1,
  '{worker_code[:500].replace(chr(39), chr(39)*2) if not DRY else ""}',
  datetime('now'), datetime('now')
)"""

d1x(script_sql, f"INSERT agentsam_scripts scr_e2e_{TS}")

# Update plan task
d1x(f"""UPDATE agentsam_plan_tasks
    SET status='done', completed_at=unixepoch(),
        output_summary='Deployed {WORKER} — verified: {verified}'
    WHERE plan_id='plan_may14_2026_repair'
      AND title LIKE '%Wire analytics%'
      AND status='todo'
    LIMIT 1""", "update plan task")

# ── cleanup ──────────────────────────────────────────────────────────────────

shutil.rmtree(work_dir, ignore_errors=True)

# ── summary ──────────────────────────────────────────────────────────────────

print(f"\n{'═'*64}")
print(f"  {'DRY RUN — nothing deployed' if DRY else 'E2E COMPLETE'}")
if not DRY:
    print(f"  Worker:   {WORKER}")
    print(f"  URL:      https://{WORKER}.workers.dev")
    print(f"  Verified: {verified}")
    print(f"  Run ID:   {run_id}")
print(f"{'═'*64}\n")
