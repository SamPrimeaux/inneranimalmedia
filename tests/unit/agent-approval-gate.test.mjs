import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequireToolApproval } from '../../src/core/agent-approval-policy.js';

test('shouldRequireToolApproval respects auto_run_mode auto in execution modes', () => {
  const validation = { requiresConfirmation: true };
  const userPolicy = { auto_run_mode: 'auto' };

  assert.equal(shouldRequireToolApproval(validation, { mode: 'agent' }, userPolicy), false);
  assert.equal(shouldRequireToolApproval(validation, { mode: 'debug' }, userPolicy), false);
  assert.equal(shouldRequireToolApproval(validation, { mode: 'multitask' }, userPolicy), false);
  assert.equal(shouldRequireToolApproval(validation, { mode: 'ask' }, userPolicy), true);
  assert.equal(shouldRequireToolApproval(validation, { mode: 'plan' }, userPolicy), true);
});

test('shouldRequireToolApproval still gates when auto_run is allowlist', () => {
  const validation = { requiresConfirmation: true };
  assert.equal(
    shouldRequireToolApproval(validation, { mode: 'agent' }, { auto_run_mode: 'allowlist' }),
    true,
  );
});
