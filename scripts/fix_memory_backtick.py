#!/usr/bin/env python3
"""
fix_memory_backtick.py — finds the unclosed template literal in memory.js
and shows enough context to fix it, then applies the fix automatically.
"""
import sys
from pathlib import Path

TARGET = Path("src/core/memory.js")
text   = TARGET.read_text()
lines  = text.splitlines(keepends=True)

# Walk through tracking backtick open/close state
in_template = False
open_line   = None

for i, raw in enumerate(lines):
    ln = raw
    j  = 0
    while j < len(ln):
        ch = ln[j]
        # Skip escaped chars
        if ch == '\\':
            j += 2
            continue
        # Skip single-quoted strings
        if ch == "'" and not in_template:
            j += 1
            while j < len(ln) and ln[j] != "'":
                if ln[j] == '\\': j += 1
                j += 1
            j += 1
            continue
        # Skip double-quoted strings
        if ch == '"' and not in_template:
            j += 1
            while j < len(ln) and ln[j] != '"':
                if ln[j] == '\\': j += 1
                j += 1
            j += 1
            continue
        if ch == '`':
            if in_template:
                in_template = False
                open_line   = None
            else:
                in_template = True
                open_line   = i + 1
        j += 1

if in_template:
    print(f"Unclosed backtick opened on line {open_line}")
    start = max(0, open_line - 2)
    end   = min(len(lines), open_line + 8)
    print(f"\n--- Context lines {start+1}–{end} ---")
    for idx in range(start, end):
        print(f"{idx+1:4d}  {lines[idx].rstrip()}")

    # The fix: the upsertAgentsamMemory SQL string was truncated at line 669/670
    # because the append cut off mid-template. Find the last backtick before EOF
    # and check if the function closes properly.
    last_bt = text.rfind('`')
    print(f"\nLast backtick in file at char offset {last_bt}")
    print(f"Last 200 chars of file:\n{repr(text[-200:])}")

    # Auto-fix: find where upsertAgentsamMemory SQL template starts
    # and append the missing closing portion
    marker = "ON CONFLICT(user_id, workspace_id, key) DO UPDATE SET"
    idx = text.rfind(marker)
    if idx == -1:
        print("\nERROR: could not find ON CONFLICT marker — manual fix needed.")
        sys.exit(1)

    # Check if there's a closing backtick after it
    after = text[idx:]
    if '`' not in after:
        print(f"\nNo closing backtick after the ON CONFLICT on line ~{open_line}.")
        print("Appending missing SQL body + closing backtick + function close.")

        addition = """\
          value = excluded.value,
          source = excluded.source,
          confidence = excluded.confidence,
          decay_score = excluded.decay_score,
          updated_at = unixepoch()`,
    )
      .run()
      .catch(() => {});
  } catch (e) {
    console.warn('[agentsam_memory] upsertAgentsamMemory', e?.message ?? e);
  }
}
"""
        TARGET.write_text(text + addition)
        print("Fixed — appended missing SQL close + function body.")
    else:
        print("\nClosing backtick exists after marker — structure may just need inspection.")
else:
    print("No unclosed backtick found — structure looks balanced.")
