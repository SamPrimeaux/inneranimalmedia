#!/usr/bin/env python3
"""
audit_agentsam_full.py
Full audit of agentsam_* D1 tables vs codebase.
Identifies: dead tables, unwired write paths, null FK linkages,
orphaned exports, schema mismatches, cron coverage gaps,
eval→Thompson feedback breaks, and Cursor-quality blockers.

Usage:
  python3 audit_agentsam_full.py [--src ./src] [--toml wrangler.production.toml]
"""

import subprocess, json, re, sys, os, argparse
from pathlib import Path
from collections import defaultdict

# ── CLI args ──────────────────────────────────────────────────────────────────
ap = argparse.ArgumentParser()
ap.add_argument('--src',  default='./src',                      help='Source directory')
ap.add_argument('--toml', default='wrangler.production.toml',   help='Wrangler config')
ap.add_argument('--out',  default='audit_agentsam_report.json', help='JSON report output')
ap.add_argument('--db',   default=None,                         help='D1 database name (auto-detected if omitted)')
args = ap.parse_args()

SRC  = Path(args.src)
TOML = args.toml
OUT  = Path(args.out)

SEP  = '─' * 72
PASS = '✓'
WARN = '⚠'
FAIL = '✗'
INFO = '·'

issues   = []   # (severity, category, table, message)
findings = {}   # structured output

def log(sym, cat, tbl, msg):
    print(f"  {sym} [{cat}] {tbl}: {msg}")
    issues.append({'severity': sym, 'category': cat, 'table': tbl, 'message': msg})

# ── D1 helpers ────────────────────────────────────────────────────────────────
def d1(sql, db_name=None):
    cmd = ['npx', 'wrangler', 'd1', 'execute']
    if db_name:
        cmd += [db_name]
    else:
        # try to auto-detect from toml
        try:
            toml_text = Path(TOML).read_text()
            m = re.search(r'database_name\s*=\s*"([^"]+)"', toml_text)
            if m:
                cmd += [m.group(1)]
        except:
            pass
    cmd += ['--remote', '-c', TOML, '--command', sql, '--json']
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        raw = r.stdout.strip()
        if not raw:
            return []
        data = json.loads(raw)
        if isinstance(data, list) and data:
            return data[0].get('results', [])
        return []
    except Exception as e:
        return []

def pragma(table):
    return d1(f"PRAGMA table_info({table});")

def row_count(table):
    rows = d1(f"SELECT COUNT(*) as n FROM {table};")
    return rows[0]['n'] if rows else -1

def null_count(table, col):
    rows = d1(f"SELECT COUNT(*) as n FROM {table} WHERE {col} IS NULL;")
    return rows[0]['n'] if rows else -1

def total_count(table):
    return row_count(table)

# ── Codebase helpers ──────────────────────────────────────────────────────────
def scan_src():
    """Return dict: filename → full text for all .js files under SRC."""
    files = {}
    for p in SRC.rglob('*.js'):
        try:
            files[str(p)] = p.read_text(errors='replace')
        except:
            pass
    return files

def grep_all(pattern, files):
    """Return list of (file, lineno, line) matching regex pattern."""
    rx = re.compile(pattern)
    hits = []
    for fname, text in files.items():
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line) and not line.strip().startswith('//') and not line.strip().startswith('*'):
                hits.append((fname, i, line.strip()))
    return hits

def export_names(files):
    """All exported function/const names across codebase."""
    rx = re.compile(r'export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)')
    names = defaultdict(list)
    for fname, text in files.items():
        for m in rx.finditer(text):
            names[m.group(1)].append(fname)
    return names

def import_names(files):
    """All imported names."""
    rx = re.compile(r'import\s*\{([^}]+)\}\s*from')
    names = defaultdict(list)
    for fname, text in files.items():
        for m in rx.finditer(text):
            for name in m.group(1).split(','):
                names[name.strip()].append(fname)
    return names

# ── Section printers ──────────────────────────────────────────────────────────
def section(title):
    print(f"\n{SEP}\n  {title}\n{SEP}")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — discover all agentsam_* tables
# ══════════════════════════════════════════════════════════════════════════════
section("1 · Discovering agentsam_* tables")

all_tables_raw = d1("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' ORDER BY name;")
ALL_TABLES = [r['name'] for r in all_tables_raw]
print(f"  Found {len(ALL_TABLES)} agentsam_* tables")

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — row counts + schema for every table
# ══════════════════════════════════════════════════════════════════════════════
section("2 · Row counts & schema")

