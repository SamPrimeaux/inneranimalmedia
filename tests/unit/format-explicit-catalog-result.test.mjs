import test from 'node:test';
import assert from 'node:assert/strict';
import { formatExplicitCatalogToolResult } from '../../src/core/format-explicit-catalog-result.js';

test('formatExplicitCatalogToolResult formats list_commits as markdown list', () => {
  const text = formatExplicitCatalogToolResult(
    'agentsam_github_list_commits',
    JSON.stringify({
      ok: true,
      repo: 'SamPrimeaux/inneranimalmedia',
      ref: 'main',
      commits: [
        {
          sha: 'abc1234567890',
          short_sha: 'abc1234',
          message: 'Pin named tools',
          author: 'Sam',
          date: '2026-07-21T21:00:00Z',
        },
      ],
    }),
  );
  assert.match(text, /Recent commits on \*\*SamPrimeaux\/inneranimalmedia\*\*/);
  assert.match(text, /`abc1234` Pin named tools/);
  assert.equal(text.includes('{"ok":true'), false);
});

test('formatExplicitCatalogToolResult formats fs_read_file content fence', () => {
  const text = formatExplicitCatalogToolResult('fs_read_file', {
    success: true,
    path: 'package.json',
    content: '{\n  "name": "inneranimalmedia"\n}',
    exit_code: 0,
  });
  assert.match(text, /Contents of `package\.json`/);
  assert.match(text, /```json/);
  assert.match(text, /inneranimalmedia/);
});

test('formatExplicitCatalogToolResult reports fs_read failures clearly', () => {
  const text = formatExplicitCatalogToolResult('fs_read_file', {
    success: false,
    path: 'package.json',
    content: '/bin/bash: cd: inneranimalmedia: No such file',
    exit_code: 1,
  });
  assert.match(text, /Could not read/);
  assert.match(text, /No such file/);
});

test('formatExplicitCatalogToolResult expands github 404 with repo hint', () => {
  const text = formatExplicitCatalogToolResult('agentsam_github_list_commits', {
    ok: false,
    error: 'github_repo_not_found',
    body: {
      status: 404,
      repo: 'SamPrimeaux/companionsofcaddo',
      user_message:
        'GitHub could not find `SamPrimeaux/companionsofcaddo` (404). Check the owner/name spelling, or call agentsam_github_repo_list to see repos you can access.',
      message: 'GitHub GET /repos/SamPrimeaux/companionsofcaddo/commits → 404: Not Found',
    },
  });
  assert.match(text, /companionsofcaddo/);
  assert.match(text, /agentsam_github_repo_list/);
  assert.notEqual(text.trim(), 'github_api_error');
  assert.notEqual(text.trim(), 'github_repo_not_found');
});
