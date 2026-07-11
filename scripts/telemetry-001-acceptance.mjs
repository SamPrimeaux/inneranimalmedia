#!/usr/bin/env node
/**
 * TELEMETRY-001 local acceptance — extractor SSOT + skip flag (no network).
 * Run: node scripts/telemetry-001-acceptance.mjs
 */
import assert from 'node:assert/strict';
import {
  extractToolExecUsage,
  shouldSkipCatalogToolCallLog,
} from '../src/core/tool-exec-telemetry.js';

const anthropic = extractToolExecUsage({
  usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.012 },
});
assert.equal(anthropic.inputTokens, 10);
assert.equal(anthropic.outputTokens, 5);
assert.equal(anthropic.totalCostUsd, 0.012);

const openai = extractToolExecUsage({
  body: { usage: { prompt_tokens: 3, completion_tokens: 7 }, costUsd: 0.001 },
});
assert.equal(openai.inputTokens, 3);
assert.equal(openai.outputTokens, 7);
assert.equal(openai.totalCostUsd, 0.001);

const free = extractToolExecUsage({ ok: true, rows: [] });
assert.equal(free.totalCostUsd, 0);
assert.equal(free.inputTokens, 0);

assert.equal(shouldSkipCatalogToolCallLog({ skipToolCallLog: true }), true);
assert.equal(shouldSkipCatalogToolCallLog({ ledgerOwner: 'tool_loop' }), true);
assert.equal(shouldSkipCatalogToolCallLog({}), false);
assert.equal(shouldSkipCatalogToolCallLog(null), false);

console.log('TELEMETRY-001 local acceptance: PASS');
