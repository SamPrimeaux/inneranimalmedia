import requests, json, time, subprocess

RUN_ID     = f"wrun_pintest_{int(time.time())}"
EXEC_ID    = f"exec_pintest_{int(time.time())}"
SESSION_ID = f"sess_pintest_{int(time.time())}"
WF_ID      = f"wf_pintest_{int(time.time())}"
TENANT     = "tenant_sam_primeaux"
WORKSPACE  = "ws_inneranimalmedia"
MODEL      = "qwen2.5-coder:7b"
PROVIDER   = "ollama"
NOW        = int(time.time())

def d1(sql):
    r = subprocess.run(
        ["wrangler","d1","execute","inneranimalmedia-business",
         "--remote","--command", sql, "--json"],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results", [])
    except:
        print(f"  D1 ERR stdout={r.stdout[:200]} stderr={r.stderr[:200]}")
        return []

def check(label, sql):
    rows = d1(sql)
    count = rows[0].get("c", 0) if rows else 0
    ok = count > 0
    print(f"  {'OK  ' if ok else 'FAIL'} {label}: {count} rows")
    return ok

# Step 0: seed agentsam_workflows with CORRECT column names (display_name, is_active)
print("[0] Seeding agentsam_workflows...")
d1(f"""INSERT OR REPLACE INTO agentsam_workflows
  (id, tenant_id, workspace_id, workflow_key, display_name, is_active, created_at)
  VALUES (
    '{WF_ID}',
    '{TENANT}',
    '{WORKSPACE}',
    'wf_pintest_e2e',
    'E2E Observability Pintest',
    1,
    datetime({NOW},'unixepoch')
  )""")

# Immediately verify it wrote
verify = d1(f"SELECT id FROM agentsam_workflows WHERE id='{WF_ID}'")
if not verify:
    print("  FATAL: agentsam_workflows insert failed — aborting")
    exit(1)
print(f"  workflows row confirmed: {WF_ID}")

# Step 1: workflow run (FK to agentsam_workflows.id)
print("[1] Writing workflow run...")
d1(f"""INSERT OR REPLACE INTO agentsam_workflow_runs
  (id, workflow_id, workflow_key, display_name, tenant_id, workspace_id,
   trigger_type, status, started_at, environment, model_used,
   steps_completed, steps_total, input_tokens, output_tokens, cost_usd)
  VALUES (
    '{RUN_ID}', '{WF_ID}', 'wf_pintest_e2e', 'E2E Observability Pintest',
    '{TENANT}', '{WORKSPACE}', 'manual', 'running',
    {NOW}, 'production', '{MODEL}', 0, 5, 0, 0, 0
  )""")

verify2 = d1(f"SELECT id FROM agentsam_workflow_runs WHERE id='{RUN_ID}'")
if not verify2:
    print("  FATAL: agentsam_workflow_runs insert failed — aborting")
    exit(1)
print(f"  workflow_runs row confirmed: {RUN_ID}")

# Step 2: executions record
print("[2] Writing execution record...")
d1(f"""INSERT OR REPLACE INTO agentsam_executions
  (id, tenant_id, workspace_id, task_id, execution_type, model_key, status, created_at)
  VALUES (
    '{EXEC_ID}', '{TENANT}', '{WORKSPACE}', '{RUN_ID}',
    'workflow', '{MODEL}', 'running', {NOW}
  )""")

# Step 3: steps + Ollama calls
steps = [
    ("classify_intent", "agent"),
    ("fetch_context",   "db_query"),
    ("generate_code",   "agent"),
    ("validate_output", "agent"),
    ("write_result",    "mcp_tool"),
]

t = NOW
tok_total = 0
print("[3] Running steps...")
for i, (node_key, node_type) in enumerate(steps):
    step_start = t
    tok_in, tok_out, latency, status = 5, 10, 50, "success"

    if node_type == "agent":
        try:
            resp = requests.post(
                "http://localhost:11434/api/generate",
                json={"model": MODEL,
                      "prompt": f"Pintest step {i+1}: {node_key}. One sentence.",
                      "stream": False},
                timeout=30
            )
            data = resp.json()
            tok_in  = data.get("prompt_eval_count", 10)
            tok_out = data.get("eval_count", 20)
            latency = data.get("total_duration", 1_000_000_000) // 1_000_000
        except Exception as e:
            print(f"   Ollama error: {e}")
            status = "failed"

    t += max(latency // 1000, 1)
    tok_total += tok_in + tok_out
    step_id = f"estep_pintest_{node_key}_{NOW}"

    # execution_id FKs to agentsam_workflow_runs.id
    d1(f"""INSERT OR REPLACE INTO agentsam_execution_steps
      (id, execution_id, node_key, node_type, status,
       started_at, completed_at, latency_ms, tokens_in, tokens_out, cost_usd)
      VALUES (
        '{step_id}', '{RUN_ID}', '{node_key}', '{node_type}', '{status}',
        {step_start}, {t}, {latency}, {tok_in}, {tok_out}, 0.0
      )""")

    if node_type == "agent":
        d1(f"""INSERT OR REPLACE INTO agentsam_usage_events
          (id, tenant_id, workspace_id, session_id, provider, model, model_key,
           tokens_in, tokens_out, total_tokens, cost_usd, status,
           event_type, ref_table, ref_id, created_at)
          VALUES (
            'ue_pintest_{node_key}_{NOW}', '{TENANT}', '{WORKSPACE}', '{SESSION_ID}',
            '{PROVIDER}', '{MODEL}', '{MODEL}',
            {tok_in}, {tok_out}, {tok_in+tok_out}, 0.0, 'ok',
            'ollama_pintest', 'agentsam_workflow_runs', '{RUN_ID}', {step_start}
          )""")

    if node_type == "mcp_tool":
        d1(f"""INSERT OR REPLACE INTO agentsam_tool_call_log
          (id, tenant_id, workspace_id, tool_name, tool_category, status, duration_ms, created_at)
          VALUES (
            'tcl_pintest_{NOW}', '{TENANT}', '{WORKSPACE}',
            '{node_key}', 'mcp', 'completed', {latency}, {step_start}
          )""")

    print(f"   step {i+1}/5: {node_key} → {status} ({latency}ms {tok_in}in/{tok_out}out)")

# Step 4: agent run
print("[4] Writing agent run...")
d1(f"""INSERT OR REPLACE INTO agentsam_agent_run
  (id, user_id, tenant_id, workspace_id, status, trigger,
   model_id, ai_model_ref, started_at, completed_at,
   input_tokens, output_tokens, cost_usd, created_at)
  VALUES (
    'arun_pintest_{NOW}', 'au_871d920d1233cbd1', '{TENANT}', '{WORKSPACE}',
    'completed', 'pintest', '{MODEL}', '{MODEL}',
    datetime({NOW},'unixepoch'), datetime({t},'unixepoch'),
    {tok_total//2}, {tok_total//2}, 0.0, datetime({NOW},'unixepoch')
  )""")

# Step 5: finalise workflow run
print("[5] Finalising workflow run...")
d1(f"""UPDATE agentsam_workflow_runs
  SET status='completed', completed_at={t},
      steps_completed=5, steps_total=5,
      input_tokens={tok_total//2}, output_tokens={tok_total//2}
  WHERE id='{RUN_ID}'""")

# Step 6: error log entry
print("[6] Writing error log entry...")
d1(f"""INSERT OR IGNORE INTO agentsam_error_log
  (id, workspace_id, tenant_id, error_type, error_message, source, resolved, created_at)
  VALUES (
    'aerr_pintest_{NOW}', '{WORKSPACE}', '{TENANT}',
    'pintest_validation', 'E2E observability pintest completed',
    'ollama_e2e_pintest', 0, {NOW}
  )""")

# Validation
print("\n── Validation ───────────────────────────────────────")
results = [
    check("agentsam_workflows",       f"SELECT COUNT(*) as c FROM agentsam_workflows WHERE id='{WF_ID}'"),
    check("agentsam_workflow_runs",   f"SELECT COUNT(*) as c FROM agentsam_workflow_runs WHERE id='{RUN_ID}'"),
    check("agentsam_executions",      f"SELECT COUNT(*) as c FROM agentsam_executions WHERE id='{EXEC_ID}'"),
    check("agentsam_execution_steps", f"SELECT COUNT(*) as c FROM agentsam_execution_steps WHERE execution_id='{RUN_ID}'"),
    check("agentsam_usage_events",    f"SELECT COUNT(*) as c FROM agentsam_usage_events WHERE ref_id='{RUN_ID}'"),
    check("agentsam_tool_call_log",   f"SELECT COUNT(*) as c FROM agentsam_tool_call_log WHERE id='tcl_pintest_{NOW}'"),
    check("agentsam_agent_run",       f"SELECT COUNT(*) as c FROM agentsam_agent_run WHERE id='arun_pintest_{NOW}'"),
    check("agentsam_error_log",       f"SELECT COUNT(*) as c FROM agentsam_error_log WHERE id='aerr_pintest_{NOW}'"),
]
print(f"\n{'ALL PASS' if all(results) else 'FAILURES DETECTED'} — {sum(results)}/{len(results)} tables populated")
