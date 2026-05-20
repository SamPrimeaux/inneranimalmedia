#!/usr/bin/env python3
"""
Fix two T001 residual issues:
1. oauth.js has a dangling `import {` block left after oauth-login-callbacks removal
2. upsertOauthToken body was truncated in oauth-token-store.js — extract full body from oauth.js
"""
import re
from pathlib import Path

ROOT         = Path('/Users/samprimeaux/inneranimalmedia')
OAUTH_JS     = ROOT / 'src/api/oauth.js'
TOKEN_STORE  = ROOT / 'src/core/oauth-token-store.js'
CALLBACKS_JS = ROOT / 'src/api/oauth-login-callbacks.js'

oauth_lines = OAUTH_JS.read_text().splitlines()
ts_lines    = TOKEN_STORE.read_text().splitlines()

# ── Diagnose ────────────────────────────────────────────────────────────────
print('=== oauth.js lines 1-30 ===')
for i, l in enumerate(oauth_lines[:30], 1):
    print(f'  {i:4}: {l}')

print('\n=== oauth-token-store.js lines 65-end ===')
for i, l in enumerate(ts_lines[64:], 65):
    print(f'  {i:4}: {l}')

# ── Fix 1: oauth.js broken import block ─────────────────────────────────────
print('\n=== Fix 1: Clean up oauth.js import block ===')

src = OAUTH_JS.read_text()

# The broken block looks like:
#   import {
#   import { upsertOauthToken, ensureOauthTokenColumns } from '../core/oauth-token-store.js';
#     handleGoogleLoginOAuthCallback,
#     handleGitHubLoginOAuthCallback,
#   } from './oauth-login-callbacks.js';        ← already removed
#
# We need to remove: bare `import {`, handleGoogleLogin..., handleGitHubLogin...
# lines that are now orphaned.

# Remove orphaned lines from the callbacks destructure
patterns_to_remove = [
    r"^import \{\s*$",                                   # bare `import {`
    r"^\s*handleGoogleLoginOAuthCallback,?\s*$",          # orphaned handler
    r"^\s*handleGitHubLoginOAuthCallback,?\s*$",          # orphaned handler
    r"^\}\s*from\s*['\"]\.\/oauth-login-callbacks\.js['\"];\s*$",  # closing (if still present)
]

new_lines = []
removed = []
for i, line in enumerate(src.splitlines(keepends=True), 1):
    stripped = line.rstrip('\n')
    drop = any(re.match(p, stripped) for p in patterns_to_remove)
    if drop:
        removed.append((i, stripped))
        print(f'  Removing line {i}: {repr(stripped)}')
    else:
        new_lines.append(line)

if not removed:
    print('  Nothing matched — import block may already be clean or pattern differs.')
    print('  Check the lines printed above and adjust manually if needed.')
else:
    OAUTH_JS.write_text(''.join(new_lines))
    print(f'  Removed {len(removed)} orphaned line(s). Written.')

# ── Fix 2: Extract complete upsertOauthToken body from oauth.js ──────────────
print('\n=== Fix 2: Extract complete upsertOauthToken from oauth.js ===')

# Re-read after fix 1
oauth_src = OAUTH_JS.read_text()
oauth_all = oauth_src.splitlines()

# Find upsertOauthToken in oauth.js (the body should still be there)
fn_start = None
for i, line in enumerate(oauth_all):
    if re.search(r'(export\s+)?async\s+function\s+upsertOauthToken\b', line):
        fn_start = i
        print(f'  Found upsertOauthToken at oauth.js line {i+1}: {line.strip()}')
        break

if fn_start is None:
    print('  upsertOauthToken NOT found in oauth.js.')
    print('  It may have been fully extracted already — check oauth-token-store.js line count.')
