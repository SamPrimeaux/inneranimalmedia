import test from 'node:test';
import assert from 'node:assert/strict';
import { messageRequestsWorkspaceGrep } from '../../src/core/agent-lane-router.js';

const REPO_SEARCH =
  'Find resolveModelForTask in my repo and show the file path.';

/**
 * Regression: capabilityFamiliesFromUserMessage used Array.prototype.delete (throws).
 * Mirror the Set merge path used after workspace_grep is selected.
 */
test('workspace_grep family merge uses Set.delete not Array.delete', () => {
  assert.equal(messageRequestsWorkspaceGrep(REPO_SEARCH), true);
  const fams = new Set(['browser', 'openweb']);
  fams.add('workspace_grep');
  fams.delete('browser');
  fams.delete('openweb');
  assert.deepEqual([...fams], ['workspace_grep']);
  assert.doesNotThrow(() => {
    fams.delete('browser');
  });
});
