#!/usr/bin/env python3
"""
Audit existing agentsam_tools + agentsam_mcp_tools seed patterns
and extract write_file/apply_change_set schema from builtin/fs.js.
Gives us everything needed to write the migration without Cursor reading files.
"""
import re, json
from pathlib import Path

ROOT    = Path('/Users/samprimeaux/inneranimalmedia')
SRC     = ROOT / 'src'
MIGS    = ROOT / 'migrations'
FS_JS   = ROOT / 'src/tools/builtin/fs.js'
DISP_JS = ROOT / 'src/tools/ai-dispatch.js'

# ── 1. Latest migration number ───────────────────────────────────────────────
print('=' * 70)
print('1. LATEST MIGRATION NUMBER')
print('=' * 70)
sql_files = sorted(MIGS.glob('*.sql'))
if sql_files:
    last = sql_files[-1]
    num  = re.match(r'^(\d+)', last.name)
    next_num = int(num.group(1)) + 1 if num else '???'
    print(f'  Latest: {last.name}')
    print(f'  Next:   {next_num}_fs_tools_catalog.sql')
else:
    print('  No migrations found')

# ── 2. agentsam_mcp_tools seed pattern from migrations ──────────────────────
print('\n' + '=' * 70)
print('2. agentsam_mcp_tools SEED PATTERN (from migrations)')
print('=' * 70)
mcp_inserts = []
for f in sql_files[-20:]:  # last 20 migrations
    txt = f.read_text()
    if 'INSERT' in txt and 'agentsam_mcp_tools' in txt:
        mcp_inserts.append((f.name, txt))

if mcp_inserts:
    fname, txt = mcp_inserts[-1]  # most recent
    print(f'  Found in: {fname}')
    lines = txt.splitlines()
    in_block = False
    for i, l in enumerate(lines):
        if 'agentsam_mcp_tools' in l and 'INSERT' in l:
            in_block = True
        if in_block:
            print(f'  {l}')
            if l.strip().endswith(';') or (i > 0 and ');' in l):
                in_block = False
                break
else:
    print('  No agentsam_mcp_tools INSERT in recent migrations')
    # Fall back to src/ seeds
    import subprocess
    r = subprocess.run(
        ['grep', '-rn', 'INSERT.*agentsam_mcp_tools', '--include=*.js',
         '--include=*.sql', '-A', '15', str(SRC)],
        capture_output=True, text=True
    )
    print('  Checking src/ instead:')
    print(r.stdout[:2000] or '  (none)')

# ── 3. agentsam_tools seed pattern ──────────────────────────────────────────
print('\n' + '=' * 70)
print('3. agentsam_tools SEED PATTERN (from migrations)')
print('=' * 70)
tools_inserts = []
for f in sql_files[-20:]:
    txt = f.read_text()
    if 'INSERT' in txt and 'agentsam_tools' in txt and 'agentsam_mcp_tools' not in txt.split('agentsam_tools')[0][-5:]:
        tools_inserts.append((f.name, txt))

if tools_inserts:
    fname, txt = tools_inserts[-1]
    print(f'  Found in: {fname}')
    lines = txt.splitlines()
    in_block = False
    count = 0
    for i, l in enumerate(lines):
        if 'agentsam_tools' in l and 'INSERT' in l and 'mcp' not in l:
            in_block = True
            count = 0
        if in_block:
            print(f'  {l}')
            count += 1
            if count > 30 or ');' in l:
                in_block = False
else:
    print('  No agentsam_tools INSERT in recent migrations — checking src/')
    import subprocess
    r = subprocess.run(
        ['grep', '-rn', "INSERT.*agentsam_tools\b", '--include=*.js',
         '--include=*.sql', '-A', '10', str(SRC)],
        capture_output=True, text=True
    )
    print(r.stdout[:2000] or '  (none)')

