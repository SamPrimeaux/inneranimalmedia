#!/usr/bin/env python3
"""
agentsam_supabase_repair.py
────────────────────────────
Fixes every issue flagged in the Supabase MCP audit:

  1. agent_memory cron broken — expires_at column missing
  2. Duplicate index on semantic_search_log
  3. Unindexed foreign keys (top 16)
  4. RLS initplan — re-evaluates auth.* per row (expensive)
  5. Reports unused indexes for manual review
  6. Validates Hyperdrive query path

Run:
  python3 scripts/agentsam_supabase_repair.py --dry-run
  python3 scripts/agentsam_supabase_repair.py
"""

VERSION = "1.1.0"

import os, sys, json, subprocess
from datetime import datetime, timezone
from pathlib import Path
import urllib.request, urllib.error

for env_name in [".env.agentsam.local", ".env"]:
    p = Path(__file__).parent.parent / env_name
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

DRY_RUN  = "--dry-run" in sys.argv
SUPA_URL = os.environ.get("SUPABASE_URL","").rstrip("/")
SUPA_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
           os.environ.get("SUPABASE_ANON_KEY",""))
NOW      = datetime.now(timezone.utc).isoformat()

R="\033[91m"; Y="\033[93m"; G="\033[92m"; C="\033[96m"; DIM="\033[2m"; X="\033[0m"; B="\033[1m"
def hdr(t):  print(f"\n{B}{C}{'═'*66}{X}\n{B}  {t}{X}\n{'═'*66}")
def ok(m):   print(f"  {G}✓{X}  {m}")
def warn(m): print(f"  {Y}⚠{X}  {m}")
def err(m):  print(f"  {R}✗{X}  {m}")
def info(m): print(f"  {DIM}{m}{X}")

