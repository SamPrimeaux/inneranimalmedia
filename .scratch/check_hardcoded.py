#!/usr/bin/env python3
"""
Check if Cursor hardcoded any example values from the T005 prompt.
"""
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')

targets = [
    'samprimeaux/inneranimalmedia',
    'samprimeaux',
    'inneranimalmedia',
    'my-client-site',
    'src/index.js',
    'src/api/agent.js',
    'main',  # too broad, skip
]

files_to_check = [
    ROOT / 'dashboard/features/agent-chat/ChatAssistant.tsx',
    ROOT / 'src/tools/builtin/fs.js',
    ROOT / 'dashboard/App.tsx',
]

print('=== Checking for hardcoded example values ===\n')
found_any = False
for f in files_to_check:
    if not f.exists():
        print(f'  NOT FOUND: {f}')
        continue
    content = f.read_text()
    for val in targets:
        if val in content:
            # find line numbers
            for i, line in enumerate(content.splitlines(), 1):
                if val in line:
                    print(f'  ⚠ HARDCODED in {f.relative_to(ROOT)} line {i}: {line.strip()}')
                    found_any = True

if not found_any:
    print('  ✓ No hardcoded example values found.')

# Also check what ChatAssistant actually appends
print('\n=== ChatAssistant.tsx — active_file_* FormData appends ===')
chat = ROOT / 'dashboard/features/agent-chat/ChatAssistant.tsx'
if chat.exists():
    for i, line in enumerate(chat.read_text().splitlines(), 1):
        if 'active_file' in line and 'append' in line:
            print(f'  {i}: {line.strip()}')
