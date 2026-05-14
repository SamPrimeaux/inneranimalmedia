#!/usr/bin/env python3
"""
fix_memory_dupes.py — removes the 5 broken re-export lines from memory.js
that conflict with the inline function bodies already present.
"""
from pathlib import Path

TARGET = Path("src/core/memory.js")
text = TARGET.read_text()

# These 5 lines were left in from the earlier bad re-export block
BAD_LINES = [
    "export { rollupExecutionPerformanceMetrics }  from './rollup-execution.js';",
    "export { rollupUsageEventsDaily }             from './rollup-usage.js';",
    "export { rollupOtlpTracesDaily }              from './rollup-traces.js';",
    "export { runAgentsamMemoryDecay }             from './memory-decay.js';",
    "export { upsertAgentsamMemory }               from './memory-upsert.js';",
]

lines = text.splitlines(keepends=True)
cleaned = []
removed = 0
for ln in lines:
    stripped = ln.strip()
    if any(stripped == bad or stripped.replace("  ", " ") == bad.replace("  ", " ") for bad in BAD_LINES):
        removed += 1
        continue
    cleaned.append(ln)

TARGET.write_text("".join(cleaned))
print(f"Removed {removed} duplicate re-export lines from {TARGET}")
if removed != 5:
    print(f"WARNING: expected 5 removals, got {removed} — verify manually.")
