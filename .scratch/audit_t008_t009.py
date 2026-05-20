#!/usr/bin/env python3
"""
Audit T008/T009 write sites in agent.js before patching.
T008: playwright_jobs INSERT — find exact line, show context
T009: triggered_by hardcoded 'agent' — find all write sites
Also: confirm agent_run_id is available in context at each site.
"""
import subprocess
from pathlib import Path

ROOT     = Path('/Users/samprimeaux/inneranimalmedia')
AGENT_JS = ROOT / 'src/api/agent.js'

def show_lines(path, lineno, before=6, after=12):
    lines = path.read_text().splitlines()
    start = max(0, lineno - before - 1)
    end   = min(len(lines), lineno + after)
    for i, l in enumerate(lines[start:end], start + 1):
        marker = '>>>' if i == lineno else '   '
        print(f'  {marker} {i:5}: {l}')

def grep_agent(pattern):
    r = subprocess.run(
        ['grep', '-n', pattern, str(AGENT_JS)],
        capture_output=True, text=True
    )
    return r.stdout.strip().splitlines()

# ── T008: playwright_jobs ────────────────────────────────────────────────────
print('=' * 70)
print('T008 — playwright_jobs INSERT sites')
print('=' * 70)
hits = grep_agent('playwright_jobs')
for h in hits:
    print(f'  {h}')

# Show full context around each INSERT
insert_lines = [int(h.split(':')[0]) for h in hits if 'INSERT' in h]
for ln in insert_lines:
    print(f'\n  --- INSERT at line {ln} ---')
    show_lines(AGENT_JS, ln, before=8, after=20)

# ── Check what variables are available near playwright_jobs inserts ──────────
print('\n' + '=' * 70)
print('T008 — agent_run_id / agentRunId availability near playwright INSERT')
print('=' * 70)
lines = AGENT_JS.read_text().splitlines()
for ln in insert_lines:
    # Search 50 lines above for agent_run_id / agentRunId / run_id
    window = lines[max(0, ln-50):ln]
    for i, l in enumerate(window):
        if any(x in l for x in ['agent_run_id', 'agentRunId', 'runId', 'run_id',
                                  'agentRunRow', 'agent_run', 'arun_']):
            actual_line = ln - 50 + i
            print(f'  line {actual_line}: {l.strip()}')

# ── T009: triggered_by hardcoded ─────────────────────────────────────────────
print('\n' + '=' * 70)
print("T009 — all 'triggered_by' write sites in agent.js")
print('=' * 70)
tb_hits = grep_agent('triggered_by')
for h in tb_hits:
    print(f'  {h}')

# Show context for hardcoded 'agent' assignments
print("\n  --- Sites with hardcoded triggered_by = 'agent' ---")
hardcoded = [h for h in tb_hits if "'agent'" in h or '"agent"' in h]
for h in hardcoded:
    ln = int(h.split(':')[0])
    print(f'\n  line {ln}:')
    show_lines(AGENT_JS, ln, before=5, after=8)

# ── Check agent_run_id availability in broader agent.js context ──────────────
print('\n' + '=' * 70)
print('agent_run_id — how/where it is set in agent.js request handling')
print('=' * 70)
run_id_hits = grep_agent('agent_run_id\|agentRunId\|insertAgentRun\|createAgentRun')
for h in run_id_hits[:30]:
    print(f'  {h}')

# ── Check how agentsam_agent_run is written in agent.js ──────────────────────
print('\n' + '=' * 70)
print('agentsam_agent_run INSERT — how run ID is generated')
print('=' * 70)
ar_hits = grep_agent('agentsam_agent_run')
for h in ar_hits[:15]:
    print(f'  {h}')

ar_insert = [int(h.split(':')[0]) for h in ar_hits if 'INSERT' in h]
for ln in ar_insert[:2]:
    print(f'\n  --- INSERT at line {ln} ---')
    show_lines(AGENT_JS, ln, before=5, after=15)

# ── Check what the execute-approved-tool route (T003) has access to ──────────
print('\n' + '=' * 70)
print('T003 execute-approved-tool — does it have agent_run_id in scope?')
print('=' * 70)
eat_hits = grep_agent('execute-approved-tool')
for h in eat_hits:
    ln = int(h.split(':')[0])
    print(f'\n  line {ln}:')
    show_lines(AGENT_JS, ln, before=3, after=25)

print('\n' + '=' * 70)
print('SUMMARY')
print('=' * 70)
print(f'  playwright_jobs INSERT sites: {len(insert_lines)}')
print(f"  triggered_by hardcoded 'agent' sites: {len(hardcoded)}")
print(f'  agent_run_id references in agent.js: {len(run_id_hits)}')
print(f'  agentsam_agent_run INSERT sites: {len(ar_insert)}')
print()
print('  Paste output — patches will target exact line numbers.')
