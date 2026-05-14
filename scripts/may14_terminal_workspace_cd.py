#!/usr/bin/env python3
"""
scripts/may14_terminal_workspace_cd.py
VERSION = "1.0.0"

Patches the terminal session init in src/api/agent.js to auto-cd to
the workspace root_path on session start.

The root_path for ws_inneranimalmedia is stored in agentsam_workspace.root_path
= /Users/samprimeaux/Downloads/inneranimalmedia

On PTY connect, reads that value from DB and sends: cd "{root_path}" && clear

Usage:
  python3 scripts/may14_terminal_workspace_cd.py --dry-run
  python3 scripts/may14_terminal_workspace_cd.py
"""
import sys, re
from pathlib import Path

DRY    = "--dry-run" in sys.argv
TARGET = Path("src/api/agent.js")

if not TARGET.exists():
    print(f"✗ {TARGET} not found — run from repo root")
    sys.exit(1)

source = TARGET.read_text()

PATCH_MARKER = "// IAM: workspace-aware cd on terminal session start"

if PATCH_MARKER in source:
    print(f"✓ Already patched — {PATCH_MARKER} found")
    sys.exit(0)

# ── Find terminal session registration anchor ───────────────────────────────
# From grep: line 762 references terminal_sessions
# Look for where we INSERT into terminal_sessions or send initial PTY input

ANCHORS = [
    # Most specific: where session row is inserted
    r"INSERT INTO terminal_sessions",
    r"terminal_sessions.*INSERT",
    # Where PTY session is opened/registered
    r"session.*register",
    r"PTY_SERVICE.*fetch",
    r"/api/terminal/session",
]

anchor_match = None
for pat in ANCHORS:
    m = re.search(pat, source, re.IGNORECASE)
    if m:
        anchor_match = m
        anchor_line = source[:m.start()].count('\n') + 1
        print(f"✓ Found terminal anchor '{pat}' at line ~{anchor_line}")
        break

if not anchor_match:
    print("✗ Could not find terminal session anchor")
    print("  Searching for 'terminal' context:")
    for i, line in enumerate(source.splitlines()):
        if 'terminal_session' in line.lower() or 'pty' in line.lower():
            print(f"  {i+1:5}: {line.rstrip()}")
    sys.exit(1)

# ── Find PTY write/send function to inject cd after session opens ───────────
# Look for where the PTY socket/fetch sends initial data
# Common pattern: ptySocket.send or fetch to PTY_SERVICE with initial command

PTY_WRITE_PATTERNS = [
    r"ptySocket\.send\(",
    r"ptyWs\.send\(",
    r"PTY_SERVICE.*write",
    r"sendInitialCommand",
    r"initialCmd",
]

pty_write_match = None
for pat in PTY_WRITE_PATTERNS:
    m = re.search(pat, source[anchor_match.start():], re.IGNORECASE)
    if m:
        pty_write_match = m
        abs_pos = anchor_match.start() + m.start()
        pty_line = source[:abs_pos].count('\n') + 1
        print(f"✓ Found PTY write at line ~{pty_line}: '{m.group()}'")
        break

# ── Build the workspace cd injection ───────────────────────────────────────
# This reads root_path from agentsam_workspace and emits it as first PTY command
# Safe: if no root_path, skips silently

CD_INJECTION = '''
    // IAM: workspace-aware cd on terminal session start
    // Reads agentsam_workspace.root_path for the active workspace and cds there.
    // Fire-and-forget — terminal still works if this fails.
    (async () => {
      try {
        const wsRow = await env.DB
          .prepare(
            `SELECT root_path FROM agentsam_workspace
             WHERE id = ? AND root_path IS NOT NULL LIMIT 1`
          )
          .bind(workspaceId || '')
          .first()
          .catch(() => null);
        if (wsRow?.root_path) {
          const cdCmd = JSON.stringify(`cd "${wsRow.root_path}" && clear\\n`);
          // Send cd as first PTY input via the same mechanism as user keystrokes
          await env.PTY_SERVICE
            .fetch(`http://pty/session/${sessionId}/write`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ data: `cd "${wsRow.root_path}" && clear\\n` }),
            })
            .catch(() => {});
        }
      } catch { /* silent — terminal still works without cd */ }
    })();
'''

# ── Strategy: inject after the INSERT INTO terminal_sessions completes ───────
# Find the .run() or .execute() that ends the session INSERT

INSERT_END_PATTERNS = [
    (r"(INSERT INTO terminal_sessions[^;]+\.run\(\))", "after INSERT .run()"),
    (r"(INSERT INTO terminal_sessions[^;]+\.execute\(\))", "after INSERT .execute()"),
    (r"(await.*terminal_sessions.*\n.*\.run\(\))", "after terminal_sessions await+run"),
]

inject_match = None
inject_desc = ""
for pat, desc in INSERT_END_PATTERNS:
    m = re.search(pat, source, re.DOTALL)
    if m:
        inject_match = m
        inject_desc = desc
        inject_line = source[:m.end()].count('\n') + 1
        print(f"✓ Injection point ({desc}) ends at line ~{inject_line}")
        break

if not inject_match:
    print("⚠  Could not find INSERT INTO terminal_sessions .run() — showing context:")
    ctx_start = anchor_match.start()
    ctx_end   = min(len(source), ctx_start + 2000)
    for i, line in enumerate(source[ctx_start:ctx_end].splitlines(), start=anchor_line):
        print(f"  {i:5}: {line}")
    print("\n  Manual insertion needed — add the following block after terminal session INSERT:")
    print(CD_INJECTION)
    sys.exit(1)

if DRY:
    print(f"\n[DRY RUN] Would inject {len(CD_INJECTION.splitlines())} lines after '{inject_desc}'")
    print("  First 5 lines:")
    for line in CD_INJECTION.splitlines()[:5]:
        print(f"    {line}")
    sys.exit(0)

# Insert CD_INJECTION after the .run() call
old_str = inject_match.group()
new_str  = old_str + CD_INJECTION

if source.count(old_str) != 1:
    print(f"✗ Anchor appears {source.count(old_str)} times — not safe to patch automatically")
    print("  Add this block manually after terminal session INSERT:")
    print(CD_INJECTION)
    sys.exit(1)

patched = source.replace(old_str, new_str, 1)
TARGET.write_text(patched)

print(f"\n✓ Patched {TARGET}")
print(f"  {len(CD_INJECTION.splitlines())} lines injected after terminal_sessions INSERT")
print(f"\n  Verify:")
print(f"  node --check src/api/agent.js && echo OK")
