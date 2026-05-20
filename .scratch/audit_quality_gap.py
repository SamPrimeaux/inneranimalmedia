#!/usr/bin/env python3
"""
Audit all remaining Cursor-parity gap tasks.
Pinpoints exact files, functions, line numbers needed for each fix.
Minimizes Cursor waste — paste output, get precise prompts.
"""
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
SRC  = ROOT / 'src'

def grep(pattern, *paths, context=4, include='*.js'):
    args = ['grep', '-rn', f'--include={include}',
            '-A', str(context), '-B', str(context), pattern]
    args += [str(p) for p in (paths or [SRC])]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

def show(path, lineno, before=3, after=15):
    if not Path(path).exists():
        return f'  FILE NOT FOUND: {path}'
    lines = Path(path).read_text().splitlines()
    start = max(0, lineno - before - 1)
    end   = min(len(lines), lineno + after)
    out = []
    for i, l in enumerate(lines[start:end], start + 1):
        marker = '>>>' if i == lineno else '   '
        out.append(f'  {marker} {i:5}: {l}')
    return '\n'.join(out)

def section(title):
    print('\n' + '=' * 70)
    print(title)
    print('=' * 70)

# ── S19: capability_aliases → resolveAgentCommand ────────────────────────────
section('S19 — capability_aliases → resolveAgentCommand')

print('\n--- resolveAgentCommand definition ---')
hits = grep('resolveAgentCommand', SRC / 'api/command-run-telemetry.js', context=2)
print(hits[:500] or '  not found')

print('\n--- resolveAgentCommand full body (find function start) ---')
f = SRC / 'api/command-run-telemetry.js'
if f.exists():
    lines = f.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'async function resolveAgentCommand' in l or 'export async function resolveAgentCommand' in l:
            print(show(f, i+1, before=1, after=40))
            break

print('\n--- capability_aliases table structure (sample rows from code) ---')
print(grep('capability_aliases', SRC, context=2)[:1500] or '  no refs')

print('\n--- where resolveAgentCommand is called ---')
print(grep('resolveAgentCommand', SRC, context=3)[:1000])

# ── S20: context_digest → buildSystemPrompt ─────────────────────────────────
section('S20 — context_digest → buildSystemPrompt')

print('\n--- buildSystemPrompt definition ---')
f_agent = SRC / 'api/agent.js'
if f_agent.exists():
    lines = f_agent.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'buildSystemPrompt' in l and ('async function' in l or 'function buildSystemPrompt' in l):
            print(show(f_agent, i+1, before=1, after=30))
            break

print('\n--- buildSystemPrompt call sites ---')
print(grep('buildSystemPrompt', SRC, context=3)[:1500])

print('\n--- context_digest current usage (should be 0) ---')
print(grep('context_digest', SRC, context=2)[:500] or '  (0 refs — unwired)')

print('\n--- system prompt assembly — where ## sections are injected ---')
if f_agent.exists():
    lines = f_agent.read_text().splitlines()
    for i, l in enumerate(lines):
        if '## Rules' in l or '## Context' in l or 'rules_document' in l or 'agentsam_rules' in l:
            print(f'  line {i+1}: {l.strip()}')

# ── iam-browser-screenshot event wire ────────────────────────────────────────
section('Browser Screenshot — iam-browser-screenshot event wire')

print('\n--- iam-browser-screenshot dispatch (should be in SSE handler) ---')
print(grep('iam-browser-screenshot', ROOT / 'dashboard', context=5,
           include='*.tsx')[:1500] or '  (no dispatch found)')

print('\n--- cdt_take_screenshot / browser_screenshot in SSE tool_done handler ---')
dash = ROOT / 'dashboard'
r = subprocess.run(
    ['grep', '-rn', '--include=*.ts', '--include=*.tsx',
     'tool_done\|tool_name.*screenshot\|screenshot.*tool\|cdt_take_screenshot\|browser_screenshot',
     '-A', '5', str(dash)],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:2000] or '  not found')

print('\n--- iam-browser-navigate handler in useAgentChatStream (reference point) ---')
r2 = subprocess.run(
    ['grep', '-rn', '--include=*.ts', '--include=*.tsx',
     'iam-browser-navigate\|onBrowserNavigate\|handleBrowserNavigate',
     '-A', '5', str(dash)],
    cwd=ROOT, capture_output=True, text=True
)
print(r2.stdout[:1500] or '  not found')

# ── apply_change_set dual write → approval_queue ─────────────────────────────
section('apply_change_set → agentsam_approval_queue dual write')

