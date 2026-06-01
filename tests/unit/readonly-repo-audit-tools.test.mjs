import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadonlyRepoAuditContext,
  readonlyRepoAuditPinnedToolNames,
  augmentReadonlyRepoAuditRouteRequirements,
  filterReportChildOrchestrationTools,
  assessRequiredEvidenceToolsPresent,
  extractRequestedRepoPaths,
  READONLY_REPO_AUDIT_ROUTE_KEY,
} from '../../src/core/readonly-repo-audit-tools.js';

const AUDIT_PROMPT =
  'Audit runtime-profile.js, mode-controllers, and agent-controller for multitask repo-audit tool selection. Report-only evidence from src/.';

test('repo audit multitask prompt matches readonly audit context', () => {
  assert.equal(isReadonlyRepoAuditContext(AUDIT_PROMPT), true);
  assert.deepEqual(readonlyRepoAuditPinnedToolNames(AUDIT_PROMPT), [
    'fs_read_file',
    'github_file',
    'fs_search_files',
    'repo_search',
    'code_search',
  ]);
});

test('augmentReadonlyRepoAuditRouteRequirements blocks memory/plan caps and boosts evidence', () => {
  const req = augmentReadonlyRepoAuditRouteRequirements(AUDIT_PROMPT, null);
  assert.ok(req.optional_capabilities.some((c) => /github|code\.search|workspace\.read/i.test(c)));
  assert.ok(req.blocked_capabilities.some((c) => /knowledge_search|memory\.write/i.test(c)));
  assert.equal(req.max_tools >= 8, true);
});

test('filterReportChildOrchestrationTools removes orchestration tools', () => {
  const tools = [
    { name: 'fs_read_file' },
    { name: 'agentsam_memory_write' },
    { name: 'agentsam_plan' },
    { name: 'agentsam_run' },
    { name: 'github_file' },
  ];
  const out = filterReportChildOrchestrationTools(tools);
  assert.deepEqual(out.map((t) => t.name), ['fs_read_file', 'github_file']);
});

test('assessRequiredEvidenceToolsPresent gates missing core evidence tools', () => {
  const ok = assessRequiredEvidenceToolsPresent(['fs_read_file', 'github_file', 'fs_search_files']);
  assert.equal(ok.required_evidence_tools_present, true);
  assert.deepEqual(ok.missing, []);

  const bad = assessRequiredEvidenceToolsPresent(['knowledge_search', 'agentsam_memory_search']);
  assert.equal(bad.required_evidence_tools_present, false);
  assert.ok(bad.missing.includes('fs_read_file'));
});

test('extractRequestedRepoPaths finds src paths in audit prompt', () => {
  const paths = extractRequestedRepoPaths('Check src/core/runtime-profile.js and multitask-controller.js');
  assert.ok(paths.some((p) => p.includes('runtime-profile.js')));
});

test('readonly_repo_audit route key is stable for child compile pin', () => {
  assert.equal(READONLY_REPO_AUDIT_ROUTE_KEY, 'readonly_repo_audit');
});
