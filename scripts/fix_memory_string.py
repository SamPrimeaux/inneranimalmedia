#!/usr/bin/env python3
"""
fix_memory_string.py — diagnoses and fixes the unterminated string literal
at line 670 of src/core/memory.js by showing context and patching if safe.
"""
import sys
from pathlib import Path

TARGET = Path("src/core/memory.js")
lines = TARGET.read_text().splitlines(keepends=True)

# Show lines around the error
start = max(0, 665)
end = min(len(lines), 680)
print(f"--- Lines {start+1}–{end} of {TARGET} ---")
for i, ln in enumerate(lines[start:end], start=start+1):
    marker = " <<<<" if i == 670 else ""
    print(f"{i:4d}  {ln.rstrip()}{marker}")

# Check if line 670 is blank / partial
line670 = lines[669] if len(lines) >= 670 else ""
print(f"\nRaw line 670 repr: {repr(line670)}")

# Count open vs closed backticks to find an unclosed template literal
full_text = TARGET.read_text()
backtick_count = full_text.count("`")
print(f"\nTotal backticks in file: {backtick_count} ({'even — not a template literal issue' if backtick_count % 2 == 0 else 'ODD — unclosed template literal somewhere'})")

# Count open single/double quotes on line 670 region
for i in range(max(0,660), min(len(lines),675)):
    ln = lines[i].rstrip()
    sq = ln.count("'") - ln.count("\\'")
    dq = ln.count('"') - ln.count('\\"')
    if sq % 2 != 0 or dq % 2 != 0:
        print(f"  Odd quotes on line {i+1}: {repr(ln)}")
