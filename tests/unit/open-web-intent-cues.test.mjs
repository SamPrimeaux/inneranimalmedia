import test from 'node:test';
import assert from 'node:assert/strict';

import { hasExplicitOpenWebSearchCue } from '../../src/core/open-web-intent-cues.js';

test('compact websearch phrasing with most recent models selects public-web discovery', () => {
  assert.equal(
    hasExplicitOpenWebSearchCue(
      'Can you websearch/provide the most recent models released by OpenAI API?',
    ),
    true,
  );
});

test('repo and database searches are not standalone public-web cues', () => {
  assert.equal(hasExplicitOpenWebSearchCue('search src for the Agent Sam controller'), false);
  assert.equal(hasExplicitOpenWebSearchCue('query agentsam_agent_run in D1'), false);
});
