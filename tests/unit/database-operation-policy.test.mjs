import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDatabaseOperation,
  evaluateDatabaseOperation,
  resolveDatabaseRuntimeContext,
} from '../../src/core/database-operation-policy.js';

test('classifyDatabaseOperation read vs ddl', () => {
  assert.equal(classifyDatabaseOperation('SELECT 1'), 'read_only');
  assert.equal(classifyDatabaseOperation('ALTER TABLE agentsam.foo ADD COLUMN x text'), 'owner_approval_required');
});

test('non-owner cannot mutate', () => {
  const ctx = resolveDatabaseRuntimeContext({ id: 'u1', role: 'viewer' }, { workspaceId: 'ws_x' });
  const ev = evaluateDatabaseOperation('UPDATE agentsam.agentsam_todo SET status = 1', ctx);
  assert.equal(ev.allowed, false);
  assert.equal(ev.reason, 'non_owner_mutation_blocked');
});

test('tenant owner read-only allowed on information_schema', () => {
  const ctx = resolveDatabaseRuntimeContext({ id: 'u1', role: 'owner' }, { workspaceId: 'ws_x' });
  assert.equal(ctx.is_owner, false);
  assert.equal(ctx.allowed_schemas.includes('agentsam'), false);
  const ev = evaluateDatabaseOperation(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = $1',
    ctx,
  );
  assert.equal(ev.allowed, true);
  assert.equal(ev.read_only, true);
});

test('superadmin is platform operator for mutations', () => {
  const ctx = resolveDatabaseRuntimeContext(
    { id: 'u1', role: 'superadmin', is_superadmin: 1 },
    { workspaceId: 'ws_x' },
  );
  assert.equal(ctx.is_owner, true);
  assert.equal(ctx.can_apply_ddl, true);
});
