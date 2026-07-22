import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveForcedExplicitCatalogTool,
  buildExplicitCatalogToolInput,
} from '../../src/core/code-implementation-intent.js';

const tools = [
  { name: 'fs_read_file' },
  { name: 'fs_write_file' },
  { name: 'agentsam_search_tools' },
];

test('create+edit proof naming fs_write_file does not force fs_read preinvoke', () => {
  const msg = `Use only fs_write_file then fs_read_file.
CREATE .scratch/agentsam-pty-proof-2026-07-22.txt
Append edited_ok=1`;
  assert.equal(resolveForcedExplicitCatalogTool(msg, tools), null);
});

test('read-only naming still forces fs_read_file', () => {
  assert.equal(
    resolveForcedExplicitCatalogTool('Please call fs_read_file on README.md', tools),
    'fs_read_file',
  );
});

test('fs_read_file input prefers .scratch .txt path over package.json default', () => {
  const input = buildExplicitCatalogToolInput(
    'fs_read_file',
    'READ .scratch/agentsam-pty-proof-2026-07-22.txt',
  );
  assert.equal(input.path, '.scratch/agentsam-pty-proof-2026-07-22.txt');
});