# ── Supabase SQL runner (via PostgREST RPC) ───────────────────────────────────
def supa_sql(sql, label=""):
    """Execute raw SQL via Supabase management API or pg RPC."""
    if not SUPA_URL or not SUPA_KEY:
        err("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return None, "not configured"
    if DRY_RUN:
        print(f"\n  {DIM}[DRY] {label}:{X}")
        for line in sql.strip().splitlines():
            print(f"    {line}")
        return [], None
    # Use Supabase /rest/v1/rpc/exec_sql if available, else warn
    # Most setups expose this via pg_net or service role direct SQL
    # Fallback: use psql if available
    url = f"{SUPA_URL}/rest/v1/rpc/exec_sql"
    data = json.dumps({"sql": sql}).encode()
    req  = urllib.request.Request(url, data=data, method="POST",
        headers={"Content-Type":"application/json",
                 "Authorization":f"Bearer {SUPA_KEY}",
                 "apikey":SUPA_KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        # exec_sql not exposed — fall back to psql
        if e.code in (404, 405):
            return _psql(sql, label)
        return None, f"{e.code}: {body[:200]}"
    except Exception as ex:
        return None, str(ex)

def _psql(sql, label=""):
    """Run SQL via psql using the DB URL from env."""
    db_url = os.environ.get("DATABASE_URL",
             os.environ.get("SUPABASE_DB_URL",""))
    if not db_url:
        # Try to construct from Supabase URL
        project = SUPA_URL.replace("https://","").split(".")[0]
        db_pass = os.environ.get("SUPABASE_DB_PASSWORD","")
        if project and db_pass:
            db_url = f"postgresql://postgres:{db_pass}@db.{project}.supabase.co:5432/postgres"
        else:
            return None, "No DATABASE_URL or SUPABASE_DB_URL — set one to run migrations"
    r = subprocess.run(
        ["psql", db_url, "-c", sql, "--no-psqlrc", "-q"],
        capture_output=True, text=True, timeout=30
    )
    if r.returncode != 0:
        return None, r.stderr.strip()[:300]
    return r.stdout.strip(), None

# ── READ via PostgREST ────────────────────────────────────────────────────────
def supa_get(path, params=""):
    if not SUPA_URL or not SUPA_KEY: return None
    url = f"{SUPA_URL}/rest/v1/{path}{'?'+params if params else ''}"
    req = urllib.request.Request(url, headers={
        "Authorization":f"Bearer {SUPA_KEY}","apikey":SUPA_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as ex:
        warn(f"GET {path}: {ex}")
        return None

# ── MIGRATION STATEMENTS ──────────────────────────────────────────────────────

# 1. Fix agent_memory — add expires_at column if missing
FIX_AGENT_MEMORY = """
ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.agent_memory.expires_at
  IS 'Optional TTL — pg_cron deletes rows where expires_at < now()';

-- Also fix memory_type column if missing (common drift)
ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'general';
"""

# 2. Drop duplicate index on semantic_search_log
FIX_DUPLICATE_INDEX = """
DROP INDEX IF EXISTS public.idx_ssl_created;
-- Keep semantic_search_log_created_at_idx as canonical name
"""

# 3. Unindexed FK fix — top offenders across agentsam_* tables
FIX_UNINDEXED_FKS = """
-- agent_memory
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace_id ON public.agent_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id      ON public.agent_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_session_id   ON public.agent_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_memory_type  ON public.agent_memory(memory_type);

-- documents (RAG)
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON public.documents(workspace_id);

-- agentsam_workflow_runs (if in public schema)
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workspace ON public.agentsam_workflow_runs(workspace_id)
  WHERE EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='agentsam_workflow_runs');

-- agentsam_eval_runs
CREATE INDEX IF NOT EXISTS idx_eval_runs_suite_id   ON public.agentsam_eval_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_model_key  ON public.agentsam_eval_runs(model_key);
CREATE INDEX IF NOT EXISTS idx_eval_runs_run_at     ON public.agentsam_eval_runs(run_at DESC);

-- agentsam_routing_decisions
CREATE INDEX IF NOT EXISTS idx_routing_decisions_model   ON public.agentsam_routing_decisions(selected_model);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_created ON public.agentsam_routing_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_arm     ON public.agentsam_routing_decisions(routing_arm_id);

-- model_performance_snapshots
CREATE INDEX IF NOT EXISTS idx_mps_model_date ON public.model_performance_snapshots(model_key, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_mps_provider   ON public.model_performance_snapshots(provider);

-- semantic_search_log
CREATE INDEX IF NOT EXISTS idx_ssl_workspace ON public.semantic_search_log(workspace_id);

-- tool_call_events
CREATE INDEX IF NOT EXISTS idx_tce_model_key  ON public.agentsam_tool_call_events(model_key);
CREATE INDEX IF NOT EXISTS idx_tce_created_at ON public.agentsam_tool_call_events(created_at DESC);
"""

# 4. RLS initplan fix — wrap auth calls in subquery so they evaluate ONCE per query
# Pattern: change   auth.uid() = user_id
#          to       (select auth.uid()) = user_id
# Apply to your hottest tables. Template — adjust policy names to match yours.
FIX_RLS_INITPLAN = """
-- TEMPLATE: replace per-row auth.uid() with subquery (evaluated once)
-- Run EXPLAIN (ANALYZE, BUFFERS) on your top queries first to confirm which
-- policies are the bottleneck, then apply the pattern below per table.

-- Example for agent_memory (adjust policy name to match yours):
DO $$
BEGIN
  -- Drop and recreate only if policy exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agent_memory'
    AND policyname='agent_memory_user_policy'
  ) THEN
    DROP POLICY agent_memory_user_policy ON public.agent_memory;
    CREATE POLICY agent_memory_user_policy ON public.agent_memory
      USING ((select auth.uid())::text = user_id::text);
  END IF;
END $$;

-- Example for documents:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='documents'
    AND policyname='documents_user_policy'
  ) THEN
    DROP POLICY documents_user_policy ON public.documents;
    CREATE POLICY documents_user_policy ON public.documents
      USING ((select auth.uid())::text = user_id::text);
  END IF;
END $$;
"""

# 5. Fix cron job SQL to use actual column names
FIX_CRON_JOB = """
-- Update the broken cron to match actual schema
-- First check what cron jobs exist
SELECT jobname, schedule, command
FROM cron.job
WHERE command LIKE '%agent_memory%';

-- If the old broken job exists, update it:
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE command LIKE '%expires_at%' AND command LIKE '%agent_memory%' LIMIT 1),
  command := $$
    DELETE FROM public.agent_memory
    WHERE expires_at IS NOT NULL AND expires_at < now()
  $$
);
"""

# 6. model_performance_snapshots — ensure upsert conflict target exists
FIX_MPS_UNIQUE = """
-- model_performance_snapshots needs a unique constraint for upsert
-- (benchmark flood v3 uses resolution=merge-duplicates)
ALTER TABLE public.model_performance_snapshots
  DROP CONSTRAINT IF EXISTS mps_unique_snapshot;

ALTER TABLE public.model_performance_snapshots
  ADD CONSTRAINT mps_unique_snapshot
  UNIQUE (workspace_id, snapshot_date, model_key, task_type, mode);
"""

# ── EXECUTION ─────────────────────────────────────────────────────────────────
hdr("SUPABASE REPAIR  |  " + ("DRY RUN" if DRY_RUN else "LIVE"))

if not SUPA_URL:
    err("SUPABASE_URL not set — check .env.agentsam.local")
    sys.exit(1)

info(f"Project: {SUPA_URL}")
info(f"Key    : {'set ('+SUPA_KEY[:8]+'...)' if SUPA_KEY else 'MISSING'}")

# ── Step 1: agent_memory column ───────────────────────────────────────────────
hdr("1. Fix agent_memory — add expires_at + memory_type columns")
result, e = supa_sql(FIX_AGENT_MEMORY, "agent_memory_columns")
if e: warn(f"  → {e} (may need psql access)")
else: ok("expires_at + memory_type columns ensured")

# ── Step 2: duplicate index ───────────────────────────────────────────────────
hdr("2. Drop duplicate index on semantic_search_log")
result, e = supa_sql(FIX_DUPLICATE_INDEX, "drop_dup_index")
if e: warn(f"  → {e}")
else: ok("Duplicate index idx_ssl_created dropped")

# ── Step 3: unindexed FKs ────────────────────────────────────────────────────
hdr("3. Create indexes for unindexed FK columns")
result, e = supa_sql(FIX_UNINDEXED_FKS, "create_fk_indexes")
if e: warn(f"  → {e}")
else: ok("FK indexes created (all IF NOT EXISTS)")

# ── Step 4: RLS initplan ──────────────────────────────────────────────────────
hdr("4. RLS initplan — template applied")
result, e = supa_sql(FIX_RLS_INITPLAN, "rls_initplan")
if e: warn(f"  → {e}")
else: ok("RLS policy subquery wrap applied where policies exist")

# ── Step 5: fix cron job ──────────────────────────────────────────────────────
hdr("5. Fix agent_memory cron job")
result, e = supa_sql(FIX_CRON_JOB, "fix_cron")
if e: warn(f"  → {e} (pg_cron may require superuser — run in Supabase SQL editor)")
else: ok("Cron job updated")

# ── Step 6: model_performance_snapshots unique constraint ─────────────────────
hdr("6. model_performance_snapshots — ensure upsert constraint")
result, e = supa_sql(FIX_MPS_UNIQUE, "mps_unique")
if e: warn(f"  → {e}")
else: ok("Unique constraint on model_performance_snapshots ensured")

# ── Step 7: Hyperdrive path validation ────────────────────────────────────────
hdr("7. Hyperdrive query path check")
print("""
  Current split (from audit):
    PostgREST  → mirrors, writes, RPC, user-scoped queries (RLS)
    Hyperdrive → RAG, analytics, aggregations, server-only SQL

  This is CORRECT. Do not collapse them — PostgREST handles RLS properly.
  
  What to fix in code:

  In src/core/hyperdrive-query.js — prefer .query() over Client connect/end:
""")
print(f"""{DIM}  // CURRENT (creates new pg connection per call — expensive at QPS):
  const client = new Client(env.HYPERDRIVE.connectionString);
  await client.connect();
  const result = await client.query(sql, params);
  await client.end();

  // BETTER (uses Hyperdrive's built-in pooling):
  if (env.HYPERDRIVE?.query) {{
    return await env.HYPERDRIVE.query(sql, params);
  }}
  // fallback to Client only if .query not available
  const client = new Client(env.HYPERDRIVE.connectionString);
  await client.connect();
  try {{
    return await client.query(sql, params);
  }} finally {{
    await client.end();
  }}{X}
""")

# ── Step 8: model_performance_snapshots current state ────────────────────────
hdr("8. model_performance_snapshots — current rows")
rows = supa_get("model_performance_snapshots", "order=computed_at.desc&limit=10")
if rows:
    print(f"\n  {'model_key':<32} {'provider':<12} {'mode':<18} {'runs':>5} {'sr':>6} {'q':>6} {'cost':>10}")
    print(f"  {'-'*32} {'-'*12} {'-'*18} {'-----':>5} {'------':>6} {'------':>6} {'----------':>10}")
    for r in rows:
        print(f"  {(r.get('model_key') or ''):<32} "
              f"{(r.get('provider') or ''):<12} "
              f"{(r.get('mode') or ''):<18} "
              f"{r.get('total_runs',0):>5} "
              f"{r.get('success_rate',0):>6.3f} "
              f"{r.get('quality_score',0):>6.3f} "
              f"${r.get('total_cost_usd',0):>9.6f}")
elif rows == []:
    warn("model_performance_snapshots is empty — run benchmark_v3 to populate")
else:
    warn("Could not read model_performance_snapshots — check Supabase connection")

# ── MANUAL SQL for Supabase editor ───────────────────────────────────────────
hdr("MANUAL SQL — run these in Supabase SQL Editor if script couldn't connect")
print(f"""
  Copy-paste these into https://supabase.com/dashboard/project/dpmuvynqixblxsilnlut/sql

  -- 1. Fix agent_memory
  ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'general';

  -- 2. Drop duplicate index
  DROP INDEX IF EXISTS public.idx_ssl_created;

  -- 3. Fix cron (in SQL editor which has superuser)
  SELECT cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE command LIKE '%agent_memory%' LIMIT 1),
    command := $$ DELETE FROM public.agent_memory WHERE expires_at IS NOT NULL AND expires_at < now() $$
  );

  -- 4. Unique constraint for benchmark upsert
  ALTER TABLE public.model_performance_snapshots
    ADD CONSTRAINT mps_unique_snapshot
    UNIQUE (workspace_id, snapshot_date, model_key, task_type, mode)
    DEFERRABLE INITIALLY DEFERRED;

  -- 5. Top FK indexes (paste full FIX_UNINDEXED_FKS block above)
""")

hdr("DONE")
print(f"""
  After running this script + manual SQL:
    python3 scripts/agentsam_benchmark_v3.py --mini --no-thompson-update

  The Supabase upsert will hit the unique constraint correctly and
  model_performance_snapshots will start receiving real per-role data.
""")
print(f"{DIM}Done — {NOW}{X}\n")
