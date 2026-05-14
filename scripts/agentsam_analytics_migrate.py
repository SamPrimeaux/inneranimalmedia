#!/usr/bin/env python3
"""
agentsam_analytics_migrate.py
──────────────────────────────
Rebuilds agentsam_analytics from the broken tenant-bucketed schema
into a per-model/intent/date analytics table.

What this does:
  1. Backs up existing data → agentsam_analytics_tenant_backup
  2. Drops agentsam_analytics
  3. Creates new agentsam_analytics with correct schema
  4. Backfills from agentsam_usage_events (any rows that have model_key)
  5. Backfills from ai_api_test_runs (benchmark history)
  6. Verifies row count + prints sample

Run:
  python3 scripts/agentsam_analytics_migrate.py --dry-run   # see SQL, no changes
  python3 scripts/agentsam_analytics_migrate.py             # apply to D1 remote
"""

VERSION = "1.1.0"

import subprocess, json, sys, textwrap
from datetime import datetime, timezone

DB      = "inneranimalmedia-business"
DRY_RUN = "--dry-run" in sys.argv
NOW     = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
TODAY   = datetime.now(timezone.utc).strftime("%Y-%m-%d")

R="\033[91m"; Y="\033[93m"; G="\033[92m"; C="\033[96m"; D="\033[2m"; X="\033[0m"; B="\033[1m"

def hdr(t):  print(f"\n{B}{C}{'═'*64}{X}\n{B}  {t}{X}\n{'═'*64}")
def ok(m):   print(f"  {G}✓{X}  {m}")
def warn(m): print(f"  {Y}⚠{X}  {m}")
def err(m):  print(f"  {R}✗{X}  {m}")
def info(m): print(f"  {D}{m}{X}")

def d1(sql, label="q"):
    if DRY_RUN:
        print(f"\n  {D}[DRY] {label}:{X}")
        print(textwrap.indent(sql.strip(), "    "))
        return []
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True, timeout=60
    )
    if r.returncode != 0:
        err(f"[{label}] {r.stderr.strip()[:200]}")
        return []
    try:
        p = json.loads(r.stdout)
        return p[0].get("results",[]) if p else []
    except Exception as e:
        err(f"parse [{label}]: {e}")
        return []

def d1_val(sql, key=None):
    rows = d1(sql)
    if not rows: return None
    return rows[0].get(key) if key else rows[0]

# ── Step 0: pre-flight ────────────────────────────────────────────────────────
hdr("PRE-FLIGHT CHECK")

existing_count = d1_val("SELECT COUNT(*) n FROM agentsam_analytics", "n") or 0
backup_exists  = d1_val("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='agentsam_analytics_tenant_backup'", "n") or 0

info(f"Current agentsam_analytics rows : {existing_count}")
info(f"Backup table already exists     : {'yes' if backup_exists else 'no'}")
if DRY_RUN:
    warn("DRY RUN — no changes will be made")

# ── Step 1: backup ────────────────────────────────────────────────────────────
hdr("STEP 1 — Backup existing data")

if backup_exists and not DRY_RUN:
    warn("Backup already exists — dropping and recreating")
    d1("DROP TABLE IF EXISTS agentsam_analytics_tenant_backup", "drop_backup")

d1("""
CREATE TABLE IF NOT EXISTS agentsam_analytics_tenant_backup AS
SELECT * FROM agentsam_analytics
""", "create_backup")

backed_up = d1_val("SELECT COUNT(*) n FROM agentsam_analytics_tenant_backup", "n") or 0
ok(f"Backed up {backed_up} rows → agentsam_analytics_tenant_backup")

# ── Step 2: drop old table ────────────────────────────────────────────────────
hdr("STEP 2 — Drop old agentsam_analytics")

d1("DROP TABLE IF EXISTS agentsam_analytics", "drop_old")
ok("Dropped agentsam_analytics")

# ── Step 3: create new schema ─────────────────────────────────────────────────
hdr("STEP 3 — Create new agentsam_analytics schema")

