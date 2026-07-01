import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSseTypeToOutboxEventType } from '../../src/core/agentsam-chat-sessions.js';

test('mapSseTypeToOutboxEventType maps stream categories', () => {
  assert.equal(mapSseTypeToOutboxEventType('text'), 'token');
  assert.equal(mapSseTypeToOutboxEventType('content'), 'token');
  assert.equal(mapSseTypeToOutboxEventType('done'), 'done');
  assert.equal(mapSseTypeToOutboxEventType('error'), 'error');
  assert.equal(mapSseTypeToOutboxEventType('status'), 'status');
  assert.equal(mapSseTypeToOutboxEventType('thinking_start'), 'status');
});
