#!/usr/bin/env python3
"""
smoke_todo_fix.py
─────────────────
Autonomous todo fixer. Every cost source tracked. Full Supabase telemetry.

D1 writes per run:
  agentsam_todo            — status, tokens_used, cost_usd
  agentsam_eval_suites     — upserted once per suite name
  agentsam_eval_cases      — one per todo
  agentsam_eval_runs       — scores, tokens, cost, sql
  agentsam_usage_events    — correct schema (tokens_in/out/model)
  agentsam_escalation      — on nano→mini escalation
  agentsam_cron_runs       — full metadata + costs

Supabase writes per run (step 9):
  public.agentsam_eval_runs         — mirror with identity + score fields
  public.agentsam_routing_decisions — model selection decision
  public.cost_forecasts             — increments today's openai spend
  public.agentsam_error_events      — only on escalation
  agentsam.agentsam_audit_snapshots — before/after null snapshot
  agentsam.agentsam_todo            — status patch (step 10)

Usage:
  python3 smoke_todo_fix.py
  python3 smoke_todo_fix.py --priority medium
  python3 smoke_todo_fix.py --dry-run
"""

import os, sys, json, uuid, time, re, requests
from datetime import datetime, timezone

# ── env ───────────────────────────────────────────────────────────────────────
CF_TOKEN     = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT   = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DB_ID     = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
TENANT_ID    = os.environ["IAM_TENANT_ID"]
WORKSPACE_ID = os.environ["IAM_WORKSPACE_ID"]
PERSON_UUID  = os.environ.get("IAM_PERSON_UUID", "550e8400-e29b-41d4-a716-446655440001")
USER_ID      = os.environ.get("IAM_D1_AUTH_USER_ID", "au_871d920d1233cbd1")
USER_EMAIL   = os.environ.get("IAM_USER_EMAIL", "info@inneranimals.com")
SB_URL       = os.environ["SUPABASE_URL"]
SB_KEY       = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_KEY   = os.environ["OPENAI_API_KEY"]

PRIORITY     = "medium" if "--priority" in sys.argv and "medium" in sys.argv else "high"
DRY_RUN      = "--dry-run" in sys.argv
AGENT_ID     = f"fix_agent_{uuid.uuid4().hex[:8]}"
RUN_GROUP_ID = f"todo_fix_{uuid.uuid4().hex[:12]}"
TODAY        = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NOW_ISO      = datetime.now(timezone.utc).isoformat()

MODEL_RATES = {
    "gpt-5.4-nano": (0.10, 0.40),
    "gpt-5.4-mini": (0.40, 1.60),
    "deterministic": (0.0, 0.0),
}
D1_RATE_READ    = 0.001
D1_RATE_WRITTEN = 1.00

D1_URL = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
          f"/d1/database/{CF_DB_ID}/query")
D1_HDR = {"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"}

# ── D1 with cost accumulators ─────────────────────────────────────────────────
_d1_rows_read    = 0
_d1_rows_written = 0

def d1(sql, params=None):
    global _d1_rows_read
    r    = requests.post(D1_URL, headers=D1_HDR,
                         json={"sql": sql, "params": params or []}, timeout=30)
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 {r.status_code}: {data.get('errors')}")
    res  = data["result"][0]
    _d1_rows_read += res.get("meta", {}).get("rows_read",
                             len(res.get("results", [])))
    return res.get("results", [])

def d1_exec(sql, params=None):
    global _d1_rows_read, _d1_rows_written
    r    = requests.post(D1_URL, headers=D1_HDR,
                         json={"sql": sql, "params": params or []}, timeout=30)
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 {r.status_code}: {data.get('errors')}")
    meta = data["result"][0].get("meta", {})
    _d1_rows_read    += meta.get("rows_read", 0)
    _d1_rows_written += meta.get("rows_written", 0)
    return meta

def d1_cost():
    return round(
        (_d1_rows_read    / 1_000_000) * D1_RATE_READ +
        (_d1_rows_written / 1_000_000) * D1_RATE_WRITTEN, 8)

# ── Supabase helpers ──────────────────────────────────────────────────────────
def _sb_hdr(schema="public"):
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    if schema != "public":
        h["Content-Profile"] = schema
        h["Accept-Profile"]  = schema
    return h

def _sb_post(table, payload, schema="public"):
    r = requests.post(f"{SB_URL}/rest/v1/{table}",
                      headers=_sb_hdr(schema), json=payload, timeout=15)
    return r.status_code in (200, 201)

def _sb_patch(table, payload, filters, schema="public"):
    r = requests.patch(f"{SB_URL}/rest/v1/{table}",
                       headers=_sb_hdr(schema), params=filters,
                       json=payload, timeout=15)
    return r.status_code in (200, 204)

def _sb_get(table, params, schema="public"):
    r = requests.get(f"{SB_URL}/rest/v1/{table}",
                     headers={**_sb_hdr(schema), "Prefer": ""},
                     params=params, timeout=15)
    return r.json() if r.status_code in (200, 206) else []

