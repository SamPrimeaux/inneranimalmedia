#!/usr/bin/env python3
"""
scripts/may14_wire_workflow_handlers.py
VERSION = "1.0.0"

Patches src/core/workflow-executor.js to dispatch real MCP tools
for terminal.analytics_dashboard.* and terminal.wrangler_* handler keys
that are currently stubs.

Finds the existing terminal handler block and extends it — never moves
or replaces existing logic.

Usage:
  python3 scripts/may14_wire_workflow_handlers.py --dry-run   # preview patch
  python3 scripts/may14_wire_workflow_handlers.py              # apply
"""
import sys, re
from pathlib import Path

DRY = "--dry-run" in sys.argv
TARGET = Path("src/core/workflow-executor.js")

if not TARGET.exists():
    print(f"✗ {TARGET} not found — run from repo root")
    sys.exit(1)

source = TARGET.read_text()

# ── 1. Find where handler_key dispatch lives ────────────────────────────────

# Look for the terminal node handler block
# The grep showed: line 98 uses handlerKey, line 106 calls agentChatStep,
# line 486: const hk = String(node.handler_key || '').toLowerCase();
# Find a safe anchor: the hk variable assignment + surrounding context

ANCHOR_PATTERN = r"(const hk = String\(node\.handler_key \|\| ''\)\.toLowerCase\(\);)"

match = re.search(ANCHOR_PATTERN, source)
if not match:
    # Try alternate pattern
    ANCHOR_PATTERN = r"(const hk = String\(node\.handler_key)"
    match = re.search(ANCHOR_PATTERN, source)

if not match:
    print("✗ Could not find handler_key dispatch anchor.")
    print("  Looking for: const hk = String(node.handler_key")
    # Show context around line 486
    lines = source.splitlines()
    for i, line in enumerate(lines[480:510], start=481):
        print(f"  {i:4}: {line}")
    sys.exit(1)

anchor_pos = match.start()
anchor_line = source[:anchor_pos].count('\n') + 1
print(f"✓ Found handler_key anchor at line ~{anchor_line}")

# ── 2. Find the right insertion point ─────────────────────────────────────
# Look for where terminal node type is handled after the anchor
# Common pattern: if (nodeType === 'terminal') { ... }
# or a switch/case on nodeType

TERMINAL_BLOCK_PATTERN = r"(nodeType === ['\"]terminal['\"])"
terminal_matches = list(re.finditer(TERMINAL_BLOCK_PATTERN, source))

if not terminal_matches:
    print("✗ Could not find terminal nodeType block")
    print("  Searching for 'terminal' near handler dispatch:")
    ctx_start = max(0, anchor_pos - 200)
    ctx_end   = min(len(source), anchor_pos + 1000)
    for i, line in enumerate(source[ctx_start:ctx_end].splitlines(), 1):
        print(f"  {i:3}: {line}")
    sys.exit(1)

# Use the first terminal match after our anchor
terminal_match = next(
    (m for m in terminal_matches if m.start() >= anchor_pos),
    terminal_matches[0]
)
terminal_line = source[:terminal_match.start()].count('\n') + 1
print(f"✓ Found terminal nodeType block at line ~{terminal_line}")

# ── 3. Check if already patched ────────────────────────────────────────────

PATCH_MARKER = "// IAM: analytics_dashboard + wrangler handler dispatch"
if PATCH_MARKER in source:
    print(f"✓ Already patched — {PATCH_MARKER} found in file")
    sys.exit(0)

# ── 4. Find handler_key-specific dispatch within terminal block ─────────────
# Look for existing hk.includes or hk === checks to find insert point

# Strategy: find the first `return` or closing brace after the terminal block
# and insert before it, or find an existing hk. check to add alongside

# Safer: find where `dispatchComplete` or similar is called for agent nodes
# and add our stub-replacement block just before the closing of the node dispatch

# Find a safe "end of node type dispatch" marker
# Pattern: closing of the main if/switch on nodeType
DISPATCH_END_PATTERNS = [
    r"} else if \(nodeType === ['\"]approval_gate['\"]\)",
    r"} else if \(nodeType === ['\"]db_query['\"]\)",
    r"} else \{[\s\n]*// unknown node type",
    r"// fallback.*unknown",
    r"nodeOutput = \{ ok: false",
]

insert_before_match = None
for pat in DISPATCH_END_PATTERNS:
    m = re.search(pat, source[terminal_match.start():])
    if m:
        insert_before_match = m
        insert_pos = terminal_match.start() + m.start()
        insert_line = source[:insert_pos].count('\n') + 1
        print(f"✓ Insertion point: before '{m.group()[:40]}' at line ~{insert_line}")
        break

