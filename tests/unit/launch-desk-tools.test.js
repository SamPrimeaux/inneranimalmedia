import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLaunchTasks,
  scoreLaunchReadiness,
  buildOwnerChecklist,
  draftLaunchCopy,
} from '../../src/launch-desk/tools.js';

const sample = {
  brief: 'Launch a workspace import flow for new teams.',
  audience: 'Ops leads',
  launchDate: '2026-06-12',
  constraints: 'Feature flags required; support is limited.',
  availableAssets: 'Screenshots, FAQ draft',
};

test('extractLaunchTasks returns prioritized tasks and missing details', () => {
  const out = extractLaunchTasks(sample);
  assert.ok(Array.isArray(out.tasks));
  assert.ok(out.tasks.length >= 4);
  assert.equal(typeof out.brief_summary, 'string');
  assert.ok(Array.isArray(out.missing_details));
  assert.ok(out.detected_channels.length >= 1);
});

test('scoreLaunchReadiness returns a bounded score and recommendation', () => {
  const out = scoreLaunchReadiness(sample);
  assert.ok(out.score >= 0 && out.score <= 100);
  assert.ok(['green', 'yellow', 'red'].includes(out.grade));
  assert.equal(typeof out.recommendation, 'string');
  assert.ok(Array.isArray(out.risks));
});

test('buildOwnerChecklist returns owner sections', () => {
  const out = buildOwnerChecklist(sample);
  assert.ok(Array.isArray(out.owners));
  assert.ok(out.owners.length > 0);
  assert.ok(Array.isArray(out.launch_day_sequence));
});

test('draftLaunchCopy returns channel drafts', () => {
  const out = draftLaunchCopy({ ...sample, channels: ['email', 'slack'] });
  assert.ok(Array.isArray(out.drafts));
  assert.equal(out.drafts.length, 2);
  assert.ok(out.drafts.some((draft) => draft.channel === 'email'));
});
