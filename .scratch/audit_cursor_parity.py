#!/usr/bin/env python3
"""
Agent Sam — Cursor Parity Repair Ladder
Master Audit Script
Run from repo root: python3 audit_cursor_parity.py
Outputs everything needed to write patches for T001-T011.
No writes. Read-only.
"""

import os, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
if not (ROOT / 'src').exists():
    ROOT = Path.cwd()
if not (ROOT / 'src').exists():
    sys.exit("ERROR: Run from the inneranimalmedia repo root.")

def sep(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print('='*70)

def read(path):
    try:
        return Path(path).read_text(errors='replace')
    except Exception as e:
        return f"[CANNOT READ: {e}]"

def show_lines(path, start, end, label=""):
    lines = read(path).splitlines()
    tag = label or f"{path}:{start}-{end}"
    print(f"\n--- {tag} ---")
    for i, line in enumerate(lines[start-1:end], start=start):
        print(f"{i:5}  {line}")

def grep(path, pattern, context=2, max_hits=30):
    lines = read(path).splitlines()
    rx = re.compile(pattern)
    hits = []
    for i, line in enumerate(lines):
        if rx.search(line):
            hits.append(i)
    shown = 0
    for idx in hits:
        if shown >= max_hits:
            print(f"  ... ({len(hits) - shown} more hits)")
            break
        lo = max(0, idx - context)
        hi = min(len(lines), idx + context + 1)
        print(f"\n  line {idx+1}:")
        for j in range(lo, hi):
            marker = ">>>" if j == idx else "   "
            print(f"  {marker} {j+1:5}  {lines[j]}")
        shown += 1
    return hits

def grep_files(paths, pattern, context=1, max_hits=20):
    rx = re.compile(pattern)
    results = []
    for p in paths:
        if not Path(p).exists():
            continue
        lines = read(p).splitlines()
        for i, line in enumerate(lines):
            if rx.search(line):
                results.append((p, i+1, line.rstrip()))
    for p, ln, line in results[:max_hits]:
        print(f"  {p}:{ln}  {line}")
    if len(results) > max_hits:
        print(f"  ... ({len(results) - max_hits} more)")
    return results

# ─────────────────────────────────────────────────────────────────────────────
# T001 — oauth circular import + upsertOauthToken extraction
# ─────────────────────────────────────────────────────────────────────────────
sep("T001 — oauth.js circular import + upsertOauthToken")

oauth_js      = ROOT / 'src/api/oauth.js'
oauth_cb_js   = ROOT / 'src/api/oauth-login-callbacks.js'

print("\n[oauth.js top imports]")
show_lines(oauth_js, 1, 30)

print("\n[oauth-login-callbacks.js top imports]")
show_lines(oauth_cb_js, 1, 25)

print("\n[upsertOauthToken occurrences in oauth.js]")
hits = grep(oauth_js, r'upsertOauthToken', context=0)
if hits:
    # Show the full function body
    lines = read(oauth_js).splitlines()
    fn_start = hits[0]  # likely the definition
    # Find definition vs calls
    for h in hits:
        if re.search(r'(export\s+)?(async\s+)?function\s+upsertOauthToken|const\s+upsertOauthToken\s*=', lines[h]):
            fn_start = h
            break
    # Find end of function (next top-level export or function at col 0)
    fn_end = fn_start + 1
    brace_depth = 0
    in_fn = False
    for i in range(fn_start, min(fn_start + 150, len(lines))):
        l = lines[i]
        brace_depth += l.count('{') - l.count('}')
        if i == fn_start:
            in_fn = True
        if in_fn and i > fn_start and brace_depth <= 0:
            fn_end = i + 1
            break
    print(f"\n[upsertOauthToken FULL BODY — lines {fn_start+1} to {fn_end}]")
    show_lines(oauth_js, fn_start+1, fn_end)

print("\n[private helpers called INSIDE upsertOauthToken — looking for non-imported fns]")
grep(oauth_js, r'pragmaColumns|ensureColumns|ensureOauth|alterTable|addColumn|buildTokenRow|tokenRowFor', context=1)

print("\n[what upsertOauthToken calls that live in oauth.js (not imported)]")
# Get all function/const definitions in oauth.js
lines = read(oauth_js).splitlines()
local_fns = []
for i, l in enumerate(lines):
    m = re.match(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(', l)
    if m:
        name = m.group(1) or m.group(2)
        local_fns.append((i+1, name))
        print(f"  line {i+1:5}  {name}")

print("\n[circular: oauth-login-callbacks.js imports from oauth.js]")
grep(oauth_cb_js, r"from\s+['\"]\.\/oauth|require.*oauth\.js", context=0)

print("\n[circular: oauth.js imports from oauth-login-callbacks.js]")
grep(oauth_js, r"from\s+['\"]\.\/oauth-login-callbacks|require.*oauth-login-callbacks", context=0)


# ─────────────────────────────────────────────────────────────────────────────
# T002 — provider='google' writes that should be 'google_drive'
# ─────────────────────────────────────────────────────────────────────────────
sep("T002 — provider string mismatch: google vs google_drive in INSERT writes")

print("\n[ALL user_oauth_tokens INSERT/UPDATE in oauth.js with provider value]")
lines = read(oauth_js).splitlines()
in_insert = False
insert_blocks = []
current_block = []
current_start = 0
for i, line in enumerate(lines):
    if re.search(r'INSERT.*user_oauth_tokens|UPDATE.*user_oauth_tokens', line, re.IGNORECASE):
        in_insert = True
        current_start = i + 1
        current_block = [line]
    elif in_insert:
        current_block.append(line)
        if ';' in line or line.strip().startswith('`') and line.strip().endswith('`'):
            insert_blocks.append((current_start, list(current_block)))
            in_insert = False
            current_block = []
        if len(current_block) > 25:
            insert_blocks.append((current_start, list(current_block)))
            in_insert = False
            current_block = []

for start, block in insert_blocks:
    print(f"\n  --- INSERT/UPDATE block at line {start} ---")
    for j, l in enumerate(block):
        print(f"  {start+j:5}  {l}")

print("\n[provider value written in oauth.js — look for google vs google_drive]")
grep(oauth_js, r"provider.*['\"]google['\"]|['\"]google['\"].*provider", context=2)

print("\n[provider value in oauth-login-callbacks.js for comparison]")
grep(oauth_cb_js, r"provider.*['\"]google|['\"]google.*provider", context=2)

print("\n[user-oauth-token.js alias map]")
uot = ROOT / 'src/core/user-oauth-token.js'
grep(uot, r'google|alias|normalizeProvider|canonicalProvider', context=1)


# ─────────────────────────────────────────────────────────────────────────────
# T003 — execute-approved-tool route insertion point
# ─────────────────────────────────────────────────────────────────────────────
sep("T003 — execute-approved-tool insertion point in agent.js")

agent_js = ROOT / 'src/api/agent.js'

print("\n[how agent.js does path routing — find the pattern]")
grep(agent_js, r"path\s*===\s*['\"]\/api\/agent\/chat['\"]|pathLower.*agent.*chat|if.*path.*chat", context=2, max_hits=10)

print("\n[lines around /api/agent/chat main handler]")
lines = read(agent_js).splitlines()
for i, l in enumerate(lines):
    if re.search(r"['\"]\/api\/agent\/chat['\"]", l) and 'execute' not in l:
        show_lines(agent_js, max(1,i-2), min(len(lines),i+8))
        break

print("\n[dispatchToolCall signature — line 1704 area]")
show_lines(agent_js, 1700, 1720)

print("\n[dispatchToolCallWithBudget call pattern — how context is built]")
show_lines(agent_js, 3855, 3880)

print("\n[how nearby routes load auth/session — find getAuthUser pattern near chat]")
grep(agent_js, r'getAuthUser|authUser\s*=|userId\s*=|resolvedWorkspaceId', context=1, max_hits=8)

print("\n[execute-approved-tool in ChatAssistant — what body it sends]")
ca = ROOT / 'dashboard/features/agent-chat/ChatAssistant.tsx'
grep(ca, r'execute-approved-tool', context=8)

print("\n[plan-task/resume handler as reference for how to build a similar route]")
show_lines(agent_js, 8782, 8830)


# ─────────────────────────────────────────────────────────────────────────────
# T004/T005 — ActiveFile type + FormData + source envelope
# ─────────────────────────────────────────────────────────────────────────────
sep("T004/T005 — ActiveFile type definition + FormData send location")

print("\n[where ActiveFile type is defined]")
for candidate in [
    'dashboard/src/types.ts',
    'src/types.ts',
    'dashboard/types.ts',
    'dashboard/features/agent-chat/types.ts',
]:
    p = ROOT / candidate
    if p.exists():
        hits = grep(p, r'ActiveFile|type.*File.*=|interface.*File', context=2, max_hits=5)
        if hits:
            print(f"  FOUND in {candidate}")
            break

print("\n[handle field on ActiveFile or tree node]")
for candidate in [
    'dashboard/src/types.ts', 'src/types.ts',
    'dashboard/components/LocalExplorer.tsx',
]:
    p = ROOT / candidate
    if p.exists():
        grep(p, r'handle\??:\s*File|FileSystemFileHandle|FileSystemHandle', context=1)

print("\n[where openFile / openInEditorFromExplorer is called with file metadata]")
grep(ROOT / 'dashboard/components/LocalExplorer.tsx', r'openFile|openInEditor|openTab', context=3, max_hits=6)

print("\n[ChatAssistant.tsx — where FormData is built and appended before fetch]")
lines = read(ca).splitlines()
for i, l in enumerate(lines):
    if 'form.append' in l or 'FormData' in l:
        show_lines(ca, max(1,i-2), min(len(lines),i+3))
        break
# Show broader FormData section
grep(ca, r'form\.append|new FormData|formData\.append', context=1, max_hits=20)

print("\n[what agent.js reads from chat body re: file context]")
grep(agent_js, r'file_path|active_file|activeFile|workspacePath|r2_bucket|github_repo', context=2, max_hits=10)


# ─────────────────────────────────────────────────────────────────────────────
# T006 — Monaco Accept/Reject exact insertion point
# ─────────────────────────────────────────────────────────────────────────────
sep("T006 — MonacoEditorView hasDiffData section + handleSaveFile signature")

monaco = ROOT / 'dashboard/components/MonacoEditorView.tsx'

print("\n[hasDiffData block — full surrounding JSX]")
grep(monaco, r'hasDiffData', context=8)

print("\n[DiffEditor render — exact lines]")
grep(monaco, r'DiffEditor|showDiff', context=5)

print("\n[handleSaveFile — full signature + what it accepts]")
grep(ROOT / 'dashboard/App.tsx', r'handleSaveFile|onSave.*=.*handleSave|onSave\?', context=3, max_hits=8)

print("\n[how onSave is passed to MonacoEditorView]")
grep(ROOT / 'dashboard/App.tsx', r'MonacoEditorView|onSave.*=', context=3, max_hits=6)

print("\n[MonacoEditorView props interface]")
show_lines(monaco, 1, 60)


# ─────────────────────────────────────────────────────────────────────────────
# T007 — change_sets table schema from migration
# ─────────────────────────────────────────────────────────────────────────────
sep("T007 — change_sets migration schema")

migs = sorted((ROOT / 'migrations').glob('*change_set*')) if (ROOT / 'migrations').exists() else []
if migs:
    for m in migs:
        print(f"\n[{m.name}]")
        print(read(m))
else:
    print("  No migration file found — searching...")
    for f in (ROOT / 'migrations').glob('*.sql') if (ROOT / 'migrations').exists() else []:
        content = read(f)
        if 'change_set' in content.lower():
            print(f"\n[{f.name}]")
            print(content[:3000])
            break


# ─────────────────────────────────────────────────────────────────────────────
# T008 — playwright_jobs INSERT exact location
# ─────────────────────────────────────────────────────────────────────────────
sep("T008 — playwright_jobs INSERT statement")

playwright = ROOT / 'src/integrations/playwright.js'
print("\n[INSERT INTO playwright_jobs — full statement]")
lines = read(playwright).splitlines()
for i, l in enumerate(lines):
    if 'INSERT INTO playwright_jobs' in l:
        show_lines(playwright, max(1,i-2), min(len(lines),i+20))
        break

print("\n[metadata column — what currently goes in]")
grep(playwright, r'metadata|meta\b', context=2, max_hits=8)


# ─────────────────────────────────────────────────────────────────────────────
# T009 — terminal_history INSERT + triggered_by column
# ─────────────────────────────────────────────────────────────────────────────
sep("T009 — terminal_history INSERT + triggered_by")

term_js  = ROOT / 'src/core/terminal.js'
term_do  = ROOT / 'src/do/AgentChat.js'

print("\n[terminal.js — INSERT INTO terminal_history full statement]")
lines = read(term_js).splitlines()
for i, l in enumerate(lines):
    if 'INSERT INTO terminal_history' in l:
        show_lines(term_js, max(1,i-3), min(len(lines),i+15))
        break

print("\n[triggered_by value — what gets set today]")
grep(term_js, r'triggered_by', context=2)
grep(term_do, r'triggered_by', context=2)

print("\n[runInTerminal in App.tsx — full function]")
app = ROOT / 'dashboard/App.tsx'
lines = read(app).splitlines()
for i, l in enumerate(lines):
    if 'runInTerminal' in l and 'useCallback' in l:
        show_lines(app, i+1, min(len(lines), i+12))
        break

print("\n[how runInTerminal sends the command — iam:run-in-terminal event payload]")
grep(app, r'iam:run-in-terminal|terminalRef.*run|runCommand', context=3, max_hits=6)


# ─────────────────────────────────────────────────────────────────────────────
# T010 — is agent.html served at /dashboard/agent
# ─────────────────────────────────────────────────────────────────────────────
sep("T010 — agent.html route check")

dispatch = ROOT / 'src/core/production-dispatch.js'
index_js = ROOT / 'src/index.js'

print("\n[production-dispatch.js — /dashboard/agent or agent.html references]")
grep(dispatch, r'agent\.html|dashboard/agent|/dashboard/agent', context=3)

print("\n[index.js — agent.html or /dashboard/agent served]")
grep(index_js, r'agent\.html|dashboard/agent', context=3)

print("\n[R2 asset serving logic — how HTML pages are resolved]")
grep(dispatch, r'\.html|serveR2|r2.*html|dashboard.*html', context=2, max_hits=10)

print("\n[agent.html size confirmation]")
p = ROOT / 'dashboard/pages/agent.html'
if p.exists():
    print(f"  EXISTS: {p} — {p.stat().st_size} bytes / {len(p.read_text().splitlines())} lines")
else:
    print("  NOT FOUND at dashboard/pages/agent.html")


# ─────────────────────────────────────────────────────────────────────────────
# T011 — BrowserView iam:agent-open-surface event
# ─────────────────────────────────────────────────────────────────────────────
sep("T011 — BrowserView agent open surface wiring")

bv = ROOT / 'dashboard/components/BrowserView.tsx'

print("\n[iam:agent-open-surface — where fired and where listened]")
for candidate in ['dashboard/App.tsx', 'dashboard/components/BrowserView.tsx',
                  'dashboard/features/agent-chat/ChatAssistant.tsx']:
    p = ROOT / candidate
    if p.exists():
        hits = grep(p, r'agent-open-surface|agent_open_surface|openSurface', context=3, max_hits=4)

print("\n[BrowserView — navigate / url change API]")
grep(bv, r'navigate|setUrl|addressBar|onNavigate|browserNavigate', context=2, max_hits=8)

print("\n[what tool would fire browse_to_url — any existing browser tool]")
for f in (ROOT / 'src/tools').glob('*.js'):
    content = read(f)
    if 'browser' in content.lower() or 'navigate' in content.lower() or 'browse' in content.lower():
        print(f"\n  --- {f.name} ---")
        grep(f, r'browser|navigate|browse|url|screenshot', context=1, max_hits=6)


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
sep("AUDIT COMPLETE — paste full output back for patch generation")
print("""
Tasks covered:
  T001 — oauth.js circular import + upsertOauthToken extraction
  T002 — provider string 'google' vs 'google_drive' write sites
  T003 — execute-approved-tool insertion point in agent.js
  T004 — fs.js source routing (uses T005 output)
  T005 — ActiveFile type + FormData send location
  T006 — MonacoEditorView hasDiffData + Accept/Reject insertion
  T007 — change_sets migration schema
  T008 — playwright_jobs INSERT + metadata column
  T009 — terminal_history INSERT + triggered_by
  T010 — agent.html route serving confirmation
  T011 — BrowserView iam:agent-open-surface wiring
""")
