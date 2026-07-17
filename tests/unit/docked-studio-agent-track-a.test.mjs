import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseD1DatabaseHint } from '../../src/core/d1-database-hint.js';
import {
  enrichD1ParamsFromStudioContext,
  normalizeD1TargetParams,
} from '../../src/core/database-studio-tool-enrich.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const agentRoutes = readFileSync(join(root, 'dashboard/lib/agentRoutes.ts'), 'utf8');
const studioEvents = readFileSync(join(root, 'dashboard/src/lib/databaseStudioEvents.ts'), 'utf8');
const migration925 = readFileSync(
  join(root, 'migrations/925_agentsam_d1_query_sql_required_targeting.sql'),
  'utf8',
);

test('isContextPreservingAgentRailPath includes Database Studio', () => {
  assert.match(agentRoutes, /export function isContextPreservingAgentRailPath/);
  assert.match(agentRoutes, /p === '\/dashboard\/database'/);
  assert.match(agentRoutes, /p\.startsWith\('\/dashboard\/database\/'\)/);
});

test('isContextPreservingAgentRailPath includes Design Studio', () => {
  assert.match(agentRoutes, /p === '\/dashboard\/designstudio'/);
  assert.match(agentRoutes, /p\.startsWith\('\/dashboard\/designstudio\/'\)/);
});

test('publisher ownership refuses clear from a stale Studio instance', () => {
  assert.match(studioEvents, /createDatabaseSurfacePublisher/);
  assert.match(studioEvents, /if \(lastPublisherId !== publisherId\) return/);
});

test('migration 925 requires sql and allows name|UUID|resource_ref targeting', () => {
  assert.match(migration925, /"required":\s*\[\s*"sql"\s*\]/);
  assert.match(migration925, /"database"/);
  assert.match(migration925, /"database_id"/);
  assert.match(migration925, /"resource_ref"/);
  assert.doesNotMatch(migration925, /"required":\s*\[\s*"database_id"\s*,\s*"sql"\s*\]/);
});

test('parseD1DatabaseHint treats non-UUID databaseId as database name', () => {
  const hint = parseD1DatabaseHint({
    databaseId: 'inneranimalmedia-business',
    sql: 'SELECT 1',
  });
  assert.equal(hint.database_id, null);
  assert.equal(hint.database_name, 'inneranimalmedia-business');
});

test('parseD1DatabaseHint keeps real UUIDs on the id lane', () => {
  const id = 'cf87b717-1111-2222-3333-444444444444';
  const hint = parseD1DatabaseHint({ database_id: id, sql: 'SELECT 1' });
  assert.equal(hint.database_id, id);
  assert.equal(hint.database_name, null);
});

test('normalizeD1TargetParams moves name-as-id onto database', () => {
  const out = normalizeD1TargetParams({ databaseId: 'inneranimalmedia-business' });
  assert.equal(out.database, 'inneranimalmedia-business');
  assert.equal(out.databaseId, undefined);
});

test('enrich injects Studio UUID when model omits targeting', () => {
  const uuid = 'cf87b717-1111-2222-3333-444444444444';
  const out = enrichD1ParamsFromStudioContext(
    { sql: 'SELECT 1' },
    {
      databaseContext: {
        provider: 'd1',
        resourceRef: uuid,
        resourceScope: 'platform',
      },
    },
  );
  assert.equal(out.database_id, uuid);
  assert.equal(out.resource_ref, uuid);
});

test('enrich preserves platform_supabase selection shape for non-D1 tools path', () => {
  const out = enrichD1ParamsFromStudioContext(
    { sql: 'SELECT 1' },
    {
      databaseContext: {
        provider: 'supabase',
        resourceRef: 'platform_supabase',
        resourceScope: 'platform',
      },
    },
  );
  assert.equal(out.database_id, undefined);
  assert.equal(out.database, undefined);
});