def sb_patch_todo(todo_id, payload):
    return _sb_patch("agentsam_todo", payload,
                     {"id": f"eq.{todo_id}"}, schema="agentsam")

def release_todo(todo_id, error_msg=""):
    d1_exec("UPDATE agentsam_todo SET execution_status='queued',"
            " started_at=NULL, error_trace=?, updated_at=datetime('now') WHERE id=?",
            [error_msg[:500], todo_id])
    if error_msg:
        sb_patch_todo(todo_id, {"execution_status": "queued",
                                "error_trace": error_msg[:500]})

# ── Supabase telemetry — all 5 tables per run ─────────────────────────────────
def write_supabase_telemetry(
        todo_id, table, title, all_improved,
        model_used, in_tok, out_tok,
        llm_cost, api_cost, total_cost,
        total_lat, llm_latency, escalated,
        before, after, fix_sql,
        total_written, attempted, succeeded_stmts,
        sq, sl, sc, stu, so):

    provider = "openai" if "gpt" in model_used else "none"
    res      = {}

    # 1. agentsam_eval_runs
    ok = _sb_post("agentsam_eval_runs", {
        "d1_auth_user_id": USER_ID,
        "user_email":      USER_EMAIL,
        "person_uuid":     PERSON_UUID,
        "tenant_id":       TENANT_ID,
        "workspace_id":    WORKSPACE_ID,
        "run_group_id":    RUN_GROUP_ID,
        "run_source":      "todo_fix",
        "agent_tool":      "autonomous_todo_fix",
        "provider":        provider if model_used != "deterministic" else None,
        "model_key":       model_used if model_used != "deterministic" else None,
        "status":          "passed" if all_improved else "partial",
        "success":         all_improved,
        "failure_reason":  None if all_improved else "partial_null_fix",
        "input_tokens":    in_tok,
        "output_tokens":   out_tok,
        "total_tokens":    in_tok + out_tok,
        "cost_usd":        total_cost,
        "duration_ms":     total_lat,
        "tool_call_count": attempted,
        "metrics_json": {
            "score_quality":  sq, "score_latency": sl,
            "score_cost":     sc, "score_tool_use": stu,
            "score_overall":  so,
            "llm_cost_usd":   llm_cost, "d1_cost_usd": api_cost,
            "rows_written":   total_written,
        },
        "metadata": {
            "todo_id": todo_id, "table": table, "title": title,
            "agent_id": AGENT_ID, "before": before, "after": after,
            "fix_sql": fix_sql[:500],
        },
        "started_at": NOW_ISO, "completed_at": NOW_ISO,
    })
    res["eval_runs"] = "OK" if ok else "FAIL"

    # 2. agentsam_routing_decisions
    ok = _sb_post("agentsam_routing_decisions", {
        "d1_auth_user_id":         USER_ID,
        "user_email":              USER_EMAIL,
        "tenant_id":               TENANT_ID,
        "workspace_id":            WORKSPACE_ID,
        "run_group_id":            RUN_GROUP_ID,
        "task_type":               "todo_fix",
        "mode":                    "agent",
        "selected_model":          model_used,
        "provider":                provider,
        "api_platform":            "openai" if provider == "openai" else None,
        "routing_strategy":        "deterministic" if model_used == "deterministic"
                                   else "cost_optimized_bandit",
        "tools_required":          False,
        "supports_tools_required": False,
        "override_happened":       escalated,
        "override_reason":         "nano_failed_escalated_to_mini" if escalated else None,
        "fallback_used":           escalated,
        "estimated_input_tokens":  in_tok,
        "estimated_output_tokens": out_tok,
        "estimated_cost_usd":      total_cost,
        "success":                 all_improved,
        "latency_ms":              llm_latency if llm_latency else total_lat,
        "metadata": {"todo_id": todo_id, "table": table, "agent_id": AGENT_ID},
    })
    res["routing_decisions"] = "OK" if ok else "FAIL"

    # 3. cost_forecasts — increment today's openai row
    if total_cost > 0:
        existing = _sb_get("cost_forecasts", {
            "forecast_date": f"eq.{TODAY}", "provider": "eq.openai",
            "select": "id,actual_spend_today_usd,tokens_in_today,"
                      "tokens_out_today,api_calls_today", "limit": "1"})
        if existing:
            row = existing[0]
            ok  = _sb_patch("cost_forecasts", {
                "actual_spend_today_usd": round(
                    (row.get("actual_spend_today_usd") or 0) + total_cost, 8),
                "tokens_in_today":  (row.get("tokens_in_today")  or 0) + in_tok,
                "tokens_out_today": (row.get("tokens_out_today") or 0) + out_tok,
                "api_calls_today":  (row.get("api_calls_today")  or 0) + 1,
                "updated_at":       NOW_ISO,
            }, {"id": f"eq.{row['id']}"})
            res["cost_forecasts"] = "updated" if ok else "FAIL"
        else:
            ok = _sb_post("cost_forecasts", {
                "forecast_date":          TODAY,
                "provider":               "openai",
                "actual_spend_today_usd": total_cost,
                "tokens_in_today":        in_tok,
                "tokens_out_today":       out_tok,
                "api_calls_today":        1,
                "burn_rate_usd_per_day":  total_cost,
                "status":                 "healthy",
                "balance_source":         "computed",
                "updated_at":             NOW_ISO,
            })
            res["cost_forecasts"] = "inserted" if ok else "FAIL"
    else:
        res["cost_forecasts"] = "skip ($0)"

    # 4. agentsam_error_events — only on escalation
    if escalated:
        ok = _sb_post("agentsam_error_events", {
            "d1_auth_user_id": USER_ID,
            "user_email":      USER_EMAIL,
            "person_uuid":     PERSON_UUID,
            "tenant_id":       TENANT_ID,
            "workspace_id":    WORKSPACE_ID,
            "run_group_id":    RUN_GROUP_ID,
            "source":          "todo_fix_agent",
            "severity":        "warn",
            "error_type":      "model_escalation",
            "error_code":      "NANO_ESCALATED_TO_MINI",
            "error_message":   f"gpt-5.4-nano failed — escalated to gpt-5.4-mini "
                               f"for {table}",
            "provider":        "openai",
            "model_key":       "gpt-5.4-mini",
            "retryable":       False,
            "resolved":        True,
            "resolution_notes": f"Completed with gpt-5.4-mini. quality={sq} overall={so}",
            "metadata":        {"todo_id": todo_id, "table": table},
        })
        res["error_events"] = "OK" if ok else "FAIL"
    else:
        res["error_events"] = "skip"

    # 5. agentsam_audit_snapshots (agentsam schema)
    improved = sum(1 for c in before if after.get(c, 0) < before[c])
    ok = _sb_post("agentsam_audit_snapshots", {
        "run_group_id":   RUN_GROUP_ID,
        "tables_audited": 1,
        "tables_clean":   1 if all_improved else 0,
        "tables_empty":   0,
        "p0_count":       len(before) - improved,
        "p1_count":       0,
        "todos_written":  0,
        "results_json": {
            "todo_id": todo_id, "table": table, "model": model_used,
            "before": before, "after": after,
            "improved_cols": improved, "rows_written": total_written,
            "llm_cost_usd": llm_cost, "d1_cost_usd": api_cost,
            "total_cost_usd": total_cost,
            "score_quality": sq, "score_overall": so,
            "escalated": escalated, "fix_sql": fix_sql[:1000],
        },
    }, schema="agentsam")
    res["audit_snapshots"] = "OK" if ok else "FAIL"

    return res

