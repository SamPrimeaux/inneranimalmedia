#!/usr/bin/env python3
"""
Search ALL git commits for complete upsertOauthToken body.
"""
import subprocess, re
from pathlib import Path

ROOT        = Path('/Users/samprimeaux/inneranimalmedia')
TOKEN_STORE = ROOT / 'src/core/oauth-token-store.js'

# Get every commit that touched oauth.js
log = subprocess.run(
    ['git', 'log', '--all', '--oneline', '--', 'src/api/oauth.js'],
    cwd=ROOT, capture_output=True, text=True
)
commits = [line.split()[0] for line in log.stdout.strip().splitlines() if line.strip()]
print(f'Found {len(commits)} commits touching oauth.js — scanning all...\n')

fn_body = None
found_in = None

for sha in commits:
    result = subprocess.run(
        ['git', 'show', f'{sha}:src/api/oauth.js'],
        cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode != 0:
        continue
    lines = result.stdout.splitlines()

    fn_start = None
    for i, line in enumerate(lines):
        if re.search(r'(export\s+)?async\s+function\s+upsertOauthToken\b', line):
            fn_start = i
            break
    if fn_start is None:
        continue

    depth = 0
    found_open = False
    fn_end = None
    for i in range(fn_start, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
                found_open = True
            elif ch == '}':
                depth -= 1
        if found_open and depth == 0:
            fn_end = i
            break

    length = (fn_end - fn_start + 1) if fn_end else 0
    print(f'  {sha}: found upsertOauthToken, {length} lines')

    if fn_end and length > 10:
        fn_body = '\n'.join(lines[fn_start:fn_end+1])
        found_in = sha
        print(f'  → Using this one.\n')
        break

if not fn_body:
    # Last resort: check if it's in any other src/ file
    print('Not found in oauth.js history. Checking other src/ files in HEAD...')
    for f in (ROOT / 'src').rglob('*.js'):
        try:
            content = f.read_text()
        except Exception:
            continue
        if 'upsertOauthToken' not in content:
            continue
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if re.search(r'(export\s+)?async\s+function\s+upsertOauthToken\b', line):
                depth = 0
                found_open = False
                fn_end = None
                for j in range(i, len(lines)):
                    for ch in lines[j]:
                        if ch == '{': depth += 1; found_open = True
                        elif ch == '}': depth -= 1
                    if found_open and depth == 0:
                        fn_end = j
                        break
                length = (fn_end - i + 1) if fn_end else 0
                print(f'  {f.relative_to(ROOT)}: upsertOauthToken {length} lines')
                if fn_end and length > 10:
                    fn_body = '\n'.join(lines[i:fn_end+1])
                    found_in = str(f.relative_to(ROOT))

if not fn_body:
    print('\nFAILED — function body is gone from all sources.')
    print('We need to reconstruct it. Run this to see what calls upsertOauthToken')
    print('so we know what parameters flow in:\n')
    print('  grep -rn "upsertOauthToken" src/ --include="*.js" | head -30')
    exit(1)

# ── Strip export prefix ──────────────────────────────────────────────────────
fn_body_clean = re.sub(r'^export\s+', '', fn_body, flags=re.MULTILINE)

print(f'=== Recovered from: {found_in} ===')
print(fn_body_clean[:800])
print('...' if len(fn_body_clean) > 800 else '')

# ── Write into oauth-token-store.js ─────────────────────────────────────────
print(f'\n=== Writing into oauth-token-store.js ===')
ts_src  = TOKEN_STORE.read_text()
ts_lines = ts_src.splitlines()

stub_start = None
for i, line in enumerate(ts_lines):
    if re.search(r'async\s+function\s+upsertOauthToken\b', line):
        stub_start = i
        break

if stub_start is not None:
    stub_end = len(ts_lines) - 1
    for i in range(stub_start, len(ts_lines)):
        if ts_lines[i].strip().startswith('export {'):
            stub_end = i - 1
            break
    new_ts = (
        '\n'.join(ts_lines[:stub_start])
        + '\n'
        + fn_body_clean
        + '\n'
        + '\n'.join(ts_lines[stub_end+1:])
    )
else:
    new_ts = re.sub(r'\nexport \{', '\n' + fn_body_clean + '\n\nexport {', ts_src)

TOKEN_STORE.write_text(new_ts)
final = TOKEN_STORE.read_text().splitlines()
print(f'oauth-token-store.js now {len(final)} lines.')
print('Last 6:')
for l in final[-6:]:
    print(f'  {l}')

print('\n✓ T001 fully complete.')
print('Next: python3 patch_t002_provider_string.py')
print('(Check if T002 is already handled — mapTokenProviderForStorage maps google→google_drive)')
