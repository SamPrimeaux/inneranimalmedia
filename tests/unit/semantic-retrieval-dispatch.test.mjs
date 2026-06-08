import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEMANTIC_LANE_KEYS,
  SEMANTIC_LANE_REGISTRY,
  embeddingSpecForSemanticLane,
  semanticQueryHash,
} from '../../src/core/semantic-retrieval-dispatch.js';

test('SEMANTIC_LANE_KEYS lists canonical semantic lanes', () => {
  assert.ok(SEMANTIC_LANE_KEYS.length >= 5);
  assert.equal(SEMANTIC_LANE_REGISTRY.code_semantic_search.binding, null);
  assert.equal(SEMANTIC_LANE_REGISTRY.deep_archive_search.dims, 3072);
});

test('embeddingSpecForSemanticLane enforces 1536 vs 3072', () => {
  assert.equal(embeddingSpecForSemanticLane('memory_semantic_search').dimensions, 1536);
  assert.equal(embeddingSpecForSemanticLane('deep_archive_search').dimensions, 3072);
});

test('semanticQueryHash is stable', async () => {
  const a = await semanticQueryHash('hello');
  const b = await semanticQueryHash('hello');
  assert.equal(a, b);
  assert.equal(a.length, 32);
});
