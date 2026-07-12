import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskSpec, mapTaskTypeToSpecAxes, taskSpecKey } from '../../src/core/task-spec.js';

test('project_question maps to code.inspect + inspect tool profile', () => {
  const spec = buildTaskSpec({
    taskType: 'project_question',
    message: 'inspect the repo and propose tool structure improvements',
    matchedBy: 'classifier',
    confidence: 0.9,
  });
  assert.equal(spec.domain, 'code');
  assert.equal(spec.operation, 'inspect');
  assert.equal(spec.toolProfile, 'inspect');
  assert.equal(spec.authority, 'read');
  assert.equal(taskSpecKey(spec), 'code.inspect');
});

test('chat + architecture ask upgrades to inspect axes', () => {
  const axes = mapTaskTypeToSpecAxes('chat', {
    message:
      'can you inspect the repo/propose how we can improve the tool structure/agent to tool/task type?',
  });
  assert.equal(axes.toolProfile, 'inspect');
  assert.equal(axes.domain, 'code');
  assert.equal(axes.operation, 'inspect');
});

test('image fast path maps to media.generate', () => {
  const spec = buildTaskSpec({
    taskType: 'image_generation',
    imageFastPath: true,
    message: 'generate an image of a red barn',
  });
  assert.equal(spec.domain, 'media');
  assert.equal(spec.toolProfile, 'image');
  assert.equal(spec.imageFastPath, true);
});

test('review + architecture ask maps to inspect (not oauth_parity)', () => {
  const axes = mapTaskTypeToSpecAxes('review', {
    message:
      'can you inspect the repo/propose how we can improve the tool structure/agent to tool/task type?',
  });
  assert.equal(axes.toolProfile, 'inspect');
  assert.equal(axes.domain, 'code');
  assert.equal(axes.operation, 'inspect');
});

test('code mutate maps to code_develop', () => {
  const spec = buildTaskSpec({ taskType: 'code_implementation', message: 'fix the migration' });
  assert.equal(spec.toolProfile, 'code_develop');
  assert.equal(spec.authority, 'approve_mutate');
  assert.equal(taskSpecKey(spec), 'code.mutate');
});
