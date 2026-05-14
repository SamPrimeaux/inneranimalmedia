#!/usr/bin/env python3
"""
patch_prompt_cache_keys.py — two surgical edits to agent.js:

1. logPromptCacheUsage: add provider/modelKey params + use them in the INSERT
2. All call sites: pass the resolved provider/modelKey through
"""
import re
from pathlib import Path

TARGET = Path("src/api/agent.js")
text   = TARGET.read_text()

# ── Fix 1: function signature — add provider + modelKey params ────────────────
OLD_SIG = "async function logPromptCacheUsage(env, tenantId, layerKeys, routeKey) {"
NEW_SIG = "async function logPromptCacheUsage(env, tenantId, layerKeys, routeKey, provider, modelKey) {"

if OLD_SIG not in text:
    print("WARN: logPromptCacheUsage signature not found — may already be updated.")
else:
    text = text.replace(OLD_SIG, NEW_SIG)
    print("✅ Added provider/modelKey params to logPromptCacheUsage signature")

# ── Fix 2: INSERT — replace hardcoded 'auto','auto' with real values ──────────
OLD_INSERT = """      await env.DB.prepare(`
        INSERT INTO agentsam_prompt_cache_keys 
        (tenant_id, provider, model_key, cache_key_hash, layer_keys_json, route_key)
        VALUES (?, 'auto', 'auto', ?, ?, ?)
      `).bind(tenantId || '', hash, layerKeysJson, routeKey || null).run();"""

NEW_INSERT = """      await env.DB.prepare(`
        INSERT INTO agentsam_prompt_cache_keys 
        (tenant_id, provider, model_key, cache_key_hash, layer_keys_json, route_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(tenantId || '', provider || 'unknown', modelKey || 'unknown', hash, layerKeysJson, routeKey || null).run();"""

if OLD_INSERT not in text:
    print("WARN: INSERT block not found — may already be updated.")
else:
    text = text.replace(OLD_INSERT, NEW_INSERT)
    print("✅ Fixed INSERT to use real provider/modelKey")

# ── Fix 3: find all call sites and add provider/modelKey args ─────────────────
# Pattern: logPromptCacheUsage(env, ..., layerKeys, routeKey) — no 5th/6th arg yet
# We look for calls that end with 2 args after layerKeys (just routeKey)
# Most common pattern: logPromptCacheUsage(env, tenantId, <layerExpr>, <routeExpr>)
# We need to know what modelKey/provider are in context at each call site.
# Strategy: find calls and check what's available — report them so we can fix manually
# if the pattern is complex, or patch if it's simple enough.

call_pattern = re.compile(r'logPromptCacheUsage\s*\(([^)]+)\)')
matches = list(call_pattern.finditer(text))
print(f"\nFound {len(matches)} call site(s) to logPromptCacheUsage:")

already_updated = 0
needs_manual   = 0

for m in matches:
    args = m.group(1)
    arg_list = [a.strip() for a in args.split(',')]
    lineno = text[:m.start()].count('\n') + 1
    print(f"  Line ~{lineno}: logPromptCacheUsage({args.strip()})")
    if len(arg_list) >= 6:
        print(f"    → already has 6 args, skipping")
        already_updated += 1
    elif len(arg_list) == 4:
        # Add provider/modelKey — try to infer from context
        # Look for resolvedModelKey, modelKey, explicitRow?.model_key etc in surrounding 50 lines
        ctx_start = max(0, m.start() - 2000)
        ctx_end   = min(len(text), m.end() + 200)
        ctx = text[ctx_start:ctx_end]

        provider_expr = 'null'
        modelkey_expr = 'null'

        if 'explicitRow?.provider' in ctx:
            provider_expr = "explicitRow?.provider ?? null"
        elif "chainRows?.[0]?.provider" in ctx:
            provider_expr = "chainRows?.[0]?.provider ?? null"

        if 'explicitRow?.model_key' in ctx:
            modelkey_expr = "explicitRow?.model_key ?? null"
        elif 'selectedModelKey' in ctx:
            modelkey_expr = "selectedModelKey ?? null"
        elif 'modelKey' in ctx:
            modelkey_expr = "modelKey ?? null"
        elif 'chainRows?.[0]?.model_key' in ctx:
            modelkey_expr = "chainRows?.[0]?.model_key ?? null"

        old_call = m.group(0)
        new_call = f"logPromptCacheUsage({', '.join(arg_list)}, {provider_expr}, {modelkey_expr})"
        text = text.replace(old_call, new_call, 1)
        print(f"    → patched: added ({provider_expr}, {modelkey_expr})")
        already_updated += 1
    else:
        print(f"    → unexpected arg count ({len(arg_list)}), needs manual review")
        needs_manual += 1

TARGET.write_text(text)
print(f"\nPatched {TARGET}")
print(f"  {already_updated} call site(s) updated, {needs_manual} need manual review")
print("\nVerify with:")
print("  grep -n 'logPromptCacheUsage' src/api/agent.js")