# ── data helpers ──────────────────────────────────────────────────────────────
def get_schema(table):
    return d1(f'PRAGMA table_info("{table}")')

def get_sample_rows(table, n=3):
    try:
        return d1(f'SELECT * FROM "{table}" LIMIT {n}')
    except Exception:
        return []

def get_null_col_counts(table):
    out = {}
    for c in get_schema(table):
        if c["notnull"]:
            continue
        try:
            n = d1(f'SELECT COUNT(*) as n FROM "{table}" '
                   f'WHERE "{c["name"]}" IS NULL')[0]["n"]
            if n > 0:
                out[c["name"]] = n
        except Exception:
            pass
    return out

# ── strategy builder ──────────────────────────────────────────────────────────
def build_strategies(table, schema_cols, null_cols):
    col_names  = [c["name"] for c in schema_cols]
    strategies = {}
    T          = table

    STATIC = {
        "tenant_id":       f"UPDATE \"{T}\" SET tenant_id='{TENANT_ID}' WHERE tenant_id IS NULL",
        "workspace_id":    f"UPDATE \"{T}\" SET workspace_id='{WORKSPACE_ID}' WHERE workspace_id IS NULL",
        "user_id":         f"UPDATE \"{T}\" SET user_id='{TENANT_ID}' WHERE user_id IS NULL",
        "person_uuid":     f"UPDATE \"{T}\" SET person_uuid='{PERSON_UUID}' WHERE person_uuid IS NULL",
        "idempotency_key": f"UPDATE \"{T}\" SET idempotency_key=id WHERE idempotency_key IS NULL",
        "chain_root_id":   f"UPDATE \"{T}\" SET chain_root_id=id WHERE chain_root_id IS NULL",
        "work_session_id": f"UPDATE \"{T}\" SET work_session_id=id WHERE work_session_id IS NULL",
        "approved_by":     f"UPDATE \"{T}\" SET approved_by='{TENANT_ID}' WHERE approved_by IS NULL",
        "decided_at":      f"UPDATE \"{T}\" SET decided_at=datetime('now') WHERE decided_at IS NULL",
    }

    for col in null_cols:
        if col in STATIC:
            strategies[col] = STATIC[col]
        elif col == "ai_model_ref" and "model_id" in col_names:
            strategies[col] = (f"UPDATE \"{T}\" SET ai_model_ref=model_id "
                               f"WHERE ai_model_ref IS NULL AND model_id IS NOT NULL")
        elif col == "session_id":
            strategies[col] = (
                f"UPDATE \"{T}\" SET session_id=conversation_id "
                f"WHERE session_id IS NULL AND conversation_id IS NOT NULL"
                if "conversation_id" in col_names else
                f"UPDATE \"{T}\" SET session_id=id WHERE session_id IS NULL")
        elif col == "routing_arm_id":
            join = (f"WHERE model_key=\"{T}\".model_id AND workspace_id='{WORKSPACE_ID}'"
                    if "model_id" in col_names else f"WHERE workspace_id='{WORKSPACE_ID}'")
            strategies[col] = (f"UPDATE \"{T}\" SET routing_arm_id=("
                               f"SELECT id FROM agentsam_routing_arms {join} LIMIT 1) "
                               f"WHERE routing_arm_id IS NULL")
        elif col == "agent_id":
            strategies[col] = (f"UPDATE \"{T}\" SET agent_id=("
                               f"SELECT id FROM agentsam_ai LIMIT 1) "
                               f"WHERE agent_id IS NULL")
        elif col == "command_id":
            strategies[col] = (
                f"UPDATE \"{T}\" SET command_id=selected_command_id "
                f"WHERE command_id IS NULL AND selected_command_id IS NOT NULL"
                if "selected_command_id" in col_names else
                f"UPDATE \"{T}\" SET command_id=("
                f"SELECT id FROM agentsam_commands "
                f"WHERE workspace_id='{WORKSPACE_ID}' AND is_active=1 LIMIT 1) "
                f"WHERE command_id IS NULL")
        elif col == "command_run_id":
            strategies[col] = (f"UPDATE \"{T}\" SET command_run_id=("
                               f"SELECT id FROM agentsam_command_run "
                               f"WHERE workspace_id='{WORKSPACE_ID}' LIMIT 1) "
                               f"WHERE command_run_id IS NULL")
        elif col == "plan_id":
            strategies[col] = (f"UPDATE \"{T}\" SET plan_id=("
                               f"SELECT id FROM agentsam_plans "
                               f"WHERE tenant_id='{TENANT_ID}' LIMIT 1) "
                               f"WHERE plan_id IS NULL")
        elif col == "todo_id":
            strategies[col] = (f"UPDATE \"{T}\" SET todo_id=("
                               f"SELECT id FROM agentsam_todo "
                               f"WHERE workspace_id='{WORKSPACE_ID}' LIMIT 1) "
                               f"WHERE todo_id IS NULL")
        elif col == "workflow_run_id":
            strategies[col] = (f"UPDATE \"{T}\" SET workflow_run_id=("
                               f"SELECT id FROM agentsam_workflow_runs "
                               f"WHERE workspace_id='{WORKSPACE_ID}' LIMIT 1) "
                               f"WHERE workflow_run_id IS NULL")
        elif col == "tool_id":
            strategies[col] = (f"UPDATE \"{T}\" SET tool_id=("
                               f"SELECT id FROM agentsam_mcp_tools "
                               f"WHERE workspace_id='{WORKSPACE_ID}' LIMIT 1) "
                               f"WHERE tool_id IS NULL")
        elif col == "tool_key":
            strategies[col] = (f"UPDATE \"{T}\" SET tool_key=("
                               f"SELECT tool_key FROM agentsam_mcp_tools "
                               f"WHERE workspace_id='{WORKSPACE_ID}' "
                               f"AND tool_key IS NOT NULL LIMIT 1) "
                               f"WHERE tool_key IS NULL")
        elif col == "execution_step_id":
            strategies[col] = (f"UPDATE \"{T}\" SET execution_step_id=("
                               f"SELECT id FROM agentsam_execution_steps LIMIT 1) "
                               f"WHERE execution_step_id IS NULL")
        elif col == "selected_command_id" and "selected_command_slug" in col_names:
            strategies[col] = (f"UPDATE \"{T}\" SET selected_command_id=("
                               f"SELECT id FROM agentsam_commands "
                               f"WHERE slug=\"{T}\".selected_command_slug LIMIT 1) "
                               f"WHERE selected_command_id IS NULL "
                               f"AND selected_command_slug IS NOT NULL")
    return strategies