table_info = {}
for t in ALL_TABLES:
    cols = pragma(t)
    cnt  = row_count(t)
    col_names = [c['name'] for c in cols]
    table_info[t] = {'cols': col_names, 'col_meta': cols, 'rows': cnt}
    sym = PASS if cnt > 0 else WARN
    print(f"  {sym} {t}: {cnt} rows, {len(col_names)} cols")

findings['table_counts'] = {t: table_info[t]['rows'] for t in ALL_TABLES}

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3 — scan codebase
# ══════════════════════════════════════════════════════════════════════════════
section("3 · Scanning codebase")

print("  Loading .js files...")
FILES = scan_src()
print(f"  Loaded {len(FILES)} JS files")

EXPORTS = export_names(FILES)
IMPORTS = import_names(FILES)

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4 — table reference analysis
# ══════════════════════════════════════════════════════════════════════════════
section("4 · Table reference analysis (reads vs writes)")

ref_report = {}
for t in ALL_TABLES:
    all_refs  = grep_all(re.escape(t), FILES)
    write_refs = [h for h in all_refs if re.search(r'INSERT\s+INTO|UPDATE\s+' + re.escape(t), h[2], re.I)]
    read_refs  = [h for h in all_refs if re.search(r'SELECT|FROM\s+' + re.escape(t), h[2], re.I)]
    other_refs = [h for h in all_refs if h not in write_refs and h not in read_refs]

    ref_report[t] = {
        'total_refs': len(all_refs),
        'write_refs': len(write_refs),
        'read_refs':  len(read_refs),
        'files': list({h[0] for h in all_refs}),
    }

    cnt = table_info[t]['rows']

    if len(all_refs) == 0:
        log(FAIL, 'dead_table', t, f"0 code references — completely orphaned")
    elif cnt == 0 and len(write_refs) == 0 and len(read_refs) > 0:
        log(WARN, 'read_only_empty', t, f"only read references, 0 writes, 0 rows — will always return empty")
    elif cnt == 0 and len(write_refs) > 0:
        log(WARN, 'wired_but_empty', t, f"{len(write_refs)} write ref(s) in code but 0 rows — write path not firing")
    elif cnt == 0 and len(all_refs) > 0:
        log(WARN, 'referenced_empty', t, f"{len(all_refs)} ref(s) but 0 rows")

findings['ref_report'] = ref_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — nullable FK / linkage audit
# ══════════════════════════════════════════════════════════════════════════════
section("5 · Nullable FK linkage audit")

# Key FK columns that SHOULD be populated
FK_CHECKS = {
    'agentsam_execution_performance_metrics': ['routing_arm_id', 'workspace_id'],
    'agentsam_tool_chain':                    ['routing_arm_id', 'plan_id', 'workspace_id'],
    'agentsam_tool_call_log':                 ['plan_id', 'workspace_id', 'routing_arm_id'],
    'agentsam_agent_run':                     ['routing_arm_id', 'workspace_id'],
    'agentsam_hook_execution':                ['tenant_id', 'workspace_id'],
    'agentsam_command_run':                   ['workspace_id', 'tenant_id'],
    'agentsam_executions':                    ['workspace_id', 'tenant_id'],
    'agentsam_execution_steps':               ['execution_id'],
    'agentsam_eval_runs':                     ['suite_id', 'case_id'],
    'agentsam_guardrail_events':              ['guardrail_id', 'workspace_id'],
    'agentsam_usage_events':                  ['workspace_id', 'tenant_id', 'model_key'],
    'agentsam_skill_invocation':              ['tenant_id', 'workspace_id'],
    'agentsam_compaction_events':             [],   # just check row count
    'agentsam_escalation':                    ['workspace_id'],
    'agentsam_plans':                         ['workspace_id', 'tenant_id'],
    'agentsam_plan_tasks':                    ['plan_id'],
}

null_report = {}
for t, cols in FK_CHECKS.items():
    if t not in table_info:
        log(WARN, 'table_missing', t, "table not found in D1")
        continue
    total = table_info[t]['rows']
    if total == 0:
        continue
    available_cols = table_info[t]['cols']
    for col in cols:
        if col not in available_cols:
            log(WARN, 'schema_gap', t, f"expected column '{col}' missing from schema")
            continue
        nulls = null_count(t, col)
        pct   = round(100 * nulls / total, 1) if total > 0 else 0
        key   = f"{t}.{col}"
        null_report[key] = {'nulls': nulls, 'total': total, 'pct': pct}
        if nulls == total:
            log(FAIL, 'missing_linkage', t, f"'{col}' is NULL on ALL {total} rows — linkage completely broken")
        elif pct > 50:
            log(WARN, 'partial_linkage', t, f"'{col}' NULL on {nulls}/{total} rows ({pct}%)")
        else:
            print(f"  {PASS} {t}.{col}: {nulls}/{total} null ({pct}%)")

