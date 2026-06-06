import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatToolTraceDisplayTitle,
  resolveToolTraceCommand,
  resolveToolTraceMetaLabel,
} from '../../dashboard/lib/formatToolTraceDisplayTitle.ts';

test('formatToolTraceDisplayTitle — terminal local', () => {
  assert.equal(
    formatToolTraceDisplayTitle({
      toolName: 'agentsam_terminal_local',
      integrationLabel: 'Agent Sam',
    }),
    'Agentsam terminal local',
  );
});

test('resolveToolTraceCommand — JSON command field', () => {
  assert.equal(
    resolveToolTraceCommand({
      id: '1',
      toolName: 'agentsam_terminal_local',
      status: 'running',
      lines: [],
      detailsJson: JSON.stringify({ command: 'npm run deploy:full' }),
      startedAtLabel: '',
    }),
    'npm run deploy:full',
  );
});

test('resolveToolTraceMetaLabel — running vs done', () => {
  const base = {
    id: '1',
    toolName: 'agentsam_terminal_local',
    lines: [],
    startedAtLabel: '',
  };
  assert.equal(
    resolveToolTraceMetaLabel({ ...base, status: 'running' }, 'ls -la'),
    'ls -la',
  );
  assert.equal(resolveToolTraceMetaLabel({ ...base, status: 'done' }, 'ls -la'), 'Result');
});
