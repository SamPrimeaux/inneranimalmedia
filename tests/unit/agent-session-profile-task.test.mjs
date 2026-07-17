import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSessionProfileTaskType } from '../../src/core/session-profile-task.js';

describe('resolveSessionProfileTaskType', () => {
  it('prefers explicit task_type', () => {
    assert.equal(
      resolveSessionProfileTaskType('agent', { task_type: 'database_schema', route_key: 'database_studio' }),
      'database_schema',
    );
  });

  it('uses database_studio route_key when no task_type', () => {
    assert.equal(
      resolveSessionProfileTaskType('agent', { route_key: 'database_studio' }),
      'database_studio',
    );
  });

  it('detects Studio surface from browserContext.databaseContext', () => {
    assert.equal(
      resolveSessionProfileTaskType('agent', {
        browserContext: {
          databaseContext: { surface: 'database', provider: 'supabase', route: '/dashboard/database' },
        },
      }),
      'database_studio',
    );
  });

  it('falls back to composer mode for ordinary agent turns', () => {
    assert.equal(resolveSessionProfileTaskType('agent', {}), 'agent');
    assert.equal(resolveSessionProfileTaskType('ask', { route_key: 'home' }), 'ask');
  });
});
