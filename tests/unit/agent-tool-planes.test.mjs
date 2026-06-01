import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadEvidenceTool,
  isMutationOrExecutionTool,
  explicitMemorySaveIntent,
  filterAskReadEvidenceTools,
} from '../../src/core/agent-tool-planes.js';
import { toolBlockedByWritePolicy } from '../../src/core/agent-mode-tool-policy.js';

test('read evidence tools include repo/file/D1 search', () => {
  assert.equal(isReadEvidenceTool('d1_query'), true);
  assert.equal(isReadEvidenceTool('fs_search_files'), true);
  assert.equal(isReadEvidenceTool('github_file'), true);
  assert.equal(isReadEvidenceTool('agentsam_memory_search'), true);
});

test('mutation tools are not read evidence', () => {
  assert.equal(isReadEvidenceTool('terminal_run'), false);
  assert.equal(isReadEvidenceTool('d1_write'), false);
  assert.equal(isMutationOrExecutionTool('terminal_run'), true);
  assert.equal(isMutationOrExecutionTool('r2_put'), true);
});

test('filterAskReadEvidenceTools strips execution tools', () => {
  const out = filterAskReadEvidenceTools(['d1_query', 'terminal_run', 'github_file', 'd1_write']);
  assert.deepEqual(out.sort(), ['d1_query', 'github_file']);
});

test('memory write blocked in ask unless explicit save intent', () => {
  const wp = {
    can_edit_files: false,
    can_terminal: false,
    can_d1_write: false,
    can_deploy: false,
    can_browser_automation: false,
    can_memory_write: false,
  };
  assert.equal(toolBlockedByWritePolicy(wp, 'agentsam_memory_write', { userMessage: 'hi' }), true);
  assert.equal(
    toolBlockedByWritePolicy(wp, 'agentsam_memory_write', { userMessage: 'remember this for later' }),
    false,
  );
  assert.equal(explicitMemorySaveIntent('save this to memory'), true);
});
