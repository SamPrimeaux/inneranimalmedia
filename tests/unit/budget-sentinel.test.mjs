import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_PRESSURE_HANDOFF,
  CONTEXT_PRESSURE_HANDOFF,
  checkBudgetPressure,
} from '../../src/core/budget-sentinel.js';
import { buildHandoffContextDigest } from '../../src/core/handoff-context.js';

test('checkBudgetPressure below thresholds does not hand off', () => {
  const r = checkBudgetPressure({
    runCostUsd: 0.4,
    maxCostPerCallUsd: 1,
    inputTokens: 50000,
    contextWindow: 200000,
  });
  assert.equal(r.shouldHandoff, false);
  assert.equal(r.reason, null);
  assert.ok(r.budgetPressure < BUDGET_PRESSURE_HANDOFF);
  assert.ok(r.contextPressure < CONTEXT_PRESSURE_HANDOFF);
});

test('checkBudgetPressure triggers on budget cap', () => {
  const r = checkBudgetPressure({
    runCostUsd: 0.85,
    maxCostPerCallUsd: 1,
    inputTokens: 1000,
    contextWindow: 200000,
  });
  assert.equal(r.shouldHandoff, true);
  assert.equal(r.reason, 'budget');
});

test('checkBudgetPressure triggers on context window', () => {
  const r = checkBudgetPressure({
    runCostUsd: 0.1,
    maxCostPerCallUsd: 1,
    inputTokens: 160000,
    contextWindow: 200000,
  });
  assert.equal(r.shouldHandoff, true);
  assert.equal(r.reason, 'context');
});

test('buildHandoffContextDigest includes goal and tools', () => {
  const digest = buildHandoffContextDigest({
    goal: 'Wire hero component in App.jsx',
    executedToolNames: ['workspace_read_file', 'r2_write'],
    triggeredBy: 'budget',
    parentModelKey: 'claude-opus-4-8',
    childModelKey: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Implement hero' }],
  });
  assert.match(digest, /Wire hero component/);
  assert.match(digest, /workspace_read_file/);
  assert.match(digest, /claude-sonnet-4-6/);
});