# ── 4. workspace_scope values in use ────────────────────────────────────────
print('\n' + '=' * 70)
print('4. workspace_scope VALUES IN USE (agentsam_mcp_tools)')
print('=' * 70)
import subprocess
r = subprocess.run(
    ['grep', '-rh', 'workspace_scope', '--include=*.sql', str(MIGS)],
    capture_output=True, text=True
)
scopes = set(re.findall(r"workspace_scope['\s]*=?\s*['\"]([^'\"]+)['\"]", r.stdout))
print(f'  Values found: {scopes or "(none in migrations)"}')

# Also check src/
r2 = subprocess.run(
    ['grep', '-rn', 'workspace_scope.*global\|workspace_scope.*system\|workspace_scope.*builtin',
     '--include=*.js', str(SRC)],
    capture_output=True, text=True
)
if r2.stdout.strip():
    for l in r2.stdout.strip().splitlines()[:8]:
        print(f'  {l.replace(str(ROOT)+"/","")}')

# ── 5. Global user_id / system seed user used in tool rows ──────────────────
print('\n' + '=' * 70)
print('5. GLOBAL/SYSTEM user_id USED IN TOOL SEEDS')
print('=' * 70)
r = subprocess.run(
    ['grep', '-rn', 'user_id.*system\|user_id.*global\|user_id.*builtin\|au_871d\|iam_system\|system_user',
     '--include=*.sql', '--include=*.js', str(MIGS), str(SRC)],
    capture_output=True, text=True
)
for l in r.stdout.strip().splitlines()[:15]:
    print(f'  {l.replace(str(ROOT)+"/","")}')

# ── 6. Extract write_file schema from fs.js ──────────────────────────────────
print('\n' + '=' * 70)
print('6. write_file INPUT SCHEMA (from builtin/fs.js)')
print('=' * 70)
if FS_JS.exists():
    fs_src = FS_JS.read_text()
    # Find schema/params definition block
    for pattern in [
        r'write_file.*?schema.*?(\{[^}]+\})',
        r'inputSchema.*?write.*?(\{.*?\})',
        r'source.*?r2Bucket.*?r2Key.*?github',
    ]:
        m = re.search(pattern, fs_src, re.DOTALL)
        if m:
            print(f'  Pattern matched: {pattern[:40]}')
            print(f'  {m.group(0)[:600]}')
            break

    # Show function signature / params destructure
    lines = fs_src.splitlines()
    for i, l in enumerate(lines):
        if 'write_file' in l or 'writeFile' in l:
            print(f'\n  line {i+1}: {l.strip()}')
            for j in range(i+1, min(i+30, len(lines))):
                print(f'  {j+1}: {lines[j]}')
                if 'source' in lines[j] and 'r2Bucket' in lines[j]:
                    break
                if lines[j].strip() == '}' or lines[j].strip() == '})':
                    break
            break

    # Show apply_change_set params
    print('\n  --- apply_change_set params ---')
    for i, l in enumerate(lines):
        if 'apply_change_set' in l or 'applyChangeSet' in l:
            print(f'  line {i+1}: {l.strip()}')
            for j in range(i+1, min(i+20, len(lines))):
                print(f'  {j+1}: {lines[j]}')
                if lines[j].strip() in ('}', '})') :
                    break
            break
else:
    print(f'  {FS_JS} not found')

# ── 7. ai-dispatch.js — how fs tools are registered ─────────────────────────
print('\n' + '=' * 70)
print('7. ai-dispatch.js — fs tool registrations')
print('=' * 70)
if DISP_JS.exists():
    disp = DISP_JS.read_text()
    lines = disp.splitlines()
    for i, l in enumerate(lines):
        if any(x in l for x in ['write_file','fs_write','apply_change_set','fs_edit','save_file','put_file']):
            print(f'  {i+1}: {l.strip()}')
else:
    print(f'  {DISP_JS} not found')

print('\n' + '=' * 70)
print('READY — paste this output to get the migration SQL written precisely.')
print('=' * 70)