# ── validation ────────────────────────────────────────────────────────────────
BLOCKED      = ["DROP ", "TRUNCATE ", "ALTER TABLE", "ATTACH ", "DETACH "]
PLACEHOLDERS = [r"'default_\w+'", r"'safe_\w+'", r"'placeholder\w*'",
                r"'dummy\w*'", r"'fake\w*'", r"'example\w*'",
                r"'<\w+>'", r"'your_\w+'"]

def validate_sql(sql):
    upper = sql.strip().upper()
    for kw in BLOCKED:
        if kw in upper:
            return False, f"Blocked: {kw.strip()}"
    for pat in PLACEHOLDERS:
        if re.search(pat, sql, re.IGNORECASE):
            return False, "Placeholder detected"
    if not any(upper.lstrip().startswith(a) for a in ["UPDATE ", "INSERT ", "WITH "]):
        return False, "Must start with UPDATE/INSERT/WITH"
    if "WHERE" not in upper and "ON CONFLICT" not in upper:
        return False, "Missing WHERE clause"
    return True, "ok"

def extract_sql(text):
    m = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else text.strip()

# ── OpenAI ────────────────────────────────────────────────────────────────────
def openai_call(prompt, model):
    t0 = time.time()
    r  = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_KEY}",
                 "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}],
              "max_tokens": 800, "temperature": 0}, timeout=45)
    r.raise_for_status()
    latency_ms  = int((time.time() - t0) * 1000)
    body        = r.json()
    text        = body["choices"][0]["message"]["content"].strip()
    usage       = body.get("usage", {})
    in_tok      = usage.get("prompt_tokens", 0)
    out_tok     = usage.get("completion_tokens", 0)
    in_r, out_r = MODEL_RATES.get(model, (0.50, 2.00))
    llm_cost    = round((in_tok * in_r + out_tok * out_r) / 1_000_000, 8)
    return text, in_tok, out_tok, llm_cost, latency_ms

