/**
 * Unit tests for agentsam memory commit contract + dry_run / idempotency helpers.
 * No live D1/PG/Vectorize — focused contract law.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftMemoryCommit,
  proposeMemoryKey,
  detectSecrets,
  buildProjectionKey,
  normalizeMemoryCommitType,
  buildRetrievalText,
  approxTokenCount,
} from '../../src/core/agentsam-memory-contract.js';

describe('agentsam memory commit contract', () => {
  it('aliases skill→procedure and project→fact', () => {
    assert.equal(normalizeMemoryCommitType('skill'), 'procedure');
    assert.equal(normalizeMemoryCommitType('project'), 'fact');
    assert.equal(normalizeMemoryCommitType('decision'), 'decision');
  });

  it('proposes stable semantic keys not title alone', () => {
    const key = proposeMemoryKey({
      memory_type: 'policy',
      title: 'Operator Credential Resolution',
      tags: ['cloudflare'],
    });
    assert.match(key, /^policy:cloudflare:/);
  });

  it('rejects secrets in draft', async () => {
    const r = await draftMemoryCommit(
      {
        content: 'Use CLOUDFLARE_API_TOKEN=abc123secretvalueherefortestxx for auth',
        memory_type: 'policy',
      },
      { tenant_id: 'tenant_x', user_id: 'au_x', workspace_id: 'ws_x' },
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('secret_content_rejected'));
  });

  it('rejects agent-supplied user_id mismatch', async () => {
    const r = await draftMemoryCommit(
      {
        content: 'Durable preference: no emoji in operator UI copy.',
        memory_type: 'preference',
        user_id: 'au_attacker',
      },
      { tenant_id: 'tenant_x', user_id: 'au_sam', workspace_id: 'ws_x' },
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('agent_supplied_user_id_rejected'));
  });

  it('builds retrieval text without value_json', async () => {
    const text = buildRetrievalText({
      title: 'Demo readiness',
      memory_type: 'state',
      scope_type: 'workspace',
      scope_id: 'ws_companionscpas',
      content: 'Companions demo is ready for Monday handoff.',
      tags: ['companions'],
    });
    assert.match(text, /Title:/);
    assert.match(text, /Companions demo/);
    assert.doesNotMatch(text, /value_json/);
  });

  it('projection_key is deterministic', () => {
    const a = buildProjectionKey({ memory_id: 'mem_1', revision: 2, chunk_index: 0 });
    const b = buildProjectionKey({ memory_id: 'mem_1', revision: 2, chunk_index: 0 });
    assert.equal(a, b);
    assert.match(a, /^memory:mem_1:revision:2:chunk:0:embed:/);
  });

  it('flags long content for extract route', async () => {
    const long = 'word '.repeat(700);
    assert.ok(approxTokenCount(long) > 600);
    const r = await draftMemoryCommit(
      { content: long + ' This is a complete sentence about deploy policy.', memory_type: 'policy' },
      { tenant_id: 'tenant_x', user_id: 'au_x', workspace_id: 'ws_x' },
    );
    assert.equal(r.ok, true);
    assert.equal(r.draft.long_content_route, 'extract_atomic');
  });

  it('detectSecrets finds bearer tokens', () => {
    const hits = detectSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb');
    assert.ok(hits.length >= 1);
  });
});
