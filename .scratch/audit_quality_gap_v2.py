#!/usr/bin/env python3
"""
Quality gap audit v2 — fixes grep escape issues, finds missing dispatch paths.
"""
import subprocess
from pathlib import Path

ROOT  = Path('/Users/samprimeaux/inneranimalmedia')
SRC   = ROOT / 'src'
DASH  = ROOT / 'dashboard'

def grep(pattern, *paths, context=4, include='*.js', extra_includes=None):
    """Single-pattern grep — no alternation, no escape issues."""
    args = ['grep', '-rn', f'--include={include}',
            '-A', str(context), '-B', str(context), pattern]
    if extra_includes:
        for e in extra_includes:
            args.insert(1, f'--include={e}')
    args += [str(p) for p in (paths or [SRC])]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

def show(path, lineno, before=3, after=20):
    p = Path(path)
    if not p.exists():
        return f'  NOT FOUND: {path}'
    lines = p.read_text().splitlines()
    s = max(0, lineno - before - 1)
    e = min(len(lines), lineno + after)
    out = []
    for i, l in enumerate(lines[s:e], s + 1):
        m = '>>>' if i == lineno else '   '
        out.append(f'  {m} {i:5}: {l}')
    return '\n'.join(out)

def section(t):
    print(f'\n{"=" * 70}\n{t}\n{"=" * 70}')

# ── S19: WHERE does free-text intent → tool happen? ─────────────────────────
section('S19 — FREE-TEXT intent resolution path (not slash commands)')

print('\n--- Where tool selection happens for non-slash messages ---')
print(grep('intentSlug', SRC, context=4))

print('\n--- loadToolsForRequest / tool selection entry point ---')
for term in ['loadToolsForRequest', 'selectTools', 'toolsForRequest', 'tool_selection']:
    h = grep(term, SRC, context=3)
    if h:
        print(f'\n  [{term}]')
        print(h[:800])

print('\n--- capability_aliases SELECT query anywhere in codebase ---')
print(grep('capability_aliases', SRC, context=5))

print('\n--- resolveAgentCommand — confirm slash-only gate (line 54) ---')
f = SRC / 'api/command-run-telemetry.js'
if f.exists():
    print(show(f, 54, before=2, after=10))

print('\n--- agentsam_capability_aliases — D1 column structure ---')
# Show a migration that created it
import subprocess as sp
r = sp.run(['grep', '-rn', '--include=*.sql', 'agentsam_capability_aliases',
            str(ROOT / 'migrations')],
           capture_output=True, text=True)
print(r.stdout[:1500] or '  (not in migrations — check D1 studio)')

# ── S17: eval grader — show the full stub block ──────────────────────────────
section('S17 — eval-runner.js grader stub (full block lines 55-100)')

f_eval = SRC / 'core/eval-runner.js'
if f_eval.exists():
    print(show(f_eval, 55, before=5, after=55))

print('\n--- callAI or fetch Anthropic in eval-runner.js ---')
print(grep('callAI', f_eval, context=3))
print(grep('fetch', f_eval, context=3)[:500])
print(grep('ANTHROPIC', f_eval, context=2))

# ── Subagent dispatch — what handles subagent_dispatch in agent.js ───────────
section('subagent_dispatch — what runs after task_type = subagent_dispatch')

f_agent = SRC / 'api/agent.js'
print('\n--- subagent_dispatch handler in agent.js ---')
print(grep('subagent_dispatch', f_agent, context=10))

print('\n--- subagent_profile_id in agent.js chat handler ---')
print(grep('subagent_profile_id', f_agent, context=6))

print('\n--- mcp.js subagent dispatch ---')
print(grep('subagent', SRC / 'api/mcp.js', context=5)[:1500])

# ── S20: buildSystemPrompt — show where sections are injected ────────────────
section('S20 — buildSystemPrompt injection points')

