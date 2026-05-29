import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipD1RowForPrivateBackfill } from '../../src/core/agentsam-private-memory-backfill.js';

describe('agentsam-private-memory-backfill', () => {
  it('skips stale and empty rows', () => {
    assert.equal(shouldSkipD1RowForPrivateBackfill({ key: '', value: 'x' }), 'empty');
    assert.equal(
      shouldSkipD1RowForPrivateBackfill({ key: 'k', value: '[STALE] removed' }),
      'stale_marker',
    );
    assert.equal(shouldSkipD1RowForPrivateBackfill(null), 'empty');
  });

  it('accepts policy and state types', () => {
    assert.equal(
      shouldSkipD1RowForPrivateBackfill({
        key: 'policy:test',
        value: 'rule',
        memory_type: 'policy',
      }),
      null,
    );
    assert.equal(
      shouldSkipD1RowForPrivateBackfill({
        key: 'state:production',
        value: '{}',
        memory_type: 'state',
      }),
      null,
    );
  });
});
