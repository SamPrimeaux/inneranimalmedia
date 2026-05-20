#!/usr/bin/env python3
"""
Audit agentsam_* table wiring across src/.
Surfaces: dead tables (0 refs), overlap candidates, T008/T009 agent_run_id gaps,
patch_sessions vs change_sets overlap, approval_queue alignment with T003.
"""
import subprocess, re
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
SRC  = ROOT / 'src'

# ── All agentsam_* tables visible in D1 Studio screenshots ──────────────────
TABLES = [
    'agentsam_agent_run',
    'agentsam_ai',
    'agentsam_analytics',
    'agentsam_approval_queue',
    'agentsam_artifact_skills',
    'agentsam_artifacts',
    'agentsam_bootstrap',
    'agentsam_browser_trusted_origin',
    'agentsam_cad_jobs',
    'agentsam_capability_aliases',
    'agentsam_code_index_job',
    'agentsam_command_allowlist',
    'agentsam_command_pattern',
    'agentsam_command_run',
    'agentsam_commands',
    'agentsam_compaction_events',
    'agentsam_context_digest',
    'agentsam_cron_runs',
    'agentsam_deployment_health',
    'agentsam_error_log',
    'agentsam_escalation',
    'agentsam_eval_cases',
    'agentsam_eval_runs',
    'agentsam_eval_suites',
    'agentsam_execution_context',
    'agentsam_execution_dependency_gra',
    'agentsam_execution_performance_me',
    'agentsam_execution_steps',
    'agentsam_executions',
    'agentsam_feature_flag',
    'agentsam_fetch_domain_allowlist',
    'agentsam_guardrail_rulesets',
    'agentsam_guardrails',
    'agentsam_health_daily',
    'agentsam_hook',
    'agentsam_hook_execution',
    'agentsam_ignore_pattern',
    'agentsam_mcp_allowlist',
    'agentsam_mcp_servers',
    'agentsam_mcp_tool_execution',
    'agentsam_mcp_tools',
    'agentsam_mcp_workflows',
    'agentsam_memory',
    'agentsam_model_catalog',
    'agentsam_model_drift_signals',
    'agentsam_model_routing_memory',
    'agentsam_model_tier',
    'agentsam_patch_sessions',
    'agentsam_plan_tasks',
    'agentsam_plans',
    'agentsam_project_context',
    'agentsam_prompt_cache_keys',
    'agentsam_prompt_routes',
    'agentsam_prompt_versions',
    'agentsam_route_requirements',
    'agentsam_routing_arms',
    'agentsam_rules_document',
    'agentsam_script_runs',
    'agentsam_scripts',
    'agentsam_skill',
    'agentsam_skill_invocation',
    'agentsam_skill_revision',
    'agentsam_slash_commands',
    'agentsam_subagent_profile',
    'agentsam_subscription_registry',
    'agentsam_task_slos',
    'agentsam_todo',
    'agentsam_tool_cache',
    'agentsam_tool_call_log',
    'agentsam_tool_chain',
    'agentsam_tool_stats_compacted',
    'agentsam_tools',
    'agentsam_usage_events',
    'agentsam_usage_rollups_daily',
    'agentsam_user_feature_override',
    'agentsam_user_policy',
    'agentsam_webhook_events',
    'agentsam_webhook_weekly',
    'agentsam_workflow_edges',
    'agentsam_workflow_nodes',
    'agentsam_workflow_runs',
    'agentsam_workflows',
    'agentsam_workspace',
    'agentsam_workspace_state',
]

def ref_count(table):
    """Count references to table name across all src/ JS files."""
    r = subprocess.run(
        ['grep', '-rl', table, '--include=*.js', str(SRC)],
        capture_output=True, text=True
    )
    files = [f for f in r.stdout.strip().splitlines() if f]
    return len(files), files

print('=' * 72)
print('AGENTSAM_* TABLE WIRING AUDIT')
print('=' * 72)

dead   = []
thin   = []
wired  = []

for t in TABLES:
    count, files = ref_count(t)
    if count == 0:
        dead.append(t)
    elif count <= 2:
        thin.append((t, count, files))
    else:
        wired.append((t, count))

print(f'\n{"DEAD (0 src refs) — "+str(len(dead))+" tables":}')
print('-' * 50)
for t in dead:
    print(f'  ✗  {t}')

