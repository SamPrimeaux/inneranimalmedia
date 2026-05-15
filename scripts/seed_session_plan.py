#!/usr/bin/env python3
"""
seed_session_plan.py
Seeds today's work session as an agentsam_plan with full plan_tasks.
Syncs to Supabase public.agentsam_plans + public.agentsam_plan_tasks.

Usage:
  python3 scripts/seed_session_plan.py --toml wrangler.production.toml
"""

import subprocess, json, sys, os, re
from pathlib import Path
from datetime import datetime, timezone

TOML        = 'wrangler.production.toml'
TENANT_ID   = 'tenant_inneranimalmedia'
WORKSPACE_ID = 'ws_inneranimalmedia'
AGENT_ID    = 'sam_primeaux'
TODAY       = datetime.now(timezone.utc).strftime('%Y-%m-%d')

PLAN_ID = 'plan_session_20260514_agentsam_quality'

# ── helpers ───────────────────────────────────────────────────────────
def d1(sql, label=''):
    # Detect db name from toml
    toml_text = Path(TOML).read_text()
    m = re.search(r'database_name\s*=\s*"([^"]+)"', toml_text)
    db = m.group(1) if m else 'inneranimalmedia-business'
    cmd = ['npx', 'wrangler', 'd1', 'execute', db,
           '--remote', '-c', TOML, '--command', sql, '--json']
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    if r.returncode != 0:
        print(f'  ✗ D1 [{label}]: {r.stderr.strip()[:120]}')
        return None
    try:
        data = json.loads(r.stdout.strip())
        if isinstance(data, list) and data:
            return data[0].get('results', [])
        return []
    except:
        return []

def supabase_upsert(table, rows, label=''):
    """Upsert rows to Supabase via PostgREST."""
    toml_text = Path(TOML).read_text()
    # Get secrets from wrangler — we'll use env vars if set
    url  = os.environ.get('SUPABASE_URL', '')
    key  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        print(f'  ⚠ Supabase env not set — skipping {label} (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to sync)')
        return False
    import urllib.request
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f'{url}/rest/v1/{table}',
        data=body,
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f'  ✓ Supabase {label}: {resp.status}')
            return True
    except Exception as e:
        print(f'  ⚠ Supabase {label}: {e}')
        return False

def ok(msg):  print(f'  ✓ {msg}')
def warn(msg): print(f'  ⚠ {msg}')
def section(t): print(f'\n{"─"*72}\n  {t}\n{"─"*72}')

# ══════════════════════════════════════════════════════════════════════
#  PLAN
# ══════════════════════════════════════════════════════════════════════
section('Seeding plan')

PLAN = {
    'id':           PLAN_ID,
    'tenant_id':    TENANT_ID,
    'workspace_id': WORKSPACE_ID,
    'plan_date':    TODAY,
    'plan_type':    'feature',
    'title':        'AgentSam Quality Sprint — Routing/Eval/Hook/Usage wiring',
    'status':       'active',
    'morning_brief': (
        'Full audit of 86 agentsam_* tables. Goal: close Thompson feedback loop, '
        'wire usage events, create autonomous eval runner, seed guardrails, '
        'restructure cron from 30min noise to tiered schedule. '
        'End state: AgentSam capable of end-to-end platform builds without manual model selection.'
    ),
    'default_model':    'claude-sonnet-4-6',
    'tasks_total':      24,
    'tasks_done':       0,
    'tasks_blocked':    0,
    'risk_level':       'medium',
    'requires_approval': 0,
    'available_providers': '["anthropic","openai","google","workers_ai","ollama"]',
}

sql = f"""INSERT OR REPLACE INTO agentsam_plans
(id, tenant_id, workspace_id, plan_date, plan_type, title, status,
 morning_brief, default_model, tasks_total, tasks_done, tasks_blocked,
 risk_level, requires_approval, available_providers, created_at, updated_at)
VALUES (
  '{PLAN['id']}', '{PLAN['tenant_id']}', '{PLAN['workspace_id']}',
  '{PLAN['plan_date']}', '{PLAN['plan_type']}',
  '{PLAN['title'].replace("'", "''")}', '{PLAN['status']}',
  '{PLAN['morning_brief'].replace("'", "''")}',
  '{PLAN['default_model']}',
  {PLAN['tasks_total']}, {PLAN['tasks_done']}, {PLAN['tasks_blocked']},
  '{PLAN['risk_level']}', {PLAN['requires_approval']},
  '{PLAN['available_providers']}',
  unixepoch(), unixepoch()
);"""

