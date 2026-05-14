#!/usr/bin/env python3
"""
patch_anthropic.py — fixes two 400-causing bugs in src/integrations/anthropic.js:

1. `betas` in streamParams body → must use client.beta.messages.create() instead
2. `thinking: { type: 'adaptive' }` → not a valid Anthropic type, replace with
   effort-based or budget_tokens-based thinking for Claude 4 models
3. `inference_geo` → not a valid Anthropic API field, strip it
"""
import sys
from pathlib import Path

TARGET = Path("src/integrations/anthropic.js")
text   = TARGET.read_text()

# ── Fix 1: remove betas from streamParams body ────────────────────────────────
OLD_BETAS_IN_BODY = "    betas: betasFiltered.length > 0 ? betasFiltered : undefined,"
if OLD_BETAS_IN_BODY not in text:
    print("WARN: betas body line not found — may already be fixed or changed.")
else:
    text = text.replace(OLD_BETAS_IN_BODY, "    // betas sent via client.beta path below, not in body")
    print("✅ Removed betas from streamParams body")

# ── Fix 2: replace adaptive thinking with effort-based for Claude 4 ───────────
OLD_ADAPTIVE = """\
  if (isSotaModel) {
    streamParams.thinking = { type: 'adaptive' };
    if (options.effort) {
      streamParams.thinking.effort = options.effort; // 'high', 'medium', 'low'
    }
  } else if (options.thinking) {"""

NEW_ADAPTIVE = """\
  if (isSotaModel) {
    // Claude 4 models use effort param directly, not inside thinking object
    // 'adaptive' is not a valid type — valid: 'enabled' (with budget_tokens) or 'disabled'
    if (options.effort) {
      streamParams.effort = options.effort; // 'max', 'high', 'medium', 'low'
    }
    // Only enable explicit thinking budget if caller specifically requested it
    if (options.thinkingBudget) {
      streamParams.thinking = { type: 'enabled', budget_tokens: Number(options.thinkingBudget) };
    }
  } else if (options.thinking) {"""

if OLD_ADAPTIVE not in text:
    print("WARN: adaptive thinking block not found — may already be fixed.")
else:
    text = text.replace(OLD_ADAPTIVE, NEW_ADAPTIVE)
    print("✅ Fixed thinking type (removed adaptive, moved effort to top-level)")

# ── Fix 3: strip inference_geo (not a valid Anthropic API field) ──────────────
OLD_GEO = """\
  // 4. Data Residency
  if (options.inference_geo) {
    streamParams.inference_geo = options.inference_geo; // 'us' or 'global'
  }"""

NEW_GEO = """\
  // 4. Data Residency — inference_geo is not a standard Anthropic field; skip"""

if OLD_GEO not in text:
    print("WARN: inference_geo block not found — may already be fixed.")
else:
    text = text.replace(OLD_GEO, NEW_GEO)
    print("✅ Removed inference_geo (not a valid Anthropic API field)")

# ── Fix 4: route to client.beta.messages.create when betas present ────────────
OLD_CREATE = "  const response = await client.messages.create(streamParams);\n  return response;"
NEW_CREATE = """\
  // Route to beta endpoint when betas are required, standard endpoint otherwise
  const response = betasFiltered.length > 0
    ? await client.beta.messages.create({ ...streamParams, betas: betasFiltered })
    : await client.messages.create(streamParams);
  return response;"""

if OLD_CREATE not in text:
    print("WARN: client.messages.create line not found — check manually.")
else:
    text = text.replace(OLD_CREATE, NEW_CREATE)
    print("✅ Routed to client.beta.messages.create when betas present")

# ── Fix 5: add count_tokens helper + document heuristic clearly ──────────────
COUNT_TOKENS_HELPER = '''
/**
 * Optional preflight token count for Anthropic payloads.
 *
 * NOT called on every chat request — that would add a full round-trip before
 * each message. Use only for:
 *   - Hard context-window enforcement before sending a large payload
 *   - Audit/debug when prompt size estimates feel wrong
 *
 * Post-call usage.input_tokens / usage.output_tokens from the API response
 * remains the canonical source for billing and agentsam_usage_events rows.
 * The chars/4 heuristic in provider.js is intentionally cheap telemetry only.
 *
 * @param {{ messages: any[], system?: string, tools?: any[], model: string }} params
 * @param {string} apiKey
 * @returns {Promise<number|null>} input token count or null on error
 */
export async function countAnthropicTokens({ messages, system, tools, model }, apiKey) {
  if (!apiKey || !messages?.length) return null;
  try {
    const client = new Anthropic({ apiKey });
    const result = await client.messages.countTokens({
      model,
      messages,
      ...(system  ? { system  } : {}),
      ...(tools?.length ? { tools } : {}),
    });
    return result?.input_tokens ?? null;
  } catch {
    return null;
  }
}
'''

# Insert helper after the existing createAnthropicBatch export
BATCH_END = "  return await client.messages.batches.create({ requests });\n}"
if BATCH_END in text and "countAnthropicTokens" not in text:
    text = text.replace(BATCH_END, BATCH_END + "\n" + COUNT_TOKENS_HELPER)
    print("✅ Added countAnthropicTokens helper (opt-in preflight, not per-request)")
else:
    print("SKIP: count_tokens helper already present or batch end not found")

TARGET.write_text(text)
print(f"\nPatched {TARGET}")

# Verify
print("\nVerification — lines around the fixed sections:")
lines = text.splitlines()
for i, ln in enumerate(lines):
    if any(kw in ln for kw in ["betas sent via", "client.beta.messages", "streamParams.effort", "inference_geo is not"]):
        print(f"  {i+1:4d}  {ln}")