print(f'\n{"THIN (1-2 src refs) — "+str(len(thin))+" tables":}')
print('-' * 50)
for t, c, files in thin:
    short = [f.replace(str(ROOT)+'/', '') for f in files]
    print(f'  ~  {t} ({c} file{"s" if c>1 else ""})')
    for f in short:
        print(f'       {f}')

print(f'\n{"WIRED (3+ src refs) — "+str(len(wired))+" tables":}')
print('-' * 50)
for t, c in sorted(wired, key=lambda x: -x[1]):
    print(f'  ✓  {t:<45} {c} files')

# ── Specific checks ──────────────────────────────────────────────────────────

print('\n' + '=' * 72)
print('T008/T009 — agent_run_id gap: tables that log tool activity but lack agent_run_id ref')
print('=' * 72)
targets = ['agentsam_tool_call_log', 'agentsam_tool_chain',
           'agentsam_hook_execution', 'agentsam_mcp_tool_execution',
           'agentsam_execution_steps', 'agentsam_approval_queue']
for t in targets:
    r = subprocess.run(
        ['grep', '-rn', 'agent_run_id', '--include=*.js', str(SRC)],
        capture_output=True, text=True
    )
    hits = [l for l in r.stdout.splitlines() if t.replace('agentsam_', '') in l.lower() or t in l]
    status = '✓ referenced' if hits else '✗ NOT stamped with agent_run_id'
    print(f'  {t}: {status}')
    for h in hits[:3]:
        print(f'    {h.replace(str(ROOT)+"/", "")}')

print('\n' + '=' * 72)
print('patch_sessions vs change_sets — overlap check')
print('=' * 72)
ps_refs = subprocess.run(
    ['grep', '-rn', 'patch_sessions\|agentsam_patch', '--include=*.js', str(SRC)],
    capture_output=True, text=True
).stdout.strip()
cs_refs = subprocess.run(
    ['grep', '-rn', 'change_sets', '--include=*.js', str(SRC)],
    capture_output=True, text=True
).stdout.strip()
print('patch_sessions refs in src/:')
print(ps_refs or '  (none)')
print('\nchange_sets refs in src/:')
print(cs_refs or '  (none — table created in D1 tonight, not yet wired)')

print('\n' + '=' * 72)
print('approval_queue — does T003 execute-approved-tool write to it?')
print('=' * 72)
aq = subprocess.run(
    ['grep', '-n', 'approval_queue\|appr_\|approve.*tool\|execute.*approved',
     '--include=*.js', '-r', str(SRC)],
    capture_output=True, text=True
).stdout.strip()
print(aq or '  (none found)')

print('\n' + '=' * 72)
print('capability_aliases — wiring status (carried task s19)')
print('=' * 72)
ca = subprocess.run(
    ['grep', '-rn', 'capability_aliases\|resolveAgentCommand',
     '--include=*.js', str(SRC)],
    capture_output=True, text=True
).stdout.strip()
print(ca[:2000] or '  (none found)')

print('\n' + '=' * 72)
print('subagent_profile — 42 rows, how used?')
print('=' * 72)
sp = subprocess.run(
    ['grep', '-rn', 'subagent_profile\|subagent_coder\|subagent_browser\|subagent_toolbox',
     '--include=*.js', str(SRC)],
    capture_output=True, text=True
).stdout.strip()
print(sp[:2000] or '  (none found)')

print('\n' + '=' * 72)
print('SUMMARY — actionable items')
print('=' * 72)
print(f'  Dead tables:         {len(dead)} — schema only, no runtime cost, low priority')
print(f'  Thin-wired tables:   {len(thin)} — worth reviewing for completeness')
print(f'  Healthy tables:      {len(wired)} — actively used')
print()
print('  HIGH PRIORITY (blocking plan tasks):')
print('  - agentsam_tool_call_log: add agent_run_id column (T008/T009)')
print('  - agentsam_approval_queue: confirm T003 writes here on approval')
print('  - change_sets: wired in T004/T006 (table exists, code not yet)')
print()
print('  CARRIED TASKS (from plan_session_20260514_agentsam_quality):')
print('  - capability_aliases → resolveAgentCommand (s19)')
print('  - context_digest → buildSystemPrompt (s20)')
print('  - guardrail_rulesets → evaluateGuardrails (s21)')
print()
print('  INTERESTING / INVESTIGATE:')
print('  - patch_sessions: 19 rows of real patch history — does this overlap change_sets?')
print('  - subagent_profile: 42 rows — are subagents (coder/browser/toolbox) actually dispatched?')
print('  - approval_queue: 19 rows of real approvals — T003 should write here')
