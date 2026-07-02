import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  d1PriorityToAgentsamLabel,
  mapD1ProjectStatusToMirror,
  mapD1ProjectToSupabaseRow,
} from '../../src/core/agentsam-projects-supabase-sync.js';

describe('agentsam-projects-supabase-sync', () => {
  it('d1PriorityToAgentsamLabel maps integer bands to P0–P3', () => {
    assert.equal(d1PriorityToAgentsamLabel(95), 'P0');
    assert.equal(d1PriorityToAgentsamLabel(80), 'P0');
    assert.equal(d1PriorityToAgentsamLabel(70), 'P1');
    assert.equal(d1PriorityToAgentsamLabel(50), 'P2');
    assert.equal(d1PriorityToAgentsamLabel(10), 'P3');
  });

  it('mapD1ProjectStatusToMirror normalizes lifecycle statuses', () => {
    assert.equal(mapD1ProjectStatusToMirror('production'), 'active');
    assert.equal(mapD1ProjectStatusToMirror('development'), 'active');
    assert.equal(mapD1ProjectStatusToMirror('discovery'), 'planning');
    assert.equal(mapD1ProjectStatusToMirror('archived'), 'archived');
  });

  it('mapD1ProjectToSupabaseRow maps core D1 fields and metadata', () => {
    const row = mapD1ProjectToSupabaseRow(
      {
        id: 'proj_agentsam_sdk',
        workspace_id: 'ws_inneranimalmedia',
        tenant_id: 'tenant_sam_primeaux',
        name: 'Agent Sam SDK',
        description: 'SDK scaffold',
        project_type: 'saas-product',
        status: 'development',
        priority: 90,
        domain: 'agentsam.dev',
        worker_id: 'agentsam-sdk',
        metadata_json: JSON.stringify({
          repo_url: 'https://github.com/SamPrimeaux/agentsam-sdk',
          phase: 'build',
          is_pinned: true,
        }),
        created_at: '2026-01-15T12:00:00.000Z',
        updated_at: '2026-06-01T08:30:00.000Z',
      },
      { slug: 'agentsam-sdk', updatedBy: 'au_test' },
    );

    assert.ok(row);
    assert.equal(row.id, 'proj_agentsam_sdk');
    assert.equal(row.slug, 'agentsam-sdk');
    assert.equal(row.status, 'active');
    assert.equal(row.priority, 'P0');
    assert.equal(row.project_type, 'saas-product');
    assert.equal(row.repo_url, 'https://github.com/SamPrimeaux/agentsam-sdk');
    assert.equal(row.live_url, 'https://agentsam.dev');
    assert.equal(row.updated_by, 'au_test');
    assert.equal(row.embedding_dirty, true);
    assert.equal(row.infra.d1_status, 'development');
    assert.equal(row.infra.worker_id, 'agentsam-sdk');
    assert.match(row.summary, /Agent Sam SDK/);
  });

  it('mapD1ProjectToSupabaseRow returns null without required ids', () => {
    assert.equal(mapD1ProjectToSupabaseRow({ id: 'p1' }), null);
    assert.equal(mapD1ProjectToSupabaseRow({ id: 'p1', workspace_id: 'ws_a' }), null);
  });
});
