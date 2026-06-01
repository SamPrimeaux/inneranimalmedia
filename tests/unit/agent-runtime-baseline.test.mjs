import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModeToolPolicy } from '../../src/core/agent-mode-tool-policy.js';
import { parseActiveFileEnvelope, defaultSearchPathFromActiveFile } from '../../src/core/active-file-envelope.js';

test('mode policy denies terminal on plan', async () => {
  const policy = await loadModeToolPolicy(null, 'plan');
  assert.ok(policy.denyTools.includes('terminal_run'));
});

test('mode policy allows fs_search on agent', async () => {
  const policy = await loadModeToolPolicy(null, 'agent');
  assert.ok(!policy.denyTools.includes('fs_search_files'));
});

test('ask mode allows read evidence tools, denies mutation/execution', async () => {
  const policy = await loadModeToolPolicy(null, 'ask');
  assert.ok(!policy.denyTools.includes('d1_query'));
  assert.ok(!policy.denyTools.includes('fs_search_files'));
  assert.ok(policy.denyTools.includes('terminal_run'));
  assert.ok(policy.denyTools.includes('d1_write'));
  assert.ok(policy.denyTools.includes('python_execute'));
  assert.ok(policy.denyTools.includes('worker_deploy'));
});

test('active file envelope parses monaco path', () => {
  const env = parseActiveFileEnvelope({
    active_file_source: 'local',
    active_file_path: 'src/api/agent.js',
    active_file_workspace_path: 'src/api/agent.js',
  });
  assert.ok(env);
  assert.equal(env.path, 'src/api/agent.js');
  assert.equal(defaultSearchPathFromActiveFile(env), 'src/api');
});
