import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConversationProjectRef } from '../../src/core/project-chat-link.js';

function envWithRow(row) {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              first: async () => row,
            };
          },
        };
      },
    },
  };
}

const base = {
  conversationId: 'conv_1',
  userId: 'user_1',
  tenantId: 'tenant_1',
};

test('existing conversation project overrides ambient request project', async () => {
  const out = await resolveConversationProjectRef(envWithRow({ project_id: 'proj_a' }), {
    ...base,
    requestedProjectRef: 'proj_stale',
  });
  assert.equal(out.projectRef, 'proj_a');
  assert.equal(out.source, 'conversation');
});

test('unbound existing conversation rejects ambient request project', async () => {
  const out = await resolveConversationProjectRef(envWithRow({ project_id: null }), {
    ...base,
    requestedProjectRef: 'proj_stale',
  });
  assert.equal(out.projectRef, null);
  assert.equal(out.source, 'conversation');
});

test('explicit selection can replace existing conversation project', async () => {
  const out = await resolveConversationProjectRef(envWithRow({ project_id: 'proj_a' }), {
    ...base,
    requestedProjectRef: 'proj_b',
    explicit: true,
  });
  assert.equal(out.projectRef, 'proj_b');
  assert.equal(out.source, 'explicit_request');
});

test('explicit clear removes existing conversation project', async () => {
  const out = await resolveConversationProjectRef(envWithRow({ project_id: 'proj_a' }), {
    ...base,
    requestedProjectRef: 'proj_a',
    explicit: true,
    clear: true,
  });
  assert.equal(out.projectRef, null);
  assert.equal(out.source, 'explicit_clear');
});
