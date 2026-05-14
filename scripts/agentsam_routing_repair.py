#!/usr/bin/env python3
"""
agentsam_routing_repair.py
──────────────────────────
1. Runs smoke SQL against D1 (read-only diagnostics)
2. Reports Thompson routing arm health
3. Generates repair SQL for the 4 BROKEN tables + routing nulls
4. Optionally applies fixes with --apply flag

Run:
  python3 scripts/agentsam_routing_repair.py            # dry-run report
  python3 scripts/agentsam_routing_repair.py --apply    # apply fixes to D1

Requires: npx wrangler in PATH, CF credentials in env or wrangler.toml
"""

import subprocess, json, sys, textwrap
from datetime import datetime, timezone

DB      = "inneranimalmedia-business"
DRY_RUN = "--apply" not in sys.argv
NOW_UTC = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# ── colour helpers ──────────────────────────────────────────────────────────
RED    = "\033[91m"; YEL = "\033[93m"; GRN = "\033[92m"
CYN    = "\033[96m"; DIM = "\033[2m";  RST = "\033[0m"
BOLD   = "\033[1m"

def hdr(title):   print(f"\n{BOLD}{CYN}{'═'*60}{RST}\n{BOLD}  {title}{RST}\n{'═'*60}")
def ok(msg):      print(f"  {GRN}✓{RST}  {msg}")
def warn(msg):    print(f"  {YEL}⚠{RST}  {msg}")
def err(msg):     print(f"  {RED}✗{RST}  {msg}")
def info(msg):    print(f"  {DIM}{msg}{RST}")

# ── D1 query helper ─────────────────────────────────────────────────────────
def d1(sql, label="query"):
    r = subprocess.run(
        ["npx","wrangler","d1","execute", DB,
         "--remote","--json","--command", sql],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"{RED}D1 error [{label}]:{RST} {r.stderr.strip()[:200]}")
        return []
    try:
        parsed = json.loads(r.stdout)
        return parsed[0].get("results", []) if parsed else []
    except Exception as e:
        print(f"{RED}Parse error [{label}]:{RST} {e}")
        return []

def d1_val(sql, key, default=None):
    rows = d1(sql)
    return rows[0].get(key, default) if rows else default

# ── 1. THOMPSON ROUTING HEALTH ───────────────────────────────────────────────
hdr("1. THOMPSON ROUTING ARM HEALTH")

arms = d1("""
    SELECT ra.id, ra.model_key, ra.arm_type,
           ra.is_active, ra.total_executions,
           ra.success_count, ra.failure_count,
           ra.avg_latency_ms, ra.ai_model_id,
           ra.alpha_successes, ra.beta_failures,
           mc.provider, mc.model_family
    FROM   agentsam_routing_arms ra
    LEFT JOIN agentsam_model_catalog mc ON mc.id = ra.ai_model_id
    ORDER BY ra.total_executions DESC
    LIMIT 40
""", "routing_arms")

if not arms:
    err("No routing arms found — agentsam_routing_arms is empty or query failed")
else:
    active       = [a for a in arms if a.get("is_active")]
    never_used   = [a for a in arms if (a.get("total_executions") or 0) == 0]
    no_catalog   = [a for a in arms if not a.get("ai_model_id")]
    no_alpha     = [a for a in arms if a.get("alpha_successes") is None]

    print(f"  Total arms fetched : {len(arms)}")
    print(f"  Active arms        : {len(active)}")
    print(f"  Never executed     : {len(never_used)}")
    print(f"  No model_catalog FK: {len(no_catalog)}  ← {RED}arms not linked to catalog{RST}")
    print(f"  Missing alpha/beta : {len(no_alpha)}   ← {RED}Thompson params not seeded{RST}")

    print(f"\n  {'model_key':<40} {'exec':>6} {'succ':>6} {'fail':>6} {'α':>6} {'β':>6} {'catalog':>8}")
    print(f"  {'-'*40} {'------':>6} {'------':>6} {'------':>6} {'------':>6} {'------':>6} {'--------':>8}")
    for a in arms[:20]:
        mk    = (a.get("model_key") or "NULL")[:38]
        ex    = a.get("total_executions") or 0
        sc    = a.get("success_count") or 0
        fc    = a.get("failure_count") or 0
        al    = a.get("alpha_successes") or "-"
        be    = a.get("beta_failures")   or "-"
        cat   = "✓" if a.get("ai_model_id") else f"{RED}✗{RST}"
        flag  = f" {YEL}← never used{RST}" if ex == 0 else ""
        print(f"  {mk:<40} {ex:>6} {sc:>6} {fc:>6} {str(al):>6} {str(be):>6} {cat:>8}{flag}")

