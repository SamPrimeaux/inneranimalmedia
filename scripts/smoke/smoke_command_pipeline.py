#!/usr/bin/env python3
"""
smoke_command_pipeline.py
─────────────────────────
Proves:
  agentsam_command_run       — real INSERT from a real command row
  agentsam_commands          — use_count / success_count / failure_count / avg_duration_ms
  agentsam_routing_arms      — Welford cost+latency, Bayesian alpha/beta, decayed_score
  agentsam_cron_runs         — routing_performance_scores job with real rows_read/rows_written
  agentsam_error_log         — written on any step failure

Run:
  source ~/inneranimalmedia/scripts/load-agentsam-env.sh && \
    python3 ~/inneranimalmedia/scripts/smoke/smoke_command_pipeline.py
"""

import os, sys, time, uuid, math, random, json, requests
from datetime import datetime

# ── env ───────────────────────────────────────────────────────────────────────
CF_TOKEN      = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT    = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DB_ID      = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
TENANT_ID     = os.environ["IAM_TENANT_ID"]
WORKSPACE_ID  = os.environ["IAM_WORKSPACE_ID"]
WRITE_D1      = os.environ.get("AGENTSAM_SMOKE_WRITE_D1", "1") == "1"

RUN_GROUP_ID  = f"cmd_pipeline_smoke_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
SMOKE_MODEL   = "gpt-5.4-nano"
SMOKE_PROVIDER = "openai"

D1_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
    f"/d1/database/{CF_DB_ID}/query"
)
HEADERS = {
    "Authorization": f"Bearer {CF_TOKEN}",
    "Content-Type": "application/json",
}

# ── helpers ───────────────────────────────────────────────────────────────────
results = {}

def step(label):
    """Print step header."""
    idx = len(results) + 1
    print(f"[{idx}] {label}...", end=" ", flush=True)

def ok(note=""):
    key = list(results.keys())[-1] if results else "_"
    print(f"OK  {('— ' + note) if note else ''}")

def fail(note=""):
    print(f"FAIL — {note}")

def skip(note=""):
    print(f"SKIP — {note}")

def d1(sql, params=None):
    """Execute SQL against D1 REST API. Returns list of result rows."""
    body = {"sql": sql, "params": params or []}
    r = requests.post(D1_URL, headers=HEADERS, json=body, timeout=15)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        errors = data.get("errors", [])
        raise RuntimeError(f"D1 error: {errors}")
    return data["result"][0].get("results", [])

def d1_exec(sql, params=None):
    """Execute write SQL, return meta dict."""
    body = {"sql": sql, "params": params or []}
    r = requests.post(D1_URL, headers=HEADERS, json=body, timeout=15)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 error: {data.get('errors')}")
    return data["result"][0].get("meta", {})

def welford_update(n, mean, m2, new_val):
    """Welford online algorithm for running mean + variance."""
    n    += 1
    delta = new_val - mean
    mean += delta / n
    m2   += delta * (new_val - mean)
    return n, mean, m2

def beta_thompson_sample(alpha, beta_val, seed=None):
    """Thompson sample from Beta(alpha, beta). Returns float 0-1."""
    rng = random.Random(seed)
    # Box-Muller approximation for Beta via gamma samples
    try:
        import numpy as np
        rng2 = np.random.default_rng(seed)
        return float(rng2.beta(max(alpha, 0.01), max(beta_val, 0.01)))
    except ImportError:
        # Fallback: mean of Beta distribution
        return alpha / (alpha + beta_val)

def decay_score(raw_score, last_decay_at_unix, half_life_seconds=86400 * 3):
    """Exponential decay. Half-life default = 3 days."""
    elapsed = time.time() - last_decay_at_unix
    decay   = math.exp(-math.log(2) * elapsed / half_life_seconds)
    return raw_score * decay

