#!/usr/bin/env python3
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')
BV   = ROOT / 'dashboard/components/BrowserView.tsx'

def grep(pattern, path=BV, context=4):
    r = subprocess.run(
        ['grep', '-n', '-A', str(context), '-B', str(context), pattern, str(path)],
        capture_output=True, text=True
    )
    return r.stdout.strip()

print('=== Take Screenshot handler ===')
print(grep('screenshot\|Screenshot\|takeScreenshot\|captureScreen', context=6))

print('\n=== Capture Area Screenshot ===')
print(grep('captureArea\|area.*screenshot\|screenshot.*area', context=6))

print('\n=== How screenshots are stored/sent ===')
print(grep('R2\|upload\|blob\|canvas\|toDataURL\|FormData\|fetch.*screenshot', context=4))

print('\n=== Playwright / PTY integration in BrowserView ===')
print(grep('playwright\|pty\|PTY\|terminal.*browser\|browser.*terminal', context=4))

print('\n=== BrowserView toolbar menu items (the ... menu) ===')
print(grep('Take Screenshot\|Copy Current URL\|Hard Reload\|Clear Browsing\|Clear Cookies\|Clear Cache', context=3))