else:
    # Extract full function body using brace counting
    # Scan from fn_start, wait for first { then count braces
    depth = 0
    found_open = False
    fn_end = None
    for i in range(fn_start, len(oauth_all)):
        for ch in oauth_all[i]:
            if ch == '{':
                depth += 1
                found_open = True
            elif ch == '}':
                depth -= 1
        if found_open and depth == 0:
            fn_end = i
            break

    if fn_end is None:
        print('  Could not find end of upsertOauthToken — brace mismatch?')
    else:
        fn_body = '\n'.join(oauth_all[fn_start:fn_end+1])
        print(f'  Extracted lines {fn_start+1}–{fn_end+1} ({fn_end - fn_start + 1} lines)')
        print(f'  First line: {oauth_all[fn_start].strip()}')
        print(f'  Last line:  {oauth_all[fn_end].strip()}')

        # Check if oauth-token-store already has the full body
        ts_src = TOKEN_STORE.read_text()
        ts_fn_start = None
        ts_lines_list = ts_src.splitlines()
        for i, line in enumerate(ts_lines_list):
            if re.search(r'async\s+function\s+upsertOauthToken\b', line):
                ts_fn_start = i
                break

        if ts_fn_start is not None:
            # Find end in token store
            ts_depth = 0
            ts_found_open = False
            ts_fn_end = None
            for i in range(ts_fn_start, len(ts_lines_list)):
                for ch in ts_lines_list[i]:
                    if ch == '{':
                        ts_depth += 1
                        ts_found_open = True
                    elif ch == '}':
                        ts_depth -= 1
                if ts_found_open and ts_depth == 0:
                    ts_fn_end = i
                    break

            ts_fn_len = (ts_fn_end - ts_fn_start + 1) if ts_fn_end else 0
            print(f'\n  oauth-token-store.js upsertOauthToken: lines {ts_fn_start+1}–{(ts_fn_end or 0)+1} ({ts_fn_len} lines)')

            if ts_fn_len < 10:
                print('  → Body is truncated. Replacing with full body from oauth.js...')
                # Remove old stub, insert full body
                fn_body_clean = re.sub(r'^export\s+', '', fn_body, flags=re.MULTILINE)
                new_ts = (
                    '\n'.join(ts_lines_list[:ts_fn_start])
                    + '\n'
                    + fn_body_clean
                    + '\n'
                    + '\n'.join(ts_lines_list[ts_fn_end+1:])
                )
                TOKEN_STORE.write_text(new_ts)
                print('  Written to oauth-token-store.js.')

                # Remove the function from oauth.js (it now lives in token-store)
                print('  Removing upsertOauthToken body from oauth.js...')
                remaining = (
                    '\n'.join(oauth_all[:fn_start])
                    + '\n'
                    + '\n'.join(oauth_all[fn_end+1:])
                )
                OAUTH_JS.write_text(remaining)
                print('  oauth.js updated.')
            else:
                print('  → Body looks complete already. No action needed.')
        else:
            print('  upsertOauthToken not found in oauth-token-store.js — inserting...')
            fn_body_clean = re.sub(r'^export\s+', '', fn_body, flags=re.MULTILINE)
            # Insert before the export line
            ts_src_new = re.sub(
                r'\nexport \{',
                '\n' + fn_body_clean + '\n\nexport {',
                ts_src
            )
            TOKEN_STORE.write_text(ts_src_new)
            print('  Inserted into oauth-token-store.js.')

            # Remove from oauth.js
            remaining = (
                '\n'.join(oauth_all[:fn_start])
                + '\n'
                + '\n'.join(oauth_all[fn_end+1:])
            )
            OAUTH_JS.write_text(remaining)
            print('  Removed from oauth.js.')

# ── Final state ──────────────────────────────────────────────────────────────
print('\n=== Final: oauth-token-store.js line count ===')
final_ts = TOKEN_STORE.read_text().splitlines()
print(f'  {len(final_ts)} lines total')
print(f'  Last 5 lines:')
for l in final_ts[-5:]:
    print(f'    {l}')

print('\n=== Final: oauth.js lines 1-22 ===')
final_oauth = OAUTH_JS.read_text().splitlines()
for i, l in enumerate(final_oauth[:22], 1):
    print(f'  {i:4}: {l}')

print('\nDone. Paste output — confirm clean before running T002.')
