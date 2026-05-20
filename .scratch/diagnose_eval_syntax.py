#!/usr/bin/env python3
"""
Fix Missing catch or finally after try in eval-runner.js.
Shows the broken area, then repairs the brace structure.
"""
import subprocess
from pathlib import Path

ROOT    = Path('/Users/samprimeaux/inneranimalmedia')
EVAL_JS = ROOT / 'src/core/eval-runner.js'

src   = EVAL_JS.read_text()
lines = src.splitlines()

print(f'=== eval-runner.js lines 125-end (broken area) ===')
for i, l in enumerate(lines[120:], 121):
    print(f'  {i:4}: {l}')

print(f'\n=== Full file for context (last 30 lines) ===')
for i, l in enumerate(lines[-30:], len(lines)-29):
    print(f'  {i:4}: {l}')

# Find the unclosed try block — scan for try without catch
depth = 0
try_stack = []
for i, l in enumerate(lines):
    stripped = l.strip()
    if stripped.startswith('try {') or stripped == 'try {':
        try_stack.append(i)
    if stripped.startswith('} catch') or stripped.startswith('catch ('):
        if try_stack:
            try_stack.pop()

print(f'\n=== Unclosed try blocks at lines: {[x+1 for x in try_stack]} ===')

# The fix: the replacement block ends with its own } catch block,
# but the OUTER try/catch that originally wrapped it may have lost its catch.
# Find where the file ends and what's missing.
print('\n=== Checking brace balance ===')
opens  = src.count('{')
closes = src.count('}')
print(f'  Open braces:  {opens}')
print(f'  Close braces: {closes}')
print(f'  Difference:   {opens - closes} (should be 0 for balanced)')