print('\n--- All ## section injections in buildSystemPrompt ---')
if f_agent.exists():
    lines = f_agent.read_text().splitlines()
    # Show 664 + 80 lines (full function start)
    print(show(f_agent, 664, before=0, after=80))

print('\n--- options object passed to buildSystemPrompt ---')
print(grep('buildSystemPrompt(', f_agent, context=5)[:2000])

# ── Browser screenshot — SSE handler for cdt_take_screenshot ────────────────
section('Browser screenshot — find tool_done handler in useAgentChatStream.ts')

uas = DASH / 'features/agent-chat/hooks/useAgentChatStream.ts'
if uas.exists():
    lines = uas.read_text().splitlines()
    # Find the browser nav tool_done block Cursor just added
    for i, l in enumerate(lines):
        if 'browser_open_url' in l or 'cdt_navigate_page' in l or 'activeBrowserNavTool' in l:
            print(f'\n  --- browser nav block at line {i+1} ---')
            print(show(uas, i+1, before=3, after=25))
            break

print('\n--- onBrowserNavigate prop definition in useAgentChatStream ---')
print(grep('onBrowserNavigate', uas, context=4,
           include='*.ts', extra_includes=['*.tsx'])[:1000])

print('\n--- screenshot_url in tool output parsing ---')
print(grep('screenshot_url', uas, context=4,
           include='*.ts', extra_includes=['*.tsx'])[:500] or '  (not handled yet — needs adding)')

# ── S21: guardrail_rulesets — show evaluateGuardrails full query + add point ─
section('S21 — evaluateGuardrails rulesets insertion point')

f_guard = SRC / 'core/guardrails.js'
if f_guard.exists():
    print(show(f_guard, 354, before=0, after=50))

print('\n--- agentsam_guardrail_rulesets schema (from migration) ---')
r2 = sp.run(['grep', '-rn', '--include=*.sql', 'guardrail_rulesets',
             str(ROOT / 'migrations')],
            capture_output=True, text=True)
print(r2.stdout[:1000] or '  (check D1 directly)')

# ── apply_change_set → approval_queue: show full applyChangeSetImpl ──────────
section('apply_change_set — full implementation (find accept block)')

fs_js = SRC / 'tools/builtin/fs.js'
if fs_js.exists():
    print(show(fs_js, 341, before=0, after=80))

# ── S23: model picker — find the toggle/render and feature flag pattern ───────
section('S23 — model picker render + feature flag pattern')

chat = DASH / 'features/agent-chat/ChatAssistant.tsx'
if chat.exists():
    lines = chat.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'isModelPickerOpen' in l and ('return' in l or '<' in l or 'render' in l.lower()):
            print(f'\n  --- picker render at line {i+1} ---')
            print(show(chat, i+1, before=2, after=15))
            break

print('\n--- feature flag pattern used elsewhere in ChatAssistant ---')
print(grep('isFeatureEnabled', chat, context=3,
           include='*.tsx', extra_includes=['*.ts'])[:800])
print(grep('featureFlag', chat, context=3,
           include='*.tsx', extra_includes=['*.ts'])[:500])

# ── context_digest: session_end hook in cicd-event.js ───────────────────────
section('context_digest — session_end hook + where to write digest')

f_cicd = SRC / 'api/cicd-event.js'
if f_cicd.exists():
    lines = f_cicd.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'session_end' in l or 'handleSessionEnd' in l:
            print(show(f_cicd, i+1, before=2, after=20))
            break

print('\n--- agentsam_context_digest schema (from migration or D1) ---')
r3 = sp.run(['grep', '-rn', '--include=*.sql', 'context_digest',
             str(ROOT / 'migrations')],
            capture_output=True, text=True)
print(r3.stdout[:500] or '  (schema unknown — need D1 query)')

print('\n--- callAI / AI completion helper available in agent.js ---')
print(grep('callAI', f_agent, context=2)[:500])
print(grep('import.*callAI', f_agent, context=1)[:300])

print('\n' + '=' * 70)
print('v2 AUDIT COMPLETE')
print('=' * 70)