if not insert_before_match:
    print("⚠  Could not find clean insertion point — printing context for manual review:")
    ctx = source[terminal_match.start():terminal_match.start()+2000]
    for i, line in enumerate(ctx.splitlines()[:50], start=terminal_line):
        print(f"  {i:4}: {line}")
    sys.exit(1)

# ── 5. Build the patch block ────────────────────────────────────────────────

PATCH = '''  // IAM: analytics_dashboard + wrangler handler dispatch
  // Wires stub handler_keys from analytics-dashboard-three-page-e2e
  // and scaffold-new-worker workflows to real MCP tools.
  // Added by scripts/may14_wire_workflow_handlers.py
  } else if (
    hk.startsWith('terminal.analytics_dashboard.') ||
    hk === 'terminal.wrangler_deploy' ||
    hk === 'terminal.wrangler_init' ||
    hk === 'terminal.verify_file' ||
    hk === 'terminal.verify_scaffold' ||
    hk === 'terminal.write_file'
  ) {
    // Route to terminal_wrangler for wrangler ops, terminal_execute otherwise
    const isWrangler = hk.includes('wrangler') || hk.includes('deploy');
    const toolName   = isWrangler ? 'terminal_wrangler' : 'terminal_execute';
    const cmd        = node.description || node.title || hk;
    try {
      const dispResult = await dispatchMcpTool(env, {
        tool_name:    toolName,
        input:        { command: cmd, workspace_id: workspaceId || '' },
        workspace_id: workspaceId || '',
        tenant_id:    tenantId    || '',
      }).catch(() => null);
      nodeOutput = {
        ok:     !!(dispResult?.ok ?? dispResult?.success),
        output: dispResult?.output || dispResult?.result || '',
        tool:   toolName,
        cmd,
      };
    } catch (termErr) {
      nodeOutput = { ok: false, error: String(termErr?.message ?? termErr), tool: toolName };
    }
  } else if (
    hk.startsWith('agentsam.analytics_dashboard.') ||
    hk === 'agentsam.deploy.plan_worker' ||
    hk === 'agentsam.code.gen_worker'    ||
    hk === 'agentsam.code.html_generate' ||
    hk === 'agentsam.plan.html_page'
  ) {
    // Route to dispatchComplete (AI generation nodes)
    const isDb = hk.includes('d1') || hk.includes('sql') || hk.includes('schema');
    const { dispatchComplete: _dc } = await import('./provider.js');
    try {
      const aiResult = await _dc(env, {
        modelKey:  'auto',
        taskType:  isDb ? 'sql_d1_generation' : 'code',
        mode:      'agent',
        messages:  [{ role: 'user', content: node.description || node.title || hk }],
        options:   { reasoningEffort: 'medium', verbosity: 'low' },
      });
      nodeOutput = {
        ok:     !!(aiResult?.text || aiResult?.output_text),
        output: aiResult?.text || aiResult?.output_text || '',
        model:  aiResult?.model_key,
      };
    } catch (aiErr) {
      nodeOutput = { ok: false, error: String(aiErr?.message ?? aiErr) };
    }
'''

# ── 6. Apply or preview ─────────────────────────────────────────────────────

# The insert goes BEFORE the matched closing block
# Replace: the matched pattern → PATCH + the matched pattern
old_str = insert_before_match.group()
new_str  = PATCH + "\n  " + old_str

if DRY:
    print(f"\n[DRY RUN] Would insert {len(PATCH.splitlines())} lines before line ~{insert_line}")
    print(f"  First 5 lines of patch:")
    for line in PATCH.splitlines()[:5]:
        print(f"    {line}")
    print("  ...")
    sys.exit(0)

# Confirm there's exactly one occurrence of the anchor
occurrences = source.count(old_str)
if occurrences != 1:
    print(f"✗ Insertion anchor appears {occurrences} times — cannot patch safely")
    print(f"  Anchor: {old_str[:60]}")
    sys.exit(1)

patched = source.replace(old_str, new_str, 1)
TARGET.write_text(patched)

print(f"\n✓ Patched {TARGET}")
print(f"  Inserted {len(PATCH.splitlines())} lines before line ~{insert_line}")
print(f"  Marker: '{PATCH_MARKER}'")
print(f"\n  Verify with:")
print(f"  node --check src/core/workflow-executor.js && echo OK")