# ── 2. REWARD SIGNAL HEALTH (usage_events) ───────────────────────────────────
hdr("2. REWARD SIGNAL HEALTH — agentsam_usage_events")

ue = d1("""
    SELECT
        COUNT(*)                                              AS total,
        SUM(CASE WHEN model_key  IS NULL OR model_key  ='' THEN 1 ELSE 0 END) AS no_model_key,
        SUM(CASE WHEN event_type IS NULL OR event_type ='' THEN 1 ELSE 0 END) AS no_event_type,
        SUM(CASE WHEN routing_arm_id IS NULL THEN 1 ELSE 0 END)               AS no_arm_id,
        SUM(CASE WHEN input_tokens  IS NULL OR input_tokens  =0 THEN 1 ELSE 0 END) AS zero_in,
        SUM(CASE WHEN output_tokens IS NULL OR output_tokens =0 THEN 1 ELSE 0 END) AS zero_out,
        SUM(COALESCE(input_tokens,0))  AS total_in_tok,
        SUM(COALESCE(output_tokens,0)) AS total_out_tok,
        SUM(COALESCE(cost_usd,0))      AS total_cost_usd,
        MAX(created_at)                AS last_write
    FROM agentsam_usage_events
""", "usage_events_health")

if ue:
    u = ue[0]
    total = u.get("total",0)
    def pct(n): return f"{100*n/total:.1f}%" if total else "N/A"

    (warn if u.get("no_model_key",0) > 0 else ok)(
        f"model_key NULL: {u.get('no_model_key',0)}/{total} ({pct(u.get('no_model_key',0))}) "
        f"← {'CRITICAL — rewards unattributable' if u.get('no_model_key',0)/max(total,1) > 0.3 else 'ok'}"
    )
    (warn if u.get("no_event_type",0) > 0 else ok)(
        f"event_type NULL: {u.get('no_event_type',0)}/{total} ({pct(u.get('no_event_type',0))})"
    )
    (err if u.get("no_arm_id",0) == total else warn)(
        f"routing_arm_id NULL: {u.get('no_arm_id',0)}/{total} — Thompson arms get ZERO reward signal"
    )
    (warn if u.get("zero_in",0) > total*0.5 else ok)(
        f"zero input_tokens: {u.get('zero_in',0)}/{total} ({pct(u.get('zero_in',0))})"
    )
    info(f"Total recorded cost: ${u.get('total_cost_usd',0):.6f} | "
         f"in: {u.get('total_in_tok',0):,} tok | out: {u.get('total_out_tok',0):,} tok")
    info(f"Last write: {u.get('last_write','?')}")

# top models actually logged
top_models = d1("""
    SELECT model_key, COUNT(*) n, SUM(COALESCE(cost_usd,0)) cost
    FROM agentsam_usage_events
    WHERE model_key IS NOT NULL AND model_key != ''
    GROUP BY model_key ORDER BY n DESC LIMIT 8
""", "top_models")
if top_models:
    print(f"\n  {'model_key':<45} {'events':>7} {'cost_usd':>12}")
    print(f"  {'-'*45} {'-------':>7} {'----------':>12}")
    for m in top_models:
        print(f"  {(m.get('model_key') or ''):<45} {m.get('n',0):>7} ${m.get('cost',0):>11.6f}")
else:
    warn("No model_key data in usage_events — reward signal completely blind")

