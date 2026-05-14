#!/usr/bin/env python3
"""
agentsam_routing_study.py
─────────────────────────
Deep-reads the routing/execution/eval table cluster and prints:
  • Actual schema (PRAGMA table_info)
  • Row counts + sample data
  • Redundancy / inefficiency flags
  • Redesign recommendations

Run:
  python3 scripts/agentsam_routing_study.py | tee docs/db-audit/routing_study.md
"""

VERSION = "1.1.0"

import subprocess, json, sys, textwrap
from datetime import datetime, timezone

DB      = "inneranimalmedia-business"
NOW_UTC = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

RED  = "\033[91m"; YEL = "\033[93m"; GRN = "\033[92m"
CYN  = "\033[96m"; DIM = "\033[2m";  RST = "\033[0m"; BOLD = "\033[1m"

def hdr(t):  print(f"\n{BOLD}{CYN}{'═'*70}{RST}\n{BOLD}  {t}{RST}\n{'═'*70}")
def sub(t):  print(f"\n  {BOLD}{YEL}── {t}{RST}")
def ok(m):   print(f"  {GRN}✓{RST}  {m}")
def warn(m): print(f"  {YEL}⚠{RST}  {m}")
def err(m):  print(f"  {RED}✗{RST}  {m}")
def info(m): print(f"  {DIM}{m}{RST}")

def d1(sql, label="q"):
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"{RED}[{label}] error:{RST} {r.stderr.strip()[:120]}")
        return []
    try:
        p = json.loads(r.stdout)
        return p[0].get("results",[]) if p else []
    except Exception as e:
        print(f"{RED}parse err [{label}]:{RST} {e}")
        return []

def schema(table):
    rows = d1(f"PRAGMA table_info({table})", f"schema:{table}")
    return rows  # [{cid, name, type, notnull, dflt_value, pk}]

def count(table):
    r = d1(f"SELECT COUNT(*) n FROM {table}", f"count:{table}")
    return r[0]["n"] if r else 0

def sample(table, cols="*", limit=5, order="rowid DESC"):
    return d1(f"SELECT {cols} FROM {table} ORDER BY {order} LIMIT {limit}", f"sample:{table}")

