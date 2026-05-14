from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
DB = 'inneranimalmedia-business'
CONFIG = 'wrangler.production.toml'

PLAN_ID = 'plan_agentsam_parallel_cms_workers_20260515'
TENANT_ID = 'tenant_sam_primeaux'
WORKSPACE_ID = 'ws_inneranimalmedia'

PRIMARY_URL = 'https://agentsam-cms-editor.meauxbility.workers.dev'
DEBUG_URL = 'https://agentsam-cms-app.meauxbility.workers.dev'


def q(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def j(v):
    return json.dumps(v, separators=(',', ':'))


def d1(sql, dry_run=False):
    if dry_run:
        print('\n--- DRY RUN SQL ---')
        print(sql)
        print('--- END SQL ---\n')
        return []

    cmd = [
        'npx', 'wrangler', 'd1', 'execute', DB,
        '--remote', '-c', CONFIG, '--json', '--command', sql
    ]

    p = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, timeout=180)

    if p.returncode != 0:
        print(p.stdout)
        print(p.stderr, file=sys.stderr)
        raise SystemExit(p.returncode)

    try:
        data = json.loads(p.stdout)
        return data[0].get('results', []) if data else []
    except Exception:
        return []


def make_sql():
    budget = {
        'budget_usd': 2.00,
        'parallel_test': True,
        'preferred_builder_model': 'gpt-5.4-mini',
        'branches': {
            'A': {
                'branch_key': 'cms_editor_primary',
                'worker': 'agentsam-cms-editor',
                'url': PRIMARY_URL,
                'r2_prefix': 'cms/builds/editor-p1/{run_group_id}/'
            },
            'B': {
                'branch_key': 'cms_app_debug',
                'worker': 'agentsam-cms-app',
                'url': DEBUG_URL,
                'r2_prefix': 'cms/builds/app-debug/{run_group_id}/'
            }
        }
    }

    plan = f"""
INSERT OR REPLACE INTO agentsam_plans (
  id, tenant_id, workspace_id, session_id, agent_id, client_id, client_name,
  plan_date, plan_type, title, status, morning_brief, session_notes,
  available_providers, blocked_providers, budget_snapshot, default_model,
  token_budget, tokens_used, cost_usd, carry_over_count, tasks_total,
  tasks_done, tasks_blocked, linked_project_keys, linked_todo_ids,
  linked_context_ids, created_at, updated_at, graph_mode, risk_level,
  requires_approval, r2_prefix
)
VALUES (
  {q(PLAN_ID)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)},
  'parallel_cms_workers_20260515', 'agent_sam', 'inneranimalmedia',
  'Inner Animal Media', '2026-05-15', 'feature',
  'Agent Sam Parallel CMS Workers — Primary Editor Build + Debug App Repair',
  'active',
  'Run two CMS Worker branches in parallel to test Agent Sam multitasking.',
  'Branch A owns agentsam-cms-editor. Branch B owns agentsam-cms-app. Debug app currently fails with React is not defined. No shared R2 overwrites. No new Worker names.',
  {q(j(['openai','anthropic','google','workers_ai']))},
  {q(j([]))},
  {q(j(budget))},
  'gpt-5.4-mini',
  150000, 0, 0, 0, 5, 0, 0,
  {q(j(['cms-editor','agentsam-cms-editor','agentsam-cms-app','parallel-workers']))},
  {q(j([]))},
  {q(j([]))},
  unixepoch(), unixepoch(), 1, 'high', 1,
  'cms/plans/20260515/parallel-cms-workers/'
);
"""

    delete_tasks = f"DELETE FROM agentsam_plan_tasks WHERE plan_id = {q(PLAN_ID)};"

    tasks = [
        (
            'task_parallel_cms_000_preflight_locks',
            0,
            'Preflight shared locks and branch boundaries',
            'Verify both Workers exist, confirm branch-specific R2 prefixes, and prevent shared overwrite keys before parallel execution.',
            'P0',
            'infra',
            'gpt-5.4-mini',
            'parallel_preflight_locks',
            'terminal',
            'high',
            1,
            [],
            {
                'must_pass': [
                    'workers list confirms agentsam-cms-editor exists',
                    'workers list confirms agentsam-cms-app exists',
                    'no new Worker names planned',
                    'R2 prefixes are branch-specific'
                ]
            }
        ),
        (
            'task_parallel_cms_A_primary_editor',
            10,
            'PARALLEL A — Build working agentsam-cms-editor',
            'Primary branch. Continue building the visually working CMS editor. Preserve existing shell and deploy only to agentsam-cms-editor.',
            'P0',
            'frontend',
            'gpt-5.4-mini',
            'cms_editor_primary_build',
            'agent',
            'high',
            1,
            ['task_parallel_cms_000_preflight_locks'],
            {
                'parallel_branch': 'A',
                'branch_key': 'cms_editor_primary',
                'worker': 'agentsam-cms-editor',
                'must_pass': ['root UI renders', 'health endpoint passes', 'no blank screen']
            }
        ),
        (
            'task_parallel_cms_B_debug_app',
            11,
            'PARALLEL B — Debug failed agentsam-cms-app React runtime',
            'Debug branch. Repair app.js React is not defined issue. This is debug/eval only, not the primary editor.',
            'P1',
            'frontend',
            'gpt-5.4-mini',
            'cms_app_react_global_debug',
            'agent',
            'medium',
            0,
            ['task_parallel_cms_000_preflight_locks'],
            {
                'parallel_branch': 'B',
                'branch_key': 'cms_app_debug',
                'worker': 'agentsam-cms-app',
                'known_error': 'React is not defined at app.js:1:42'
            }
        ),
        (
            'task_parallel_cms_020_patch_branch_env_support',
            20,
            'Add branch-aware env support to deploy/build scripts',
            'Patch scripts to capture branch_key, R2 prefix, run_group_id, Worker name, metrics, and dry-run targets.',
            'P0',
            'backend',
            'gpt-5.4-mini',
            'patch_branch_env_support',
            'script',
            'medium',
            1,
            ['task_parallel_cms_000_preflight_locks'],
            {
                'must_pass': ['py_compile passes', 'dry run prints branch_key', 'dry run prints R2 prefix']
            }
        ),
        (
            'task_parallel_cms_030_parallel_dry_run',
            30,
            'Run both branches in dry-run mode simultaneously',
            'Run both branch scripts at same time in dry-run mode and capture collisions before real deploy.',
            'P0',
            'infra',
            'gpt-5.4-mini',
            'parallel_dry_run',
            'parallel',
            'medium',
            0,
            ['task_parallel_cms_020_patch_branch_env_support'],
            {
                'must_pass': ['Branch A targets agentsam-cms-editor', 'Branch B targets agentsam-cms-app', 'R2 prefixes differ']
            }
        )
    ]

    inserts = []

    for tid, order_index, title, desc, priority, category, model, handler_key, handler_type, risk, approval, depends, gate in tasks:
        files = ['scripts/deploy_cms_editor_live.py', 'scripts/agentsam_cms_overnight_build.py']
        tables = ['agentsam_plans', 'agentsam_plan_tasks', 'agentsam_scripts', 'agentsam_workflow_runs', 'agentsam_agent_run']
        routes = [PRIMARY_URL + '/', PRIMARY_URL + '/health', DEBUG_URL + '/', DEBUG_URL + '/health']

        inserts.append(f"""
INSERT OR REPLACE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, agent_id, assigned_model,
  order_index, title, description, priority, category, status,
  files_involved, tables_involved, routes_involved, depends_on,
  estimated_minutes, notes, quality_gate_json, node_key, handler_key,
  handler_type, risk_level, requires_approval, edge_taken, created_at
)
VALUES (
  {q(tid)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(PLAN_ID)},
  'agent_sam', {q(model)}, {order_index}, {q(title)}, {q(desc)},
  {q(priority)}, {q(category)}, 'todo',
  {q(j(files))}, {q(j(tables))}, {q(j(routes))}, {q(j(depends))},
  60,
  'Seeded for parallel CMS Worker pressure test. Branch A primary editor, Branch B debug app.',
  {q(j(gate))},
  {q(tid)}, {q(handler_key)}, {q(handler_type)}, {q(risk)}, {approval},
  'parallel_start',
  unixepoch()
);
""")

    update_plan = f"""
UPDATE agentsam_plans
SET tasks_total = 5,
    tasks_done = 0,
    tasks_blocked = 0,
    updated_at = unixepoch()
WHERE id = {q(PLAN_ID)};
"""

    return '\n\n'.join([plan, delete_tasks] + inserts + [update_plan])


def verify_sql():
    return f"""
SELECT id, title, status, plan_type, default_model, token_budget, tasks_total, graph_mode, risk_level, requires_approval, r2_prefix
FROM agentsam_plans
WHERE id = {q(PLAN_ID)};

SELECT order_index, id, priority, category, status, assigned_model, handler_type, risk_level, requires_approval, title
FROM agentsam_plan_tasks
WHERE plan_id = {q(PLAN_ID)}
ORDER BY order_index;
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()

    if args.verify_only:
        rows = d1(verify_sql(), dry_run=args.dry_run)
        print(json.dumps(rows, indent=2))
        return

    d1(make_sql(), dry_run=args.dry_run)

    if args.dry_run:
        print('DRY RUN complete. No D1 writes executed.')
        print('Plan ID would be:', PLAN_ID)
        return

    print('Seeded plan:', PLAN_ID)
    print('Verification:')
    rows = d1(verify_sql())
    print(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
