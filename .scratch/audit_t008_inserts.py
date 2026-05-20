#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
SRC  = ROOT / 'src'

def show(path, lineno, before=5, after=25):
    lines = Path(path).read_text().splitlines()
    s = max(0, lineno - before - 1)
    e = min(len(lines), lineno + after)
    for i, l in enumerate(lines[s:e], s+1):
        m = '>>>' if i == lineno else '   '
        print(f'  {m} {i:5}: {l}')

print('=== playwright.js INSERT context (line 118) ===')
show(SRC / 'integrations/playwright.js', 118, before=10, after=20)

print('\n=== agentsam_tool_call_log INSERT in agent.js ===')
f = SRC / 'api/agent.js'
lines = f.read_text().splitlines()
for i, l in enumerate(lines):
    if 'INSERT' in l and 'agentsam_tool_call_log' in l:
        show(f, i+1, before=3, after=20)
        print('  ---')

print('\n=== agentsam_mcp_tool_execution INSERT (scheduleRecordMcpToolExecution) ===')
for fname in ['agent.js', 'command-run-telemetry.js']:
    fp = SRC / 'api' / fname
    if not fp.exists():
        fp = SRC / 'core' / fname
    if fp.exists():
        lines = fp.read_text().splitlines()
        for i, l in enumerate(lines):
            if 'INSERT' in l and 'agentsam_mcp_tool_execution' in l:
                print(f'\n  {fname} line {i+1}:')
                show(fp, i+1, before=3, after=20)
                break

print('\n=== chatAgentRunId — where it is set and passed to tool dispatch ===')
r = subprocess.run(
    ['grep', '-n', 'chatAgentRunId\|agent_run_id.*chat\|chat.*agent_run_id',
     str(SRC / 'api/agent.js')],
    capture_output=True, text=True)
print(r.stdout.strip()[:1000] or '  (none)')