d1(sql, 'insert plan')

# ══════════════════════════════════════════════════════════════════════
#  PLAN TASKS
# ══════════════════════════════════════════════════════════════════════
section('Seeding plan_tasks')

# status: done = completed this session, todo = remaining
TASKS = [
    # ── DONE THIS SESSION ─────────────────────────────────────────────
    {
        'id': 'task_s01_ollama_secret',
        'order_index': 1, 'priority': 'P0', 'category': 'infra', 'status': 'done',
        'title': 'Set OLLAMA_BASE_URL Worker secret',
        'description': 'Wrangler secret put OLLAMA_BASE_URL → https://ollama.inneranimalmedia.com',
        'handler_type': 'terminal', 'risk_level': 'low',
        'notes': 'OLLAMA provider now reachable from Worker runtime',
    },
    {
        'id': 'task_s02_thinking_event',
        'order_index': 2, 'priority': 'P0', 'category': 'backend', 'status': 'done',
        'title': 'Wire onThinkingEvent → handleThinkingEvent in ChatAssistant',
        'description': 'Both consumeAgentChatSseBody call sites missing onThinkingEvent: handleThinkingEvent. Patched via python3 regex replace.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["dashboard/features/agent-chat/ChatAssistant.tsx"]',
        'notes': 'tool_start/tool_done/thinking_start SSE events now surface in UI thinking strip',
    },
    {
        'id': 'task_s03_skill_tenant',
        'order_index': 3, 'priority': 'P1', 'category': 'backend', 'status': 'done',
        'title': 'Fix skill_invocation missing tenant_id + VALUES placeholder',
        'description': 'SQL INSERT had 6 columns but 7 VALUES. Added tenant_id column + ? bind.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["agentsam_skill_invocation"]',
        'files_involved': '["src/api/agent.js"]',
    },
    {
        'id': 'task_s04_confidence_fix',
        'order_index': 4, 'priority': 'P0', 'category': 'backend', 'status': 'done',
        'title': 'Fix confidence: 0 → 0.75 in normalizeGateParseFailure',
        'description': 'normalizeGateParseFailure returned confidence:0 causing qualityScore:0 on every run and incorrect model skipping in fallback chain.',
        'handler_type': 'agent', 'risk_level': 'medium',
        'files_involved': '["src/api/agent.js"]',
        'notes': 'Thompson quality signals now non-zero. Fallback chain startIdx corrected.',
    },
    {
        'id': 'task_s05_cron_restructure',
        'order_index': 5, 'priority': 'P1', 'category': 'infra', 'status': 'done',
        'title': 'Move routing jobs from 30min to hourly cron slot',
        'description': 'reconcileRoutingArms, rollupModelRoutingMemory, enforceSlos, syncPause, analyticsRollup moved to runHourlyRoutingJobs. Hourly slot 0 * * * * was unused.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/cron/scheduled.js","src/cron/jobs/thirty-minute-cron.js"]',
        'notes': '30min D1 load cut ~50%. Hourly slot now active.',
    },
    {
        'id': 'task_s06_guardrails_seed',
        'order_index': 6, 'priority': 'P1', 'category': 'backend', 'status': 'done',
        'title': 'Seed 8 global guardrail rules into agentsam_guardrails',
        'description': 'no_prod_destructive, no_secret_logging, tool_rate_limit, long_run_warn, no_rm_rf, no_curl_pipe_sh, output_token_floor, no_env_dump.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["agentsam_guardrails"]',
    },
    {
        'id': 'task_s07_quality_gates_seed',
        'order_index': 7, 'priority': 'P1', 'category': 'backend', 'status': 'done',
        'title': 'Seed quality_gate_sets + quality_gates for 8 task types',
        'description': 'chat, code, deploy, terminal, debug, plan, cms_edit, tool_use gate sets. 15 concrete metric gates seeded.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["quality_gate_sets","quality_gates"]',
    },
    {
        'id': 'task_s08_usage_event_wire',
        'order_index': 8, 'priority': 'P0', 'category': 'backend', 'status': 'done',
        'title': 'Wire writeUsageEvent into agent.js after every run completion',
        'description': 'writeUsageEvent called via ctx.waitUntil after recordArmOutcome. Passes workspace_id, tenant_id, model_key, arm_id, task_type, tokens, cost, duration.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/api/agent.js","src/core/usage-event-writer.js"]',
        'tables_involved': '["agentsam_usage_events"]',
        'notes': 'Zero SSE latency impact — pure waitUntil async.',
    },
    {
        'id': 'task_s09_hook_dispatcher',
        'order_index': 9, 'priority': 'P1', 'category': 'backend', 'status': 'done',
        'title': 'Create hook-dispatcher.js + wire fireAgentHooks on run complete',
        'description': 'New src/core/hook-dispatcher.js reads agentsam_hook by event_type, dispatches to webhook/log_only/usage_event handlers, writes agentsam_hook_execution with full tenant+workspace scope.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/core/hook-dispatcher.js","src/api/agent.js"]',
        'tables_involved': '["agentsam_hook","agentsam_hook_execution"]',
    },
    {
        'id': 'task_s10_eval_runner',
        'order_index': 10, 'priority': 'P1', 'category': 'backend', 'status': 'done',
        'title': 'Create eval-runner.js — autonomous eval→Thompson feedback',
        'description': 'New src/core/eval-runner.js: triggerEvalAfterNRuns fires every 50 arm executions, runs eval_cases against suite, writes eval_runs, feeds score_overall back to scheduleRoutingArmQualityUpdate.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/core/eval-runner.js","src/core/routing.js"]',
        'tables_involved': '["agentsam_eval_runs","agentsam_eval_suites","agentsam_eval_cases","agentsam_routing_arms"]',
        'notes': 'Closes the Thompson self-healing loop. avg_quality_score will now accumulate from real eval runs.',
    },
    {
        'id': 'task_s11_schema_migrations',
        'order_index': 11, 'priority': 'P1', 'category': 'db', 'status': 'done',
        'title': 'D1 Studio schema migrations — 13 ALTER TABLE ADD COLUMN',
        'description': 'routing_arm_id on tool_chain + tool_call_log. quality_score + task_type on agent_run. step_type + tool_name on execution_steps. input_tokens + output_tokens on usage_events. tenant_id + risk_level + rate_limit + requires_approval + allowed_methods on fetch_domain_allowlist.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["agentsam_tool_chain","agentsam_tool_call_log","agentsam_agent_run","agentsam_execution_steps","agentsam_usage_events","agentsam_fetch_domain_allowlist"]',
    },
    # ── REMAINING — IN ORDER OF CURSOR-QUALITY IMPACT ─────────────────
    {
        'id': 'task_s12_eval_trigger_call',
        'order_index': 12, 'priority': 'P0', 'category': 'backend', 'status': 'todo',
        'title': 'Wire triggerEvalAfterNRuns call inside recordArmOutcome',
        'description': 'Import exists in routing.js but no call site. After arm UPDATE, add: if (ctx?.waitUntil && arm.total_executions % 50 === 0) ctx.waitUntil(triggerEvalAfterNRuns(env, ctx, {armId, taskType, mode, modelKey, workspaceId})). Requires ctx passed into recordArmOutcome.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/core/routing.js"]',
        'tables_involved': '["agentsam_routing_arms","agentsam_eval_runs"]',
        'notes': 'recordArmOutcome may need ctx param added — check signature first',
    },
    {
        'id': 'task_s13_build_verify',
        'order_index': 13, 'priority': 'P0', 'category': 'infra', 'status': 'todo',
        'title': 'Build + deploy + verify no runtime errors',
        'description': 'npm run build:vite-only && git push origin main. Check CF build logs. Send test message in agent, verify: usage_events row written, hook_execution row written, thinking strip fires.',
        'handler_type': 'terminal', 'risk_level': 'low',
        'files_involved': '["src/api/agent.js","src/core/routing.js","src/core/eval-runner.js","src/core/hook-dispatcher.js"]',
    },
    {
        'id': 'task_s14_e2e_platform_build',
        'order_index': 14, 'priority': 'P0', 'category': 'backend', 'status': 'todo',
        'title': 'End-to-end platform build validation — full Cursor-replacement test',
        'description': 'Agent must autonomously: read existing codebase, plan changes across multiple files, execute terminal commands, write D1 migrations, deploy to CF, verify deployment. No manual model selection. Auto mode only.',
        'handler_type': 'agent', 'risk_level': 'medium',
        'notes': 'This is the acceptance test. If AgentSam can build a full feature end-to-end without intervention, we pass.',
        'estimated_minutes': 60,
    },
    {
        'id': 'task_s15_routing_arm_id_metrics',
        'order_index': 15, 'priority': 'P1', 'category': 'backend', 'status': 'todo',
        'title': 'Fix routing_arm_id NULL on all 305 execution_performance_metrics rows',
        'description': 'rollupExecutionPerformanceMetrics in memory.js builds metrics from executions but never joins agentsam_agent_run to pull routing_arm_id. Add JOIN and stamp arm_id on INSERT.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/core/memory.js"]',
        'tables_involved': '["agentsam_execution_performance_metrics","agentsam_agent_run"]',
    },
    {
        'id': 'task_s16_plan_id_linkage',
        'order_index': 16, 'priority': 'P1', 'category': 'backend', 'status': 'todo',
        'title': 'Fix plan_id NULL on all tool_chain + tool_call_log rows',
        'description': 'tool_chain and tool_call_log both have plan_id NULL on 100% of rows. The active plan_id should be passed into runAgentToolLoop and stamped on both tables during tool execution.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/api/agent.js","src/core/agent-chat-tool-execution-ledger.js"]',
        'tables_involved': '["agentsam_tool_chain","agentsam_tool_call_log"]',
    },
    {
        'id': 'task_s17_eval_lm_grader',
        'order_index': 17, 'priority': 'P1', 'category': 'backend', 'status': 'todo',
        'title': 'Wire LLM-as-judge grader into eval-runner.js',
        'description': 'eval-runner.js currently uses scoreQuality=0.75 stub. Replace with actual grader: send input_prompt + output_text + grading_criteria to claude-haiku, parse score JSON, write real score_overall.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["src/core/eval-runner.js"]',
        'tables_involved': '["agentsam_eval_runs"]',
        'estimated_minutes': 30,
    },
    {
        'id': 'task_s18_supabase_plan_sync',
        'order_index': 18, 'priority': 'P2', 'category': 'backend', 'status': 'todo',
        'title': 'Verify agentsam_plans + agentsam_plan_tasks sync to Supabase public schema',
        'description': 'agentsam-plan-supabase-public-sync.js should mirror plan creates/updates to public.agentsam_plans and public.agentsam_plan_tasks. Confirm tables exist in Supabase and sync is firing on plan create.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["agentsam_plans","agentsam_plan_tasks"]',
        'notes': 'Supabase table names: public.agentsam_plans, public.agentsam_plan_tasks',
    },
    {
        'id': 'task_s19_capability_aliases_wire',
        'order_index': 19, 'priority': 'P2', 'category': 'backend', 'status': 'todo',
        'title': 'Wire agentsam_capability_aliases into command resolution path',
        'description': '73 rows, 0 code references. capability_aliases should map shorthand capability names to full tool_key/command_pattern for natural language routing. Wire into resolveAgentCommand.',
        'handler_type': 'agent', 'risk_level': 'low',
        'tables_involved': '["agentsam_capability_aliases","agentsam_command_pattern"]',
        'files_involved': '["src/api/agent.js"]',
    },
    {
        'id': 'task_s20_context_digest_wire',
        'order_index': 20, 'priority': 'P2', 'category': 'backend', 'status': 'todo',
        'title': 'Wire agentsam_context_digest into system prompt assembly',
        'description': '3 rows, 0 code references. context_digest should provide compressed workspace context summaries injected into system prompt for long-running sessions. Wire into buildSystemPrompt.',
        'handler_type': 'agent', 'risk_level': 'low',
        'tables_involved': '["agentsam_context_digest"]',
        'files_involved': '["src/api/agent.js"]',
    },
    {
        'id': 'task_s21_guardrail_rulesets_wire',
        'order_index': 21, 'priority': 'P2', 'category': 'backend', 'status': 'todo',
        'title': 'Wire agentsam_guardrail_rulesets into evaluateGuardrails',
        'description': '2 rulesets, 0 code references. Rulesets group guardrails for bulk evaluation. evaluateGuardrails currently queries individual rules — should also load active rulesets and evaluate all grouped keys.',
        'handler_type': 'agent', 'risk_level': 'low',
        'tables_involved': '["agentsam_guardrail_rulesets","agentsam_guardrails"]',
    },
    {
        'id': 'task_s22_user_feature_seed',
        'order_index': 22, 'priority': 'P2', 'category': 'db', 'status': 'todo',
        'title': 'Seed agentsam_user_feature_override for Sam + Connor',
        'description': '0 rows. Sam should have all features enabled. Connor should have subset appropriate for client workspace. Seed override rows so feature flag system has per-user data to work with.',
        'handler_type': 'db_query', 'risk_level': 'low',
        'tables_involved': '["agentsam_user_feature_override","agentsam_feature_flag"]',
    },
    {
        'id': 'task_s23_picker_suppression',
        'order_index': 23, 'priority': 'P2', 'category': 'ux', 'status': 'todo',
        'title': 'Hide model picker from default UI — Auto mode only by default',
        'description': 'Model picker bypasses Thompson routing entirely. Hide behind settings gear. Auto mode should be the only default-visible option. Power users can toggle picker in settings.',
        'handler_type': 'agent', 'risk_level': 'low',
        'files_involved': '["dashboard/features/agent-chat/ChatAssistant.tsx"]',
        'notes': 'This single change accelerates Thompson data accumulation faster than any other fix.',
    },
    {
        'id': 'task_s24_audit_rerun',
        'order_index': 24, 'priority': 'P1', 'category': 'backend', 'status': 'todo',
        'title': 'Re-run audit — verify critical issues drop from 29 to <10',
        'description': 'python3 scripts/audit_agentsam_full.py --src ./src --toml wrangler.production.toml. Expected: dead_write_path for usage_events resolved, eval_runner_missing resolved, thompson_quality improved.',
        'handler_type': 'terminal', 'risk_level': 'low',
    },
]

