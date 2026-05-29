import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDataPlaneAccess,
  isPlatformDataPlane,
  isPlatformOnlyCatalogTool,
} from '../../src/core/data-plane-access-guard.js';

test('isPlatformDataPlane identifies platform bindings', () => {
  assert.equal(isPlatformDataPlane('platform_d1'), true);
  assert.equal(isPlatformDataPlane('platform_supabase_agentsam'), true);
  assert.equal(isPlatformDataPlane('customer_supabase'), false);
});

test('non-owner platform hyperdrive denied', () => {
  const r = assertDataPlaneAccess(
    { is_owner: false, is_superadmin: false, user_id: 'au_x' },
    'platform_supabase_agentsam',
    'run_readonly_sql',
    { sql: 'SELECT 1' },
  );
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'platform_binding_blocked_for_non_owner');
});

test('non-owner agentsam sql denied even on ambiguous plane', () => {
  const r = assertDataPlaneAccess(
    { is_owner: false, is_superadmin: false },
    'public_learning',
    'run_readonly_sql',
    { sql: 'SELECT * FROM agentsam_workflow_runs LIMIT 1' },
  );
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'agentsam_schema_denied_non_owner');
});

test('customer supabase without connection returns customer_database_not_connected', () => {
  const r = assertDataPlaneAccess(
    {
      is_owner: false,
      customer_connection_ok: false,
      project_ref: null,
    },
    'customer_supabase',
    'run_readonly_sql',
  );
  assert.equal(r.allowed, false);
  assert.equal(r.error, 'customer_database_not_connected');
});

test('customer supabase with project allowed', () => {
  const r = assertDataPlaneAccess(
    {
      is_owner: false,
      customer_connection_ok: true,
      project_ref: 'abcdefgh',
    },
    'customer_supabase',
    'run_readonly_sql',
  );
  assert.equal(r.allowed, true);
});

test('owner platform read allowed', () => {
  const r = assertDataPlaneAccess(
    { is_owner: true, is_superadmin: true },
    'platform_supabase_agentsam',
    'inspect_schema',
  );
  assert.equal(r.allowed, true);
});

test('platform catalog tools flagged', () => {
  assert.equal(isPlatformOnlyCatalogTool('hyperdrive_readonly_query'), true);
  assert.equal(isPlatformOnlyCatalogTool('customer_supabase_readonly_query'), false);
  assert.equal(
    isPlatformOnlyCatalogTool('platform_hyperdrive_agentsam_query', { admin_only: true }),
    true,
  );
});
