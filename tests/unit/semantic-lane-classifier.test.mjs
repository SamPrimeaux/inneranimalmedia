import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySemanticLane,
  classifyDatabaseAssistantIntent,
} from '../../src/core/semantic-lane-classifier.js';

test('classifySemanticLane code vs grep', () => {
  assert.equal(
    classifySemanticLane('What files handle model routing and fallback?'),
    'code_semantic_search',
  );
  assert.equal(classifySemanticLane('Find resolveModelForTask in my repo'), null);
});

test('classifyDatabaseAssistantIntent migration proposal', () => {
  assert.equal(
    classifyDatabaseAssistantIntent('Propose a migration to add a telemetry column but do not apply it'),
    'propose_migration',
  );
});