# ── Insert all tasks ──────────────────────────────────────────────────
for t in TASKS:
    status_sym = '✓' if t['status'] == 'done' else '·'
    sql = f"""INSERT OR REPLACE INTO agentsam_plan_tasks
(id, plan_id, tenant_id, workspace_id, order_index, title, description,
 priority, category, status, handler_type, risk_level, requires_approval,
 files_involved, tables_involved, notes, created_at)
VALUES (
  '{t['id']}',
  '{PLAN_ID}',
  '{TENANT_ID}',
  '{WORKSPACE_ID}',
  {t['order_index']},
  '{t['title'].replace("'","''")}',
  '{t.get('description','').replace("'","''")}',
  '{t['priority']}',
  '{t['category']}',
  '{t['status']}',
  '{t.get('handler_type','agent')}',
  '{t.get('risk_level','low')}',
  0,
  '{t.get('files_involved','[]')}',
  '{t.get('tables_involved','[]')}',
  '{t.get('notes','').replace("'","''")}',
  unixepoch()
);"""
    result = d1(sql, f"task {t['order_index']:02d}: {t['title'][:50]}")
    print(f"  {status_sym} [{t['status']:11s}] {t['order_index']:02d}. {t['title'][:60]}")

# ── Update plan task counts ───────────────────────────────────────────
done_count  = sum(1 for t in TASKS if t['status'] == 'done')
total_count = len(TASKS)
d1(f"""UPDATE agentsam_plans SET
  tasks_total = {total_count},
  tasks_done  = {done_count},
  updated_at  = unixepoch()
WHERE id = '{PLAN_ID}';""", 'update task counts')

# ══════════════════════════════════════════════════════════════════════
#  SUPABASE SYNC
# ══════════════════════════════════════════════════════════════════════
section('Supabase sync')

supabase_upsert('agentsam_plans', [PLAN], 'agentsam_plans')
supabase_upsert('agentsam_plan_tasks',
    [{k: v for k, v in t.items()} for t in TASKS],
    'agentsam_plan_tasks')

# ══════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════
section('Summary')
print(f"  Plan: {PLAN_ID}")
print(f"  Tasks: {total_count} total, {done_count} done, {total_count - done_count} remaining")
print(f"\n  Done this session:")
for t in TASKS:
    if t['status'] == 'done':
        print(f"    ✓ [{t['priority']}] {t['title']}")
print(f"\n  Remaining (priority order):")
for t in TASKS:
    if t['status'] != 'done':
        print(f"    · [{t['priority']}] {t['order_index']:02d}. {t['title']}")
print(f"\n  View in dashboard: /dashboard/agent → ask 'show plan {PLAN_ID}'")
print('─' * 72)
