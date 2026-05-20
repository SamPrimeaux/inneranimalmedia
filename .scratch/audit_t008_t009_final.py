#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
SRC  = ROOT / 'src'

def grep(pattern, path, context=5):
    r = subprocess.run(
        ['grep', '-rn', '--include=*.js', '-A', str(context), '-B', str(context),
         pattern, str(path)], capture_output=True, text=True)
    return r.stdout.strip()

print('=== T008: playwright_jobs INSERT (find file + agent_run_id availability) ===')
r = subprocess.run(
    ['grep', '-rn', '--include=*.js', 'INSERT.*playwright_jobs\|playwright_jobs.*INSERT',
     str(SRC)], capture_output=True, text=True)
print(r.stdout.strip() or '  (none in src/)')

print('\n=== T008: how playwright jobs are triggered from agent context ===')
r2 = subprocess.run(
    ['grep', '-rn', '--include=*.js', 'playwright.*job\|enqueue.*playwright\|playwright.*queue\|createPlaywright',
     str(SRC)], capture_output=True, text=True)
print(r2.stdout.strip()[:2000] or '  (none)')

print('\n=== T009: triggered_by write sites in agent.js ===')
r3 = subprocess.run(
    ['grep', '-n', "triggered_by", str(SRC / 'api/agent.js')],
    capture_output=True, text=True)
print(r3.stdout.strip() or '  (none)')

print('\n=== agent_run_id already stamped in tool_call_log/tool_chain? (check recent inserts) ===')
for tbl in ['agentsam_tool_call_log', 'agentsam_tool_chain', 'agentsam_mcp_tool_execution']:
    r4 = subprocess.run(
        ['grep', '-rn', '--include=*.js', '-A', '15', f'INSERT.*{tbl}', str(SRC)],
        capture_output=True, text=True)
    hits = r4.stdout.strip()
    has_run_id = 'agent_run_id' in hits
    print(f'  {tbl}: agent_run_id in INSERT = {"✓ YES" if has_run_id else "✗ NOT YET"}')
