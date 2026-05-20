#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
SRC  = ROOT / 'src'

def grep(pattern, context=4):
    r = subprocess.run(
        ['grep', '-rn', '--include=*.js', '-A', str(context), '-B', str(context),
         pattern, str(SRC)], capture_output=True, text=True)
    return r.stdout.strip()

def show(path, lineno, after=25):
    lines = Path(path).read_text().splitlines()
    s = max(0, lineno - 2)
    e = min(len(lines), lineno + after)
    for i, l in enumerate(lines[s:e], s+1):
        m = '>>>' if i == lineno else '   '
        print(f'  {m} {i:5}: {l}')

print('=== dispatchComplete — definition + signature ===')
for f in SRC.rglob('*.js'):
    txt = f.read_text()
    if 'export async function dispatchComplete' in txt or \
       'export function dispatchComplete' in txt:
        for i, l in enumerate(txt.splitlines(), 1):
            if 'dispatchComplete' in l and 'function' in l:
                print(f'\n  {f.relative_to(ROOT)} line {i}:')
                show(f, i, after=20)
                break

print('\n=== dispatchComplete call site in workflow/summary.js ===')
ws = SRC / 'core/workflow' / 'summary.js'
if not ws.exists():
    # find it
    r = subprocess.run(['find', str(SRC), '-name', 'summary.js'],
                       capture_output=True, text=True)
    print(f'  summary.js locations: {r.stdout.strip()}')
    # try common paths
    for candidate in SRC.rglob('summary.js'):
        print(f'\n  Found: {candidate.relative_to(ROOT)}')
        txt = candidate.read_text()
        for i, l in enumerate(txt.splitlines(), 1):
            if 'dispatchComplete' in l:
                show(candidate, i, after=15)
                break
else:
    txt = ws.read_text()
    for i, l in enumerate(txt.splitlines(), 1):
        if 'dispatchComplete' in l:
            show(ws, i, after=15)
            break

print('\n=== resolveCheapestModelKey — definition ===')
r = subprocess.run(
    ['grep', '-rn', '--include=*.js', 'resolveCheapestModelKey', str(SRC)],
    capture_output=True, text=True)
print(r.stdout.strip()[:1000] or '  not found')

print('\n=== agentsam_ai — how it is queried for model resolution ===')
print(grep('agentsam_ai', context=5)[:2000])

print('\n=== what imports eval-runner uses vs what it needs ===')
eval_js = SRC / 'core/eval-runner.js'
if eval_js.exists():
    txt = eval_js.read_text().splitlines()
    print('  Current imports:')
    for i, l in enumerate(txt[:10], 1):
        print(f'    {i}: {l}')

print('\n=== OpenAI direct fetch pattern (openai_responses platform) ===')
for f in SRC.rglob('*.js'):
    txt = f.read_text()
    if 'openai_responses' in txt and 'fetch' in txt:
        lines = txt.splitlines()
        for i, l in enumerate(lines):
            if 'openai_responses' in l:
                print(f'\n  {f.relative_to(ROOT)} line {i+1}:')
                show(f, i+1, after=10)
                break

print('\n=== completeWithOpenAIResponses or similar ===')
r2 = subprocess.run(
    ['grep', '-rn', '--include=*.js',
     'completeWithOpenAI\|chatWithOpenAI\|openai.*responses\|responses.*openai',
     str(SRC / 'integrations')],
    capture_output=True, text=True)
print(r2.stdout.strip()[:1500] or '  check src/integrations/')

# Show openai.js exports
openai_js = SRC / 'integrations/openai.js'
if openai_js.exists():
    lines = openai_js.read_text().splitlines()
    print(f'\n=== src/integrations/openai.js exports (first 30 lines) ===')
    for i, l in enumerate(lines[:30], 1):
        print(f'  {i}: {l}')