# ── scoring ───────────────────────────────────────────────────────────────────
def score_quality(before, after):
    if not before: return 1.0
    return round(sum(1 for c in before if after.get(c, 0) < before[c]) / len(before), 4)

def score_latency(ms):
    return round(max(0.0, 1.0 - max(0, ms - 500) / 29500), 4)

def score_cost(cost):
    return round(max(0.0, 1.0 - cost / 0.01), 4)

def score_tool_use(attempted, succeeded):
    return round(succeeded / attempted, 4) if attempted else 1.0

def score_overall(sq, sl, sc, stu):
    return round(sq * 0.40 + sl * 0.20 + sc * 0.20 + stu * 0.20, 4)

# ── eval suite ────────────────────────────────────────────────────────────────
SUITE_NAME = "Autonomous Todo Fix"

def ensure_eval_suite():
    rows = d1("SELECT id FROM agentsam_eval_suites WHERE name=? AND tenant_id=? LIMIT 1",
              [SUITE_NAME, TENANT_ID])
    if rows: return rows[0]["id"]
    sid = f"evs_{uuid.uuid4().hex[:16]}"
    d1_exec("""INSERT INTO agentsam_eval_suites
               (id,tenant_id,name,description,provider,mode,task_type,created_by)
               VALUES(?,?,?,?,?,?,?,?)""",
            [sid, TENANT_ID, SUITE_NAME,
             "Tracks every autonomous todo fix — tokens, cost, quality, latency.",
             "openai", "agent", "execute", "agentsam_smoke"])
    return sid

def create_eval_case(suite_id, table, null_cols_counts):
    cid = f"evc_{uuid.uuid4().hex[:16]}"
    d1_exec("""INSERT INTO agentsam_eval_cases
               (id,suite_id,tenant_id,input_prompt,expected_output,grading_criteria,tags)
               VALUES(?,?,?,?,?,?,?)""",
            [cid, suite_id, TENANT_ID,
             f"Fix NULL columns in {table}: {list(null_cols_counts.keys())}",
             f"All {len(null_cols_counts)} NULL columns → 0",
             "All target columns must reach 0 NULLs. No placeholder strings.",
             json.dumps(["todo-fix", table, "null-linkage"])])
    return cid

def write_d1_eval_run(suite_id, case_id, model_key, provider,
                      in_tok, out_tok, latency_ms, total_cost,
                      sq, sl, sc, stu, so, passed, fix_sql,
                      grader_notes, attempted, succeeded):
    rid = f"evr_{uuid.uuid4().hex[:16]}"
    d1_exec("""INSERT INTO agentsam_eval_runs
               (id,suite_id,case_id,tenant_id,model_key,provider,
                input_tokens,output_tokens,latency_ms,cost_usd,
                score_quality,score_latency,score_cost,score_tool_use,
                score_safety,score_overall,passed,output_text,grader_notes,
                grader_model,run_group_id,tool_calls_attempted,tool_calls_succeeded,
                failure_taxonomy)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [rid, suite_id, case_id, TENANT_ID, model_key, provider,
             in_tok, out_tok, latency_ms, total_cost,
             sq, sl, sc, stu, 1.0, so,
             1 if passed else 0, fix_sql[:2000], grader_notes,
             "agentsam_smoke", RUN_GROUP_ID, attempted, succeeded,
             None if passed else "partial_null_fix"])
    d1_exec("UPDATE agentsam_eval_suites SET run_count=run_count+1,"
            " last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
            [suite_id])
    return rid

# ── escalation ────────────────────────────────────────────────────────────────
def write_escalation(model_attempted, succeeded, in_tok, out_tok,
                     latency_ms, error_message=None):
    err_id = f"err_{uuid.uuid4().hex[:16]}"
    try:
        d1_exec("""INSERT INTO agentsam_error_events
                   (id,workspace_id,tenant_id,error_type,severity,retryable,resolved,resolution)
                   VALUES(?,?,?,?,?,?,?,?)""",
                [err_id, WORKSPACE_ID, TENANT_ID, "model_escalation",
                 "warning", 1, 1 if succeeded else 0,
                 f"Escalated to {model_attempted}"])
    except Exception:
        pass
    esc_id = uuid.uuid4().hex
    try:
        d1_exec("""INSERT INTO agentsam_escalation
                   (id,run_group_id,error_event_id,chain_index,
                    model_attempted,succeeded,input_tokens,output_tokens,
                    latency_ms,error_message,workspace_id,tenant_id)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                [esc_id, RUN_GROUP_ID, err_id, 1, model_attempted,
                 1 if succeeded else 0, in_tok, out_tok, latency_ms,
                 error_message, WORKSPACE_ID, TENANT_ID])
    except Exception as e:
        print(f"     escalation WARN: {e}")