CREATE_SQL = """
CREATE TABLE agentsam_analytics (
  -- primary key: one row per (date + model + intent + arm_type)
  id               TEXT NOT NULL PRIMARY KEY,

  -- time bucket
  bucket_date      TEXT NOT NULL DEFAULT '',       -- 'YYYY-MM-DD'
  bucket_hour      INTEGER NOT NULL DEFAULT -1,    -- 0-23, or -1 = daily rollup

  -- what was called
  model_key        TEXT NOT NULL DEFAULT '',
  provider         TEXT NOT NULL DEFAULT '',
  tier             TEXT NOT NULL DEFAULT '',       -- nano|mini|standard|power|max
  arm_type         TEXT NOT NULL DEFAULT '',       -- benchmark|chat|code|routing|embed|tool
  intent_category  TEXT NOT NULL DEFAULT '',       -- classifyIntent result
  workspace_id     TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  routing_arm_id   TEXT NOT NULL DEFAULT '',

  -- volume
  total_calls      INTEGER NOT NULL DEFAULT 0,
  success_calls    INTEGER NOT NULL DEFAULT 0,
  failure_calls    INTEGER NOT NULL DEFAULT 0,
  timeout_calls    INTEGER NOT NULL DEFAULT 0,

  -- tokens (exact, no NULLs allowed)
  total_input_tok  INTEGER NOT NULL DEFAULT 0,
  total_output_tok INTEGER NOT NULL DEFAULT 0,
  total_cached_tok INTEGER NOT NULL DEFAULT 0,
  avg_input_tok    REAL    NOT NULL DEFAULT 0,
  avg_output_tok   REAL    NOT NULL DEFAULT 0,

  -- cost (exact)
  total_cost_usd   REAL NOT NULL DEFAULT 0.0,
  avg_cost_usd     REAL NOT NULL DEFAULT 0.0,

  -- latency
  avg_latency_ms   REAL NOT NULL DEFAULT 0.0,
  p50_latency_ms   REAL NOT NULL DEFAULT 0.0,
  p95_latency_ms   REAL NOT NULL DEFAULT 0.0,
  min_latency_ms   REAL NOT NULL DEFAULT 0.0,
  max_latency_ms   REAL NOT NULL DEFAULT 0.0,

  -- TTFT (time to first token)
  avg_ttft_ms      REAL NOT NULL DEFAULT 0.0,

  -- quality signals
  avg_quality_score  REAL NOT NULL DEFAULT 0.0,
  assertion_pass_ct  INTEGER NOT NULL DEFAULT 0,
  assertion_fail_ct  INTEGER NOT NULL DEFAULT 0,
  success_rate       REAL NOT NULL DEFAULT 0.0,
  assertion_rate     REAL NOT NULL DEFAULT 0.0,

  -- cache
  cache_hit_count  INTEGER NOT NULL DEFAULT 0,
  cache_hit_rate   REAL    NOT NULL DEFAULT 0.0,

  -- Thompson link
  alpha_contribution INTEGER NOT NULL DEFAULT 0,  -- successes this period
  beta_contribution  INTEGER NOT NULL DEFAULT 0,  -- failures this period

  -- meta
  source           TEXT NOT NULL DEFAULT 'benchmark', -- benchmark|live|eval
  run_group_id     TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(bucket_date, model_key, intent_category, arm_type, workspace_id)
    ON CONFLICT REPLACE
)
"""

d1(CREATE_SQL, "create_new_analytics")
ok("Created new agentsam_analytics")

# ── Step 4: backfill from ai_api_test_runs ────────────────────────────────────
hdr("STEP 4 — Backfill from ai_api_test_runs")

# Check if ai_api_test_runs has data
test_run_count = d1_val("SELECT COUNT(*) n FROM ai_api_test_runs WHERE model IS NOT NULL AND model != ''", "n") or 0
info(f"ai_api_test_runs rows with model: {test_run_count}")