def log_error(source, source_id, error_type, message, step_name):
    """Best-effort write to agentsam_error_log."""
    try:
        d1_exec(
            """INSERT INTO agentsam_error_log
               (workspace_id, tenant_id, error_type, error_message, source, source_id, context_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [
                WORKSPACE_ID, TENANT_ID, error_type,
                message[:1000], source, source_id or "",
                json.dumps({"run_group_id": RUN_GROUP_ID, "step": step_name}),
            ],
        )
    except Exception as e:
        print(f"     ⚠ error_log write failed: {e}")

# ── smoke results tracker ──────────────────────────────────────────────────────
checks = {}   # label → 'PASS' | 'FAIL' | 'SKIP'

def mark(label, status, note=""):
    checks[label] = status
    results[label] = note

# ═════════════════════════════════════════════════════════════════════════════
print()
print("=" * 60)
print("  Agent Sam Command Pipeline Smoke")
print(f"  run_group_id : {RUN_GROUP_ID}")
print(f"  workspace    : {WORKSPACE_ID}")
print(f"  tenant       : {TENANT_ID}")
print("=" * 60)
print()

# ── [1] Pick a real low-risk command ──────────────────────────────────────────
step("Fetching real low-risk command from agentsam_commands")
command = None
try:
    rows = d1(
        """SELECT id, slug, task_type, use_count, success_count, failure_count,
                  avg_duration_ms, success_count
           FROM agentsam_commands
           WHERE risk_level = 'low'
             AND is_active  = 1
             AND is_global  = 1
           ORDER BY use_count ASC
           LIMIT 1"""
    )
    if not rows:
        raise RuntimeError("No eligible low-risk commands found")
    command = rows[0]
    ok(f"id={command['id']}  slug={command['slug']}")
    mark("command_fetch", "PASS", command["id"])
except Exception as e:
    fail(str(e))
    mark("command_fetch", "FAIL", str(e))
    log_error("smoke", RUN_GROUP_ID, "db_query", str(e), "command_fetch")
    sys.exit(1)   # nothing works without a real command

# ── [2] INSERT agentsam_command_run ───────────────────────────────────────────
step("INSERT agentsam_command_run")
run_id        = f"run_{uuid.uuid4().hex[:16]}"
sim_duration  = random.randint(400, 2200)   # ms
sim_in_tok    = random.randint(10, 60)
sim_out_tok   = random.randint(5, 40)
sim_cost      = round((sim_in_tok * 0.10 + sim_out_tok * 0.30) / 1_000_000, 8)
sim_success   = 1
task_type     = command.get("task_type") or "misc"

try:
    d1_exec(
        """INSERT INTO agentsam_command_run
           (id, workspace_id, tenant_id, user_input, normalized_intent,
            intent_category, tier_used, model_id, commands_json, result_json,
            output_text, success, duration_ms, input_tokens, output_tokens,
            cost_usd, selected_command_id, selected_command_slug, risk_level,
            approval_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            run_id, WORKSPACE_ID, TENANT_ID,
            f"smoke test — {command['slug']}",
            command["slug"],
            task_type if task_type in (
                "deploy","debug","db","r2","git","worker","search","file","misc"
            ) else "misc",
            0, SMOKE_MODEL,
            json.dumps([command["id"]]),
            json.dumps({"smoke": True, "run_group_id": RUN_GROUP_ID}),
            "Smoke execution — OK",
            sim_success, sim_duration, sim_in_tok, sim_out_tok, sim_cost,
            command["id"], command["slug"], "low", "not_required",
        ],
    )
    ok(f"id={run_id}  duration={sim_duration}ms  cost=${sim_cost:.8f}")
    mark("command_run_insert", "PASS", run_id)
except Exception as e:
    fail(str(e))
    mark("command_run_insert", "FAIL", str(e))
    log_error("smoke", RUN_GROUP_ID, "db_write", str(e), "command_run_insert")
    sys.exit(1)

