import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSearchQueryFromUserText,
  normalizeFsSearchFilesParams,
} from '../../src/core/fs-search-files.js';

test('extractSearchQueryFromUserText — quoted containing', () => {
  const q = extractSearchQueryFromUserText(
    'Use fs_search_files to find all files containing "execOnPtyHost" in this repo',
  );
  assert.equal(q, 'execOnPtyHost');
});

test('extractSearchQueryFromUserText — agentsam_ prefix', () => {
  const q = extractSearchQueryFromUserText('find agentsam_ tables in the repo');
  assert.match(q, /^agentsam_/i);
});

test('extractSearchQueryFromUserText — markdown heading', () => {
  const q = extractSearchQueryFromUserText('try again to find # Agent Sam — Audit Checklist');
  assert.match(q, /Agent Sam/i);
});

test('normalizeFsSearchFilesParams fills query from userMessage', () => {
  const out = normalizeFsSearchFilesParams({}, {
    userMessage: 'find all files containing "execOnPtyHost"',
  });
  assert.equal(out.query, 'execOnPtyHost');
});
