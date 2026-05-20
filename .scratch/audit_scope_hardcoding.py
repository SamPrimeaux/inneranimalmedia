#!/usr/bin/env python3
"""
Audit hardcoded user_id / workspace_id / tenant_id across:
- migrations/ (tool seed rows)
- src/tools/builtin/fs.js
- src/api/agent.js (loadToolsForRequest, approval queue inserts)
- src/core/mcp-tool-execution.js
Surfaces every place a specific ID is baked in instead of resolved from session.
"""
import subprocess
from pathlib import Path

ROOT  = Path('/Users/samprimeaux/inneranimalmedia')
SRC   = ROOT / 'src'
MIGS  = ROOT / 'migrations'

SAM_USER    = 'au_871d920d1233cbd1'
SEED_USER   = 'au_77a622faf006c9e4'
SAM_WS      = 'ws_inneranimalmedia'
SAM_TENANT  = 'tenant_sam_primeaux'

def grep(pattern, *paths, context=3, include='*.js'):
    args = ['grep', '-rn', f'--include={include}']
    if context:
        args += ['-A', str(context), '-B', str(context)]
    args += [pattern] + [str(p) for p in paths]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

def grep_sql(pattern, path=MIGS):
    r = subprocess.run(
        ['grep', '-rn', '--include=*.sql', '-B', '2', '-A', '5', pattern, str(path)],
        cwd=ROOT, capture_output=True, text=True
    )
    return r.stdout.strip()

# ── 1. Hardcoded IDs in migrations ──────────────────────────────────────────
print('=' * 70)
print(f'1. HARDCODED sam user ({SAM_USER}) in migrations')
print('=' * 70)
print(grep_sql(SAM_USER)[:3000] or '  (none)')

print(f'\n--- HARDCODED seed user ({SEED_USER}) in migrations ---')
print(grep_sql(SEED_USER)[:2000] or '  (none)')

print(f'\n--- HARDCODED workspace ({SAM_WS}) in migrations ---')
print(grep_sql(SAM_WS)[:2000] or '  (none)')

# ── 2. How loadToolsForRequest resolves user/workspace ──────────────────────
print('\n' + '=' * 70)
print('2. loadToolsForRequest — how it scopes tool rows to the current user')
print('=' * 70)
r = subprocess.run(
    ['grep', '-n', 'loadToolsForRequest\|loadTools\|workspace_scope\|user_id.*tool\|tool.*user_id',
     '--include=*.js', '-r', '-A', '5', str(SRC)],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:3000] or '  (none)')

# ── 3. How agentsam_mcp_tools is queried at runtime ─────────────────────────
print('\n' + '=' * 70)
print('3. agentsam_mcp_tools runtime query — does it filter by user_id/workspace?')
print('=' * 70)
for f in [
    SRC / 'core/mcp-tool-execution.js',
    SRC / 'api/agent.js',
]:
    if not f.exists():
        continue
    lines = f.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'agentsam_mcp_tools' in l and ('SELECT' in l or 'WHERE' in l):
            print(f'\n  {f.name} line {i+1}:')
            for j in range(max(0,i-2), min(len(lines), i+8)):
                print(f'    {j+1}: {lines[j]}')

# ── 4. How agentsam_tools is queried at runtime ──────────────────────────────
print('\n' + '=' * 70)
print('4. agentsam_tools runtime query — does it filter by workspace_scope?')
print('=' * 70)
for f in [
    SRC / 'core/mcp-tool-execution.js',
    SRC / 'api/agent.js',
]:
    if not f.exists():
        continue
    lines = f.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'agentsam_tools' in l and 'agentsam_mcp' not in l and ('SELECT' in l or 'WHERE' in l):
            print(f'\n  {f.name} line {i+1}:')
            for j in range(max(0,i-2), min(len(lines), i+8)):
                print(f'    {j+1}: {lines[j]}')

# ── 5. approval_queue INSERT — does it use session user or hardcode? ─────────
print('\n' + '=' * 70)
print('5. agentsam_approval_queue INSERT — session-scoped or hardcoded?')
print('=' * 70)
r = subprocess.run(
    ['grep', '-n', 'INSERT.*agentsam_approval_queue', '-A', '15',
     '--include=*.js', '-r', str(SRC)],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:3000] or '  (none)')

# ── 6. change_sets INSERT — session-scoped? ──────────────────────────────────
print('\n' + '=' * 70)
print('6. change_sets INSERT — session-scoped?')
print('=' * 70)
fs_js = SRC / 'tools/builtin/fs.js'
if fs_js.exists():
    lines = fs_js.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'change_sets' in l and 'INSERT' in l:
            print(f'\n  line {i+1}:')
            for j in range(max(0,i-3), min(len(lines), i+20)):
                print(f'    {j+1}: {lines[j]}')

# ── 7. workspace_scope='["ws_inneranimalmedia"]' — is that a filter or a tag? -
print('\n' + '=' * 70)
print('7. workspace_scope query logic — how is it used at runtime?')
print('=' * 70)
r = subprocess.run(
    ['grep', '-rn', 'workspace_scope', '--include=*.js', '-A', '3', str(SRC)],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:3000] or '  (none)')

print('\n' + '=' * 70)
print('SUMMARY — paste this to understand scope before writing any migration')
print('=' * 70)