if test_run_count > 0:
    d1(f"""
INSERT OR REPLACE INTO agentsam_analytics (
  id, bucket_date, bucket_hour, model_key, provider, tier, arm_type, intent_category,
  workspace_id, routing_arm_id,
  total_calls, success_calls, failure_calls, timeout_calls,
  total_input_tok, total_output_tok, total_cached_tok,
  avg_input_tok, avg_output_tok,
  total_cost_usd, avg_cost_usd,
  avg_latency_ms, p50_latency_ms, p95_latency_ms, min_latency_ms, max_latency_ms,
  avg_ttft_ms,
  avg_quality_score, assertion_pass_ct, assertion_fail_ct,
  success_rate, assertion_rate,
  cache_hit_count, cache_hit_rate,
  alpha_contribution, beta_contribution,
  source, run_group_id, created_at, updated_at
)
SELECT
  lower(hex(randomblob(8))) || '_' || model || '_' || mode || '_' || date(created_at),
  date(created_at),
  -1,
  model,
  provider,
  COALESCE(mode, 'unknown'),
  COALESCE(mode, 'benchmark'),
  COALESCE(mode, ''),
  COALESCE(workspace_id, 'ws_inneranimalmedia'),
  '',
  COUNT(*),
  SUM(success),
  SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),
  0,
  SUM(COALESCE(input_tokens,0)),
  SUM(COALESCE(output_tokens,0)),
  SUM(COALESCE(cached_tokens,0)),
  AVG(COALESCE(input_tokens,0)),
  AVG(COALESCE(output_tokens,0)),
  SUM(COALESCE(total_cost_usd,0)),
  AVG(COALESCE(total_cost_usd,0)),
  AVG(COALESCE(latency_ms,0)),
  AVG(COALESCE(latency_ms,0)),
  AVG(COALESCE(latency_ms,0)),
  MIN(COALESCE(latency_ms,0)),
  MAX(COALESCE(latency_ms,0)),
  AVG(COALESCE(time_to_first_token_ms,0)),
  0.0,
  SUM(CASE WHEN assertion_passed=1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN assertion_passed=0 THEN 1 ELSE 0 END),
  CAST(SUM(success) AS REAL) / MAX(COUNT(*),1),
  CAST(SUM(CASE WHEN assertion_passed=1 THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*),1),
  0,
  0.0,
  SUM(success),
  SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),
  'benchmark',
  COALESCE(run_group_id,''),
  datetime('now'),
  datetime('now')
FROM ai_api_test_runs
WHERE model IS NOT NULL AND model != ''
GROUP BY date(created_at), model, provider, mode, workspace_id
""", "backfill_from_test_runs")
    ok(f"Backfilled from ai_api_test_runs")

# ── Step 5: backfill from agentsam_usage_events ───────────────────────────────
hdr("STEP 5 — Backfill from agentsam_usage_events")

ue_count = d1_val("SELECT COUNT(*) n FROM agentsam_usage_events WHERE model_key IS NOT NULL AND model_key != ''", "n") or 0
info(f"agentsam_usage_events rows with model_key: {ue_count}")

if ue_count > 0:
    d1(f"""
INSERT OR REPLACE INTO agentsam_analytics (
  id, bucket_date, bucket_hour, model_key, provider, tier, arm_type, intent_category,
  workspace_id, routing_arm_id,
  total_calls, success_calls, failure_calls, timeout_calls,
  total_input_tok, total_output_tok, total_cached_tok,
  avg_input_tok, avg_output_tok,
  total_cost_usd, avg_cost_usd,
  avg_latency_ms, p50_latency_ms, p95_latency_ms, min_latency_ms, max_latency_ms,
  avg_ttft_ms,
  avg_quality_score, assertion_pass_ct, assertion_fail_ct,
  success_rate, assertion_rate,
  cache_hit_count, cache_hit_rate,
  alpha_contribution, beta_contribution,
  source, run_group_id, created_at, updated_at
)
SELECT
  lower(hex(randomblob(8))) || '_ue_' || model_key || '_' || date(created_at),
  date(created_at),
  -1,
  model_key,
  COALESCE(provider, 'unknown'),
  'unknown',
  COALESCE(event_type, 'live'),
  COALESCE(event_type, ''),
  COALESCE(workspace_id, 'ws_inneranimalmedia'),
  COALESCE(routing_arm_id, ''),
  COUNT(*),
  COUNT(*),
  0,
  0,
  SUM(COALESCE(input_tokens,0)),
  SUM(COALESCE(output_tokens,0)),
  0,
  AVG(COALESCE(input_tokens,0)),
  AVG(COALESCE(output_tokens,0)),
  SUM(COALESCE(cost_usd,0)),
  AVG(COALESCE(cost_usd,0)),
  0.0, 0.0, 0.0, 0.0, 0.0,
  0.0,
  0.0, 0, 0,
  1.0, 0.0,
  0, 0.0,
  COUNT(*), 0,
  'live',
  '',
  datetime('now'),
  datetime('now')
FROM agentsam_usage_events
WHERE model_key IS NOT NULL AND model_key != ''
GROUP BY date(created_at), model_key, provider, event_type, workspace_id
""", "backfill_from_usage_events")
    ok("Backfilled from agentsam_usage_events")

