import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shellLayoutMeta = readFileSync(join(root, 'dashboard/lib/shellLayoutMeta.ts'), 'utf8');
const appIcon = readFileSync(join(root, 'dashboard/components/ui/AppIcon.tsx'), 'utf8');

test('resolveAgentChatLayout — center-chat routes ignore agentPosition side rails', () => {
  const centerBlock = shellLayoutMeta.match(
    /if \(centerChat && !editorRoute\) \{[\s\S]*?return 'center';[\s\S]*?\}/,
  );
  assert.ok(centerBlock, 'center-chat early return block exists');
  assert.doesNotMatch(centerBlock[0], /agentPosition/, 'center layout must not depend on agentPosition');
  const centerIdx = shellLayoutMeta.indexOf("if (centerChat && !editorRoute)");
  const rightIdx = shellLayoutMeta.indexOf("if (agentPosition === 'right') return 'right-rail'");
  assert.ok(centerIdx >= 0 && rightIdx >= 0, 'expected layout branches present');
  assert.ok(centerIdx < rightIdx, 'center-chat guard must precede right-rail branch');
});

test('AppIcon — no local integration SVG asset fallback', () => {
  assert.doesNotMatch(appIcon, /assets\/integrations\/.*\.svg/);
});
