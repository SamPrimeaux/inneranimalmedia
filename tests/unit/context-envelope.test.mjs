import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyActiveFileDefaultsToToolInput,
  parseActiveFileEnvelope,
} from '../../src/core/active-file-envelope.js';
import {
  contextEnvelopeGithubFocus,
  envelopeToActiveFileBodyFields,
  mergeContextEnvelopeIntoActiveFile,
  parseContextEnvelope,
} from '../../src/core/context-envelope.js';

test('parseContextEnvelope accepts JSON string body field', () => {
  const env = parseContextEnvelope({
    context_envelope: JSON.stringify({
      version: 1,
      focus: {
        lane: 'github',
        github: {
          repo: 'SamPrimeaux/inneranimalmedia',
          path: 'README.md',
          branch: 'main',
        },
      },
      content: { text: '# Hello', truncated: false },
    }),
  });
  assert.ok(env);
  assert.equal(contextEnvelopeGithubFocus(env)?.path, 'README.md');
});

test('envelopeToActiveFileBodyFields maps github focus + content', () => {
  const fields = envelopeToActiveFileBodyFields({
    version: 1,
    focus: {
      lane: 'github',
      github: { repo: 'SamPrimeaux/inneranimalmedia', path: 'README.md', branch: 'main' },
    },
    content: { text: '# Title', truncated: false },
  });
  assert.equal(fields?.active_file_github_path, 'README.md');
  assert.match(String(fields?.active_file_content), /Title/);
});

test('mergeContextEnvelopeIntoActiveFile overrides model-bound github path', () => {
  const ctx = {
    version: 1,
    focus: {
      lane: 'github',
      github: { repo: 'SamPrimeaux/inneranimalmedia', path: 'README.md', branch: 'main' },
    },
  };
  const merged = mergeContextEnvelopeIntoActiveFile(null, ctx, {
    parseActiveFileEnvelope,
    activeFileIsLocalWorkspaceBuffer: () => false,
  });
  assert.equal(merged?.github_path, 'README.md');
  const out = applyActiveFileDefaultsToToolInput(
    'agentsam_github_read',
    { repo: 'SamPrimeaux/inneranimalmedia', path: 'readme.md', ref: 'main' },
    merged,
  );
  assert.equal(out.path, 'README.md');
  assert.equal(out.ref, 'main');
});

test('agentsam_github_read backfill fills missing repo/path from envelope', () => {
  const envelope = parseActiveFileEnvelope({
    active_file_source: 'github',
    active_file_github_repo: 'SamPrimeaux/inneranimalmedia',
    active_file_github_path: 'README.md',
    active_file_github_branch: 'main',
  });
  const out = applyActiveFileDefaultsToToolInput('agentsam_github_read', {}, envelope);
  assert.equal(out.repo, 'SamPrimeaux/inneranimalmedia');
  assert.equal(out.path, 'README.md');
  assert.equal(out.ref, 'main');
});
