import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifySemanticLane,
  classifyDatabaseAssistantIntent,
} from '../../src/core/semantic-lane-classifier.js';
import { resolveAgentChatLaneContextBlock } from '../../src/core/agent-chat-lane-context.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const agentSrc = readFileSync(join(root, 'src/api/agent.js'), 'utf8');

test('agent.js hot path does not call unifiedRagSearch', () => {
  assert.equal(agentSrc.includes('unifiedRagSearch('), false);
  assert.equal(agentSrc.includes('retrieveContextPack('), false);
  assert.equal(agentSrc.includes('Relevant context:'), false);
  assert.ok(agentSrc.includes('resolveAgentChatLaneContextBlock'));
  assert.ok(agentSrc.includes('legacyUnifiedRagSearch'));
});

test('A read_only file intent — no semantic lane', () => {
  assert.equal(classifySemanticLane('Describe this README in Monaco'), null);
});

test('B exact repo symbol — no semantic lane', () => {
  assert.equal(classifySemanticLane('Find resolveModelForTask in my repo'), null);
});

test('C code semantic lane classification', () => {
  assert.equal(
    classifySemanticLane('What files handle model routing and fallback?'),
    'code_semantic_search',
  );
});

test('D schema semantic lane classification', () => {
  assert.equal(
    classifySemanticLane('What tables support model routing and pricing?'),
    'schema_semantic_search',
  );
});

test('E open web — no semantic lane', () => {
  assert.equal(
    classifySemanticLane('What are the latest Cloudflare AI Search docs updates?'),
    null,
  );
});

test('F database assistant explain table intent', () => {
  assert.equal(
    classifyDatabaseAssistantIntent('Explain agentsam_workflow_runs schema in Supabase'),
    'explain_table',
  );
});

test('resolveAgentChatLaneContextBlock skips grep-style prompts without bindings', async () => {
  const out = await resolveAgentChatLaneContextBlock(
    {},
    {
      message: 'Find resolveModelForTask in my repo',
      includeRag: true,
      workspaceId: 'ws_test',
      tenantId: 'tenant_test',
    },
  );
  assert.equal(out.block, '');
  assert.equal(out.lane, null);
});