# ── [3] UPDATE agentsam_commands counters ─────────────────────────────────────
step("UPDATE agentsam_commands counters")
try:
    old_n   = int(command.get("success_count") or 0)
    old_avg = float(command.get("avg_duration_ms") or 0.0)
    # Welford-style rolling average for avg_duration_ms
    new_n   = old_n + 1
    new_avg = old_avg + (sim_duration - old_avg) / new_n

    d1_exec(
        """UPDATE agentsam_commands
           SET use_count       = use_count + 1,
               success_count   = success_count + ?,
               failure_count   = failure_count + ?,
               avg_duration_ms = ?,
               last_used_at    = datetime('now'),
               updated_at      = datetime('now')
           WHERE id = ?""",
        [
            1 if sim_success else 0,
            0 if sim_success else 1,
            round(new_avg, 2),
            command["id"],
        ],
    )
    ok(
        f"use_count+1  "
        f"{'success' if sim_success else 'failure'}_count+1  "
        f"avg_duration_ms={round(new_avg,1)}ms"
    )
    mark("commands_counters", "PASS")
except Exception as e:
    fail(str(e))
    mark("commands_counters", "FAIL", str(e))
    log_error("smoke", run_id, "db_write", str(e), "commands_counters")

# ── [4] UPSERT agentsam_routing_arms ─────────────────────────────────────────
step("UPSERT agentsam_routing_arms (Welford + Bayesian)")
arm_mode = "agent"
try:
    existing = d1(
        """SELECT success_alpha, success_beta,
                  cost_n, cost_mean, cost_m2,
                  latency_n, latency_mean, latency_m2,
                  last_decay_at
           FROM agentsam_routing_arms
           WHERE workspace_id = ? AND task_type = ? AND mode = ? AND model_key = ?""",
        [WORKSPACE_ID, task_type, arm_mode, SMOKE_MODEL],
    )

    if existing:
        arm = existing[0]
        # Welford updates
        cost_n, cost_mean, cost_m2 = welford_update(
            arm["cost_n"], arm["cost_mean"], arm["cost_m2"], sim_cost
        )
        lat_n, lat_mean, lat_m2 = welford_update(
            arm["latency_n"], arm["latency_mean"], arm["latency_m2"], sim_duration
        )
        # Bayesian update
        new_alpha = arm["success_alpha"] + (1 if sim_success else 0)
        new_beta  = arm["success_beta"]  + (0 if sim_success else 1)
        # Thompson sample → decayed score
        raw_score   = beta_thompson_sample(new_alpha, new_beta, seed=42)
        new_decayed = decay_score(raw_score, arm["last_decay_at"])

        d1_exec(
            """UPDATE agentsam_routing_arms
               SET success_alpha  = ?,
                   success_beta   = ?,
                   cost_n         = ?,
                   cost_mean      = ?,
                   cost_m2        = ?,
                   latency_n      = ?,
                   latency_mean   = ?,
                   latency_m2     = ?,
                   decayed_score  = ?,
                   last_decay_at  = unixepoch(),
                   total_executions = total_executions + 1,
                   updated_at     = unixepoch()
               WHERE workspace_id = ? AND task_type = ? AND mode = ? AND model_key = ?""",
            [
                new_alpha, new_beta,
                cost_n, round(cost_mean, 10), round(cost_m2, 10),
                lat_n,  round(lat_mean, 4),   round(lat_m2, 4),
                round(new_decayed, 6),
                WORKSPACE_ID, task_type, arm_mode, SMOKE_MODEL,
            ],
        )
        ok(
            f"updated  α={round(new_alpha,2)} β={round(new_beta,2)}"
            f"  decayed={round(new_decayed,4)}"
            f"  lat_mean={round(lat_mean,1)}ms"
        )
    else:
        # First-ever arm for this combo — INSERT
        raw_score   = beta_thompson_sample(1.0, 1.0, seed=42)
        d1_exec(
            """INSERT INTO agentsam_routing_arms
               (workspace_id, task_type, mode, model_key, provider,
                success_alpha, success_beta,
                cost_n, cost_mean, cost_m2,
                latency_n, latency_mean, latency_m2,
                decayed_score, last_decay_at,
                total_executions, is_active)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch(),1,1)""",
            [
                WORKSPACE_ID, task_type, arm_mode, SMOKE_MODEL, SMOKE_PROVIDER,
                1.0 + (1 if sim_success else 0),
                1.0 + (0 if sim_success else 1),
                1, sim_cost,  0.0,
                1, sim_duration, 0.0,
                round(raw_score, 6),
            ],
        )
        ok(f"created new arm  task_type={task_type}  model={SMOKE_MODEL}")

    mark("routing_arms", "PASS")
