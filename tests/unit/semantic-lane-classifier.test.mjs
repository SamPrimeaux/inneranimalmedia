import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySemanticLane,
  classifyDatabaseAssistantIntent,
  shouldSupplementDeepArchive,
} from '../../src/core/semantic-lane-classifier.js';

test('classifySemanticLane code vs grep', () => {
  assert.equal(
    classifySemanticLane('What files handle model routing and fallback?'),
    'code_semantic_search',
  );
  assert.equal(classifySemanticLane('Find resolveModelForTask in my repo'), null);
});

test('classifySemanticLane platform baseline routes deep archive', () => {
  assert.equal(
    classifySemanticLane('What does the platform baseline say about Vectorize?'),
    'deep_archive_search',
  );
  assert.equal(
    classifySemanticLane('Show me the binding map for AGENTSAM_VECTORIZE'),
    'deep_archive_search',
  );
});

test('shouldSupplementDeepArchive supplements docs lane for platform wiring', () => {
  assert.equal(
    shouldSupplementDeepArchive('How does Vectorize binding wiring work?', 'docs_knowledge_search'),
    true,
  );
  assert.equal(shouldSupplementDeepArchive('deep archive only query', 'deep_archive_search'), false);
  assert.equal(shouldSupplementDeepArchive('grep for foo', 'code_semantic_search'), false);
});

test('classifyDatabaseAssistantIntent migration proposal', () => {
  assert.equal(
    classifyDatabaseAssistantIntent('Propose a migration to add a telemetry column but do not apply it'),
    'propose_migration',
  );
});