# ── Step 6: backfill from model_routing_memory (real observed stats) ──────────
hdr("STEP 6 — Backfill from agentsam_model_routing_memory")

mrm_count = d1_val("SELECT COUNT(*) n FROM agentsam_model_routing_memory WHERE model_key IS NOT NULL", "n") or 0
info(f"agentsam_model_routing_memory rows: {mrm_count}")

if mrm_count > 0:
    d1(f"""
INSERT OR REPLACE INTO agentsam_analytics (
  id, bucket_date, bucket_hour, model_key, provider, tier, arm_type, intent_category,
  workspace_id, routing_arm_id,
  total_calls, success_calls, failure_calls, timeout_calls,
  total_input_tok, total_output_tok, total_cached_tok,
  avg_input_tok, avg_output_tok,
  total_cost_usd, avg_cost_usd,
  avg_latency_ms, p50_latency_ms, p95_latency_ms, min_latency_ms, max_latency_ms,
  avg_ttft_ms,
  avg_quality_score, assertion_pass_ct, assertion_fail_ct,
  success_rate, assertion_rate,
  cache_hit_count, cache_hit_rate,
  alpha_contribution, beta_contribution,
  source, run_group_id, created_at, updated_at
)
SELECT
  lower(hex(randomblob(8))) || '_mrm_' || model_key || '_' || task_type,
  date(updated_at),
  -1,
  model_key,
  COALESCE(provider, 'unknown'),
  'unknown',
  COALESCE(task_type, 'live'),
  COALESCE(task_type, ''),
  COALESCE(workspace_id, 'ws_inneranimalmedia'),
  '',
  COALESCE(sample_count, 0),
  CAST(COALESCE(sample_count,0) * COALESCE(success_rate,0) AS INTEGER),
  CAST(COALESCE(sample_count,0) * (1 - COALESCE(success_rate,0)) AS INTEGER),
  0,
  0, 0, 0, 0, 0,
  COALESCE(avg_cost_usd,0) * COALESCE(sample_count,0),
  COALESCE(avg_cost_usd,0),
  COALESCE(avg_latency_ms,0),
  COALESCE(avg_latency_ms,0),
  COALESCE(avg_latency_ms,0),
  COALESCE(avg_latency_ms,0),
  COALESCE(avg_latency_ms,0),
  0.0,
  COALESCE(success_rate,0),
  CAST(COALESCE(sample_count,0) * COALESCE(success_rate,0) AS INTEGER),
  CAST(COALESCE(sample_count,0) * (1 - COALESCE(success_rate,0)) AS INTEGER),
  COALESCE(success_rate,0),
  COALESCE(success_rate,0),
  0, 0.0,
  CAST(COALESCE(sample_count,0) * COALESCE(success_rate,0) AS INTEGER),
  CAST(COALESCE(sample_count,0) * (1 - COALESCE(success_rate,0)) AS INTEGER),
  'observed',
  '',
  datetime('now'),
  datetime('now')
FROM agentsam_model_routing_memory
WHERE model_key IS NOT NULL AND sample_count > 0
""", "backfill_from_routing_memory")
    ok("Backfilled from agentsam_model_routing_memory")

