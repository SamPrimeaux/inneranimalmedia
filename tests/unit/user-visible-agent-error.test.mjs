import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternalAgentErrorText,
  synthesizeUserVisibleAgentFailure,
  USER_VISIBLE_TOOL_FAILURE,
} from '../../src/core/user-visible-agent-error.js';
import { formatExplicitCatalogToolResult } from '../../src/core/format-explicit-catalog-result.js';

test('isInternalAgentErrorText catches tool timeout strings', () => {
  assert.equal(isInternalAgentErrorText('Tool timed out after 1341ms'), true);
  assert.equal(
    isInternalAgentErrorText('Tool execution failed: Tool timed out after 1341ms'),
    true,
  );
  assert.equal(isInternalAgentErrorText('Here is your HTML landing page.'), false);
});

test('synthesizeUserVisibleAgentFailure never returns raw timeout', () => {
  const out = synthesizeUserVisibleAgentFailure('Tool timed out after 1341ms', {
    code: 'tool_timeout',
  });
  assert.equal(out, USER_VISIBLE_TOOL_FAILURE);
  assert.equal(out.includes('1341'), false);
  assert.equal(out.includes('Tool timed out'), false);
});

test('formatExplicitCatalogToolResult synthesizes timeout toolOutput', () => {
  const text = formatExplicitCatalogToolResult(
    'agentsam_github_list_commits',
    'Tool execution failed: Tool timed out after 1341ms',
  );
  assert.equal(text, USER_VISIBLE_TOOL_FAILURE);
  assert.equal(text.includes('1341'), false);
});

test('synthesize preserves ordinary non-internal messages', () => {
  const msg = 'Repository not found (404). Check the owner/name spelling.';
  assert.equal(synthesizeUserVisibleAgentFailure(msg), msg);
});