findings['null_report'] = null_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6 — write path existence check for empty tables
# ══════════════════════════════════════════════════════════════════════════════
section("6 · Write path depth check")

WRITE_PATH_CHECKS = {
    'agentsam_usage_events': {
        'writer_file': 'usage-event-writer.js',
        'export':      'writeUsageEvent',
        'caller_pattern': r'writeUsageEvent|writeUsage',
    },
    'agentsam_compaction_events': {
        'writer_file': None,
        'export':      'compactAgentsamToolCallLogToStats',
        'caller_pattern': r'compactAgentsam|compaction_events',
    },
    'agentsam_guardrail_events': {
        'writer_file': None,
        'export':      'evaluateGuardrails',
        'caller_pattern': r'evaluateGuardrails',
    },
    'agentsam_escalation': {
        'writer_file': None,
        'export':      None,
        'caller_pattern': r'INSERT INTO agentsam_escalation',
    },
    'agentsam_execution_context': {
        'writer_file': None,
        'export':      None,
        'caller_pattern': r'INSERT INTO agentsam_execution_context',
    },
    'agentsam_eval_runs': {
        'writer_file': None,
        'export':      None,
        'caller_pattern': r'INSERT INTO agentsam_eval_runs',
    },
    'agentsam_hook_execution': {
        'writer_file': None,
        'export':      'fireHook',
        'caller_pattern': r'fireHook|hook_execution',
    },
}

wp_report = {}
for t, cfg in WRITE_PATH_CHECKS.items():
    callers = grep_all(cfg['caller_pattern'], FILES)
    # exclude the definition file itself
    callers = [c for c in callers if cfg.get('writer_file') is None or cfg['writer_file'] not in c[0]]

    export_fn = cfg.get('export')
    export_imported = False
    if export_fn and export_fn in IMPORTS:
        export_imported = True

    wp_report[t] = {
        'caller_hits': len(callers),
        'export_imported': export_imported,
        'caller_files': list({c[0] for c in callers}),
    }

    cnt = table_info.get(t, {}).get('rows', -1)
    if len(callers) == 0 and not export_imported:
        log(FAIL, 'dead_write_path', t, f"writer exists but NEVER called/imported — rows will stay 0")
    elif len(callers) == 0:
        log(WARN, 'uncalled_writer', t, f"export '{export_fn}' imported but no call sites found")
    elif cnt == 0:
        log(WARN, 'writer_not_firing', t, f"{len(callers)} call site(s) exist but 0 rows written — likely guarded/skipped")
    else:
        print(f"  {PASS} {t}: {len(callers)} caller(s), {cnt} rows")

findings['write_path_report'] = wp_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 7 — Thompson/eval feedback loop integrity
# ══════════════════════════════════════════════════════════════════════════════
section("7 · Thompson + eval feedback loop")

# Check qualityScore feeding
qs_sites = grep_all(r'qualityScore', FILES)
qs_null  = [h for h in qs_sites if re.search(r'qualityScore:\s*null', h[2])]
qs_undef = [h for h in qs_sites if re.search(r'qualityScore:\s*undefined', h[2])]
qs_real  = [h for h in qs_sites if re.search(r'qualityScore:\s*[^nu]', h[2]) and 'null' not in h[2] and 'undefined' not in h[2]]

print(f"  qualityScore: {len(qs_real)} real values, {len(qs_null)} null, {len(qs_undef)} undefined")
if qs_null:
    for h in qs_null:
        log(WARN, 'quality_signal_null', 'agentsam_routing_arms', f"qualityScore: null at {h[0]}:{h[1]}")
if qs_undef:
    for h in qs_undef:
        log(FAIL, 'quality_signal_missing', 'agentsam_routing_arms', f"qualityScore: undefined at {h[0]}:{h[1]}")

# Check eval runner exists
eval_runner = grep_all(r'runEvalSuite|evalRunner|triggerEval|runAgentEval|eval_runner', FILES)
if not eval_runner:
    log(FAIL, 'eval_runner_missing', 'agentsam_eval_runs',
        "No eval runner found — suites/cases exist but nothing executes them autonomously")
