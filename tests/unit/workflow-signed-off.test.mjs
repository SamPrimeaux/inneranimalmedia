import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkflowSignedOff,
  shouldEnforceWorkflowApproval,
  buildSignedOffMetadataPatch,
} from '../../src/core/workflow-signed-off.js';

test('isWorkflowSignedOff reads metadata_json.signed_off', () => {
  assert.equal(isWorkflowSignedOff({ metadata_json: { signed_off: true } }), true);
  assert.equal(isWorkflowSignedOff({ metadata_json: '{"signed_off":true}' }), true);
  assert.equal(isWorkflowSignedOff({ metadata_json: { automation_mode: 'trusted' } }), true);
  assert.equal(isWorkflowSignedOff({ metadata_json: {} }), false);
  assert.equal(isWorkflowSignedOff(null), false);
});

test('shouldEnforceWorkflowApproval inverts signed-off state', () => {
  assert.equal(shouldEnforceWorkflowApproval({ metadata_json: { signed_off: true } }), false);
  assert.equal(shouldEnforceWorkflowApproval({ metadata_json: {} }), true);
});

test('buildSignedOffMetadataPatch stamps sign-off metadata', () => {
  const patch = buildSignedOffMetadataPatch('{"starter":true}', {
    signedOff: true,
    userId: 'au_test',
  });
  assert.equal(patch.signed_off, true);
  assert.equal(patch.starter, true);
  assert.equal(patch.signed_off_by, 'au_test');
  assert.ok(typeof patch.signed_off_at === 'string');
});