# ── 3. AGENT RUN TOKEN HEALTH ────────────────────────────────────────────────
hdr("3. AGENT RUN TOKEN CAPTURE — agentsam_agent_run")

ar = d1("""
    SELECT
        COUNT(*)                                                         AS total,
        SUM(CASE WHEN input_tokens=0  OR input_tokens  IS NULL THEN 1 ELSE 0 END) AS zero_in,
        SUM(CASE WHEN output_tokens=0 OR output_tokens IS NULL THEN 1 ELSE 0 END) AS zero_out,
        SUM(CASE WHEN cost_usd=0      OR cost_usd      IS NULL THEN 1 ELSE 0 END) AS zero_cost,
        SUM(CASE WHEN routing_arm_id IS NULL THEN 1 ELSE 0 END)                   AS no_arm,
        SUM(CASE WHEN ai_model_ref   IS NULL THEN 1 ELSE 0 END)                   AS no_model,
        SUM(COALESCE(input_tokens,0))  AS total_in,
        SUM(COALESCE(output_tokens,0)) AS total_out,
        SUM(COALESCE(cost_usd,0))      AS total_cost
    FROM agentsam_agent_run
""", "agent_run_tokens")

if ar:
    a = ar[0]
    total = a.get("total",0)
    def pct(n): return f"{100*n/total:.1f}%" if total else "N/A"
    (err if a.get("zero_in",0) == total else warn)(
        f"zero input_tokens: {a.get('zero_in',0)}/{total} ({pct(a.get('zero_in',0))}) "
        f"← {'ALL ZERO — SSE usage block not captured' if a.get('zero_in',0)==total else ''}"
    )
    (err if a.get("no_arm",0) == total else warn)(
        f"no routing_arm_id: {a.get('no_arm',0)}/{total} — runs not linked to Thompson arms"
    )
    info(f"Total recorded: in={a.get('total_in',0):,} out={a.get('total_out',0):,} cost=${a.get('total_cost',0):.6f}")

# recent runs for spot-check
recent_runs = d1("""
    SELECT model_key, provider, input_tokens, output_tokens, cost_usd,
           status, routing_arm_id, created_at
    FROM agentsam_agent_run
    ORDER BY created_at DESC LIMIT 5
""", "recent_runs")
if recent_runs:
    print(f"\n  Last 5 agent runs:")
    for r in recent_runs:
        tok_flag = f"{RED}ZERO TOKENS{RST}" if not r.get("input_tokens") else f"in={r['input_tokens']} out={r.get('output_tokens',0)}"
        arm_flag = f"{YEL}no arm{RST}" if not r.get("routing_arm_id") else "arm✓"
        print(f"    {(r.get('model_key') or 'NULL'):<35} {tok_flag}  {arm_flag}  {r.get('status','?')}")

# ── 4. TOOL CALL LOG / MCP EXECUTION HEALTH ─────────────────────────────────
hdr("4. TOOL CALL LOG + MCP EXECUTION")

tcl = d1("""
    SELECT COUNT(*) total,
           SUM(CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END) no_ws,
           SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END)     no_tool_key,
           SUM(CASE WHEN capability_key IS NULL THEN 1 ELSE 0 END) no_cap_key
    FROM agentsam_tool_call_log
""", "tcl")
if tcl:
    t = tcl[0]
    total = t.get("total",0)
    warn(f"tool_call_log: workspace_id NULL {t.get('no_ws',0)}/{total} | "
         f"tool_key NULL {t.get('no_tool_key',0)}/{total} | "
         f"capability_key NULL {t.get('no_cap_key',0)}/{total}")

mte = d1("""
    SELECT COUNT(*) total,
           SUM(CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END) no_ws,
           SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END)     no_tool_key,
           AVG(duration_ms) avg_ms
    FROM agentsam_mcp_tool_execution
""", "mte")
if mte:
    m = mte[0]
    warn(f"mcp_tool_execution: workspace_id NULL {m.get('no_ws',0)}/{m.get('total',0)} | "
         f"tool_key NULL {m.get('no_tool_key',0)}/{m.get('total',0)} | "
         f"avg_ms={m.get('avg_ms') or 'NULL'}")

