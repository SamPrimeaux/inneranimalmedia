#!/usr/bin/env python3
"""Find and remove the extra closing brace in eval-runner.js."""
import subprocess
from pathlib import Path

ROOT    = Path('/Users/samprimeaux/inneranimalmedia')
EVAL_JS = ROOT / 'src/core/eval-runner.js'

src   = EVAL_JS.read_text()
lines = src.splitlines()

# Walk the file tracking brace depth — find where it goes negative
depth = 0
for i, l in enumerate(lines):
    for ch in l:
        if ch == '{': depth += 1
        elif ch == '}': depth -= 1
    if depth < 0:
        print(f'Depth goes negative at line {i+1}: {repr(l)}')
        print(f'Context:')
        for j in range(max(0,i-5), min(len(lines), i+5)):
            marker = '>>>' if j == i else '   '
            print(f'  {marker} {j+1:4}: {lines[j]}')
        break

# Also show lines 50-80 where the replacement landed
print('\n=== Replacement area lines 50-80 ===')
for i, l in enumerate(lines[49:80], 50):
    print(f'  {i:4}: {l}')
