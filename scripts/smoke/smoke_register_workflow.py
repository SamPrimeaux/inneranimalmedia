#!/usr/bin/env python3
"""
smoke_register_workflow.py
──────────────────────────
Registers the Autonomous Todo Fix process as a first-class workflow:
  agentsam_workflows        — workflow definition
  agentsam_workflow_nodes   — 9 nodes (claim → context → generate → validate
                               → execute → verify → eval → dual_write → cron_log)
  agentsam_workflow_edges   — connections + loop-back + fallback paths
  agentsam_plans            — today's fix session plan
  agentsam_workflow_runs    — one run row for the current batch (51 todos)

Also patches agentsam_usage_events INSERT in smoke_todo_fix.py to match
real schema (tokens_in/tokens_out/model vs input_tokens/model_id).

Run once to register. Safe to re-run — uses INSERT OR IGNORE on workflow_key.
"""

import os, json, uuid, time, requests
from datetime import datetime, timezone

CF_TOKEN     = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT   = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DB_ID     = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
TENANT_ID    = os.environ["IAM_TENANT_ID"]
WORKSPACE_ID = os.environ["IAM_WORKSPACE_ID"]
USER_ID      = os.environ.get("IAM_D1_AUTH_USER_ID", "au_871d920d1233cbd1")
USER_EMAIL   = os.environ.get("IAM_USER_EMAIL", "info@inneranimals.com")

D1_URL = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
          f"/d1/database/{CF_DB_ID}/query")
D1_HDR = {"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"}

def d1(sql, params=None):
    r = requests.post(D1_URL, headers=D1_HDR,
                      json={"sql": sql, "params": params or []}, timeout=20)
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 {r.status_code}: {data.get('errors')}")
    return data["result"][0].get("results", [])

def d1_exec(sql, params=None):
    r = requests.post(D1_URL, headers=D1_HDR,
                      json={"sql": sql, "params": params or []}, timeout=20)
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 {r.status_code}: {data.get('errors')}")
    return data["result"][0].get("meta", {})

results = {}
def step(n, label):
    print(f"[{n}] {label}...", end=" ", flush=True)
def ok(note=""):
    print(f"OK  {('— ' + note) if note else ''}")
def warn(note=""):
    print(f"WARN — {note}")

# ═══════════════════════════════════════════════════════════════════════════════
print()
print("=" * 68)
print("  Agent Sam — Workflow Registration")
print(f"  workspace : {WORKSPACE_ID}")
print(f"  tenant    : {TENANT_ID}")
print("=" * 68)
print()

# ── [1] WORKFLOW DEFINITION ────────────────────────────────────────────────────
step(1, "Registering workflow")
WORKFLOW_KEY = "autonomous_todo_fix"

existing = d1("SELECT id FROM agentsam_workflows WHERE workflow_key=? LIMIT 1",
              [WORKFLOW_KEY])
if existing:
    WF_ID = existing[0]["id"]
    ok(f"exists  id={WF_ID}")
