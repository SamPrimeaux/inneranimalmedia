import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeApplyPatchOperation,
  upsertApplyPatchCall,
  finalizePendingApplyPatchCalls,
} from '../../src/core/openai-apply-patch-items.js';

test('mergeApplyPatchOperation does not wipe path with empty string', () => {
  const merged = mergeApplyPatchOperation(
    { type: 'create_file', path: 'oai_apply_patch_pass1.html', diff: '+hi\n' },
    { type: 'create_file', path: '', diff: '' },
  );
  assert.equal(merged.path, 'oai_apply_patch_pass1.html');
  assert.equal(merged.diff, '+hi\n');
});

test('upsertApplyPatchCall links call_* and apc_* into one entry', () => {
  const list = [];
  const byKey = new Map();
  upsertApplyPatchCall(list, byKey, {
    id: 'apc_aaa',
    call_id: null,
    operation: {},
    status: 'in_progress',
  });
  upsertApplyPatchCall(list, byKey, {
    id: 'apc_aaa',
    call_id: 'call_bbb',
    operation: {
      type: 'create_file',
      path: 'oai_apply_patch_pass1.html',
      diff: '+x\n',
    },
    status: 'completed',
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].call_id, 'call_bbb');
  assert.equal(list[0].id, 'apc_aaa');
  assert.equal(list[0].operation.path, 'oai_apply_patch_pass1.html');
  assert.equal(byKey.get('call_bbb'), 0);
  assert.equal(byKey.get('apc_aaa'), 0);
});

test('finalizePendingApplyPatchCalls drops empty-path duplicates', () => {
  const finalized = finalizePendingApplyPatchCalls([
    { call_id: 'call_1', id: 'apc_1', operation: {} },
    {
      call_id: 'call_1',
      id: 'apc_1',
      operation: { type: 'create_file', path: 'oai_apply_patch_pass1.html', diff: '+hi\n' },
    },
  ]);
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].call_id, 'call_1');
  assert.equal(finalized[0].operation.path, 'oai_apply_patch_pass1.html');
});