except Exception as e:
    fail(str(e))
    mark("routing_arms", "FAIL", str(e))
    log_error("smoke", run_id, "db_write", str(e), "routing_arms")

# ── [5] Simulate routing_performance_scores cron ──────────────────────────────
step("Simulating routing_performance_scores cron (last 50 runs → score all arms)")
cron_run_id   = f"acr_{uuid.uuid4().hex[:14]}"
cron_start    = int(time.time())
rows_read     = 0
rows_written  = 0
cron_status   = "completed"
cron_err_msg  = None

try:
    # Insert cron_run row as 'running'
    d1_exec(
        """INSERT INTO agentsam_cron_runs
           (id, job_name, cron_expression, status, tenant_id, workspace_id,
            started_at, metadata_json)
           VALUES (?,?,?,?,?,?,unixepoch(),?)""",
        [
            cron_run_id,
            "routing_performance_scores",
            "*/30 * * * *",
            "running",
            TENANT_ID, WORKSPACE_ID,
            json.dumps({"run_group_id": RUN_GROUP_ID, "smoke": True}),
        ],
    )

    # Read recent command_run rows (real data now exists from step 2)
    recent_runs = d1(
        """SELECT model_id, success, cost_usd, duration_ms, intent_category
           FROM agentsam_command_run
           WHERE workspace_id = ?
             AND model_id IS NOT NULL
             AND created_at >= (unixepoch() - 86400)
           LIMIT 50""",
        [WORKSPACE_ID],
    )
    rows_read = len(recent_runs)

    # Group by model_id — compute win rate and avg cost/latency
    groups = {}
    for r in recent_runs:
        key = r["model_id"] or SMOKE_MODEL
        if key not in groups:
            groups[key] = {"success": 0, "total": 0, "cost": [], "latency": []}
        groups[key]["total"]   += 1
        groups[key]["success"] += int(r["success"] or 0)
        if r["cost_usd"]:
            groups[key]["cost"].append(float(r["cost_usd"]))
        if r["duration_ms"]:
            groups[key]["latency"].append(float(r["duration_ms"]))

    for model_key, stats in groups.items():
        wins   = stats["success"]
        losses = stats["total"] - wins
        avg_c  = sum(stats["cost"])    / len(stats["cost"])    if stats["cost"]    else 0
        avg_l  = sum(stats["latency"]) / len(stats["latency"]) if stats["latency"] else 0

        # Re-fetch current arm stats for accurate Welford update
        arm_rows = d1(
            """SELECT success_alpha, success_beta, cost_n, cost_mean, cost_m2,
                      latency_n, latency_mean, latency_m2, last_decay_at
               FROM agentsam_routing_arms
               WHERE workspace_id = ? AND model_key = ?
               LIMIT 1""",
            [WORKSPACE_ID, model_key],
        )
        if not arm_rows:
            continue

        arm = arm_rows[0]
        new_alpha = arm["success_alpha"] + wins
        new_beta  = arm["success_beta"]  + losses
        raw       = beta_thompson_sample(new_alpha, new_beta)
        decayed   = decay_score(raw, arm["last_decay_at"])

        d1_exec(
            """UPDATE agentsam_routing_arms
               SET success_alpha   = ?,
                   success_beta    = ?,
                   decayed_score   = ?,
                   last_decay_at   = unixepoch(),
                   updated_at      = unixepoch()
               WHERE workspace_id = ? AND model_key = ?""",
            [
                round(new_alpha, 4), round(new_beta, 4),
                round(decayed, 6),
                WORKSPACE_ID, model_key,
            ],
        )
        rows_written += 1

    cron_dur = int((time.time() - cron_start) * 1000)

    # Close cron_run as completed with real counters
    d1_exec(
        """UPDATE agentsam_cron_runs
           SET status       = ?,
               completed_at = unixepoch(),
               duration_ms  = ?,
               rows_read    = ?,
               rows_written = ?
           WHERE id = ?""",
        ["completed", cron_dur, rows_read, rows_written, cron_run_id],
    )
    ok(
        f"id={cron_run_id}  "
        f"rows_read={rows_read}  rows_written={rows_written}  "
        f"duration={cron_dur}ms"
    )
    mark("routing_cron_sim", "PASS")

