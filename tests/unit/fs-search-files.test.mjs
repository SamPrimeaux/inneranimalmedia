import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRgSearchCommand,
  isSafeRgSearchCommand,
  parseRgJsonMatches,
} from '../../src/core/fs-search-rg-parse.js';
test('buildRgSearchCommand produces safe command', () => {
  const cmd = buildRgSearchCommand('resolveModelForTask', 'src/core');
  assert.ok(cmd);
  assert.equal(isSafeRgSearchCommand(cmd), true);
  assert.match(cmd, /rg --json/);
});

test('parseRgJsonMatches extracts match rows', () => {
  const line = JSON.stringify({
    type: 'match',
    data: {
      path: { text: 'src/core/resolveModel.js' },
      line_number: 10,
      lines: { text: 'export function resolveModelForTask' },
    },
  });
  const matches = parseRgJsonMatches(`${line}\n`);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].path, 'src/core/resolveModel.js');
});

