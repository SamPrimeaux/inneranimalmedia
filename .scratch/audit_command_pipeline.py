#!/usr/bin/env python3
"""
audit_command_pipeline.py
Audits everything Cursor needs to wire agent_run_id into the slash command pipeline.
Run from repo root: python3 audit_command_pipeline.py
"""
import subprocess, re, sys

BASE = '/Users/samprimeaux/inneranimalmedia'

def read(path, start=None, end=None):
    try:
        with open(f'{BASE}/{path}') as f:
            lines = f.readlines()
        if start and end:
            return lines[start-1:end]
        return lines
    except FileNotFoundError:
        return []

def grep(pattern, path, flags='-n'):
    try:
        r = subprocess.run(['grep', flags, pattern, f'{BASE}/{path}'],
                           capture_output=True, text=True)
        return r.stdout.strip()
    except:
        return ''

def grep_r(pattern, directory='src', include='*.js'):
    try:
        r = subprocess.run(['grep', '-rn', '--include', include, pattern, f'{BASE}/{directory}'],
                           capture_output=True, text=True)
        return r.stdout.strip()
    except:
        return ''

def section(title):
    print(f'\n{"="*70}')
    print(f'  {title}')
    print(f'{"="*70}')

def show_lines(lines, start_ln=1, label=''):
    if label:
        print(f'\n--- {label} ---')
    for i, l in enumerate(lines):
        print(f'  {start_ln+i}: {l}', end='')

# ── 1. command-run-telemetry.js ──────────────────────────────────────────────
section('COMMAND-RUN-TELEMETRY.JS — full import block + key function signatures')

lines = read('src/api/command-run-telemetry.js')
if not lines:
    print('  FILE NOT FOUND — try worker.js or src/api/commands.js')
else:
    print(f'  Total lines: {len(lines)}')

    # imports
    import_end = next((i for i,l in enumerate(lines) if l.strip() and not l.startswith('import') and i > 2), 20)
    show_lines(lines[:import_end+2], 1, 'imports')

    # executeCommand
    for kw in ['executeCommand', 'async function executeCommand', 'export.*executeCommand']:
        hits = [(i+1, l.rstrip()) for i,l in enumerate(lines) if re.search(kw, l)]
        if hits:
            print(f'\n  executeCommand hits:')
            for ln, text in hits[:5]:
                print(f'    {ln}: {text}')

    # INSERT INTO agentsam_command_run
    hits = [(i+1) for i,l in enumerate(lines) if 'agentsam_command_run' in l and 'INSERT' in l]
    for ln in hits:
        print(f'\n  INSERT agentsam_command_run at line {ln}:')
        show_lines(lines[ln-3:ln+15], ln-2)

    # INSERT INTO agentsam_tool_chain (hardcoded blocks)
    hits = [(i+1) for i,l in enumerate(lines) if 'agentsam_tool_chain' in l and 'INSERT' in l]
    print(f'\n  Hardcoded agentsam_tool_chain INSERTs at lines: {hits}')
    for ln in hits[:3]:
        show_lines(lines[ln-2:ln+12], ln-1, f'tool_chain INSERT @ line {ln}')

    # completeCommand
    comp_hits = [(i+1) for i,l in enumerate(lines) if re.search(r'(async function|export.*function)\s+completeCommand', l)]
    print(f'\n  completeCommand defined at lines: {comp_hits}')
    for ln in comp_hits[:2]:
        show_lines(lines[ln-1:ln+20], ln, f'completeCommand @ {ln}')

    # existing agentRunId / agent_run_id references
    existing = [(i+1, l.rstrip()) for i,l in enumerate(lines) if 'agentRunId' in l or 'agent_run_id' in l]
    print(f'\n  Existing agent_run_id refs ({len(existing)} hits):')
    for ln, text in existing[:10]:
        print(f'    {ln}: {text}')

    # where tokens/cost/status resolved in completeCommand
    cost_hits = [(i+1, l.rstrip()) for i,l in enumerate(lines) if re.search(r'(input_tokens|output_tokens|total_cost|cost_usd|success|status.*complet)', l)]
    print(f'\n  Token/cost/status vars (for scheduleAgentsamChatAgentRunInsert):')
    for ln, text in cost_hits[:10]:
        print(f'    {ln}: {text}')

    # o.agentRunId / o.sessionId / o.commandId usage
    o_hits = [(i+1, l.rstrip()) for i,l in enumerate(lines) if re.search(r'o\.(agentRunId|sessionId|commandId|workspaceId|tenantId|userId)', l)]
    print(f'\n  o.* param refs:')
    for ln, text in o_hits[:15]:
        print(f'    {ln}: {text}')

    # resolvedWorkspace / sessionId / commandId variable names
    var_hits = [(i+1, l.rstrip()) for i,l in enumerate(lines) if re.search(r'(resolvedWorkspace|workspaceId\s*=|sessionId\s*=|commandId\s*=|commandRunId\s*=|effectiveTaskType)', l)]
    print(f'\n  Key local variable assignments:')
    for ln, text in var_hits[:15]:
        print(f'    {ln}: {text}')