else:
    print(f"  {PASS} eval runner references: {len(eval_runner)}")

# Check eval→arm feedback
eval_to_arm = grep_all(r'scheduleRoutingArmQualityUpdate.*eval|eval.*scheduleRoutingArmQualityUpdate', FILES)
score_to_arm = grep_all(r'score_overall.*routing|routing.*score_overall', FILES)
if not eval_to_arm and not score_to_arm:
    log(FAIL, 'eval_thompson_disconnect', 'agentsam_eval_runs',
        "eval_runs.score_overall never feeds scheduleRoutingArmQualityUpdate — loop is broken")
else:
    print(f"  {PASS} eval→Thompson linkage found")

# Check usage_events writer is imported anywhere outside its own file
usage_writer_calls = grep_all(r'writeUsageEvent', FILES)
usage_writer_calls = [h for h in usage_writer_calls if 'usage-event-writer' not in h[0]]
if not usage_writer_calls:
    log(FAIL, 'dead_write_path', 'agentsam_usage_events',
        "writeUsageEvent never called outside its definition — all runs produce 0 usage events")
    log(FAIL, 'downstream_broken', 'agentsam_usage_rollups_daily',
        "rollup cron reads usage_events which has 0 rows — midnight rollup produces nothing")

findings['thompson_eval'] = {
    'quality_score_real_sites': len(qs_real),
    'quality_score_null_sites': len(qs_null),
    'quality_score_undef_sites': len(qs_undef),
    'eval_runner_exists': len(eval_runner) > 0,
    'eval_to_arm_wired': len(eval_to_arm) > 0 or len(score_to_arm) > 0,
    'usage_event_writer_called': len(usage_writer_calls) > 0,
}

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 8 — cron coverage audit
# ══════════════════════════════════════════════════════════════════════════════
section("8 · Cron coverage audit")

CRON_FUNCTIONS = {
    'reconcileRoutingArmsFromAgentRuns':  'hourly (moved today)',
    'rollupAgentsamModelRoutingMemory':   'hourly (moved today)',
    'runMidnightUtcJobs':                 'midnight',
    'scheduleOneAmMaintenance':           '1am',
    'runWebhookPayloadPurgeCron':         '3am',
    'rollupUsageEventsDaily':             'midnight (in memory.js)',
    'sendDailyPlanEmail':                 'daily',
    'runSpendLedgerRollup':               'daily',
    'runFinancialCommandCron':            'daily',
    'runWeeklyRollup':                    'weekly',
    'writeDailySnapshot':                 '00:10',
    'scheduleSixAmRagJobs':               '6am',
    'runHourlyRoutingJobs':               'hourly (new)',
    'writeQualityRunFromAgentRun':        'NOT SCHEDULED — needs per-run hook',
    'triggerEvalAfterNRuns':              'NOT SCHEDULED — needs per-arm hook',
}

scheduled_text = ''
try:
    scheduled_text = Path('src/cron/scheduled.js').read_text()
except:
    pass

cron_report = {}
for fn, expected in CRON_FUNCTIONS.items():
    in_scheduled = fn in scheduled_text
    callers = grep_all(re.escape(fn), FILES)
    callers = [c for c in callers if 'scheduled.js' not in c[0] or in_scheduled]
    defined  = any(f'function {fn}' in t or f'async function {fn}' in t for t in FILES.values())

    cron_report[fn] = {
        'in_scheduled': in_scheduled,
        'defined': defined,
        'caller_count': len(callers),
        'expected_schedule': expected,
    }

    if 'NOT SCHEDULED' in expected:
        log(WARN, 'cron_gap', 'scheduled.js', f"{fn} — {expected}")
    elif not in_scheduled and not any(fn in t for t in FILES.values()):
        log(FAIL, 'cron_missing', 'scheduled.js', f"{fn} not found in codebase at all")
    elif not in_scheduled:
        log(WARN, 'cron_unwired', 'scheduled.js', f"{fn} defined but not in scheduled.js dispatch")
    else:
        print(f"  {PASS} {fn} → {expected}")

findings['cron_report'] = cron_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 9 — schema drift (columns in code but not in table)
# ══════════════════════════════════════════════════════════════════════════════
section("9 · Schema drift detection")

