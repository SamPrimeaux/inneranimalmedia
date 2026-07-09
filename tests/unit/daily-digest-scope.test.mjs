import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  digestContextJson,
  workspaceIdInSql,
} from '../../src/core/daily-digest-scope.js';

describe('daily-digest-scope', () => {
  it('workspaceIdInSql returns 1=0 when empty', () => {
    const out = workspaceIdInSql([]);
    assert.equal(out.clause, '1=0');
    assert.deepEqual(out.binds, []);
  });

  it('workspaceIdInSql builds IN clause', () => {
    const out = workspaceIdInSql(['ws_a', 'ws_b']);
    assert.equal(out.clause, 'workspace_id IN (?,?)');
    assert.deepEqual(out.binds, ['ws_a', 'ws_b']);
  });

  it('digestContextJson strips platform fields for collaborators', () => {
    const ctx = {
      platformCtx: { project_name: 'IAM SECRET' },
      memoryRows: { results: [{ key: 'k1' }] },
      clientCtxRows: { results: [{ project_name: 'Connor project' }] },
      clientRevenue: { results: [{ client_name: 'SECRET CLIENT' }] },
      cronHealth: { results: [{ job_name: 'cron_leak' }] },
      gitLog: 'abc123 leak',
      planTasks: { results: [{ status: 'open', cnt: 2 }] },
    };
    const json = JSON.parse(digestContextJson(ctx, {
      isPlatformOperator: false,
      tenantId: 'tenant_connor_mcneely',
      workspaceIds: ['ws_connor_mcneely'],
      userId: 'au_connor',
    }));

    assert.equal(json.digestMode, 'workspace');
    assert.equal(json.platform, undefined);
    assert.equal(json.clientRevenue, undefined);
    assert.equal(json.cronHealth, undefined);
    assert.equal(json.gitLog, undefined);
    assert.deepEqual(json.workspaceProjects, [{ project_name: 'Connor project' }]);
  });

  it('digestContextJson includes platform fields for operator', () => {
    const ctx = {
      platformCtx: { project_name: 'IAM' },
      clientRevenue: { results: [{ client_name: 'Client A' }] },
      gitLog: 'deadbeef',
      memoryRows: { results: [] },
      clientCtxRows: { results: [] },
    };
    const json = JSON.parse(digestContextJson(ctx, {
      isPlatformOperator: true,
      tenantId: 'tenant_inneranimalmedia',
      workspaceIds: ['ws_inneranimalmedia'],
      userId: 'au_sam',
    }));

    assert.equal(json.digestMode, 'platform_operator');
    assert.equal(json.platform.project_name, 'IAM');
    assert.equal(json.gitLog, 'deadbeef');
    assert.deepEqual(json.clientRevenue, [{ client_name: 'Client A' }]);
  });
});
