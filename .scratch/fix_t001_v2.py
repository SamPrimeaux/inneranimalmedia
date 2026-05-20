#!/usr/bin/env python3
"""
Inspect current state and fix circular imports directly.
"""
from pathlib import Path
import re

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
TOKEN_STORE  = ROOT / 'src/core/oauth-token-store.js'
OAUTH_JS     = ROOT / 'src/api/oauth.js'
CALLBACKS_JS = ROOT / 'src/api/oauth-login-callbacks.js'

# ── Show current state ──────────────────────────────────────────────────────

print('=== oauth-token-store.js (first 80 lines) ===')
lines = TOKEN_STORE.read_text().splitlines()
for i, l in enumerate(lines[:80], 1):
    print(f'  {i:3}: {l}')

print('\n=== oauth.js imports (first 25 lines) ===')
lines = OAUTH_JS.read_text().splitlines()
for i, l in enumerate(lines[:25], 1):
    print(f'  {i:3}: {l}')

print('\n=== oauth-login-callbacks.js imports (first 20 lines) ===')
lines = CALLBACKS_JS.read_text().splitlines()
for i, l in enumerate(lines[:20], 1):
    print(f'  {i:3}: {l}')

# ── Fix oauth-token-store.js: remove bottom export{} and any remaining inline exports ──

print('\n=== Fixing oauth-token-store.js ===')
src = TOKEN_STORE.read_text()

# Remove the bottom export { ... } block (named re-export)
before = src
src = re.sub(r'\nexport\s*\{[^}]*\};\s*$', '', src, flags=re.DOTALL)
if src != before:
    print('  Removed bottom export{} block.')

# Strip any remaining inline `export ` from declarations
src2 = re.sub(r'^export (async function|function|const) ', r'\1 ', src, flags=re.MULTILINE)
if src2 != src:
    print('  Stripped remaining inline export keywords.')
src = src2

# Ensure named exports at bottom
if 'export {' not in src and 'export function' not in src and 'export async' not in src:
    src = src.rstrip() + '\n\nexport { nowSeconds, encryptWithVault, decryptWithVault, pragmaColumns, ensureOauthTokenColumns, normalizeProvider, mapTokenProviderForStorage, upsertOauthToken };\n'
    print('  Added named export block.')

TOKEN_STORE.write_text(src)
print('  Written.')

# ── Fix oauth-login-callbacks.js: patch import from oauth.js → oauth-token-store.js ──

print('\n=== Fixing oauth-login-callbacks.js ===')
cb = CALLBACKS_JS.read_text()
cb_new = re.sub(
    r"from\s+['\"]\.\/oauth\.js['\"]",
    "from '../core/oauth-token-store.js'",
    cb
)
if cb_new != cb:
    print('  Patched import: ./oauth.js → ../core/oauth-token-store.js')
    CALLBACKS_JS.write_text(cb_new)
    print('  Written.')
else:
    print('  No ./oauth.js import found — checking for other patterns...')
    # Show all imports to debug
    for i, line in enumerate(cb.splitlines(), 1):
        if 'import' in line and i <= 25:
            print(f'    line {i}: {line}')

# ── Fix oauth.js: ensure no import from oauth-login-callbacks ──

print('\n=== Checking oauth.js for lingering oauth-login-callbacks import ===')
oauth = OAUTH_JS.read_text()
oauth_new = '\n'.join(
    line for line in oauth.splitlines()
    if 'oauth-login-callbacks' not in line
) + '\n'
if oauth_new != oauth:
    print('  Found and removed oauth-login-callbacks import line(s).')
    OAUTH_JS.write_text(oauth_new)
else:
    print('  Clean — no oauth-login-callbacks import in oauth.js.')

# ── Final check (grep-style, not node --check which fails on ESM) ──────────

print('\n=== Final circular import check ===')
cb_final = CALLBACKS_JS.read_text()
oauth_final = OAUTH_JS.read_text()

ok = True
if re.search(r"from\s+['\"]\.\/oauth\.js['\"]", cb_final):
    print('  FAIL: oauth-login-callbacks.js still imports from oauth.js')
    ok = False
else:
    print('  PASS: oauth-login-callbacks.js does not import oauth.js')

if 'oauth-login-callbacks' in oauth_final:
    print('  FAIL: oauth.js still imports oauth-login-callbacks.js')
    ok = False
else:
    print('  PASS: oauth.js does not import oauth-login-callbacks.js')

ts = TOKEN_STORE.read_text()
if 'export' not in ts:
    print('  FAIL: oauth-token-store.js has no exports')
    ok = False
else:
    print('  PASS: oauth-token-store.js has exports')

if ok:
    print('\n✓ T001 complete. Run: python3 patch_t002_provider_string.py')
else:
    print('\n✗ Issues remain — paste this output.')