# ── Step 7: verify ────────────────────────────────────────────────────────────
hdr("STEP 7 — VERIFICATION")

total = d1_val("SELECT COUNT(*) n FROM agentsam_analytics", "n") or 0
ok(f"agentsam_analytics now has {total} rows")

sample = d1("""
SELECT model_key, provider, arm_type, bucket_date,
       total_calls, success_calls, total_cost_usd,
       avg_latency_ms, success_rate, avg_quality_score
FROM agentsam_analytics
ORDER BY total_calls DESC
LIMIT 10
""", "verify_sample")

if sample:
    print(f"\n  {'model_key':<38} {'prov':<12} {'type':<12} {'calls':>5} "
          f"{'succ':>5} {'cost':>10} {'lat':>7} {'sr':>5} {'q':>5}")
    print(f"  {'-'*38} {'-'*12} {'-'*12} {'-----':>5} "
          f"{'-----':>5} {'----------':>10} {'-------':>7} {'-----':>5} {'-----':>5}")
    for r in sample:
        print(f"  {(r.get('model_key') or ''):<38} "
              f"{(r.get('provider') or ''):<12} "
              f"{(r.get('arm_type') or ''):<12} "
              f"{r.get('total_calls',0):>5} "
              f"{r.get('success_calls',0):>5} "
              f"${r.get('total_cost_usd',0):>9.6f} "
              f"{r.get('avg_latency_ms',0):>6.0f}ms "
              f"{r.get('success_rate',0):>5.2f} "
              f"{r.get('avg_quality_score',0):>5.2f}")

# null check
null_check = d1("""
SELECT
  SUM(CASE WHEN model_key IS NULL OR model_key='' THEN 1 ELSE 0 END)  no_model,
  SUM(CASE WHEN provider  IS NULL OR provider=''  THEN 1 ELSE 0 END)  no_provider,
  SUM(CASE WHEN bucket_date IS NULL OR bucket_date='' THEN 1 ELSE 0 END) no_date,
  SUM(CASE WHEN total_calls = 0 THEN 1 ELSE 0 END)                    zero_calls,
  COUNT(*) total
FROM agentsam_analytics
""", "null_check")

if null_check:
    nc = null_check[0]
    issues = []
    if nc.get("no_model"):   issues.append(f"no_model={nc['no_model']}")
    if nc.get("no_provider"):issues.append(f"no_provider={nc['no_provider']}")
    if nc.get("no_date"):    issues.append(f"no_date={nc['no_date']}")
    if nc.get("zero_calls"): issues.append(f"zero_calls={nc['zero_calls']}")
    if issues:
        warn(f"Data quality issues: {', '.join(issues)}")
    else:
        ok(f"Zero NULL violations across {nc.get('total',0)} rows")

hdr("DONE")
print(f"""
  agentsam_analytics is now:
    • Bucketed by (bucket_date, model_key, intent_category, arm_type, workspace_id)
    • 30 columns, all NOT NULL with real defaults
    • Pre-filled from ai_api_test_runs + usage_events + routing_memory
    • Ready to receive benchmark_flood_v2 rollup writes

  Run the benchmark now:
    python3 scripts/agentsam_benchmark_flood_v2.py --mini
    python3 scripts/agentsam_benchmark_flood_v2.py --suite default --skip-expensive

  Key columns the benchmark writes:
    model_key, provider, tier, arm_type, intent_category
    total_calls, success_calls, failure_calls
    total_input_tok, total_output_tok, total_cost_usd, avg_cost_usd
    avg_latency_ms, p50_latency_ms, p95_latency_ms
    avg_ttft_ms (time to first token)
    avg_quality_score, assertion_pass_ct, assertion_fail_ct
    success_rate, assertion_rate
    alpha_contribution, beta_contribution  ← Thompson inputs
    routing_arm_id                         ← links back to arms table

  Backup of old data:
    agentsam_analytics_tenant_backup ({backed_up} rows — safe to drop later)
""")

print(f"\n{D}Done — {NOW}{X}\n")
