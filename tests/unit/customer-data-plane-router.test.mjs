import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCustomerDataPlane } from '../../src/core/customer-data-plane-router.js';

test('non-owner agentsam schema question denied — not public learning fallback', async () => {
  const plane = await resolveCustomerDataPlane(
    {},
    {
      user_id: 'au_test',
      workspace_id: 'ws_test',
      message: 'Explain agentsam_workflow_runs schema',
      authUser: { id: 'au_test', role: 'member' },
    },
  );
  assert.equal(plane.data_plane, 'platform_access_denied');
  assert.equal(plane.degraded_reason, 'platform_schema_denied_non_owner');
});

test('tenant owner agentsam schema question denied — owner role is not platform operator', async () => {
  const plane = await resolveCustomerDataPlane(
    {},
    {
      user_id: 'au_owner',
      workspace_id: 'ws_test',
      message: 'Explain agentsam_workflow_runs schema',
      authUser: { id: 'au_owner', role: 'owner' },
    },
  );
  assert.equal(plane.data_plane, 'platform_access_denied');
  assert.equal(plane.degraded_reason, 'platform_schema_denied_non_owner');
});

test('superadmin agentsam schema question routes to platform supabase', async () => {
  const plane = await resolveCustomerDataPlane(
    {},
    {
      user_id: 'au_sam',
      workspace_id: 'ws_inneranimalmedia',
      message: 'Explain agentsam_workflow_runs schema',
      authUser: { id: 'au_sam', role: 'superadmin', is_superadmin: 1 },
    },
  );
  assert.equal(plane.data_plane, 'platform_supabase_agentsam');
  assert.equal(plane.owner_type, 'platform');
});

test('superadmin on BYOK-only workspace denied platform plane', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return {
                  limits_json: JSON.stringify({
                    allow_platform_fallback: false,
                    byok_required: true,
                  }),
                };
              },
            };
          },
        };
      },
    },
  };

  const plane = await resolveCustomerDataPlane(env, {
    user_id: 'au_sam',
    workspace_id: 'ws_connor_mcneely',
    message: 'Explain agentsam_workflow_runs schema',
    authUser: { id: 'au_sam', role: 'superadmin', is_superadmin: 1 },
  });
  assert.equal(plane.data_plane, 'platform_access_denied');
  assert.equal(plane.degraded_reason, 'platform_binding_blocked_by_workspace_policy');
});

test('my supabase tables routes to customer_supabase with selection hint when unbound', async () => {
  const plane = await resolveCustomerDataPlane(
    {},
    {
      user_id: 'au_connor',
      workspace_id: 'ws_connor',
      message: 'Explain my Supabase tables',
      authUser: { id: 'au_connor', role: 'member' },
    },
  );
  assert.equal(plane.data_plane, 'customer_supabase');
  assert.equal(plane.degraded_reason, 'supabase_project_not_selected');
});

test('public examples routes to public_learning', async () => {
  const plane = await resolveCustomerDataPlane(
    {},
    {
      user_id: 'au_x',
      workspace_id: 'ws_x',
      message: 'Show Agent Sam public examples',
      authUser: { id: 'au_x', role: 'member' },
    },
  );
  assert.equal(plane.data_plane, 'public_learning');
});
