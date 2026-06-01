import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askPinnedEvidenceToolNames,
  askDataPlaneIntent,
  agentWriteOrProposeIntent,
  githubWorkspaceIntent,
  augmentAskRouteRequirements,
} from '../../src/core/ask-evidence-tools.js';

test('askDataPlaneIntent — remote D1 audit', () => {
  assert.equal(
    askDataPlaneIntent('audit agentsam_prompt_routes in the remote d1'),
    true,
  );
});

test('askPinnedEvidenceToolNames — agent mode does not hardcode tool names', () => {
  const names = askPinnedEvidenceToolNames(
    'audit agentsam_prompt_routes in the remote d1',
    'agent',
  );
  assert.deepEqual(names, []);
});

test('augmentAskRouteRequirements agent mode — D1 audit adds capability keys', () => {
  const req = augmentAskRouteRequirements(
    'audit agentsam_prompt_routes in the remote d1',
    {
      route_key: 'browser',
      task_type: 'agent',
      allowed_lanes: ['inspect'],
      required_capabilities: [],
      optional_capabilities: [],
      blocked_capabilities: [],
      max_tools: 8,
      approval_policy: null,
      source: 'test',
    },
    'agent',
  );
  assert.ok(req.optional_capabilities.some((c) => /d1/.test(String(c))));
});

test('augmentAskRouteRequirements agent mode — github write caps', () => {
  const req = augmentAskRouteRequirements(
    'write/upload the readme to agentsam-cms-python repo',
    {
      route_key: 'browser',
      task_type: 'agent',
      allowed_lanes: ['inspect'],
      required_capabilities: [],
      optional_capabilities: [],
      blocked_capabilities: [],
      max_tools: 8,
      approval_policy: null,
      source: 'test',
    },
    'agent',
  );
  assert.ok(req.optional_capabilities.some((c) => String(c).includes('github')));
  assert.ok(agentWriteOrProposeIntent('can you write/upload the readme ?'));
});

test('githubWorkspaceIntent — cms-python repo question', () => {
  assert.equal(
    githubWorkspaceIntent('is it SamPrimeaux/agentsam-cms-python? read README on github'),
    true,
  );
});

test('browser route defaults include github and d1 capabilities (resolver SSOT)', async () => {
  const fs = await import('node:fs');
  const path = new URL('../../src/core/agentsam-route-tool-resolver.js', import.meta.url);
  const src = fs.readFileSync(path, 'utf8');
  assert.match(src, /browser:\s*\{[\s\S]*github\.read/);
  assert.match(src, /browser:\s*\{[\s\S]*d1_query/);
});
