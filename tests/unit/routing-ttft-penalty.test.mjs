import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTtftPenaltyToAlpha,
  TTFT_INTERACTIVE_PENALTY_MS,
} from '../../src/core/exec-context-tier.js';

describe('applyTtftPenaltyToAlpha', () => {
  it('exports threshold constant', () => {
    assert.equal(TTFT_INTERACTIVE_PENALTY_MS, 8000);
  });

  it('reduces alpha for slow interactive arms with enough samples', () => {
    const out = applyTtftPenaltyToAlpha(10, {
      mode: 'agent',
      sampleN: 10,
      avgLatencyMs: TTFT_INTERACTIVE_PENALTY_MS + 100,
    });
    assert.equal(out, 7);
  });

  it('skips penalty for plan mode', () => {
    const out = applyTtftPenaltyToAlpha(10, {
      mode: 'plan',
      sampleN: 20,
      avgLatencyMs: 20000,
    });
    assert.equal(out, 10);
  });
});
