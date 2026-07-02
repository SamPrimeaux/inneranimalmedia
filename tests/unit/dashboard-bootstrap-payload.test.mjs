import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const bootJs = readFileSync(join(root, 'src/api/dashboard-bootstrap.js'), 'utf8');
const bootTs = readFileSync(join(root, 'dashboard/src/loadDashboardBootstrap.ts'), 'utf8');

/** L1 allowlist — agent domain fields belong on L2 endpoints only. */
const L1_TOP_LEVEL_KEYS = new Set([
  'ok',
  'fetched_at',
  'me',
  'workspaces',
  'status',
  'theme',
  'client',
  '_meta',
]);

test('dashboard-bootstrap.js — no L2 agent keys in handler', () => {
  assert.doesNotMatch(bootJs, /^[ \t]+agent_policy,/m);
  assert.doesNotMatch(bootJs, /^[ \t]+agent:\s*\{/m);
  assert.doesNotMatch(bootJs, /agentsam_model_catalog/);
  assert.doesNotMatch(bootJs, /resolveActiveBootstrap/);
});

test('DashboardBootstrapPayload type — no agent block', () => {
  assert.doesNotMatch(bootTs, /agent\?:\s*\{/);
  assert.doesNotMatch(bootTs, /agent_policy/);
});

test('L1 response keys are documented allowlist subset', () => {
  const block = bootJs.match(/return jsonResponse\(\{([\s\S]*?)\}\);/);
  assert.ok(block, 'jsonResponse return block found');
  const keys = [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  for (const key of keys) {
    assert.ok(L1_TOP_LEVEL_KEYS.has(key), `unexpected L1 key: ${key}`);
  }
});
