import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_DASHBOARD_INSTRUCTIONS_KEY,
  PROJECT_DASHBOARD_MEMORY_KEY,
  PROJECT_DASHBOARD_MEMORY_TYPE,
} from '../../src/core/project-dashboard-memory.js';

describe('project-dashboard-memory keys', () => {
  it('uses user_preference memory_type for dashboard UI rows', () => {
    assert.equal(PROJECT_DASHBOARD_MEMORY_TYPE, 'user_preference');
    assert.equal(PROJECT_DASHBOARD_MEMORY_KEY, 'dashboard.memory');
    assert.equal(PROJECT_DASHBOARD_INSTRUCTIONS_KEY, 'dashboard.instructions');
  });
});