# ── 5. GENERATE REPAIR SQL ───────────────────────────────────────────────────
hdr("5. REPAIR SQL")

WORKSPACE_ID = "ws_inneranimalmedia"
TENANT_ID    = "tenant_sam_primeaux"

# Derive model_key backfill by joining agent_run on session context
# (best-effort: usage_events with NULL model_key, try to join on session_id or recent runs)
REPAIR_SQL = [

    # ── A. usage_events: backfill event_type for rows that have provider hint ──
    f"""-- A1. usage_events: set event_type='completion' where clearly a model call
UPDATE agentsam_usage_events
SET event_type = 'completion'
WHERE (event_type IS NULL OR event_type = '')
  AND (input_tokens > 0 OR output_tokens > 0)""",

    f"""-- A2. usage_events: set event_type='unknown' for remaining NULLs
UPDATE agentsam_usage_events
SET event_type = 'unknown'
WHERE event_type IS NULL OR event_type = ''""",

    # ── B. tool_call_log: backfill workspace_id ───────────────────────────────
    f"""-- B. tool_call_log: backfill missing workspace_id with canonical value
UPDATE agentsam_tool_call_log
SET workspace_id = '{WORKSPACE_ID}'
WHERE workspace_id IS NULL""",

    # ── C. mcp_tool_execution: backfill workspace_id ─────────────────────────
    f"""-- C. mcp_tool_execution: backfill workspace_id
UPDATE agentsam_mcp_tool_execution
SET workspace_id = '{WORKSPACE_ID}'
WHERE workspace_id IS NULL""",

    # ── D. mcp_tool_execution: backfill tool_key from tool_name if present ────
    f"""-- D. mcp_tool_execution: copy tool_name → tool_key where tool_key is NULL
UPDATE agentsam_mcp_tool_execution
SET tool_key = tool_name
WHERE tool_key IS NULL AND tool_name IS NOT NULL AND tool_name != ''""",

    # ── E. routing_arms: link ai_model_id from model_catalog via model_key ────
    f"""-- E. routing_arms: link ai_model_id from model_catalog on model_key
UPDATE agentsam_routing_arms
SET ai_model_id = (
    SELECT id FROM agentsam_model_catalog
    WHERE model_key = agentsam_routing_arms.model_key
    LIMIT 1
)
WHERE ai_model_id IS NULL
  AND model_key IS NOT NULL""",

    # ── F. routing_arms: seed alpha/beta if NULL (uninformed Beta(1,1) prior) ─
    f"""-- F. routing_arms: seed Thompson priors alpha=1 beta=1 for unseeded arms
UPDATE agentsam_routing_arms
SET alpha_successes = COALESCE(alpha_successes, success_count + 1),
    beta_failures   = COALESCE(beta_failures,   failure_count + 1)
WHERE alpha_successes IS NULL OR beta_failures IS NULL""",

    # ── G. model_tier: link routing_arm_id from routing_arms on model_key ─────
    f"""-- G. model_tier: populate routing_arm_id from routing_arms
UPDATE agentsam_model_tier
SET routing_arm_id = (
    SELECT id FROM agentsam_routing_arms
    WHERE model_key = agentsam_model_tier.model_key
      AND is_active = 1
    LIMIT 1
)
WHERE routing_arm_id IS NULL
  AND model_key IS NOT NULL""",

    # ── H. cron_runs: backfill tenant_id / workspace_id for recent scoped runs ─
    f"""-- H. cron_runs: backfill identity for NULL tenant rows
UPDATE agentsam_cron_runs
SET tenant_id    = '{TENANT_ID}',
    workspace_id = '{WORKSPACE_ID}'
WHERE tenant_id IS NULL""",
]

