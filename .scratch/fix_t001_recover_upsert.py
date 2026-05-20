#!/usr/bin/env python3
"""
Recover upsertOauthToken full body from git history and
write it into oauth-token-store.js.
"""
import subprocess, re
from pathlib import Path

ROOT        = Path('/Users/samprimeaux/inneranimalmedia')
TOKEN_STORE = ROOT / 'src/core/oauth-token-store.js'

# ── Find the last commit that had upsertOauthToken in oauth.js ──────────────
print('=== Searching git log for last known upsertOauthToken in oauth.js ===')
log = subprocess.run(
    ['git', 'log', '--oneline', '-20', '--', 'src/api/oauth.js'],
    cwd=ROOT, capture_output=True, text=True
)
print(log.stdout.strip() or '  (no commits found)')

# Try the last 5 commits to find one with the full function body
commits = [line.split()[0] for line in log.stdout.strip().splitlines() if line.strip()]

fn_body = None
found_in = None

for sha in commits[:5]:
    result = subprocess.run(
        ['git', 'show', f'{sha}:src/api/oauth.js'],
        cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode != 0:
        continue
    content = result.stdout
    lines = content.splitlines()

    # Find upsertOauthToken
    fn_start = None
    for i, line in enumerate(lines):
        if re.search(r'(export\s+)?async\s+function\s+upsertOauthToken\b', line):
            fn_start = i
            break

    if fn_start is None:
        continue

    # Extract with brace counting
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

    if fn_end and (fn_end - fn_start) > 5:
        fn_body = '\n'.join(lines[fn_start:fn_end+1])
        found_in = sha
        print(f'  Found complete body in commit {sha} — {fn_end - fn_start + 1} lines')
        print(f'  First: {lines[fn_start].strip()}')
        print(f'  Last:  {lines[fn_end].strip()}')
        break

if not fn_body:
    # Fallback: try worker.js which may still have the original
    print('\n  Not found in oauth.js git history. Checking worker.js...')
    wjs = ROOT / 'worker.js'
    if wjs.exists():
        wlines = wjs.read_text().splitlines()
        for i, line in enumerate(wlines):
            if re.search(r'(export\s+)?async\s+function\s+upsertOauthToken\b', line):
                depth = 0
                found_open = False
                fn_end = None
                for j in range(i, len(wlines)):
                    for ch in wlines[j]:
                        if ch == '{': depth += 1; found_open = True
                        elif ch == '}': depth -= 1
                    if found_open and depth == 0:
                        fn_end = j
                        break
                if fn_end and (fn_end - i) > 5:
                    fn_body = '\n'.join(wlines[i:fn_end+1])
                    found_in = 'worker.js'
                    print(f'  Found in worker.js lines {i+1}–{fn_end+1} ({fn_end-i+1} lines)')
                break

if not fn_body:
    print('\n  FAILED: Could not recover upsertOauthToken from git or worker.js.')
    print('  Options:')
    print('    1. Run: git log --all --oneline -- src/api/oauth.js')
    print('    2. Run: git stash list')
    print('    3. Check if worker.js has the function')
    exit(1)

# ── Strip export keyword if present ─────────────────────────────────────────
fn_body_clean = re.sub(r'^export\s+', '', fn_body, flags=re.MULTILINE)

# ── Write into oauth-token-store.js ─────────────────────────────────────────
print(f'\n=== Writing recovered body into oauth-token-store.js (from {found_in}) ===')
ts_src = TOKEN_STORE.read_text()
ts_lines = ts_src.splitlines()

# Find the truncated stub and replace it
stub_start = None
for i, line in enumerate(ts_lines):
    if re.search(r'async\s+function\s+upsertOauthToken\b', line):
        stub_start = i
        break

if stub_start is not None:
    # Find where the stub ends (export line or EOF)
    stub_end = len(ts_lines) - 1
    for i in range(stub_start, len(ts_lines)):
        if ts_lines[i].strip().startswith('export {'):
            stub_end = i - 1
            break

    print(f'  Replacing stub lines {stub_start+1}–{stub_end+1} with full body ({len(fn_body_clean.splitlines())} lines)')
    new_ts = (
        '\n'.join(ts_lines[:stub_start])
        + '\n'
        + fn_body_clean
        + '\n'
        + '\n'.join(ts_lines[stub_end+1:])
    )
else:
    print('  No stub found — appending before export block')
    new_ts = re.sub(
        r'\nexport \{',
        '\n' + fn_body_clean + '\n\nexport {',
        ts_src
    )

TOKEN_STORE.write_text(new_ts)

# ── Verify ───────────────────────────────────────────────────────────────────
final = TOKEN_STORE.read_text().splitlines()
print(f'\n=== oauth-token-store.js now {len(final)} lines ===')
print('  Last 8 lines:')
for l in final[-8:]:
    print(f'    {l}')

print(f'\n✓ Done. oauth-token-store.js has complete upsertOauthToken.')
print('  Next: python3 patch_t002_provider_string.py')
print('  But first verify T002 is still needed — mapTokenProviderForStorage')
print('  already maps google→google_drive. Check if upsertOauthToken calls it.')