print('\n--- applyChangeSetImpl — current implementation ---')
fs_js = SRC / 'tools/builtin/fs.js'
if fs_js.exists():
    lines = fs_js.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'applyChangeSetImpl' in l or 'apply_change_set' in l:
            print(show(fs_js, i+1, before=1, after=35))
            break

print('\n--- approval_queue INSERT pattern (from agent.js — use as template) ---')
if f_agent.exists():
    lines = f_agent.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'INSERT INTO agentsam_approval_queue' in l:
            print(show(f_agent, i+1, before=2, after=20))
            print('  ---')
            break

# ── S21: guardrail_rulesets → evaluateGuardrails ─────────────────────────────
section('S21 — guardrail_rulesets → evaluateGuardrails')

print('\n--- evaluateGuardrails definition ---')
print(grep('evaluateGuardrails', SRC, context=3)[:500])

f_guard = SRC / 'core/guardrails.js'
if f_guard.exists():
    lines = f_guard.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'async function evaluateGuardrails' in l or 'function evaluateGuardrails' in l:
            print(show(f_guard, i+1, before=1, after=40))
            break

print('\n--- guardrail_rulesets current usage ---')
print(grep('guardrail_rulesets', SRC, context=2)[:500] or '  (0 refs — unwired)')

# ── S17: LLM-as-judge grader in eval-runner.js ──────────────────────────────
section('S17 — LLM-as-judge grader stub in eval-runner.js')

f_eval = SRC / 'core/eval-runner.js'
if f_eval.exists():
    lines = f_eval.read_text().splitlines()
    for i, l in enumerate(lines):
        if '0.75' in l or 'stub' in l.lower() or 'scoreQuality' in l or 'score_overall' in l:
            print(f'  line {i+1}: {l.strip()}')

print('\n--- how score_overall is currently set ---')
print(grep('score_overall\|scoreQuality\|grader\|judge', f_eval, context=4)[:2000])

print('\n--- what AI client is available in eval-runner.js ---')
if f_eval.exists():
    for i, l in enumerate(f_eval.read_text().splitlines()[:30]):
        print(f'  {i+1}: {l}')

# ── patch_sessions → change_sets consolidation ───────────────────────────────
section('patch_sessions → change_sets consolidation')

print('\n--- patch_sessions schema (from sqlite_master if accessible) ---')
print(grep('patch_sessions', SRC, context=2)[:500] or '  (0 refs in src/)')
print('\n  Note: 19 rows exist in D1, written by a now-removed code path.')
print('  change_sets is the canonical table going forward.')
print('  Consolidation = migration that copies patch_sessions rows into change_sets + drops/renames.')

# ── S23: model picker suppression ────────────────────────────────────────────
section('S23 — model picker suppression')

print('\n--- model picker in dashboard ---')
r = subprocess.run(
    ['grep', '-rn', '--include=*.tsx', '--include=*.ts',
     'modelPicker\|ModelPicker\|model.*picker\|picker.*model\|ModelSelector\|model_selector',
     '-A', '3', str(ROOT / 'dashboard')],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:2000] or '  not found')

print('\n--- where model selection bypasses routing ---')
print(grep('selected_model\|selectedModel\|model_override\|override.*model', SRC, context=3)[:1500])

# ── subagent dispatch validation ─────────────────────────────────────────────
section('subagent_profile dispatch — end-to-end path')

print('\n--- subagent routing entry point ---')
print(grep('subagent.*profile_id\|subagent_profile_id\|subagent === true', SRC, context=5)[:1500])

print('\n--- subagent_coder / subagent_browser / subagent_toolbox dispatch ---')
print(grep('subagent_coder\|subagent_browser\|subagent_toolbox', SRC, context=4)[:1500])

print('\n--- agentsam_subagent_profile SELECT at runtime ---')
print(grep('FROM agentsam_subagent_profile', SRC, context=4)[:1000])

# ── context_digest auto-generation ───────────────────────────────────────────
section('context_digest auto-generation — where it should be written')

print('\n--- session end / conversation close hooks ---')
print(grep('session.*end\|conversationEnd\|onSessionEnd\|session_end\|chat.*complete', SRC, context=3)[:1500])

print('\n--- cron jobs that could write digests ---')
r = subprocess.run(
    ['grep', '-rn', '--include=*.js', 'context_digest\|writeDigest\|buildDigest',
     str(SRC)],
    cwd=ROOT, capture_output=True, text=True
)
print(r.stdout[:500] or '  (no digest writer found — needs to be created)')

print('\n' + '=' * 70)
print('AUDIT COMPLETE — paste output for precise Cursor prompts')
print('=' * 70)
