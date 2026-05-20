#!/usr/bin/env python3
"""
Fix T001 post-patch issues:
1. Remove duplicate inline `export` keywords from oauth-token-store.js
   (functions have `export` AND there's a bottom export{} block)
2. Remove the oauth-login-callbacks.js import from oauth.js (circular)
"""

import re
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
TOKEN_STORE = ROOT / 'src/core/oauth-token-store.js'
OAUTH_JS    = ROOT / 'src/api/oauth.js'

# ── Fix 1: oauth-token-store.js duplicate exports ──────────────────────────

print('[Fix 1] Reading oauth-token-store.js...')
src = TOKEN_STORE.read_text()

# Strip `export ` prefix from function/const declarations
# These were copied with their inline export keyword; the bottom
# export{} block already re-exports them.
fixed = re.sub(r'^export (async function|function|const) ', r'\1 ', src, flags=re.MULTILINE)

if fixed == src:
    print('  No inline export keywords found — already clean.')
else:
    count = len(re.findall(r'^export (async function|function|const) ', src, re.MULTILINE))
    print(f'  Removed {count} inline export keyword(s).')

TOKEN_STORE.write_text(fixed)
print('  Written.')

# ── Fix 2: oauth.js — remove import from oauth-login-callbacks.js ──────────

print('\n[Fix 2] Reading oauth.js...')
oauth_src = OAUTH_JS.read_text()
lines = oauth_src.splitlines(keepends=True)

new_lines = []
removed = []
for i, line in enumerate(lines, 1):
    if 'oauth-login-callbacks' in line and line.strip().startswith('import'):
        removed.append((i, line.rstrip()))
        print(f'  Removing line {i}: {line.rstrip()}')
    else:
        new_lines.append(line)

if not removed:
    print('  No oauth-login-callbacks import found in oauth.js — already clean.')
else:
    OAUTH_JS.write_text(''.join(new_lines))
    print(f'  Removed {len(removed)} line(s). Written.')

# ── Validate ────────────────────────────────────────────────────────────────

import subprocess

print('\n[Validate] node --check on all three files...')
for f in [TOKEN_STORE, OAUTH_JS, ROOT / 'src/api/oauth-login-callbacks.js']:
    r = subprocess.run(['node', '--check', str(f)], capture_output=True, text=True)
    if r.returncode == 0:
        print(f'  PASS  {f.name}')
    else:
        print(f'  FAIL  {f.name}')
        print(f'        {r.stderr.strip()}')

print('\n[Circular check]')
cb_src = (ROOT / 'src/api/oauth-login-callbacks.js').read_text()
if "'./oauth.js'" in cb_src or '"./oauth.js"' in cb_src:
    print('  FAIL: oauth-login-callbacks.js still imports from oauth.js')
else:
    print('  PASS: oauth-login-callbacks.js no longer imports oauth.js')

oauth_final = OAUTH_JS.read_text()
if 'oauth-login-callbacks' in oauth_final:
    print('  FAIL: oauth.js still imports oauth-login-callbacks.js')
else:
    print('  PASS: oauth.js circular import removed')

print('\nDone. If all PASS above, run: python3 patch_t002_provider_string.py')
