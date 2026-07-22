/**
 * Regression: approved fs_write_file must not resolve to missing agentsam_tools write_file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolName } from '../../src/tools/ai-dispatch.js';
import { resolveCatalogDispatchToolKey } from '../../src/core/catalog-tool-key-resolve.js';

function approvedDispatchKey(raw) {
  return resolveCatalogDispatchToolKey(normalizeToolName(raw));
}

test('fs_write_file stays catalog-canonical after normalize + resolve', () => {
  assert.equal(approvedDispatchKey('fs_write_file'), 'fs_write_file');
  assert.equal(approvedDispatchKey('write_file'), 'fs_write_file');
  assert.equal(approvedDispatchKey('save_file'), 'fs_write_file');
});

test('fs_edit_file is not collapsed to write_file', () => {
  assert.equal(normalizeToolName('fs_edit_file'), 'fs_edit_file');
  assert.equal(approvedDispatchKey('fs_edit_file'), 'fs_edit_file');
});

test('fs_read_file stays catalog-canonical', () => {
  assert.equal(approvedDispatchKey('fs_read_file'), 'fs_read_file');
  assert.equal(approvedDispatchKey('read_file'), 'fs_read_file');
});