# ── 2. agent-run-routing.js exports ─────────────────────────────────────────
section('AGENT-RUN-ROUTING.JS — export signatures')

lines_r = read('src/core/agent-run-routing.js')
if not lines_r:
    print('  FILE NOT FOUND')
else:
    for fn in ['newChatAgentRunId', 'scheduleAgentsamChatAgentRunStart', 'scheduleAgentsamChatAgentRunInsert']:
        hits = [(i+1) for i,l in enumerate(lines_r) if fn in l and ('export' in l or 'function' in l)]
        for ln in hits[:2]:
            show_lines(lines_r[ln-1:ln+25], ln, f'{fn} @ line {ln}')

# ── 3. fireForgetAgentToolChainRow ───────────────────────────────────────────
section('fireForgetAgentToolChainRow — definition + command_run_id / workflow_run_id pattern')

hit = grep_r('fireForgetAgentToolChainRow', 'src')
print(f'  All references:\n{hit}')

# find definition file
def_match = re.search(r'^([^:]+):.*(?:export|async function).*fireForgetAgentToolChainRow', hit, re.MULTILINE)
if def_match:
    def_file = def_match.group(1).replace(f'{BASE}/', '')
    lines_f = read(def_file)
    fn_hits = [(i+1) for i,l in enumerate(lines_f) if 'fireForgetAgentToolChainRow' in l and ('function' in l or 'export' in l or '=>' in l)]
    for ln in fn_hits[:2]:
        show_lines(lines_f[ln-1:ln+40], ln, f'fireForgetAgentToolChainRow definition in {def_file}')

    # workflow_run_id PRAGMA pattern to copy
    wf_hits = [(i+1) for i,l in enumerate(lines_f) if 'workflow_run_id' in l]
    if wf_hits:
        ln = wf_hits[0]
        show_lines(lines_f[max(0,ln-3):ln+8], ln-2, 'workflow_run_id PRAGMA pattern (copy this for command_run_id)')

# ── 4. src/index.js slash route ──────────────────────────────────────────────
section('SRC/INDEX.JS — slash command route → executeCommand call')

lines_i = read('src/index.js')
if not lines_i:
    print('  FILE NOT FOUND')
else:
    slash_hits = [(i+1) for i,l in enumerate(lines_i) if re.search(r'(slash|/command|executeCommand)', l)]
    print(f'  Slash/executeCommand hits: {slash_hits[:10]}')
    for ln in slash_hits[:3]:
        show_lines(lines_i[max(0,ln-3):ln+10], ln-2, f'@ line {ln}')

# ── 5. Confirm what agentsam_command_run columns exist on remote ─────────────
section('COMMAND RUN SCHEMA — confirm agent_run_id column')

print('  Run this to check (not run by script — needs cloudflare env):')
print('  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute \\')
print('    inneranimalmedia-business --remote \\')
print('    -c wrangler.production.toml --json \\')
print('    --command "PRAGMA table_info(agentsam_command_run);" | grep -E "name|agent_run"')

# ── 6. Existing migration files to avoid number collision ────────────────────
section('HIGHEST MIGRATION NUMBER (avoid collision for 165_)')

try:
    r = subprocess.run(['ls', f'{BASE}/migrations/'], capture_output=True, text=True)
    nums = sorted([int(re.match(r'^(\d+)', f).group(1)) for f in r.stdout.split() if re.match(r'^\d+', f)])
    print(f'  Highest migration number: {nums[-1] if nums else "none found"}')
    print(f'  Last 5: {nums[-5:] if nums else []}')
except:
    print('  Could not read migrations dir')

# ── 7. Summary for Cursor prompt ─────────────────────────────────────────────
section('SUMMARY — paste this into Cursor prompt header')
print("""
  Files to edit:
    src/api/command-run-telemetry.js  (executeCommand + completeCommand)
    src/index.js                       (slash route caller)
    [fireForgetAgentToolChainRow file] (add command_run_id field)

  New migration:
    migrations/[NEXT_NUM]_command_run_agent_run_id.sql
    → ALTER TABLE agentsam_command_run ADD COLUMN agent_run_id TEXT

  Imports to add to command-run-telemetry.js:
    newChatAgentRunId
    scheduleAgentsamChatAgentRunStart
    scheduleAgentsamChatAgentRunInsert
    (all from '../core/agent-run-routing.js')

  Deploy: Worker-only — npm run deploy (no dashboard files changed)
""")

print('\n[audit_command_pipeline] DONE\n')