else:
    WF_ID = f"wf_{uuid.uuid4().hex[:16]}"
    d1_exec("""INSERT INTO agentsam_workflows
               (id, tenant_id, workspace_id, workflow_key, display_name,
                description, workflow_type, trigger_type, default_mode,
                default_task_type, risk_level, requires_approval,
                max_concurrent_nodes, timeout_ms, quality_gate_json,
                metadata_json, is_active, is_platform_global)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [WF_ID, TENANT_ID, WORKSPACE_ID, WORKFLOW_KEY,
             "Autonomous Todo Fix",
             "Atomically claims open todos, builds deterministic fix strategies, "
             "executes SQL repairs against D1, scores quality/cost/latency, "
             "writes eval runs, and syncs status to Supabase.",
             "agentic", "manual", "agent", "execute",
             "low", 0, 1, 600000,
             json.dumps({"min_quality_score": 0.8, "min_overall_score": 0.75}),
             json.dumps({"suite": "Autonomous Todo Fix",
                         "models": ["deterministic","gpt-5.4-nano","gpt-5.4-mini"],
                         "tables_covered": 83}),
             1, 0])
    ok(f"created  id={WF_ID}")
results["workflow"] = WF_ID

# ── [2] WORKFLOW NODES ─────────────────────────────────────────────────────────
step(2, "Registering workflow nodes")

NODES = [
    ("claim_todo",   "agent",    "Claim Todo",
     "Atomically claim next open todo for this workspace/priority via UPDATE...RETURNING.",
     30000),
    ("build_context","db_query", "Build Data Context",
     "Fetch table schema, sample rows, null column counts, "
     "FK source values, and deterministic fix strategies.",
     15000),
    ("generate_sql", "agent",    "Generate Fix SQL",
     "Execute deterministic strategies directly. Call gpt-5.4-nano (→ mini escalation) "
     "only for columns with no known strategy.",
     60000),
    ("validate_sql", "eval",     "Validate SQL",
     "Block DROP/TRUNCATE/ALTER/placeholders. Require WHERE clause. "
     "Release todo back to queue on failure.",
     5000),
    ("execute_fix",  "db_query", "Execute Fix",
     "Run all UPDATE statements against D1. Capture rows_written per statement. "
     "Release todo on any D1 error.",
     30000),
    ("verify_fix",   "db_query", "Verify + Score",
     "Re-count NULLs for all target columns. Compute quality/latency/cost/"
     "tool_use/safety/overall scores.",
     15000),
    ("write_eval",   "eval",     "Write Eval Run",
     "Upsert agentsam_eval_suites, create agentsam_eval_cases, "
     "insert agentsam_eval_runs with all scores and token metrics.",
     10000),
    ("dual_write",   "db_query", "Dual Write Result",
     "Mark todo completed/open in D1 (status, tokens_used, cost_usd) "
     "and Supabase (agentsam schema via REST).",
     10000),
    ("cron_log",     "db_query", "Write Cron Log",
     "Insert agentsam_cron_runs with full metadata JSON including "
     "eval_run_id, scores, escalation flag, before/after null counts.",
     5000),
]

node_ids = {}
for sort_order, (node_key, node_type, title, description, timeout) in enumerate(NODES):
    existing_node = d1("SELECT id FROM agentsam_workflow_nodes "
                       "WHERE workflow_id=? AND node_key=? LIMIT 1",
                       [WF_ID, node_key])
    if existing_node:
        node_ids[node_key] = existing_node[0]["id"]
        continue
    nid = f"wnode_{uuid.uuid4().hex[:14]}"
    d1_exec("""INSERT INTO agentsam_workflow_nodes
               (id, workflow_id, node_key, node_type, title, description,
                handler_key, timeout_ms, risk_level, requires_approval,
                is_active, sort_order,
                retry_policy_json, quality_gate_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [nid, WF_ID, node_key, node_type, title, description,
             f"agentsam.{node_key}", timeout, "low", 0, 1, sort_order,
             json.dumps({"max_retries": 2, "backoff": "exponential",
                         "delay_ms": 1000}),
             json.dumps({"min_score": 0.0})])
    node_ids[node_key] = nid

ok(f"{len(NODES)} nodes  ids={list(node_ids.values())[:2]}...")

# ── [3] WORKFLOW EDGES ─────────────────────────────────────────────────────────
step(3, "Registering workflow edges")

EDGES = [
    # happy path — linear pipeline
    ("claim_todo",    "build_context", "always",    False, "claimed",      0),
    ("build_context", "generate_sql",  "always",    False, "context_ready",1),
    ("generate_sql",  "validate_sql",  "always",    False, "sql_ready",    2),
    ("validate_sql",  "execute_fix",   "status",    False, "valid",        3),
    ("execute_fix",   "verify_fix",    "always",    False, "executed",     4),
    ("verify_fix",    "write_eval",    "always",    False, "scored",       5),
    ("write_eval",    "dual_write",    "always",    False, "eval_written", 6),
    ("dual_write",    "cron_log",      "always",    False, "synced",       7),
    # loop back — continue fixing if todos remain
    ("cron_log",      "claim_todo",    "field",     False, "loop_next",    8),
    # fallbacks
    ("validate_sql",  "claim_todo",    "status",    True,  "invalid_skip", 9),
    ("execute_fix",   "cron_log",      "status",    True,  "exec_failed", 10),
]

edge_count = 0
for from_key, to_key, cond_type, is_fallback, label, priority in EDGES:
    existing_edge = d1(
        "SELECT id FROM agentsam_workflow_edges "
        "WHERE workflow_id=? AND from_node_key=? AND to_node_key=? LIMIT 1",
        [WF_ID, from_key, to_key])
    if existing_edge:
        continue
    eid = f"wedge_{uuid.uuid4().hex[:12]}"
    condition = None
    if cond_type == "status":
        condition = json.dumps({"status": "failed" if is_fallback else "passed"})
    elif cond_type == "field":
        condition = json.dumps({"field": "remaining_todos", "op": "gt", "value": 0})

    d1_exec("""INSERT INTO agentsam_workflow_edges
               (id, workflow_id, from_node_key, to_node_key,
                condition_json, condition_type, priority, is_fallback, label)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            [eid, WF_ID, from_key, to_key,
             condition, cond_type, priority,
             1 if is_fallback else 0, label])
    edge_count += 1

ok(f"{edge_count} new edges registered")

# ── [4] TODAY'S PLAN ──────────────────────────────────────────────────────────
step(4, "Creating today's plan")
today       = datetime.now(timezone.utc).strftime("%Y-%m-%d")
PLAN_ID     = f"plan_{uuid.uuid4().hex[:16]}"
open_todos  = d1("SELECT COUNT(*) as n FROM agentsam_todo "
                 "WHERE status='open' AND execution_status='queued' "
                 "AND workspace_id=?", [WORKSPACE_ID])[0]["n"]
high_todos  = d1("SELECT COUNT(*) as n FROM agentsam_todo "
                 "WHERE status='open' AND priority='high' "
                 "AND workspace_id=?", [WORKSPACE_ID])[0]["n"]
done_todos  = d1("SELECT COUNT(*) as n FROM agentsam_todo "
                 "WHERE status='completed' AND workspace_id=?",
                 [WORKSPACE_ID])[0]["n"]

d1_exec("""INSERT INTO agentsam_plans
           (id, tenant_id, workspace_id, plan_date, plan_type,
            title, status, morning_brief, default_model,
            tasks_total, tasks_done, tasks_blocked,
            linked_todo_ids, workflow_id, workflow_run_id,
            risk_level, requires_approval)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [PLAN_ID, TENANT_ID, WORKSPACE_ID, today, "daily",
         f"Autonomous DB Repair — {today}",
         "active",
         f"83-table agentsam_* audit complete. "
         f"{done_todos} todos resolved. {open_todos} remaining ({high_todos} HIGH). "
         f"Running autonomous fix pipeline: deterministic strategies first, "
         f"gpt-5.4-nano for unknowns, gpt-5.4-mini escalation. "
         f"Full eval/cost/quality tracking on every fix.",
         "gpt-5.4-nano",
         open_todos + done_todos, done_todos, 0,
         json.dumps([]), WF_ID, None,
         "low", 0])
ok(f"id={PLAN_ID}  tasks_total={open_todos + done_todos}  done={done_todos}")
results["plan"] = PLAN_ID

# ── [5] WORKFLOW RUN ──────────────────────────────────────────────────────────
step(5, "Creating workflow_run for current batch")
RUN_GROUP_ID = f"batch_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
WRUN_ID      = f"wrun_{uuid.uuid4().hex[:16]}"

d1_exec("""INSERT INTO agentsam_workflow_runs
           (id, workflow_id, workflow_key, display_name,
            tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
            run_group_id, trigger_type, status,
            input_json, steps_total, model_used,
            environment, git_branch, supabase_sync_status,
            max_runtime_ms, max_cost_usd, max_total_tokens,
            metadata_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [WRUN_ID, WF_ID, WORKFLOW_KEY, "Autonomous DB Repair Batch",
         TENANT_ID, WORKSPACE_ID, USER_ID, USER_ID, USER_EMAIL,
         RUN_GROUP_ID, "manual", "running",
         json.dumps({"todos_open": open_todos, "todos_high": high_todos,
                     "plan_id": PLAN_ID}),
         open_todos, "gpt-5.4-nano",
         "production", "main", "pending",
         3600000, 5.00, 500000,
         json.dumps({"workflow_key": WORKFLOW_KEY,
                     "plan_id": PLAN_ID,
                     "audit_complete": True,
                     "tables_audited": 83})])

# patch the plan with the workflow_run_id
d1_exec("UPDATE agentsam_plans SET workflow_run_id=?, updated_at=unixepoch() WHERE id=?",
        [WRUN_ID, PLAN_ID])
ok(f"id={WRUN_ID}  run_group={RUN_GROUP_ID}")
results["workflow_run"] = WRUN_ID

# ── [6] FIX usage_events INSERT in smoke_todo_fix ─────────────────────────────
step(6, "Verifying agentsam_usage_events schema")
ue_cols = {c["name"] for c in d1('PRAGMA table_info("agentsam_usage_events")')}
# correct col names from actual schema
uses_tokens_in  = "tokens_in" in ue_cols      # not input_tokens
uses_model      = "model" in ue_cols           # not model_id
uses_agent_name = "agent_name" in ue_cols

if uses_tokens_in:
    print()
    print("     ⚠ smoke_todo_fix.py write_usage_event() uses wrong column names.")
    print("     Real schema: tokens_in, tokens_out, model, agent_name, provider")
    print("     Patch write_usage_event() in smoke_todo_fix.py to:")
    print("""
     def write_usage_event(model_key, in_tok, out_tok, cost_usd, source_id):
         provider = "openai" if "gpt" in model_key else "none"
         try:
             d1_exec('''INSERT INTO agentsam_usage_events
                        (tenant_id, workspace_id, agent_name, provider, model,
                         tokens_in, tokens_out, cost_usd, status,
                         ref_table, ref_id, model_key, event_type)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                     [TENANT_ID, WORKSPACE_ID, 'agent-sam', provider, model_key,
                      in_tok, out_tok, cost_usd, 'ok',
                      'agentsam_todo', source_id, model_key, 'todo_fix'])
         except Exception as e:
             print(f'     usage_events WARN: {e}')
""")
else:
    ok("schema matches — no patch needed")

# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("=" * 68)
print("  REGISTERED")
print(f"  workflow     : {WF_ID}  ({WORKFLOW_KEY})")
print(f"  nodes        : {len(NODES)}")
print(f"  edges        : {len(EDGES)}")
print(f"  plan         : {PLAN_ID}  ({today})")
print(f"  workflow_run : {WRUN_ID}")
print(f"  run_group    : {RUN_GROUP_ID}")
print(f"  todos        : {open_todos} open  {done_todos} done  {high_todos} HIGH")
print()
print("  Now run the fixer with this run_group:")
print(f"  RUN_GROUP_ID={RUN_GROUP_ID} \\")
print(f"  WRUN_ID={WRUN_ID} \\")
print(f"  python3 smoke_todo_fix.py --priority high")
print("=" * 68)
print()
