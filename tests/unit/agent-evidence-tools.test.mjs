import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askPinnedEvidenceToolNames,
  askDataPlaneIntent,
  agentWriteOrProposeIntent,
} from '../../src/core/ask-evidence-tools.js';

test('askDataPlaneIntent — remote D1 audit', () => {
  assert.equal(
    askDataPlaneIntent('audit agentsam_prompt_routes in the remote d1'),
    true,
  );
});

test('askPinnedEvidenceToolNames agent mode — D1 audit pins d1_query', () => {
  const names = askPinnedEvidenceToolNames(
    'audit agentsam_prompt_routes in the remote d1',
    'agent',
  );
  assert.ok(names.includes('d1_query'));
  assert.ok(names.includes('d1_schema'));
});

test('askPinnedEvidenceToolNames agent mode — write readme pins write tools', () => {
  const names = askPinnedEvidenceToolNames('can you write/upload the readme ?', 'agent');
  assert.ok(names.includes('write_file'));
  assert.ok(agentWriteOrProposeIntent('can you write/upload the readme ?'));
});

test('askPinnedEvidenceToolNames agent mode — browser route proposal still gets file tools', () => {
  const names = askPinnedEvidenceToolNames(
    'CAN YOU PROPOSE HOW WE CAN MAKE THIS decent .html into a full stack app?',
    'agent',
  );
  assert.ok(names.includes('fs_read_file') || names.includes('github_file'));
});
