import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDataPlaneOperation } from '../../src/core/database-operation-policy.js';

test('public_learning blocks mutations', () => {
  const r = evaluateDataPlaneOperation({
    owner_type: 'public_learning',
    sql: 'INSERT INTO public.iam_tool_cards (slug) VALUES (\'x\')',
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'public_learning_read_only');
});

test('public_learning allows select on iam tables', () => {
  const r = evaluateDataPlaneOperation({
    owner_type: 'public_learning',
    sql: 'SELECT slug FROM public.iam_tool_cards LIMIT 5',
  });
  assert.equal(r.allowed, true);
});

test('customer mutation requires approval', () => {
  const r = evaluateDataPlaneOperation({
    owner_type: 'customer',
    sql: 'CREATE TABLE customers (id uuid primary key)',
    operation_type: 'apply_migration',
  });
  assert.equal(r.allowed, false);
  assert.equal(r.requires_approval, true);
});

test('customer mutation allowed with approval id', () => {
  const r = evaluateDataPlaneOperation({
    owner_type: 'customer',
    sql: 'CREATE TABLE customers (id uuid primary key)',
    explicit_approval_id: 'appr_123',
  });
  assert.equal(r.allowed, true);
});

test('platform raw access denied for non-owner', () => {
  const r = evaluateDataPlaneOperation({
    owner_type: 'platform',
    is_owner: false,
    sql: 'SELECT 1',
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'platform_raw_access_owner_only');
});