# Columns referenced in code INSERT statements that may not exist in schema
COLUMN_CHECKS = {
    'agentsam_tool_chain':    ['routing_arm_id', 'plan_id', 'tenant_id', 'workspace_id'],
    'agentsam_tool_call_log': ['plan_id', 'routing_arm_id', 'tenant_id'],
    'agentsam_agent_run':     ['routing_arm_id', 'quality_score', 'task_type'],
    'agentsam_execution_steps': ['step_type', 'tool_name', 'status', 'execution_id'],
    'agentsam_skill_invocation': ['tenant_id', 'workspace_id', 'conversation_id'],
    'agentsam_usage_events':  ['model_key', 'tenant_id', 'workspace_id', 'cost_usd', 'input_tokens', 'output_tokens'],
}

drift_report = {}
for t, expected_cols in COLUMN_CHECKS.items():
    if t not in table_info:
        continue
    actual = set(table_info[t]['cols'])
    missing = [c for c in expected_cols if c not in actual]
    drift_report[t] = {'expected': expected_cols, 'missing': missing}
    if missing:
        log(FAIL, 'schema_drift', t, f"columns expected by code but missing from schema: {missing}")
    else:
        print(f"  {PASS} {t}: all expected columns present")

findings['schema_drift'] = drift_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 10 — user_policy enforcement completeness
# ══════════════════════════════════════════════════════════════════════════════
section("10 · user_policy enforcement completeness")

POLICY_FIELDS = [
    'max_cost_per_session_usd',
    'max_cost_per_call_usd',
    'allowed_model_tier_max',
    'tool_risk_level_max',
    'require_allowlist_for_mcp',
    'allow_subagent_spawn',
    'max_spawn_depth',
    'max_tool_chain_depth',
    'max_tab_count',
    'web_search_enabled',
    'web_fetch_enabled',
]

policy_report = {}
for field in POLICY_FIELDS:
    hits = grep_all(re.escape(field), FILES)
    hits = [h for h in hits if 'user_policy' not in h[0] or 'loadAgentSam' not in h[0]]
    policy_report[field] = len(hits)
    if len(hits) == 0:
        log(FAIL, 'policy_unenforced', 'agentsam_user_policy',
            f"'{field}' defined in schema but never read in agent logic — no enforcement")
    elif len(hits) < 2:
        log(WARN, 'policy_partial', 'agentsam_user_policy',
            f"'{field}' only referenced {len(hits)} time(s) — may not be enforced on all paths")
    else:
        print(f"  {PASS} {field}: {len(hits)} reference(s)")

findings['policy_enforcement'] = policy_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 11 — mcp_allowlist enforcement
# ══════════════════════════════════════════════════════════════════════════════
section("11 · mcp_allowlist enforcement")

MCP_FIELDS = [
    'max_calls_per_day',
    'timeout_override_ms',
    'risk_level_override',
    'requires_approval',
    'is_allowed',
]

mcp_report = {}
for field in MCP_FIELDS:
    hits = grep_all(re.escape(field), FILES)
    hits = [h for h in hits if 'mcp_allowlist' not in h[2] or 'INSERT' not in h[2]]
    mcp_report[field] = len(hits)
    if len(hits) == 0:
        log(FAIL, 'mcp_unenforced', 'agentsam_mcp_allowlist',
            f"'{field}' schema column never enforced in tool call path")
    elif field == 'requires_approval' and len(hits) >= 3:
        print(f"  {PASS} {field}: {len(hits)} reference(s)")
    elif len(hits) < 2:
        log(WARN, 'mcp_partial', 'agentsam_mcp_allowlist',
            f"'{field}' only {len(hits)} reference(s)")
    else:
        print(f"  {PASS} {field}: {len(hits)} reference(s)")

findings['mcp_enforcement'] = mcp_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 12 — Cursor-quality blockers (end-to-end platform builder checklist)
# ══════════════════════════════════════════════════════════════════════════════
section("12 · Cursor-quality blocker checklist")