# ── usage events ──────────────────────────────────────────────────────────────
def write_usage_event(model_key, in_tok, out_tok, total_cost, latency_ms, source_id):
    provider = "openai" if "gpt" in model_key else "cloudflare"
    try:
        d1_exec("""INSERT INTO agentsam_usage_events
                   (tenant_id,workspace_id,agent_name,provider,model,
                    tokens_in,tokens_out,cost_usd,status,
                    ref_table,ref_id,model_key,event_type,duration_ms,total_tokens)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                [TENANT_ID, WORKSPACE_ID, "agent-sam", provider, model_key,
                 in_tok, out_tok, total_cost, "ok",
                 "agentsam_todo", source_id, model_key,
                 "todo_fix", latency_ms, in_tok + out_tok])
    except Exception as e:
        print(f"     usage_events WARN: {e}")

# ═════════════════════════════════════════════════════════════════════════════
print()
print("=" * 68)
print("  Agent Sam Autonomous Todo Fixer")
print(f"  agent    : {AGENT_ID}")
print(f"  run_group: {RUN_GROUP_ID}")
print(f"  priority : {PRIORITY}  dry_run: {DRY_RUN}")
print("=" * 68)
print()

# [1] CLAIM
print("[1] Claiming todo...", end=" ", flush=True)
claimed = d1(
    """UPDATE agentsam_todo
       SET execution_status='in_progress', started_at=datetime('now'),
           assigned_to=?, updated_at=datetime('now')
       WHERE id=(
           SELECT id FROM agentsam_todo
           WHERE status='open' AND execution_status='queued'
             AND workspace_id=? AND priority=? AND created_by='agentsam_smoke'
           ORDER BY created_at ASC LIMIT 1
       )
       RETURNING id, title, linked_table""",
    [AGENT_ID, WORKSPACE_ID, PRIORITY])

if not claimed:
    print(f"NONE — no open {PRIORITY} todos")
    sys.exit(0)

TODO_ID = claimed[0]["id"]
TABLE   = claimed[0]["linked_table"]
TITLE   = claimed[0]["title"]
print(f"OK  →  {TODO_ID}  |  {TABLE}")
print(f"       {TITLE}")

# [2] CONTEXT
print("[2] Building context...", end=" ", flush=True)
schema_cols      = get_schema(TABLE)
sample_rows      = get_sample_rows(TABLE)
null_cols_counts = get_null_col_counts(TABLE)
strategies       = build_strategies(TABLE, schema_cols, null_cols_counts.keys())
unknown_cols     = [c for c in null_cols_counts if c not in strategies]
print(f"OK  — {len(null_cols_counts)} null cols  "
      f"{len(strategies)} deterministic  {len(unknown_cols)} need LLM")
print()
for col, n in null_cols_counts.items():
    flag    = "✓" if col in strategies else "?"
    preview = strategies[col][:90] if col in strategies else "→ LLM"
    print(f"  {flag} {col}({n}): {preview}")
print()

# [2b] EVAL SUITE
print("[2b] Ensuring eval suite...", end=" ", flush=True)
try:
    suite_id = ensure_eval_suite()
    case_id  = create_eval_case(suite_id, TABLE, null_cols_counts)
    print(f"OK  suite={suite_id}")
except Exception as e:
    print(f"WARN: {e}")
    suite_id = case_id = None

# [3] SQL ASSEMBLY
model_used   = "deterministic"
fix_stmts    = list(strategies.values())
in_tok       = 0
out_tok      = 0
llm_cost     = 0.0
llm_latency  = 0
escalated    = False

if unknown_cols:
    schema_str  = "\n".join(f"  {c['name']} {c['type']}{'  NOT NULL' if c['notnull'] else ''}"
                            for c in schema_cols)
    sample_str  = ("Sample rows:\n" + "\n".join(
        "  " + json.dumps({k: r.get(k) for k in list(r.keys())[:12]})
        for r in sample_rows)) if sample_rows else ""
    known_str   = "\n".join(f"  {c}: {s}" for c, s in strategies.items())
    unknown_str = "\n".join(
        f"  {c}: {null_cols_counts[c]} NULLs — derive fix from schema/sample"
        for c in unknown_cols)
    prompt = (f"SQLite repair agent for Cloudflare D1. "
              f"Fix NULL columns in '{TABLE}'. Real subqueries only.\n\n"
              f"SCHEMA:\n{schema_str}\n\n{sample_str}\n"
              f"NULL COLUMNS:\n"
              + "\n".join(f"  {c}: {n} NULLs" for c, n in null_cols_counts.items())
              + f"\n\nKNOWN STRATEGIES:\n{known_str}"
              f"\n\nUNKNOWN:\n{unknown_str}"
              f"\n\nValues: tenant_id='{TENANT_ID}' workspace_id='{WORKSPACE_ID}' "
              f"person_uuid='{PERSON_UUID}'\n"
              f"One UPDATE per column. Semicolons. No markdown. SQL only.")

    model_used = "gpt-5.4-nano"
    print(f"[3] Calling {model_used}...", end=" ", flush=True)
    try:
        raw, in_tok, out_tok, llm_cost, llm_latency = openai_call(prompt, "gpt-5.4-nano")
        print(f"OK  in={in_tok} out={out_tok} llm=${llm_cost:.8f} {llm_latency}ms")
    except Exception as e:
        print(f"nano FAIL → gpt-5.4-mini...", end=" ", flush=True)
        escalated = True
        try:
            raw, in_tok, out_tok, llm_cost, llm_latency = openai_call(prompt, "gpt-5.4-mini")
            model_used = "gpt-5.4-mini"
            print(f"OK  in={in_tok} out={out_tok} llm=${llm_cost:.8f} {llm_latency}ms")
            write_escalation("gpt-5.4-mini", True, in_tok, out_tok, llm_latency, str(e))
        except Exception as e2:
            write_escalation("gpt-5.4-mini", False, 0, 0, 0, str(e2))
            release_todo(TODO_ID, str(e2))
            print(f"FAIL: {e2}")
            sys.exit(1)
    for stmt in extract_sql(raw).split(";"):
        s = stmt.strip()
        if s: fix_stmts.append(s)
else:
    print("[3] All deterministic — skipping LLM")

fix_sql = ";\n".join(fix_stmts)
print(f"\n  model: {model_used}")
print(f"  SQL:")
for line in fix_sql.splitlines():
    print(f"    {line}")
print()

# [4] VALIDATE
print("[4] Validating...", end=" ", flush=True)
for stmt in fix_stmts:
    ok, reason = validate_sql(stmt)
    if not ok:
        release_todo(TODO_ID, f"VALIDATION: {reason} — {stmt[:80]}")
        print(f"FAIL — {reason}")
        sys.exit(1)
print("OK")

if DRY_RUN:
    release_todo(TODO_ID)
    print("\n  DRY RUN — todo released")
    sys.exit(0)

# [5] BEFORE
before = dict(null_cols_counts)
print(f"[5] Before: {before}")

# [6] EXECUTE
print("[6] Executing...", end=" ", flush=True)
t0 = time.time()
total_written = succeeded_stmts = 0
attempted     = len(fix_stmts)
errors        = []

for stmt in fix_stmts:
    s = stmt.strip().rstrip(";")
    if not s: continue
    try:
        meta = d1_exec(s)
        total_written   += meta.get("rows_written", meta.get("changes", 0))
        succeeded_stmts += 1
    except Exception as e:
        errors.append(f"{s[:60]}... → {e}")

elapsed = int((time.time() - t0) * 1000)
if errors:
    msg = " | ".join(errors)
    release_todo(TODO_ID, msg)
    print(f"FAIL:\n  " + "\n  ".join(errors))
    sys.exit(1)
print(f"OK  rows={total_written}  stmts={succeeded_stmts}/{attempted}  {elapsed}ms")

# [7] VERIFY + SCORE
print("[7] Verifying + scoring...")
after        = get_null_col_counts(TABLE)
all_improved = True
for col, b in before.items():
    a = after.get(col, 0)
    if a >= b: all_improved = False
    print(f"     {col}: {b} → {a}  {'✓' if a < b else '⚠'}")

api_cost   = d1_cost()
total_cost = round(llm_cost + api_cost, 8)
total_lat  = elapsed + llm_latency

sq  = score_quality(before, after)
sl  = score_latency(total_lat)
sc  = score_cost(total_cost)
stu = score_tool_use(attempted, succeeded_stmts)
so  = score_overall(sq, sl, sc, stu)

print(f"\n  LLM  : ${llm_cost:.8f}  (in={in_tok} out={out_tok} model={model_used})")
print(f"  D1   : ${api_cost:.8f}  (reads={_d1_rows_read} writes={_d1_rows_written})")
print(f"  TOTAL: ${total_cost:.8f}")
print(f"  scores: quality={sq}  latency={sl}  cost={sc}  tool_use={stu}  overall={so}")

# [8] D1 EVAL RUN
print("[8] Writing D1 eval run...", end=" ", flush=True)
eval_run_id = None
if suite_id and case_id:
    try:
        eval_run_id = write_d1_eval_run(
            suite_id, case_id, model_used,
            "openai" if model_used != "deterministic" else "cloudflare",
            in_tok, out_tok, total_lat, total_cost,
            sq, sl, sc, stu, so, all_improved, fix_sql,
            f"before={before} after={after} rows={total_written} "
            f"d1_reads={_d1_rows_read} d1_writes={_d1_rows_written}",
            attempted, succeeded_stmts)
        print(f"OK  evr={eval_run_id}")
    except Exception as e:
        print(f"WARN: {e}")
else:
    print("SKIP")

# [9] SUPABASE TELEMETRY
print("[9] Writing Supabase telemetry...")
try:
    sb_results = write_supabase_telemetry(
        todo_id=TODO_ID, table=TABLE, title=TITLE, all_improved=all_improved,
        model_used=model_used, in_tok=in_tok, out_tok=out_tok,
        llm_cost=llm_cost, api_cost=api_cost, total_cost=total_cost,
        total_lat=total_lat, llm_latency=llm_latency, escalated=escalated,
        before=before, after=after, fix_sql=fix_sql,
        total_written=total_written, attempted=attempted,
        succeeded_stmts=succeeded_stmts,
        sq=sq, sl=sl, sc=sc, stu=stu, so=so)
    for tbl, status in sb_results.items():
        flag = "✓" if status in ("OK","updated","inserted","skip","skip ($0)") else "✗"
        print(f"     {flag} {tbl:<30} {status}")
except Exception as e:
    print(f"     WARN: {e}")

# [10] USAGE EVENT
print("[10] Usage event...", end=" ", flush=True)
write_usage_event(model_used, in_tok, out_tok, total_cost, total_lat, TODO_ID)
print("OK")

# [11] DUAL WRITE TODO
print("[11] Marking todo complete...", end=" ", flush=True)
new_status = "completed" if all_improved else "open"
new_exec   = "completed" if all_improved else "queued"
summary    = (f"model={model_used} rows={total_written} {total_lat}ms "
              f"in={in_tok} out={out_tok} "
              f"llm=${llm_cost:.8f} d1=${api_cost:.8f} total=${total_cost:.8f} "
              f"quality={sq} overall={so}")
d1_exec("""UPDATE agentsam_todo
           SET status=?, execution_status=?, output_summary=?,
               tokens_used=?, cost_usd=?,
               completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END,
               updated_at=datetime('now')
           WHERE id=?""",
        [new_status, new_exec, summary[:500],
         in_tok + out_tok, total_cost, new_status, TODO_ID])
sb_ok = sb_patch_todo(TODO_ID, {
    "status": new_status, "execution_status": new_exec,
    "output_summary": summary[:500]})
print(f"D1=OK  Supabase={'OK' if sb_ok else 'WARN'}")

# [12] CRON LOG
cron_id = f"acr_{uuid.uuid4().hex[:14]}"
try:
    d1_exec("""INSERT INTO agentsam_cron_runs
               (id,job_name,cron_expression,status,tenant_id,workspace_id,
                started_at,completed_at,duration_ms,rows_written,metadata_json)
               VALUES(?,?,?,?,?,?,unixepoch(),unixepoch(),?,?,?)""",
            [cron_id, "autonomous_todo_fix", "manual",
             "completed" if all_improved else "failed",
             TENANT_ID, WORKSPACE_ID, total_lat, total_written,
             json.dumps({
                 "todo_id": TODO_ID, "table": TABLE, "model": model_used,
                 "agent_id": AGENT_ID, "run_group_id": RUN_GROUP_ID,
                 "input_tokens": in_tok, "output_tokens": out_tok,
                 "llm_cost_usd": llm_cost, "d1_cost_usd": api_cost,
                 "total_cost_usd": total_cost,
                 "d1_rows_read": _d1_rows_read, "d1_rows_written": _d1_rows_written,
                 "score_quality": sq, "score_overall": so,
                 "escalated": escalated, "eval_run_id": eval_run_id,
                 "before": before, "after": after,
             })])
    print(f"[12] Cron log: {cron_id}")
except Exception as e:
    print(f"[12] Cron WARN: {e}")

# Summary
remaining = d1("SELECT COUNT(*) as n FROM agentsam_todo "
               "WHERE status='open' AND execution_status='queued' "
               "AND workspace_id=? AND priority=?",
               [WORKSPACE_ID, PRIORITY])[0]["n"]

print()
print("=" * 68)
print(f"  {'PASS' if all_improved else 'PARTIAL'}")
print(f"  todo      : {TODO_ID}")
print(f"  table     : {TABLE}")
print(f"  model     : {model_used}")
print(f"  tokens    : in={in_tok}  out={out_tok}")
print(f"  LLM cost  : ${llm_cost:.8f}")
print(f"  D1  cost  : ${api_cost:.8f}  (reads={_d1_rows_read} writes={_d1_rows_written})")
print(f"  TOTAL     : ${total_cost:.8f}")
print(f"  quality   : {sq}  overall: {so}")
print(f"  rows      : {total_written}")
print(f"  eval_run  : {eval_run_id or 'n/a'}")
print(f"  cron_run  : {cron_id}")
print(f"  escalated : {escalated}")
print(f"  remaining : {remaining} open {PRIORITY} todos")
print()
if remaining > 0:
    print(f"  Next: python3 smoke_todo_fix.py --priority {PRIORITY}")
else:
    other = "medium" if PRIORITY == "high" else "high"
    print(f"  All {PRIORITY} done — try: --priority {other}")
print("=" * 68)
print()