except Exception as e:
    cron_status  = "failed"
    cron_err_msg = str(e)
    cron_dur     = int((time.time() - cron_start) * 1000)
    fail(str(e))
    mark("routing_cron_sim", "FAIL", str(e))
    log_error("smoke", cron_run_id, "cron_execution", str(e), "routing_cron_sim")
    try:
        d1_exec(
            """UPDATE agentsam_cron_runs
               SET status='failed', completed_at=unixepoch(),
                   duration_ms=?, error_message=?, rows_read=?, rows_written=?
               WHERE id=?""",
            [cron_dur, str(e)[:500], rows_read, rows_written, cron_run_id],
        )
    except Exception:
        pass

# ── [6] Verify all rows written back ─────────────────────────────────────────
step("Verifying written rows")
try:
    v_run = d1(
        "SELECT id, success, duration_ms, cost_usd FROM agentsam_command_run WHERE id=?",
        [run_id],
    )
    v_cmd = d1(
        "SELECT use_count, success_count, avg_duration_ms FROM agentsam_commands WHERE id=?",
        [command["id"]],
    )
    v_arm = d1(
        """SELECT success_alpha, decayed_score, total_executions
           FROM agentsam_routing_arms
           WHERE workspace_id=? AND task_type=? AND mode=? AND model_key=?""",
        [WORKSPACE_ID, task_type, arm_mode, SMOKE_MODEL],
    )
    v_cron = d1(
        "SELECT status, rows_read, rows_written FROM agentsam_cron_runs WHERE id=?",
        [cron_run_id],
    )

    assert v_run,  "command_run row missing"
    assert v_cmd,  "commands row missing"
    assert v_arm,  "routing_arm row missing"
    assert v_cron, "cron_run row missing"

    ok(
        f"command_run ✓  "
        f"commands use_count={v_cmd[0]['use_count']} ✓  "
        f"arm α={v_arm[0]['success_alpha']} decayed={round(v_arm[0]['decayed_score'],4)} ✓  "
        f"cron {v_cron[0]['status']} ✓"
    )
    mark("verify", "PASS")
except Exception as e:
    fail(str(e))
    mark("verify", "FAIL", str(e))

# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("=" * 60)
status_sym = {"PASS": "[+]", "FAIL": "[!]", "SKIP": "[~]"}
for label, status in checks.items():
    print(f"  {status_sym.get(status,'[?]')} {label:<30} {status}")

print()
all_pass = all(v == "PASS" for v in checks.values())
any_fail = any(v == "FAIL" for v in checks.values())

print(f"  Tables written  : agentsam_command_run, agentsam_commands,")
print(f"                    agentsam_routing_arms, agentsam_cron_runs")
if any_fail:
    print(f"  Errors logged   : agentsam_error_log")
print(f"  run_group_id    : {RUN_GROUP_ID}")
print(f"  command         : {command['slug']}  ({command['id']})")
print(f"  command_run_id  : {run_id}")
print(f"  cron_run_id     : {cron_run_id}")
print()
if all_pass:
    print("  PASS — Agent Sam Command Pipeline Smoke")
elif any_fail:
    print("  FAIL — one or more steps failed (see above + agentsam_error_log)")
else:
    print("  PARTIAL — some steps skipped")
print("=" * 60)
print()