def null_pct(table, col, total):
    r = d1(f"SELECT COUNT(*) n FROM {table} WHERE {col} IS NULL", f"nullpct:{table}.{col}")
    n = r[0]["n"] if r else 0
    return n, (100*n//max(total,1))

def distinct_vals(table, col, limit=12):
    return d1(f"SELECT {col}, COUNT(*) n FROM {table} WHERE {col} IS NOT NULL GROUP BY {col} ORDER BY n DESC LIMIT {limit}", f"dist:{table}.{col}")

# ────────────────────────────────────────────────────────────────────────────
# TABLE STUDIES
# ────────────────────────────────────────────────────────────────────────────

# ── 1. agentsam_model_catalog ────────────────────────────────────────────────
hdr("1. agentsam_model_catalog")
n = count("agentsam_model_catalog")
print(f"  Rows: {n}")
cols = schema("agentsam_model_catalog")
print(f"  Columns ({len(cols)}): {', '.join(c['name'] for c in cols)}")

sub("All models in catalog")
rows = d1("""
    SELECT model_key, provider, model_family, is_active,
           context_window, input_cost_per_mtok, output_cost_per_mtok,
           supports_streaming, supports_tools, is_deprecated
    FROM agentsam_model_catalog ORDER BY provider, model_family
""", "catalog_full")
if rows:
    print(f"  {'model_key':<42} {'provider':<12} {'family':<16} {'active':>6} {'ctx':>8} {'in$/M':>8} {'out$/M':>8} {'depr':>5}")
    print(f"  {'-'*42} {'-'*12} {'-'*16} {'------':>6} {'--------':>8} {'--------':>8} {'--------':>8} {'-----':>5}")
    for r in rows:
        print(f"  {(r.get('model_key') or ''):<42} "
              f"{(r.get('provider') or ''):<12} "
              f"{(r.get('model_family') or ''):<16} "
              f"{'Y' if r.get('is_active') else 'N':>6} "
              f"{(r.get('context_window') or '?'):>8} "
              f"{(r.get('input_cost_per_mtok') or '?'):>8} "
              f"{(r.get('output_cost_per_mtok') or '?'):>8} "
              f"{'Y' if r.get('is_deprecated') else 'N':>5}")

sub("Zombie column audit")
zombie_candidates = ['avg_latency_p50_ms','avg_latency_p95_ms','quality_score','rate_limit_rpm','rate_limit_tpd']
for col in zombie_candidates:
    nulls, pct = null_pct("agentsam_model_catalog", col, n)
    flag = f"{RED}ZOMBIE{RST}" if pct == 100 else (f"{YEL}sparse{RST}" if pct > 80 else f"{GRN}ok{RST}")
    print(f"    {col:<35} NULL {nulls}/{n} ({pct}%)  {flag}")

print(f"""
  {BOLD}RECOMMENDATION:{RST}
  - Add missing cost fields for GPT-5.4-mini/nano/Gemini 2.5 flash if not present
  - Drop: avg_latency_p50_ms, avg_latency_p95_ms, quality_score, rate_limit_rpm, rate_limit_tpd
    (100% NULL — use agentsam_execution_performance_metrics for real latency instead)
  - Add: preferred_lane TEXT (text_default|edge_bulk|multimodal) to guide embed routing
""")

# ── 2. agentsam_model_tier ────────────────────────────────────────────────────
hdr("2. agentsam_model_tier  ← REDESIGN TARGET")
n = count("agentsam_model_tier")
print(f"  Rows: {n}  {RED}← {n} rows for tier config is wasteful if duplicated per workspace{RST}")

sub("Workspace distribution — how many workspaces have tier rows?")
ws_dist = d1("""
    SELECT workspace_id, COUNT(*) n
    FROM agentsam_model_tier GROUP BY workspace_id ORDER BY n DESC LIMIT 10
""", "tier_ws_dist")
if ws_dist:
    for r in ws_dist:
        print(f"    {(r.get('workspace_id') or 'NULL'):<40} {r.get('n',0)} rows")

sub("Tier distribution")
tier_dist = distinct_vals("agentsam_model_tier", "tier_name")
for r in tier_dist:
    print(f"    tier={r.get('tier_name','?'):<20} {r.get('n',0)} rows")

sub("Sample rows")
rows = sample("agentsam_model_tier",
    "workspace_id, tier_name, model_key, priority, is_active, fallback_model_id, routing_arm_id", 8)
if rows:
    for r in rows:
        arm_flag = f"{RED}no arm{RST}" if not r.get("routing_arm_id") else f"{GRN}arm✓{RST}"
        fb_flag  = f"{RED}no fallback{RST}" if not r.get("fallback_model_id") else "fb✓"
        print(f"    tier={r.get('tier_name','?'):<15} model={r.get('model_key','?'):<35} "
              f"pri={r.get('priority','?'):>3}  {arm_flag}  {fb_flag}")

print(f"""
  {BOLD}{RED}INEFFICIENCY:{RST}
  Current design: 1 row per (workspace × tier × model) = exponential growth.
  {n} rows with 1 workspace means the tiers themselves are already bloated.

  {BOLD}RECOMMENDED REDESIGN → global tier registry (platform-wide):{RST}

  CREATE TABLE agentsam_model_tier_v2 (
    id           TEXT PRIMARY KEY,
    tier_name    TEXT NOT NULL,          -- 'nano'|'mini'|'standard'|'power'|'max'
    model_key    TEXT NOT NULL,
    provider     TEXT NOT NULL,
    priority     INTEGER DEFAULT 0,      -- lower = preferred within tier
    is_active    INTEGER DEFAULT 1,
    max_input_tok INTEGER,               -- guard rail
    max_cost_usd  REAL,                  -- per-call ceiling
    fallback_tier TEXT,                  -- e.g. 'mini' fallbacks to 'nano'
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(tier_name, model_key)
  );
  -- workspace overrides only when truly needed:
  CREATE TABLE agentsam_model_tier_override (
    workspace_id TEXT NOT NULL,
    tier_name    TEXT NOT NULL,
    model_key    TEXT NOT NULL,          -- override the global default
    PRIMARY KEY (workspace_id, tier_name)
  );

  Migration: SELECT DISTINCT tier_name, model_key, provider, priority, is_active
             FROM agentsam_model_tier → INSERT into v2 (dedup).
  Then DROP agentsam_model_tier, rename v2.
  Workspace overrides table stays small (only workspaces that actually differ).
""")

# ── 3. agentsam_routing_arms ─────────────────────────────────────────────────
hdr("3. agentsam_routing_arms")
n = count("agentsam_routing_arms")
print(f"  Rows: {n}")

sub("Active arms with Thompson state")
arms = d1("""
    SELECT ra.model_key, ra.arm_type, ra.is_active,
           ra.total_executions, ra.success_count, ra.failure_count,
           ra.alpha_successes, ra.beta_failures,
           ra.avg_latency_ms, ra.avg_cost_usd,
           ra.ai_model_id,
           mc.input_cost_per_mtok, mc.output_cost_per_mtok
    FROM agentsam_routing_arms ra
    LEFT JOIN agentsam_model_catalog mc ON mc.id = ra.ai_model_id
    WHERE ra.is_active = 1
    ORDER BY ra.total_executions DESC
    LIMIT 30
""", "arms_detail")
if arms:
    print(f"  {'model_key':<42} {'type':<12} {'exec':>6} {'α':>6} {'β':>6} {'win%':>6} {'in$/M':>8} {'arm_id':>5}")
    print(f"  {'-'*42} {'-'*12} {'------':>6} {'------':>6} {'------':>6} {'------':>6} {'--------':>8} {'-----':>5}")
    for r in arms:
        alpha = r.get("alpha_successes") or 1
        beta  = r.get("beta_failures")   or 1
        winrate = f"{100*alpha/(alpha+beta):.0f}%" if (alpha and beta) else "?"
        cat_link = f"{GRN}✓{RST}" if r.get("ai_model_id") else f"{RED}✗{RST}"
        print(f"  {(r.get('model_key') or 'NULL'):<42} "
              f"{(r.get('arm_type') or ''):<12} "
              f"{(r.get('total_executions') or 0):>6} "
              f"{str(alpha):>6} "
              f"{str(beta):>6} "
              f"{winrate:>6} "
              f"{str(r.get('input_cost_per_mtok') or '?'):>8} "
              f"{cat_link:>5}")

sub("Arms NEVER executed")
never = d1("""
    SELECT model_key, arm_type, created_at
    FROM agentsam_routing_arms
    WHERE total_executions = 0 OR total_executions IS NULL
    ORDER BY created_at DESC
""", "arms_never_used")
if never:
    warn(f"{len(never)} arms have never been used:")
    for r in never:
        print(f"    {r.get('model_key','?'):<42} type={r.get('arm_type','?')}")

# ── 4. agentsam_route_requirements ───────────────────────────────────────────
hdr("4. agentsam_route_requirements")
n = count("agentsam_route_requirements")
print(f"  Rows: {n}")
rows = sample("agentsam_route_requirements", "*", 10)
if rows:
    cols = list(rows[0].keys())
    print(f"  Cols: {', '.join(cols)}")
    for r in rows:
        print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

null_cols = ['min_context_window','min_output_tokens','max_cost_per_1k_in','min_quality_score']
print(f"\n  Zombie cols: {', '.join(null_cols)} (all 100% NULL)")
print(f"""
  {BOLD}RECOMMENDATION:{RST}
  This table is mostly skeleton — 4/N columns are pure zombie.
  Rename max_cost_per_1k_in → max_cost_per_mtok_in (align with model_catalog units).
  Populate or drop: min_quality_score, min_context_window.
  Add: preferred_tier TEXT (references tier_name in model_tier_v2).
""")

# ── 5. agentsam_capability_aliases ───────────────────────────────────────────
hdr("5. agentsam_capability_aliases")
n = count("agentsam_capability_aliases")
print(f"  Rows: {n}")

sub("Sample — what do aliases map to?")
rows = sample("agentsam_capability_aliases", "*", 15, "rowid DESC")
if rows:
    cols = list(rows[0].keys())
    print(f"  Cols: {', '.join(cols)}")
    for r in rows:
        print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

sub("Distinct alias targets")
target_col = None
for c in (schema("agentsam_capability_aliases") or []):
    if "target" in c["name"].lower() or "map" in c["name"].lower() or "key" in c["name"].lower():
        target_col = c["name"]
        break
if target_col:
    dist = distinct_vals("agentsam_capability_aliases", target_col)
    for r in dist:
        print(f"    {target_col}={r.get(target_col,'?'):<40} {r.get('n',0)} aliases")

# ── 6. agentsam_model_routing_memory ─────────────────────────────────────────
hdr("6. agentsam_model_routing_memory")
n = count("agentsam_model_routing_memory")
print(f"  Rows: {n}")
rows = sample("agentsam_model_routing_memory", "*", 10, "rowid DESC")
if rows:
    cols = list(rows[0].keys())
    print(f"  Cols: {', '.join(cols)}")
    for r in rows:
        print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

print(f"""
  {BOLD}RECOMMENDATION:{RST}
  Zombie: subtask_type, avg_input_tokens, avg_output_tokens (all 100% NULL).
  This should store actual observed routing decisions with outcomes so Thompson arms
  can be updated from historical data. Consider adding:
    - decision_basis TEXT (intent_category that triggered the routing choice)
    - outcome TEXT (success|failure|timeout|cost_exceeded)
    - actual_cost_usd REAL
""")

# ── 7. agentsam_model_drift_signals ──────────────────────────────────────────
hdr("7. agentsam_model_drift_signals")
n = count("agentsam_model_drift_signals")
print(f"  Rows: {n}")
rows = sample("agentsam_model_drift_signals", "*", 5)
if rows:
    for r in rows:
        print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")
print(f"""
  All FK cols NULL (baseline_run_id, ai_model_id, routing_arm_id).
  This table can't do its job until arms are linked to model_catalog.
  Fix routing_arm_id first (repair script), then drift signals become meaningful.
""")

# ── 8. agentsam_analytics  ← REDESIGN ─────────────────────────────────────────
hdr("8. agentsam_analytics  ← REDESIGN: per-model/agent analytics")
n = count("agentsam_analytics")
print(f"  Rows: {n}")
cols = schema("agentsam_analytics")
print(f"  Current cols ({len(cols)}): {', '.join(c['name'] for c in cols)}")

sub("Current data sample")
rows = sample("agentsam_analytics", "*", 5)
if rows:
    for r in rows:
        print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

print(f"""
  {BOLD}{RED}CURRENT PROBLEM:{RST}
  Analytics bucketed by tenant_id — useless for model/agent development.
  You need to know: which model is fastest, cheapest, most accurate, for which intent.

  {BOLD}PROPOSED REDESIGN — agentsam_analytics_v2:{RST}

  DROP TABLE agentsam_analytics;  -- or rename to agentsam_analytics_tenant_backup

  CREATE TABLE agentsam_analytics (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    -- time bucket
    bucket_date     TEXT NOT NULL,               -- 'YYYY-MM-DD'
    bucket_hour     INTEGER,                     -- 0–23 (NULL = daily rollup)
    -- what was called
    model_key       TEXT NOT NULL,
    provider        TEXT NOT NULL,
    arm_type        TEXT,                        -- 'chat'|'embed'|'tool'|'eval'
    intent_category TEXT,                        -- from classifyIntent
    workspace_id    TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
    -- volume
    total_calls     INTEGER DEFAULT 0,
    success_calls   INTEGER DEFAULT 0,
    failure_calls   INTEGER DEFAULT 0,
    timeout_calls   INTEGER DEFAULT 0,
    -- tokens + cost (exact)
    total_input_tok  INTEGER DEFAULT 0,
    total_output_tok INTEGER DEFAULT 0,
    total_cost_usd   REAL    DEFAULT 0.0,
    -- latency
    avg_latency_ms   REAL,
    p50_latency_ms   REAL,
    p95_latency_ms   REAL,
    -- quality signals
    avg_quality_score REAL,
    cache_hit_count   INTEGER DEFAULT 0,
    -- Thompson arm link
    routing_arm_id   TEXT,
    -- meta
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (bucket_date, model_key, intent_category, arm_type)
      ON CONFLICT REPLACE
  );

  BACKFILL from usage_events:
    INSERT OR REPLACE INTO agentsam_analytics
      (bucket_date, model_key, provider, arm_type, workspace_id,
       total_calls, total_input_tok, total_output_tok, total_cost_usd)
    SELECT
      date(created_at) as bucket_date,
      model_key,
      provider,
      event_type as arm_type,
      workspace_id,
      COUNT(*),
      SUM(COALESCE(input_tokens,0)),
      SUM(COALESCE(output_tokens,0)),
      SUM(COALESCE(cost_usd,0))
    FROM agentsam_usage_events
    WHERE model_key IS NOT NULL
    GROUP BY date(created_at), model_key, provider, event_type, workspace_id;
""")

# ── 9. agentsam_escalation ────────────────────────────────────────────────────
hdr("9. agentsam_escalation")
n = count("agentsam_escalation")
print(f"  Rows: {n}")
cols = schema("agentsam_escalation")
print(f"  Cols: {', '.join(c['name'] for c in cols)}")

sub("Escalation reasons distribution")
reason_dist = distinct_vals("agentsam_escalation", "reason", 10)
for r in reason_dist:
    print(f"    reason={r.get('reason','?'):<35} {r.get('n',0)}")

sub("Escalation → tier flow (what tier did it escalate FROM/TO?)")
tier_flow = d1("""
    SELECT from_tier, to_tier, COUNT(*) n
    FROM agentsam_escalation
    WHERE from_tier IS NOT NULL OR to_tier IS NOT NULL
    GROUP BY from_tier, to_tier ORDER BY n DESC LIMIT 10
""", "escalation_tiers")
if tier_flow:
    for r in tier_flow:
        print(f"    {r.get('from_tier','?'):<15} → {r.get('to_tier','?'):<15} {r.get('n',0)}x")
else:
    warn("No from_tier/to_tier data — escalation path not being recorded")

# ── 10. agentsam_eval_suites / cases / runs ───────────────────────────────────
hdr("10. EVAL CLUSTER  (suites / cases / runs)")

for tbl in ["agentsam_eval_suites","agentsam_eval_cases","agentsam_eval_runs"]:
    n = count(tbl)
    cols = schema(tbl)
    sub(f"{tbl}  ({n} rows, {len(cols)} cols)")
    rows = sample(tbl, "*", 4)
    if rows:
        for r in rows:
            print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

sub("Eval runs — model coverage")
model_coverage = d1("""
    SELECT er.model_key, COUNT(*) runs,
           AVG(er.score) avg_score,
           SUM(CASE WHEN er.passed=1 THEN 1 ELSE 0 END) passed
    FROM agentsam_eval_runs er
    WHERE er.model_key IS NOT NULL
    GROUP BY er.model_key ORDER BY runs DESC LIMIT 12
""", "eval_model_coverage")
if model_coverage:
    print(f"  {'model_key':<42} {'runs':>5} {'avg_score':>10} {'passed':>7}")
    for r in model_coverage:
        print(f"  {(r.get('model_key') or ''):<42} {r.get('runs',0):>5} "
              f"{(r.get('avg_score') or 0):>10.3f} {(r.get('passed') or 0):>7}")
else:
    warn("Eval runs have no model_key populated — can't compare model quality")

# ── 11. agentsam_execution cluster ───────────────────────────────────────────
hdr("11. EXECUTION CLUSTER (executions / steps / context / perf_metrics / dep_graph)")

for tbl, cols_sel in [
    ("agentsam_executions",
     "id, workspace_id, tenant_id, status, provider, model_key, input_tokens, output_tokens, cost_usd, created_at"),
    ("agentsam_execution_steps",
     "id, workflow_run_id, step_type, status, duration_ms, created_at"),
    ("agentsam_execution_context",
     "id, workspace_id, tenant_id, cwd, created_at"),
    ("agentsam_execution_performance_metrics",
     "id, workspace_id, model_key, intent_category, latency_ms, input_tokens, output_tokens, cost_usd, routing_arm_id"),
    ("agentsam_execution_dependency_graph",
     "id, workspace_id, tenant_id, created_at"),
]:
    n = count(tbl)
    sub(f"{tbl}  ({n} rows)")
    rows = sample(tbl, cols_sel, 3)
    if rows:
        for r in rows:
            print(f"    {json.dumps({k:v for k,v in r.items() if v is not None})}")

sub("Performance metrics — latency + cost by model")
perf = d1("""
    SELECT model_key, intent_category,
           COUNT(*) n,
           AVG(latency_ms) avg_lat,
           AVG(input_tokens) avg_in,
           AVG(output_tokens) avg_out,
           AVG(cost_usd) avg_cost
    FROM agentsam_execution_performance_metrics
    WHERE model_key IS NOT NULL
    GROUP BY model_key, intent_category
    ORDER BY n DESC LIMIT 15
""", "perf_by_model")
if perf:
    print(f"  {'model_key':<42} {'intent':<20} {'n':>5} {'avg_lat':>9} {'avg_in':>8} {'avg_out':>8} {'avg_cost':>10}")
    for r in perf:
        print(f"  {(r.get('model_key') or 'NULL'):<42} "
              f"{(r.get('intent_category') or 'NULL'):<20} "
              f"{r.get('n',0):>5} "
              f"{(r.get('avg_lat') or 0):>9.0f}ms "
              f"{(r.get('avg_in') or 0):>8.0f} "
              f"{(r.get('avg_out') or 0):>8.0f} "
              f"${(r.get('avg_cost') or 0):>9.6f}")
else:
    warn("No model_key in performance metrics — latency/cost benchmarks unavailable")

# ── FINAL SUMMARY ─────────────────────────────────────────────────────────────
hdr("SUMMARY + ACTION PLAN")
print(f"""
  {BOLD}IMMEDIATE (no deploy needed — SQL only):{RST}
  1. Run agentsam_routing_repair.py --apply  →  backfills workspace_id, seeds α/β priors,
     links routing_arm_id in model_tier + usage_events
  2. Migrate agentsam_model_tier → model_tier_v2 (global registry + override table)
     Saves ~150 rows now, prevents exponential growth across workspaces
  3. Redesign agentsam_analytics per schema above (bucket by model+intent+date)
     Backfill from usage_events immediately

  {BOLD}CODE FIXES (P0 — these make Thompson routing real):{RST}
  4. Wire routing_arm_id into every INSERT: agent_run, usage_events, execution_steps
  5. Capture SSE usage block → write input_tokens/output_tokens/cost_usd to agent_run
  6. classifyIntent result must flow into: usage_events.event_type, perf_metrics.intent_category

  {BOLD}ARCHITECTURE NOTE — model_tier_v2:{RST}
  Platform-wide tiers:  nano(gpt-5.4-nano, gemini-2.5-flash)
                        mini(gpt-5.4-mini)
                        standard(gpt-5.4, gemini-2.5-pro)
                        power(claude-sonnet-4-5)
                        max(claude-opus-4-5, o3)
  Workspace overrides only when a client workspace needs a different default.
  This is 5 rows, not 155.
""")

print(f"{DIM}Done — {NOW_UTC}{RST}\n")
