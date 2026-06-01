import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

test('hot-path banned patterns are absent (runtime spine)', () => {
  const repoRoot = path.resolve(process.cwd());
  const targets = [
    path.join(repoRoot, 'src/api/agent-chat-spine.js'),
    path.join(repoRoot, 'src/core/runtime-profile.js'),
    path.join(repoRoot, 'src/core/mode-controllers/agent-controller.js'),
  ];

  const banned = [
    /requestedMode ===/,
    /inferIntentHeuristics/,
    /enterLongWorkPlanPipeline/,
    /runtime_intent_mode/,
    /agent_mode/,
    /chat_loop/,
    /workflow_only/,
  ];

  for (const file of targets) {
    const content = read(file);
    for (const re of banned) {
      assert.equal(
        re.test(content),
        false,
        `banned pattern ${String(re)} found in ${path.relative(repoRoot, file)}`,
      );
    }
  }
});

