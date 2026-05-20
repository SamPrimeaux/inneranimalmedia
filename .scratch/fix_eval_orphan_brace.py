#!/usr/bin/env python3
"""Remove the single orphaned } left over from the stub replacement."""
import subprocess
from pathlib import Path

ROOT    = Path('/Users/samprimeaux/inneranimalmedia')
EVAL_JS = ROOT / 'src/core/eval-runner.js'

lines = EVAL_JS.read_text().splitlines()

# Show lines 105-120 to find the orphaned }
print('=== Lines 100-125 (replacement end zone) ===')
for i, l in enumerate(lines[99:124], 100):
    print(f'  {i:4}: {l}')

# Find the orphaned } — it sits immediately after the replacement block ends.
# The replacement ends with "      }" (6-space indent, closing outer catch).
# The orphaned } is a standalone "      }" right after, before "scores.push"
orphan_idx = None
for i, l in enumerate(lines):
    if l.strip() == '}' and i + 1 < len(lines):
        next_non_empty = next(
            (lines[j] for j in range(i+1, min(i+4, len(lines))) if lines[j].strip()),
            ''
        )
        # The orphan sits before scores.push(scoreQuality)
        if 'scores.push' in next_non_empty:
            orphan_idx = i
            print(f'\nFound orphaned }} at line {i+1}: {repr(l)}')
            print(f'Next non-empty: {repr(next_non_empty)}')
            break

if orphan_idx is None:
    # Fallback: find any standalone } between graderOutputText and scores.push
    in_zone = False
    for i, l in enumerate(lines):
        if 'graderOutputText' in l:
            in_zone = True
        if in_zone and 'scores.push' in l:
            break
        if in_zone and l.strip() == '}':
            # Check if the previous non-empty line suggests end of a block
            # that shouldn't be closing here
            prev = next((lines[j] for j in range(i-1, max(i-5,-1), -1) if lines[j].strip()), '')
            print(f'\nCandidate orphan at line {i+1}: {repr(l)}')
            print(f'  Prev non-empty: {repr(prev)}')
            orphan_idx = i
            break

if orphan_idx is not None:
    new_lines = lines[:orphan_idx] + lines[orphan_idx+1:]
    EVAL_JS.write_text('\n'.join(new_lines) + '\n')
    print(f'\n✓ Removed line {orphan_idx+1}. File now {len(new_lines)} lines.')

    # Verify
    final = EVAL_JS.read_text()
    opens  = final.count('{')
    closes = final.count('}')
    print(f'  Braces: {{ {opens}  }} {closes}  diff={opens-closes} (want 0)')

    r = subprocess.run(['node', '--check', str(EVAL_JS)], capture_output=True, text=True)
    if r.returncode == 0:
        print('  node --check: PASS')
    elif 'import' in r.stderr or 'export' in r.stderr:
        real = [l for l in r.stderr.splitlines()
                if 'SyntaxError' in l and 'import' not in l and 'export' not in l]
        print(f'  node --check: {"PASS (ESM)" if not real else "FAIL: "+str(real)}')
    else:
        print(f'  node --check: FAIL\n  {r.stderr.strip()}')
else:
    print('\nCould not locate orphan — showing lines 55-115:')
    for i, l in enumerate(lines[54:114], 55):
        print(f'  {i:4}: {l}')
