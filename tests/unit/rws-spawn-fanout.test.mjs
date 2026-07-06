import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRwsSubagentProfiles,
  RWS_ROLE_SLUGS,
} from '../../src/core/subagent-profile-resolve.js';
import {
  buildRwsChildUserMessage,
  shouldRunRwsFanout,
  RWS_SPAWN_MODES,
} from '../../src/core/rws-spawn-pipeline.js';

const mockProfiles = [
  { slug: 'deep-researcher', display_name: 'Reader' },
  { slug: 'code-editor', display_name: 'Writer' },
  { slug: 'plain-summarizer', display_name: 'Summarizer' },
  { slug: 'deploy-validator', display_name: 'Other' },
];

test('pickRwsSubagentProfiles returns read write summarize roles', () => {
  const picked = pickRwsSubagentProfiles(mockProfiles);
  assert.equal(picked.length, 3);
  assert.equal(picked[0]._rws_role, 'read');
  assert.equal(picked[0].slug, 'deep-researcher');
  assert.equal(picked[1]._rws_role, 'write');
  assert.equal(picked[2]._rws_role, 'summarize');
  assert.equal(picked[2].slug, 'plain-summarizer');
});

test('RWS_ROLE_SLUGS has three pipeline stages', () => {
  assert.ok(RWS_ROLE_SLUGS.read.length);
  assert.ok(RWS_ROLE_SLUGS.write.length);
  assert.ok(RWS_ROLE_SLUGS.summarize.includes('plain-summarizer'));
});

test('buildRwsChildUserMessage includes prior read/write for summarize', () => {
  const msg = buildRwsChildUserMessage('summarize', 'fix the bug', {
    read: 'found error in foo.js',
    write: 'patched foo.js',
  });
  assert.match(msg, /found error in foo\.js/);
  assert.match(msg, /patched foo\.js/);
  assert.match(msg, /simple plain English/i);
});

test('shouldRunRwsFanout is multitask-only with policy execution enabled', () => {
  assert.equal(
    shouldRunRwsFanout({
      mode: 'multitask',
      parallel_policy: { enabled: true, execution_enabled: true },
    }),
    true,
  );
  assert.equal(
    shouldRunRwsFanout({
      mode: 'multitask',
      parallel_policy: { enabled: true, execution_enabled: false },
    }),
    false,
    'RWS requires execution_enabled',
  );
  assert.equal(
    shouldRunRwsFanout({
      mode: 'multitask',
      parallel_policy: { enabled: true, execution_enabled: true },
      skip_rws_fanout: true,
    }),
    false,
    'Design Studio surface skips RWS fanout',
  );
  assert.equal(
    shouldRunRwsFanout({
      mode: 'multitask',
      parallel_policy: { enabled: true, execution_enabled: true },
      refined_route_key: 'design_studio',
    }),
    false,
    'design_studio route skips RWS fanout',
  );
  for (const mode of ['agent', 'debug', 'plan', 'ask']) {
    assert.equal(
      shouldRunRwsFanout({
        mode,
        parallel_policy: { enabled: true, execution_enabled: true },
      }),
      false,
      `RWS must not run on mode=${mode}`,
    );
  }
});