# ── print or apply ───────────────────────────────────────────────────────────
if DRY_RUN:
    print(f"\n  {YEL}DRY RUN — pass --apply to execute against D1{RST}\n")
    for i, sql in enumerate(REPAIR_SQL, 1):
        label = sql.split('\n')[0].lstrip('- ').strip()
        print(f"  [{i:02d}] {label}")
    print(f"\n  {DIM}Full SQL:{RST}")
    for sql in REPAIR_SQL:
        print(textwrap.indent(sql.strip(), "    "))
        print()
else:
    print(f"\n  {GRN}APPLYING {len(REPAIR_SQL)} repairs to D1...{RST}\n")
    for i, sql in enumerate(REPAIR_SQL, 1):
        label = sql.split('\n')[0].lstrip('- ').strip()
        rows  = d1(sql, label)
        ok(f"[{i:02d}] {label}")

# ── 6. ROUTING ARM THOMPSON READINESS SUMMARY ───────────────────────────────
hdr("6. THOMPSON READINESS SCORE")

# Count arms that are genuinely ready for Thompson sampling
ready = d1(f"""
    SELECT
        COUNT(*)                                                               AS total,
        SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END)                         AS active,
        SUM(CASE WHEN is_active=1
                 AND ai_model_id IS NOT NULL
                 AND alpha_successes IS NOT NULL
                 AND beta_failures   IS NOT NULL
                 THEN 1 ELSE 0 END)                                           AS thompson_ready,
        SUM(CASE WHEN total_executions > 10 THEN 1 ELSE 0 END)               AS warmed_up,
        SUM(COALESCE(total_executions,0))                                     AS total_exec
    FROM agentsam_routing_arms
""", "thompson_ready")

if ready:
    r = ready[0]
    total = r.get("total",0)
    tr    = r.get("thompson_ready",0)
    score = int(100 * tr / max(total, 1))
    color = GRN if score >= 70 else (YEL if score >= 40 else RED)
    print(f"  Total arms    : {total}")
    print(f"  Active        : {r.get('active',0)}")
    print(f"  Warmed (>10x) : {r.get('warmed_up',0)}")
    print(f"  {color}Thompson-ready : {tr}/{total}  →  score {score}/100{RST}")
    print(f"  Total executions logged: {r.get('total_exec',0):,}")

    if score < 50:
        print(f"\n  {RED}RECOMMENDATION:{RST}")
        print("    1. Run --apply to backfill routing_arm_id links")
        print("    2. Fix SSE handler to write usage_events with model_key + routing_arm_id")
        print("    3. Fix agentsam_agent_run to capture input_tokens/output_tokens from provider response")
        print("    4. Wire routing_arm_id into every INSERT for agent_run + usage_events")
    else:
        ok("Thompson routing is operational — monitor arm drift weekly")

# ── NEXT STEPS ───────────────────────────────────────────────────────────────
hdr("NEXT STEPS")
print(f"""
  Priority order for code fixes (no DB changes needed — write path only):

  [P0] src/core/stream-handler.js (or wherever SSE usage block is parsed)
       After the provider stream completes, extract:
         usage.input_tokens, usage.output_tokens, usage.total_tokens
       Then UPDATE agentsam_agent_run SET input_tokens=?, output_tokens=?, cost_usd=?
       AND INSERT INTO agentsam_usage_events (model_key, event_type, routing_arm_id, ...)

  [P0] Every INSERT into agentsam_usage_events must include:
         model_key, event_type, routing_arm_id, tenant_id, workspace_id

  [P1] Every INSERT into agentsam_agent_run must include:
         routing_arm_id  (looked up from agentsam_routing_arms by model_key at call time)

  [P1] agentsam_mcp_tool_execution + agentsam_tool_call_log writes must include:
         workspace_id, tool_key (from the tool dispatch context)

  [P2] After P0 is done, run this script again to verify reward signal quality.
       Thompson arms with > 50 executions will give statistically meaningful routing.

  Run again:
    python3 scripts/agentsam_routing_repair.py          # report only
    python3 scripts/agentsam_routing_repair.py --apply  # apply DB backfill
""")

print(f"{DIM}Done — {NOW_UTC}{RST}\n")