CURSOR_CHECKS = [
    ('Parallel tool execution visible in SSE',
     r'tool_start|tool_done|thinking_start',
     'onThinkingEvent'),
    ('Step-level execution tracking writes',
     r'INSERT INTO agentsam_execution_steps',
     'execution_steps_write'),
    ('Approval modal fires on requires_approval tools',
     r'onToolApprovalRequest|approval_required',
     'approval_modal'),
    ('Plan task progress tracked',
     r'agentsam_plan_tasks.*status|UPDATE agentsam_plan_tasks',
     'plan_task_progress'),
    ('Cost tracking per run',
     r'cost_usd|costUsd',
     'cost_tracking'),
    ('Model tier enforcement from user_policy',
     r'allowed_model_tier_max|model_tier',
     'tier_enforcement'),
    ('Subagent spawn gated by user_policy',
     r'allow_subagent_spawn|max_spawn_depth',
     'subagent_gate'),
    ('Tool chain depth enforced',
     r'max_tool_chain_depth',
     'chain_depth'),
    ('Session cost cap enforced',
     r'max_cost_per_session_usd|sessionCostUsd',
     'session_cost_cap'),
    ('Guardrail events write on block/warn',
     r'INSERT INTO agentsam_guardrail_events',
     'guardrail_events_write'),
    ('Usage events written per run',
     r'writeUsageEvent|INSERT INTO agentsam_usage_events',
     'usage_events'),
    ('Eval runs auto-triggered after N arm executions',
     r'triggerEval|runEvalSuite|eval.*arm|arm.*eval',
     'eval_auto_trigger'),
    ('Thompson arm quality score updated from eval',
     r'score_overall.*quality|quality.*score_overall',
     'thompson_quality'),
    ('Hook dispatcher fires on run complete',
     r'fireAgentHooks|fireHook.*agent_run_complete',
     'hook_dispatch'),
    ('Routing arm ID stamped on agent_run',
     r'routing_arm_id.*agent_run|agent_run.*routing_arm_id',
     'arm_id_on_run'),
]

cursor_report = {}
for label, pattern, key in CURSOR_CHECKS:
    hits = grep_all(pattern, FILES)
    hits = [h for h in hits if not re.search(r'^\s*//', h[2])]
    passing = len(hits) > 0
    cursor_report[key] = {'label': label, 'hits': len(hits), 'passing': passing}
    sym = PASS if passing else FAIL
    sev = '' if passing else FAIL
    print(f"  {sym} {label}: {len(hits)} hit(s)")
    if not passing:
        log(FAIL, 'cursor_quality_blocker', key, f"MISSING: {label}")

findings['cursor_checklist'] = cursor_report

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 13 — fetch_domain_allowlist improvements needed
# ══════════════════════════════════════════════════════════════════════════════
section("13 · fetch_domain_allowlist schema gaps")

fda_cols = table_info.get('agentsam_fetch_domain_allowlist', {}).get('cols', [])
NEEDED_FDA_COLS = ['tenant_id', 'risk_level', 'rate_limit_per_hour', 'allowed_methods', 'requires_approval']
missing_fda = [c for c in NEEDED_FDA_COLS if c not in fda_cols]
if missing_fda:
    log(WARN, 'schema_improvement', 'agentsam_fetch_domain_allowlist',
        f"Missing columns for multi-tenant safety: {missing_fda}. "
        f"Currently host-only — no per-tenant rate limiting or risk classification.")
    findings['fetch_domain_gaps'] = missing_fda
else:
    print(f"  {PASS} fetch_domain_allowlist has all recommended columns")

# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
section("SUMMARY")

by_sev = defaultdict(list)
for iss in issues:
    by_sev[iss['severity']].append(iss)

critical = by_sev[FAIL]
warnings = by_sev[WARN]

print(f"\n  {FAIL} CRITICAL issues : {len(critical)}")
print(f"  {WARN} WARNINGS        : {len(warnings)}")
print(f"\n  Top critical issues:")
for iss in critical[:20]:
    print(f"    → [{iss['category']}] {iss['table']}: {iss['message']}")

if len(critical) > 20:
    print(f"    ... and {len(critical) - 20} more (see {OUT})")

# Priority fix list
print(f"\n  PRIORITY FIX ORDER (Cursor-quality impact):")
priority = [
    i for i in critical
    if i['category'] in ('dead_write_path', 'eval_thompson_disconnect',
                         'eval_runner_missing', 'cursor_quality_blocker',
                         'missing_linkage', 'schema_drift')
]
for i, iss in enumerate(priority[:10], 1):
    print(f"    {i}. [{iss['category']}] {iss['table']}: {iss['message'][:80]}")

# ── Write JSON report ─────────────────────────────────────────────────────────
findings['issues'] = issues
findings['summary'] = {
    'total_tables': len(ALL_TABLES),
    'critical': len(critical),
    'warnings': len(warnings),
    'tables_empty': sum(1 for t in ALL_TABLES if table_info[t]['rows'] == 0),
    'tables_healthy': sum(1 for t in ALL_TABLES if table_info[t]['rows'] > 0),
}

OUT.write_text(json.dumps(findings, indent=2))
print(f"\n  Full report written to: {OUT}")
print(f"\n{SEP}")
