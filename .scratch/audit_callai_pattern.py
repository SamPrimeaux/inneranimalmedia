#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT    = Path('/Users/samprimeaux/inneranimalmedia')
SRC     = ROOT / 'src'
EVAL    = SRC / 'core/eval-runner.js'
ROUTING = SRC / 'core/routing.js'

def show(path, lineno, before=2, after=20):
    lines = Path(path).read_text().splitlines()
    s = max(0, lineno - before - 1)
    e = min(len(lines), lineno + after)
    for i, l in enumerate(lines[s:e], s + 1):
        m = '>>>' if i == lineno else '   '
        print(f'  {m} {i:5}: {l}')

def grep(pattern, path, context=3):
    r = subprocess.run(
        ['grep', '-n', '-A', str(context), '-B', str(context), pattern, str(path)],
        capture_output=True, text=True)
    return r.stdout.strip()

print('=== eval-runner.js imports (first 15 lines) ===')
lines = EVAL.read_text().splitlines()
for i, l in enumerate(lines[:15], 1):
    print(f'  {i}: {l}')

print('\n=== callAI usage in routing.js (pattern to copy) ===')
print(grep('callAI', ROUTING, context=5)[:2000])

print('\n=== callAI import/definition ===')
r = subprocess.run(
    ['grep', '-rn', '--include=*.js', 'export.*callAI\|export async function callAI',
     str(SRC)], capture_output=True, text=True)
print(r.stdout.strip())

print('\n=== callAI signature ===')
for f in SRC.rglob('*.js'):
    txt = f.read_text()
    if 'export async function callAI' in txt:
        for i, l in enumerate(txt.splitlines(), 1):
            if 'export async function callAI' in l:
                print(f'\n  {f.relative_to(ROOT)} line {i}:')
                for j, ll in enumerate(txt.splitlines()[i-1:i+25], i):
                    print(f'    {j}: {ll}')
                break

print('\n=== how callAI is called in routing.js (full call site) ===')
if ROUTING.exists():
    lines = ROUTING.read_text().splitlines()
    for i, l in enumerate(lines):
        if 'callAI(' in l or 'await callAI' in l:
            print(f'\n  line {i+1}:')
            for j in range(max(0,i-3), min(len(lines), i+15)):
                print(f'    {j+1}: {lines[j]}')
