#!/usr/bin/env python3
"""
patch_routing.py — inserts writeRoutingMemoryPrior call into
applyRoutingArmUsageFeedback in src/core/routing.js before the catch block.
"""
import sys
from pathlib import Path

TARGET = Path("src/core/routing.js")
NEEDLE = "    console.warn('[routing_arms] usage feedback', e?.message ?? e);"
INSERT = """\
  if (o?.workspaceId && o?.taskType && o?.modelKey) {
    writeRoutingMemoryPrior(env, {
      workspaceId: String(o.workspaceId),
      taskType:    String(o.taskType),
      modelKey:    String(o.modelKey),
      provider:    o.provider ?? null,
      success,
      latencyMs:   durationMs,
      costUsd,
    }).catch(() => {});
  }
"""

text = TARGET.read_text()

if "writeRoutingMemoryPrior(env," in text:
    print("Already patched — nothing to do.")
    sys.exit(0)

# Insert before `  } catch (e) {` that contains the needle on the next line
catch_marker = "  } catch (e) {\n" + NEEDLE
replacement  = INSERT + "  } catch (e) {\n" + NEEDLE

if catch_marker not in text:
    print("ERROR: could not find insertion point — check routing.js manually.", file=sys.stderr)
    sys.exit(1)

patched = text.replace(catch_marker, replacement, 1)
TARGET.write_text(patched)
print("Patched src/core/routing.js — writeRoutingMemoryPrior call inserted.")
